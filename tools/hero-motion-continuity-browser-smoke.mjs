import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const baseUrl = (process.env.DEUNA_VISUAL_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const outputDir = path.resolve(process.env.DEUNA_VISUAL_OUTPUT_DIR ?? "artifacts/visual-smoke");
const reportPath = path.join(outputDir, "hero-motion-continuity.json");
const viewports = [
  { id: "desktop", width: 1440, height: 1000 },
  { id: "tablet", width: 1024, height: 900 },
  { id: "mobile", width: 390, height: 844 },
];

function requireCheck(condition, message) {
  if (!condition) throw new Error(message);
}

function findChrome() {
  const candidates = [process.env.CHROME_BIN, "google-chrome-stable", "google-chrome", "chromium", "chromium-browser"].filter(Boolean);
  for (const candidate of candidates) {
    const result = spawnSync("sh", ["-lc", `command -v ${JSON.stringify(candidate)}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const resolved = result.stdout.trim();
    if (result.status === 0 && resolved) return resolved;
  }
  throw new Error("Hero continuity smoke necesita Chrome/Chromium disponible en PATH.");
}

async function waitForDebugger(profileDir, browser) {
  const activePortPath = path.join(profileDir, "DevToolsActivePort");
  const deadline = Date.now() + 30_000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (browser.exitCode !== null) throw new Error(`Chrome terminó antes de exponer DevTools (exit ${browser.exitCode}).`);
    try {
      const { readFile } = await import("node:fs/promises");
      const raw = await readFile(activePortPath, "utf8");
      const port = Number.parseInt(raw.split(/\r?\n/, 1)[0] ?? "", 10);
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
        if (page) return page;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`Chrome no expuso DevTools a tiempo.${lastError instanceof Error ? ` ${lastError.message}` : ""}`);
}

function openWebSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error("Timeout conectando con Chrome DevTools.")), 10_000);
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      resolve(socket);
    }, { once: true });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("No se pudo abrir el WebSocket de Chrome DevTools."));
    }, { once: true });
  });
}

class CdpSession {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        else pending.resolve(message.result ?? {});
        return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => listeners.delete(listener);
  }

  waitFor(method, timeoutMs = 15_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timeout esperando ${method}.`));
      }, timeoutMs);
      const unsubscribe = this.on(method, (params) => {
        clearTimeout(timer);
        unsubscribe();
        resolve(params);
      });
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "Runtime.evaluate falló.");
    }
    return result.result?.value;
  }

  close() {
    this.socket.close();
  }
}

async function setViewport(cdp, viewport) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
    screenOrientation: { type: "portraitPrimary", angle: 0 },
  });
}

async function navigate(cdp, url) {
  const loaded = cdp.waitFor("Page.loadEventFired");
  const navigation = await cdp.send("Page.navigate", { url });
  if (navigation.errorText) throw new Error(`No se pudo navegar a ${url}: ${navigation.errorText}`);
  await loaded;
}

async function waitUntil(cdp, expression, label, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cdp.evaluate(`Boolean(${expression})`)) return;
    await delay(50);
  }
  throw new Error(`Timeout esperando ${label}.`);
}

function closeEnough(a, b, tolerance = 0.035) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
}

function opacityTransition(sample) {
  return sample.animations?.find((animation) =>
    animation.type === "CSSTransition" && animation.transitionProperty === "opacity"
  );
}

function hasLiveOpacityProgress(sample) {
  const animation = opacityTransition(sample);
  return Boolean(
    animation &&
    animation.playState === "running" &&
    Number.isFinite(animation.currentTime) &&
    Number.isFinite(animation.duration) &&
    animation.currentTime > 0 &&
    animation.currentTime < animation.duration
  );
}

function hasIntermediateOpacity(sample) {
  if (!sample.retained) return false;
  if (!sample.previousVisible && sample.visible) {
    return sample.opacity > 0.01 && sample.opacity < sample.targetOpacity - 0.01;
  }
  if (sample.previousVisible && !sample.visible) {
    return sample.opacity > 0.01 && sample.opacity < sample.previousOpacity - 0.01;
  }
  return hasLiveOpacityProgress(sample);
}

