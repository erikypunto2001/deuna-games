import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const baseUrl = (
  process.env.DEUNA_VISUAL_BASE_URL ?? "http://127.0.0.1:3000"
).replace(/\/$/, "");
const outputDir = path.resolve(
  process.env.DEUNA_VISUAL_OUTPUT_DIR ?? "artifacts/visual-smoke"
);
const adminUsername = process.env.DEUNA_VISUAL_ADMIN_USERNAME?.trim();
const adminPassword = process.env.DEUNA_VISUAL_ADMIN_PASSWORD;
const viewport = { width: 1440, height: 1000 };
const tolerance = 1;

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    "google-chrome-stable",
    "google-chrome",
    "chromium",
    "chromium-browser",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const result = spawnSync(
      "sh",
      ["-lc", `command -v ${JSON.stringify(candidate)}`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const resolved = result.stdout.trim();
    if (result.status === 0 && resolved) return resolved;
  }

  throw new Error(
    "Hero height runtime smoke necesita Chrome/Chromium disponible en PATH."
  );
}

async function waitForDebugger(profileDir, browser) {
  const activePortPath = path.join(profileDir, "DevToolsActivePort");
  const deadline = Date.now() + 30_000;
  let lastError = null;

  while (Date.now() < deadline) {
    if (browser.exitCode !== null) {
      throw new Error(
        `Chrome terminó antes de exponer DevTools (exit ${browser.exitCode}).`
      );
    }

    try {
      const raw = await readFile(activePortPath, "utf8");
      const port = Number.parseInt(raw.split(/\r?\n/, 1)[0] ?? "", 10);
      if (!Number.isFinite(port) || port <= 0) {
        throw new Error("Puerto DevTools inválido.");
      }
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find(
          (target) => target.type === "page" && target.webSocketDebuggerUrl
        );
        if (page) return page;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }

  throw new Error(
    `Chrome no expuso DevTools a tiempo.${
      lastError instanceof Error ? ` ${lastError.message}` : ""
    }`
  );
}

function openWebSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(
      () => reject(new Error("Timeout conectando con Chrome DevTools.")),
      10_000
    );
    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timer);
        resolve(socket);
      },
      { once: true }
    );
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timer);
        reject(new Error("No se pudo abrir el WebSocket de Chrome DevTools."));
      },
      { once: true }
    );
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
        if (message.error) {
          pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        } else {
          pending.resolve(message.result ?? {});
        }
        return;
      }
      const listeners = this.listeners.get(message.method);
      if (!listeners) return;
      for (const listener of [...listeners]) listener(message.params ?? {});
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
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(method);
    };
  }

  waitFor(method, predicate = () => true, timeoutMs = 15_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timeout esperando ${method}.`));
      }, timeoutMs);
      const unsubscribe = this.on(method, (params) => {
        if (!predicate(params)) return;
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
      throw new Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text ??
          "Runtime.evaluate falló."
      );
    }
    return result.result?.value;
  }

  close() {
    this.socket.close();
  }
}

async function navigate(cdp, url) {
  const loaded = cdp.waitFor("Page.loadEventFired");
  const navigation = await cdp.send("Page.navigate", { url });
  if (navigation.errorText) {
    throw new Error(`No se pudo navegar a ${url}: ${navigation.errorText}`);
  }
  await loaded;
}

async function waitUntil(cdp, expression, label, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cdp.evaluate(`Boolean(${expression})`)) return;
    await delay(100);
  }
  throw new Error(`Timeout esperando ${label}.`);
}

async function setViewport(cdp) {
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

async function loginAdmin(cdp) {
  if (!adminUsername || !adminPassword) {
    throw new Error(
      "Faltan DEUNA_VISUAL_ADMIN_USERNAME/DEUNA_VISUAL_ADMIN_PASSWORD."
    );
  }

  await navigate(cdp, `${baseUrl}/admin/login`);
  await waitUntil(
    cdp,
    'document.querySelector("#admin-username")',
    "formulario de login Admin"
  );

  const prepared = await cdp.evaluate(`(() => {
    const username = document.querySelector("#admin-username");
    const password = document.querySelector("#admin-password");
    const form = document.querySelector('form[action="/api/admin/auth/login"]');
    if (!(username instanceof HTMLInputElement) ||
        !(password instanceof HTMLInputElement) ||
        !(form instanceof HTMLFormElement)) return false;
    username.value = ${JSON.stringify(adminUsername)};
    password.value = ${JSON.stringify(adminPassword)};
    username.dispatchEvent(new Event("input", { bubbles: true }));
    password.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  if (!prepared) throw new Error("No se pudo preparar el login real del Admin.");

  const loaded = cdp.waitFor("Page.loadEventFired");
  await cdp.evaluate(
    'document.querySelector(\'form[action="/api/admin/auth/login"]\')?.requestSubmit()'
  );
  await loaded;
  await delay(200);
  if ((await cdp.evaluate("location.pathname")) === "/admin/login") {
    throw new Error("El login visual del Admin fue rechazado.");
  }
}

function requireCheck(condition, message) {
  if (!condition) throw new Error(message);
}

function closeEnough(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
}

function assertGeometryStable(baseline, sample, label) {
  for (const key of [
    "rootHeight",
    "viewportHeight",
    "marginTop",
    "marginBottom",
    "insetTop",
    "insetBottom",
  ]) {
    requireCheck(
      closeEnough(baseline[key], sample[key]),
      `${label}: ${key} cambió de ${baseline[key]} a ${sample[key]}.`
    );
  }

  if (baseline.footprintToNext !== null && sample.footprintToNext !== null) {
    requireCheck(
      closeEnough(baseline.footprintToNext, sample.footprintToNext),
      `${label}: la huella vertical hasta la siguiente sección cambió de ${baseline.footprintToNext} a ${sample.footprintToNext}.`
    );
  }
}

function surfaceExpression(surface, body) {
  const documentExpression = surface === "editor"
    ? 'document.querySelector(\'iframe[title^="Hero real"]\')?.contentDocument'
    : "document";
  return `(() => { const doc = ${documentExpression}; ${body} })()`;
}

async function measureSurface(cdp, surface) {
  return cdp.evaluate(surfaceExpression(surface, `
    const view = doc?.defaultView;
    const HtmlElement = view?.HTMLElement;
    const root = doc?.querySelector('section[aria-roledescription="carrusel"][aria-label="Juegos destacados"]');
    const viewportNode = root?.querySelector('[class*="carouselViewport"]');
    const main = root?.querySelector('[data-position="main"]');
    if (!view || !HtmlElement || !(root instanceof HtmlElement) || !(viewportNode instanceof HtmlElement) || !(main instanceof HtmlElement)) return null;
    const rootRect = root.getBoundingClientRect();
    const viewportRect = viewportNode.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    const next = root.nextElementSibling instanceof HtmlElement ? root.nextElementSibling : null;
    const nextRect = next?.getBoundingClientRect() ?? null;
    const style = view.getComputedStyle(root);
    const numeric = (value) => { const parsed = Number.parseFloat(value); return Number.isFinite(parsed) ? parsed : 0; };
    return {
      main: main.getAttribute('aria-label'),
      rootHeight: rootRect.height,
      viewportHeight: viewportRect.height,
      mainHeight: mainRect.height,
      marginTop: numeric(style.marginTop),
      marginBottom: numeric(style.marginBottom),
      insetTop: numeric(style.getPropertyValue('--hero-visual-inset-top')),
      insetBottom: numeric(style.getPropertyValue('--hero-visual-inset-bottom')),
      footprintToNext: nextRect ? nextRect.top - rootRect.top : null,
      cardHeightVariable: style.getPropertyValue('--hero-card-height').trim(),
    };
  `));
}

async function clickNext(cdp, surface) {
  return cdp.evaluate(surfaceExpression(surface, `
    const view = doc?.defaultView;
    const HtmlElement = view?.HTMLElement;
    const ButtonElement = view?.HTMLButtonElement;
    const root = doc?.querySelector('section[aria-roledescription="carrusel"][aria-label="Juegos destacados"]');
    if (!HtmlElement || !(root instanceof HtmlElement)) return false;
    root.focus();
    const next = root.querySelector('button[aria-label="Juego siguiente"]:not(:disabled)');
    const previous = root.querySelector('button[aria-label="Juego anterior"]:not(:disabled)');
    const target = next ?? previous;
    if (!ButtonElement || !(target instanceof ButtonElement)) return false;
    target.click();
    return true;
  `));
}

async function verifySurface(cdp, surface, transitions = 3) {
  const baseline = await measureSurface(cdp, surface);
  requireCheck(baseline, `${surface}: no se pudo medir el Hero.`);
  requireCheck(baseline.rootHeight > 0, `${surface}: Hero sin altura visible.`);
  requireCheck(
    closeEnough(baseline.rootHeight, baseline.viewportHeight),
    `${surface}: el viewport (${baseline.viewportHeight}) no coincide con la altura del Hero (${baseline.rootHeight}).`
  );

  const checks = [{ phase: "baseline", ...baseline }];
  let previousMain = baseline.main;

  for (let index = 0; index < transitions; index += 1) {
    const clicked = await clickNext(cdp, surface);
    requireCheck(clicked, `${surface}: no hay control disponible para avanzar el Hero.`);

    for (const [phase, wait] of [
      ["early", 60],
      ["mid", 260],
      ["settled", 1050],
    ]) {
      await delay(wait);
      const sample = await measureSurface(cdp, surface);
      requireCheck(sample, `${surface}: no se pudo medir el Hero en ${phase}.`);
      assertGeometryStable(baseline, sample, `${surface} transición ${index + 1} ${phase}`);
      checks.push({ transition: index + 1, phase, ...sample });
      if (phase === "settled") {
        requireCheck(
          sample.main && sample.main !== previousMain,
          `${surface}: la flecha no cambió el juego principal en la transición ${index + 1}.`
        );
        requireCheck(
          closeEnough(baseline.mainHeight, sample.mainHeight),
          `${surface}: la tarjeta principal cambió de alto entre imágenes (${baseline.mainHeight} → ${sample.mainHeight}).`
        );
        previousMain = sample.main;
      }
    }
  }

  return checks;
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const profileDir = await mkdtemp(
    path.join(os.tmpdir(), "deuna-hero-height-chrome-")
  );
  const browser = spawn(findChrome(), [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--remote-debugging-port=0",
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profileDir}`,
    `--window-size=${viewport.width},${viewport.height}`,
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  browser.stderr.resume();

  let cdp = null;
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    viewport,
    tolerance,
    editor: null,
    publicHome: null,
    runtimeIssues: [],
  };

  try {
    const target = await waitForDebugger(profileDir, browser);
    cdp = new CdpSession(await openWebSocket(target.webSocketDebuggerUrl));
    await Promise.all([
      cdp.send("Page.enable"),
      cdp.send("Runtime.enable"),
      cdp.send("Network.enable"),
    ]);
    await setViewport(cdp);
    cdp.on("Runtime.exceptionThrown", (event) => {
      report.runtimeIssues.push(
        event.exceptionDetails?.exception?.description ??
          event.exceptionDetails?.text ??
          "Excepción JavaScript sin detalle."
      );
    });
    cdp.on("Runtime.consoleAPICalled", (event) => {
      if (event.type !== "error") return;
      report.runtimeIssues.push(
        event.args?.map((arg) => arg.value ?? arg.description ?? arg.type).join(" ") ??
          "console.error"
      );
    });

    await loginAdmin(cdp);
    await navigate(cdp, `${baseUrl}/admin/portada?seccion=hero`);
    await waitUntil(
      cdp,
      'document.querySelector(\'iframe[title^="Hero real"]\')?.contentDocument?.querySelector(\'section[aria-roledescription="carrusel"]\')',
      "Hero real del editor"
    );
    report.editor = await verifySurface(cdp, "editor");

    await navigate(cdp, `${baseUrl}/`);
    await waitUntil(
      cdp,
      'document.querySelector(\'section[aria-roledescription="carrusel"][aria-label="Juegos destacados"]\')',
      "Hero público"
    );
    report.publicHome = await verifySurface(cdp, "public");

    requireCheck(
      report.runtimeIssues.length === 0,
      `Errores runtime durante estabilidad del Hero: ${report.runtimeIssues.join(" | ")}`
    );
    await writeFile(
      path.join(outputDir, "hero-height-stability-runtime.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8"
    );
    console.log(
      "[hero-height-runtime] OK: editor y Home mantienen altura, márgenes, insets y huella vertical estables durante 3 cambios de imagen."
    );
  } catch (error) {
    report.error = error instanceof Error ? error.stack ?? error.message : String(error);
    await writeFile(
      path.join(outputDir, "hero-height-stability-runtime.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8"
    ).catch(() => {});
    throw error;
  } finally {
    cdp?.close();
    browser.kill("SIGTERM");
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

await main();
