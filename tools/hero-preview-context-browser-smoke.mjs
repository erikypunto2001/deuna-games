import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

function requireCheck(condition, message) {
  if (!condition) throw new Error(message);
}

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
  throw new Error("Hero preview context smoke necesita Chrome/Chromium en PATH.");
}

async function waitForDebugger(profileDir, browser) {
  const activePortPath = path.join(profileDir, "DevToolsActivePort");
  const deadline = Date.now() + 30_000;
  let lastError = null;

  while (Date.now() < deadline) {
    if (browser.exitCode !== null) {
      throw new Error(`Chrome terminó antes de exponer DevTools (exit ${browser.exitCode}).`);
    }
    try {
      const raw = await readFile(activePortPath, "utf8");
      const port = Number.parseInt(raw.split(/\r?\n/, 1)[0] ?? "", 10);
      if (!Number.isFinite(port) || port <= 0) throw new Error("Puerto DevTools inválido.");
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

  throw new Error(
    `Chrome no expuso DevTools a tiempo.${lastError instanceof Error ? ` ${lastError.message}` : ""}`
  );
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
      reject(new Error("No se pudo abrir Chrome DevTools."));
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
  if (navigation.errorText) throw new Error(`No se pudo navegar a ${url}: ${navigation.errorText}`);
  await loaded;
}

async function waitUntil(cdp, expression, label, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cdp.evaluate(`Boolean(${expression})`)) return;
    await delay(80);
  }
  throw new Error(`Timeout esperando ${label}.`);
}