async function capturePhase(cdp) {
  return cdp.evaluate(`(() => {
    const root = document.querySelector('section[aria-roledescription="carrusel"][aria-label="Juegos destacados"]');
    const cards = Array.from(root?.querySelectorAll('[data-position]') ?? []);
    const prior = window.__heroContinuityNodes ?? [];
    const samples = prior.map((item, order) => {
      const retained = cards.includes(item.node);
      if (!retained) return { previousPosition: item.position, retained: false, order };
      const style = getComputedStyle(item.node);
      const animations = item.node.getAnimations().map((animation) => {
        const timing = animation.effect?.getComputedTiming?.() ?? {};
        return {
          type: animation.constructor?.name ?? null,
          playState: animation.playState,
          currentTime: typeof animation.currentTime === 'number' ? animation.currentTime : null,
          duration: typeof timing.duration === 'number' ? timing.duration : null,
          transitionProperty: typeof animation.transitionProperty === 'string' ? animation.transitionProperty : null,
          animationName: typeof animation.animationName === 'string' ? animation.animationName : null,
        };
      });
      return {
        previousPosition: item.position,
        previousVisible: item.visible,
        previousOpacity: item.opacity,
        retained: true,
        sameDomOrder: cards[order] === item.node,
        position: item.node.getAttribute('data-position'),
        visible: item.node.getAttribute('data-hero-visible') === 'true',
        buffer: item.node.getAttribute('data-motion-buffer') === 'true',
        edgeWrap: item.node.getAttribute('data-edge-wrap') === 'true',
        opacity: Number.parseFloat(style.opacity),
        targetOpacity: Number.parseFloat(item.node.style.opacity || style.opacity),
        transitionDuration: style.transitionDuration,
        animations,
      };
    });
    const main = root?.querySelector('[data-position="main"]');
    return {
      ready: root?.getAttribute('data-motion-ready') === 'true',
      main: main?.getAttribute('aria-label') ?? null,
      cards: cards.length,
      retained: samples.filter((sample) => sample.retained).length,
      stableDomOrder: samples.every((sample) => sample.retained && sample.sameDomOrder),
      moved: samples.filter((sample) => sample.retained && sample.position !== sample.previousPosition).length,
      running: samples.reduce((sum, sample) => sum + (sample.animations?.filter((animation) => animation.playState === 'running').length ?? 0), 0),
      entering: samples.filter((sample) => sample.retained && !sample.previousVisible && sample.visible),
      leaving: samples.filter((sample) => sample.retained && sample.previousVisible && !sample.visible),
      visibleDurations: samples.filter((sample) => sample.retained && sample.visible).map((sample) => sample.transitionDuration),
      samples,
    };
  })()`);
}

async function waitForRealMotionProgress(cdp, viewportId, needsBufferPair, timeoutMs = 700) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await capturePhase(cdp);
    const anyOpacityProgress = latest.samples.some((sample) => hasLiveOpacityProgress(sample));
    const buffersProgress = !needsBufferPair || (
      latest.entering.length > 0 &&
      latest.leaving.length > 0 &&
      latest.entering.every((sample) => hasIntermediateOpacity(sample)) &&
      latest.leaving.every((sample) => hasIntermediateOpacity(sample))
    );
    if (latest.ready && latest.running > 0 && anyOpacityProgress && buffersProgress) return latest;
    await delay(35);
  }
  const compact = latest?.samples?.map((sample) => ({
    from: sample.previousPosition,
    to: sample.position,
    opacity: sample.opacity,
    target: sample.targetOpacity,
    opacityTransition: opacityTransition(sample) ?? null,
  }));
  throw new Error(`${viewportId}: las transiciones no mostraron progreso real a tiempo: ${JSON.stringify(compact)}`);
}