async function loginAdmin(cdp) {
  if (!adminUsername || !adminPassword) {
    throw new Error("Faltan DEUNA_VISUAL_ADMIN_USERNAME/DEUNA_VISUAL_ADMIN_PASSWORD.");
  }
  await navigate(cdp, `${baseUrl}/admin/login`);
  await waitUntil(cdp, 'document.querySelector("#admin-username")', "login Admin");
  const prepared = await cdp.evaluate(`(() => {
    const username = document.querySelector('#admin-username');
    const password = document.querySelector('#admin-password');
    const form = document.querySelector('form[action="/api/admin/auth/login"]');
    if (!(username instanceof HTMLInputElement) || !(password instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) return false;
    username.value = ${JSON.stringify(adminUsername)};
    password.value = ${JSON.stringify(adminPassword)};
    username.dispatchEvent(new Event('input', { bubbles: true }));
    password.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  requireCheck(prepared, "No se pudo preparar el login Admin.");
  const loaded = cdp.waitFor("Page.loadEventFired");
  await cdp.evaluate(`document.querySelector('form[action="/api/admin/auth/login"]')?.requestSubmit()`);
  await loaded;
  await delay(200);
  requireCheck((await cdp.evaluate("location.pathname")) !== "/admin/login", "El login visual del Admin fue rechazado.");
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

async function currentMain(cdp) {
  return cdp.evaluate(`document.querySelector('iframe[title^="Hero real"]')?.contentDocument?.querySelector('[data-position="main"]')?.getAttribute('aria-label') ?? null`);
}

async function clickButtonByText(cdp, text) {
  return cdp.evaluate(`(() => {
    const button = Array.from(document.querySelectorAll('button')).find((node) => node.textContent?.trim() === ${JSON.stringify(text)});
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`);
}

async function switchDeviceAndRequireReplay(cdp, label, frameTitle) {
  const before = await currentMain(cdp);
  requireCheck(before, `No se pudo leer el Hero antes de cambiar a ${label}.`);
  const probeArmed = await cdp.evaluate(`(() => {
    const frame = document.querySelector('iframe[title^="Hero real"]');
    const doc = frame?.contentDocument;
    const view = frame?.contentWindow;
    if (!doc?.body || !view) return false;
    view.__deunaHeroReplayProbe?.observer?.disconnect?.();
    const probe = {
      events: [],
      rootChanges: 0,
      lastRoot: null,
      lastEventKey: '',
      observer: null,
    };
    const sample = () => {
      const root = doc.querySelector('[data-motion-style]');
      const label = root?.querySelector('[data-position="main"]')?.getAttribute('aria-label') ?? null;
      if (root && root !== probe.lastRoot) {
        probe.rootChanges += 1;
        probe.lastRoot = root;
      }
      if (!label || !probe.rootChanges) return;
      const key = probe.rootChanges + ':' + label;
      if (key === probe.lastEventKey) return;
      probe.lastEventKey = key;
      probe.events.push({ rootVersion: probe.rootChanges, label });
    };
    const observer = new view.MutationObserver(sample);
    probe.observer = observer;
    view.__deunaHeroReplayProbe = probe;
    sample();
    observer.observe(doc.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-label', 'data-position'],
    });
    return true;
  })()`);
  requireCheck(probeArmed, `No se pudo observar el replay contextual antes de cambiar a ${label}.`);
  requireCheck(await clickButtonByText(cdp, label), `No se encontró el botón ${label}.`);
  await waitUntil(cdp, `document.querySelector('iframe')?.title === ${JSON.stringify(frameTitle)}`, `viewport ${label}`);
  await waitUntil(
    cdp,
    `(() => {
      const frame = document.querySelector('iframe[title^="Hero real"]');
      const probe = frame?.contentWindow?.__deunaHeroReplayProbe;
      if (!probe?.rootChanges) return false;
      const currentLabels = probe.events
        .filter((event) => event.rootVersion === probe.rootChanges)
        .map((event) => event.label);
      return new Set(currentLabels).size >= 2;
    })()`,
    `replay automático al cambiar a ${label}`,
    2500
  );
  await delay(950);
  const after = await currentMain(cdp);
  const replayTrace = await cdp.evaluate(`(() => {
    const frame = document.querySelector('iframe[title^="Hero real"]');
    const view = frame?.contentWindow;
    const probe = view?.__deunaHeroReplayProbe;
    if (!probe) return null;
    probe.observer?.disconnect?.();
    const events = probe.events.map((event) => ({ ...event }));
    const currentRootLabels = events
      .filter((event) => event.rootVersion === probe.rootChanges)
      .map((event) => event.label);
    delete view.__deunaHeroReplayProbe;
    return {
      rootChanges: probe.rootChanges,
      events,
      currentRootLabels,
    };
  })()`);
  const edgeWrapCount = await cdp.evaluate(`document.querySelector('iframe[title^="Hero real"]')?.contentDocument?.querySelectorAll('[data-edge-wrap="true"]').length ?? 0`);
  requireCheck(after, `${label} quedó sin slide principal tras el replay contextual.`);
  requireCheck(
    replayTrace && new Set(replayTrace.currentRootLabels).size >= 2,
    `${label} no confirmó un cambio de slide en el Hero montado tras el cambio de dispositivo: ${JSON.stringify(replayTrace)}.`
  );
  requireCheck(edgeWrapCount === 0, `${label} dejó ${edgeWrapCount} edge-wrap residual(es).`);
  return { before, after, edgeWrapCount, replayTrace };
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "deuna-hero-preview-context-"));
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
  const report = { generatedAt: new Date().toISOString(), baseUrl, checks: {}, runtimeIssues: [] };

  try {
    const target = await waitForDebugger(profileDir, browser);
    cdp = new CdpSession(await openWebSocket(target.webSocketDebuggerUrl));
    await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable")]);
    await setViewport(cdp);
    cdp.on("Runtime.exceptionThrown", (event) => report.runtimeIssues.push(event.exceptionDetails?.exception?.description ?? event.exceptionDetails?.text ?? "Excepción JavaScript sin detalle."));
    cdp.on("Runtime.consoleAPICalled", (event) => {
      if (event.type === "error") report.runtimeIssues.push(event.args?.map((arg) => arg.value ?? arg.description ?? arg.type).join(" ") ?? "console.error");
    });

    await loginAdmin(cdp);
    await navigate(cdp, `${baseUrl}/admin/portada?seccion=hero`);
    await waitUntil(cdp, `document.querySelector('iframe[title="Hero real en escritorio"]')?.contentDocument?.querySelector('[data-position="main"]')`, "Hero desktop del editor");

    const initial = await currentMain(cdp);
    requireCheck(initial, "No se pudo identificar el slide inicial del preview.");
    const playClicked = await cdp.evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('button')).find((node) => node.textContent?.includes('Probar funcionamiento'));
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()`);
    requireCheck(playClicked, "No se pudo activar Probar funcionamiento.");
    await waitUntil(cdp, `document.body.innerText.includes('Volver a editar')`, "modo prueba");
    await waitUntil(
      cdp,
      `document.querySelector('iframe[title^="Hero real"]')?.contentDocument?.querySelector('[data-position="main"]')?.getAttribute('aria-label') !== ${JSON.stringify(initial)}`,
      "demostración automática inicial",
      2500
    );
    await delay(950);
    report.checks.initial = { before: initial, after: await currentMain(cdp) };

    report.checks.tablet = await switchDeviceAndRequireReplay(cdp, "Tableta", "Hero real en tableta");
    report.checks.mobile = await switchDeviceAndRequireReplay(cdp, "Móvil", "Hero real en móvil");
    report.checks.desktop = await switchDeviceAndRequireReplay(cdp, "Escritorio", "Hero real en escritorio");

    requireCheck(report.runtimeIssues.length === 0, `Errores runtime: ${report.runtimeIssues.join(" | ")}`);
    await writeFile(path.join(outputDir, "hero-preview-context-runtime.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log("[hero-preview-context] OK: replay automático preservado al cambiar escritorio/tableta/móvil sin salir del modo prueba.");
  } catch (error) {
    report.error = error instanceof Error ? error.stack ?? error.message : String(error);
    await writeFile(path.join(outputDir, "hero-preview-context-runtime.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8").catch(() => {});
    throw error;
  } finally {
    cdp?.close();
    browser.kill("SIGTERM");
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

await main();