async function verifyViewport(cdp, viewport) {
  await setViewport(cdp, viewport);
  await navigate(cdp, `${baseUrl}/`);
  const rootSelector = 'section[aria-roledescription="carrusel"][aria-label="Juegos destacados"]';
  await waitUntil(
    cdp,
    `document.querySelector('${rootSelector}[data-motion-ready="true"] [data-position="main"]')`,
    `Hero público ${viewport.id} con motor V3 listo`
  );

  const before = await cdp.evaluate(`(() => {
    const root = document.querySelector('${rootSelector}');
    if (!(root instanceof HTMLElement) || root.getAttribute('data-motion-ready') !== 'true') return null;
    root.focus();
    const cards = Array.from(root.querySelectorAll('[data-position]'));
    window.__heroContinuityNodes = cards.map((node) => ({
      node,
      position: node.getAttribute('data-position'),
      visible: node.getAttribute('data-hero-visible') === 'true',
      opacity: Number.parseFloat(getComputedStyle(node).opacity),
    }));
    const main = root.querySelector('[data-position="main"]');
    const match = main?.getAttribute('aria-label')?.match(/ de (\\d+):/);
    return {
      ready: true,
      motionStyle: root.getAttribute('data-motion-style'),
      main: main?.getAttribute('aria-label') ?? null,
      cards: cards.length,
      totalGames: match ? Number(match[1]) : cards.length,
      visibleCount: cards.filter((node) => node.getAttribute('data-hero-visible') === 'true').length,
      bufferCount: cards.filter((node) => node.getAttribute('data-motion-buffer') === 'true').length,
    };
  })()`);

  requireCheck(before?.ready, `${viewport.id}: el motor V3 no estaba listo al tomar la muestra inicial.`);
  requireCheck(before.motionStyle, `${viewport.id}: falta data-motion-style.`);
  requireCheck(before.main, `${viewport.id}: falta tarjeta principal inicial.`);
  requireCheck(before.cards === Math.min(5, before.totalGames), `${viewport.id}: el Hero conserva ${before.cards}/${Math.min(5, before.totalGames)} nodos físicos.`);
  if (before.totalGames > before.visibleCount) requireCheck(before.bufferCount >= 1, `${viewport.id}: faltan buffers físicos fuera del área visible.`);

  const clicked = await cdp.evaluate(`(() => {
    const root = document.querySelector('${rootSelector}');
    if (root?.getAttribute('data-motion-ready') !== 'true') return false;
    const next = root.querySelector('button[aria-label="Juego siguiente"]:not(:disabled)');
    const previous = root.querySelector('button[aria-label="Juego anterior"]:not(:disabled)');
    const target = next ?? previous;
    if (!(target instanceof HTMLButtonElement)) return false;
    target.click();
    return true;
  })()`);
  requireCheck(clicked, `${viewport.id}: no se pudo iniciar la navegación del Hero listo.`);

  const early = await waitForRealMotionProgress(cdp, viewport.id, before.bufferCount > 0);

  // El resize se provoca sólo después de comprobar que el compositor está
  // interpolando de verdad. Así validamos que el fitting no corte una transición
  // real en curso, sin depender de milisegundos de CPU del runner headless.
  await setViewport(cdp, { ...viewport, height: viewport.height + 1 });
  await delay(25);
  const mid = await capturePhase(cdp);

  const result = { before, early, mid, settled: null, errors: [] };
  const check = (condition, message) => { if (!condition) result.errors.push(message); };

  check(early.ready && mid.ready, `${viewport.id}: el motor V3 perdió readiness durante la transición.`);
  check(early.main && early.main !== before.main, `${viewport.id}: el principal no cambió al iniciar la transición.`);
  check(early.retained === before.cards && mid.retained === before.cards, `${viewport.id}: se desmontaron tarjetas durante la transición.`);
  check(early.stableDomOrder && mid.stableDomOrder, `${viewport.id}: React reordenó físicamente nodos Hero durante el cambio de slot.`);
  check(mid.moved >= Math.min(2, before.cards), `${viewport.id}: no hay suficientes nodos físicos recorriendo slots (${mid.moved}).`);
  check(mid.running > 0, `${viewport.id}: el resize cortó todas las animaciones/transiciones activas.`);
  check(mid.visibleDurations.some((value) => Number.parseFloat(value) > 0), `${viewport.id}: un resize durante el movimiento dejó la duración de transición en 0.`);

  if (before.bufferCount > 0) {
    check(early.entering.length >= 1 && early.leaving.length >= 1, `${viewport.id}: faltó el cruce físico entre visible y buffer.`);
    for (const sample of early.entering) {
      check(hasLiveOpacityProgress(sample) && hasIntermediateOpacity(sample), `${viewport.id}: tarjeta entrante no interpoló opacity hacia ${sample.targetOpacity} (actual=${sample.opacity}).`);
    }
    for (const sample of early.leaving) {
      check(hasLiveOpacityProgress(sample) && hasIntermediateOpacity(sample), `${viewport.id}: tarjeta saliente no interpoló opacity desde ${sample.previousOpacity} (actual=${sample.opacity}).`);
    }
    for (const sample of mid.entering) {
      check(opacityTransition(sample)?.playState === "running", `${viewport.id}: el resize canceló la transición de opacity de una tarjeta entrante.`);
    }
    for (const sample of mid.leaving) {
      check(opacityTransition(sample)?.playState === "running", `${viewport.id}: el resize canceló la transición de opacity de una tarjeta saliente.`);
    }
  }

  await delay(980);
  const settled = await cdp.evaluate(`(() => (window.__heroContinuityNodes ?? []).map((item) => ({
    retained: item.node?.isConnected === true,
    visible: item.node?.getAttribute('data-hero-visible') === 'true',
    opacity: item.node?.isConnected ? Number.parseFloat(getComputedStyle(item.node).opacity) : null,
    targetOpacity: item.node?.isConnected ? Number.parseFloat(item.node.style.opacity || getComputedStyle(item.node).opacity) : null,
  })))()`);
  result.settled = settled;
  check(settled.every((sample) => sample.retained), `${viewport.id}: algún nodo se desmontó antes de completar el settle.`);
  for (const sample of settled) {
    if (!sample.visible) check(closeEnough(sample.opacity, 0), `${viewport.id}: buffer asentado quedó visible con opacity=${sample.opacity}.`);
    else check(closeEnough(sample.opacity, sample.targetOpacity), `${viewport.id}: tarjeta visible no terminó en su opacity objetivo (${sample.opacity}/${sample.targetOpacity}).`);
  }
  return result;
}

async function persistReport(report) {
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "deuna-hero-continuity-chrome-"));
  const browser = spawn(findChrome(), [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--remote-debugging-port=0",
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profileDir}`,
    "--window-size=1440,1000",
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  browser.stderr.resume();

  let cdp = null;
  const report = { generatedAt: new Date().toISOString(), baseUrl, viewports: {}, runtimeIssues: [] };
  try {
    const target = await waitForDebugger(profileDir, browser);
    cdp = new CdpSession(await openWebSocket(target.webSocketDebuggerUrl));
    await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Network.enable")]);
    await cdp.send("Emulation.setEmulatedMedia", {
      media: "",
      features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
    });
    cdp.on("Runtime.exceptionThrown", (event) => {
      report.runtimeIssues.push(event.exceptionDetails?.exception?.description ?? event.exceptionDetails?.text ?? "Excepción JavaScript sin detalle.");
    });
    cdp.on("Runtime.consoleAPICalled", (event) => {
      if (event.type === "error") report.runtimeIssues.push(event.args?.map((arg) => arg.value ?? arg.description ?? arg.type).join(" ") ?? "console.error");
    });

    for (const viewport of viewports) {
      const result = await verifyViewport(cdp, viewport);
      report.viewports[viewport.id] = result;
      await persistReport(report);
      requireCheck(result.errors.length === 0, `${viewport.id}: ${result.errors.join(" | ")}`);
    }

    requireCheck(report.runtimeIssues.length === 0, `Errores runtime: ${report.runtimeIssues.join(" | ")}`);
    await persistReport(report);
    console.log("Hero motion continuity browser: OK (readiness explícito, orden DOM estable, progreso real desktop/tablet/mobile y resize sin cortar transición).");
  } catch (error) {
    report.error = error instanceof Error ? error.stack ?? error.message : String(error);
    await persistReport(report).catch(() => {});
    throw error;
  } finally {
    cdp?.close();
    browser.kill("SIGTERM");
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

await main();