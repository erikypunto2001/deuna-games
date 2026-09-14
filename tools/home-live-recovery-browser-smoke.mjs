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
  throw new Error("Home live recovery smoke necesita Chrome/Chromium en PATH.");
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

async function clearHomeRecoveryStorage(cdp) {
  await cdp.evaluate(`(() => {
    const keys = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key && (key.startsWith('deuna:hero-draft:') || key === 'deuna:home-curation-draft:latest' || key === 'deuna:home-presentation-draft:latest')) keys.push(key);
    }
    keys.forEach((key) => sessionStorage.removeItem(key));
    return keys.length;
  })()`);
}

async function reloadClean(cdp, url, readyExpression, label) {
  await clearHomeRecoveryStorage(cdp);
  await navigate(cdp, url);
  await waitUntil(cdp, readyExpression, label);
  await clearHomeRecoveryStorage(cdp);
}

async function testHero(cdp) {
  const url = `${baseUrl}/admin/portada?seccion=hero`;
  await reloadClean(cdp, url, `document.querySelector('[aria-label="Estilo de movimiento del Hero"]')`, "editor Hero");

  const setup = await cdp.evaluate(`(() => {
    const buttons = Array.from(document.querySelectorAll('[aria-label="Estilo de movimiento del Hero"] button'));
    const active = buttons.find((button) => button.getAttribute('aria-pressed') === 'true');
    const alternatives = buttons.filter((button) => button !== active);
    return {
      active: active?.textContent?.trim() ?? null,
      first: alternatives[0]?.textContent?.trim() ?? null,
      second: alternatives[1]?.textContent?.trim() ?? null,
    };
  })()`);
  requireCheck(setup.active && setup.first && setup.second, "Hero no expuso tres movimientos utilizables.");

  const clickMotion = async (text) => cdp.evaluate(`(() => {
    const button = Array.from(document.querySelectorAll('[aria-label="Estilo de movimiento del Hero"] button')).find((node) => node.textContent?.trim() === ${JSON.stringify(text)});
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`);

  requireCheck(await clickMotion(setup.first), `No se pudo seleccionar ${setup.first}.`);
  await waitUntil(cdp, `document.body.innerText.includes('Cambios sin guardar')`, "Hero sucio");
  await waitUntil(cdp, `sessionStorage.getItem('deuna:hero-draft:latest')`, "copia local Hero");
  await delay(120);
  requireCheck(await clickMotion(setup.second), `No se pudo seleccionar ${setup.second}.`);
  await delay(250);

  const state = await cdp.evaluate(`(() => ({
    recoveryVisible: document.body.innerText.includes('Hay cambios de esta revisión conservados en esta pestaña'),
    topbarInert: Boolean(document.querySelector('[data-preview] header')?.inert),
    latestStored: Boolean(sessionStorage.getItem('deuna:hero-draft:latest')),
  }))()`);
  return { ...setup, ...state };
}

async function testPresentation(cdp) {
  const url = `${baseUrl}/admin/portada?seccion=contenido`;
  await reloadClean(cdp, url, `document.querySelector('input[name="presentationJson"]')`, "Presentación de Inicio");

  const original = await cdp.evaluate(`(() => {
    const label = Array.from(document.querySelectorAll('label')).find((node) => node.textContent?.includes('Título SEO/accesible'));
    const input = label?.querySelector('input');
    return input instanceof HTMLInputElement ? input.value : null;
  })()`);
  requireCheck(typeof original === "string", "No se encontró Título SEO/accesible.");

  const setTitle = async (value) => cdp.evaluate(`(() => {
    const label = Array.from(document.querySelectorAll('label')).find((node) => node.textContent?.includes('Título SEO/accesible'));
    const input = label?.querySelector('input');
    if (!(input instanceof HTMLInputElement)) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);

  requireCheck(await setTitle(`${original} · sesión A`), "No se pudo realizar la primera edición de Presentación.");
  await waitUntil(cdp, `document.querySelector('input[name="presentationJson"]')?.closest('form')?.getAttribute('data-home-editor-dirty') === 'true'`, "Presentación sucia");
  await waitUntil(cdp, `sessionStorage.getItem('deuna:home-presentation-draft:latest')`, "copia local de Presentación");
  await delay(120);
  requireCheck(await setTitle(`${original} · sesión B`), "No se pudo realizar la segunda edición de Presentación.");
  await delay(250);

  return cdp.evaluate(`(() => ({
    recoveryVisible: document.body.innerText.includes('Cambios locales recuperables'),
    presentationInert: Boolean(document.querySelector('input[name="presentationJson"]')?.closest('form')?.querySelector('section[inert]')),
    latestStored: Boolean(sessionStorage.getItem('deuna:home-presentation-draft:latest')),
  }))()`);
}

async function testCuration(cdp) {
  const url = `${baseUrl}/admin/portada?seccion=contenido`;
  await reloadClean(cdp, url, `document.querySelector('input[name="curationJson"]')`, "Curaduría de Inicio");

  const modes = await cdp.evaluate(`(() => {
    const form = document.querySelector('input[name="curationJson"]')?.closest('form');
    const buttons = Array.from(form?.querySelectorAll('button[aria-pressed]') ?? []).filter((button) => ['Manual','Automático','Híbrido'].some((label) => button.textContent?.includes(label)));
    const active = buttons.find((button) => button.getAttribute('aria-pressed') === 'true');
    const alternatives = buttons.filter((button) => button !== active);
    return {
      active: active?.textContent?.trim() ?? null,
      first: alternatives[0]?.textContent?.trim() ?? null,
      second: alternatives[1]?.textContent?.trim() ?? null,
    };
  })()`);
  requireCheck(modes.active && modes.first && modes.second, "Curaduría no expuso tres modos utilizables.");

  const clickMode = async (text) => cdp.evaluate(`(() => {
    const form = document.querySelector('input[name="curationJson"]')?.closest('form');
    const button = Array.from(form?.querySelectorAll('button[aria-pressed]') ?? []).find((node) => node.textContent?.trim() === ${JSON.stringify(text)});
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`);

  requireCheck(await clickMode(modes.first), `No se pudo seleccionar ${modes.first}.`);
  await waitUntil(cdp, `document.querySelector('input[name="curationJson"]')?.closest('form')?.getAttribute('data-home-editor-dirty') === 'true'`, "Curaduría sucia");
  await waitUntil(cdp, `sessionStorage.getItem('deuna:home-curation-draft:latest')`, "copia local de Curaduría");
  await delay(120);
  requireCheck(await clickMode(modes.second), `No se pudo seleccionar ${modes.second}.`);
  await delay(250);

  const state = await cdp.evaluate(`(() => ({
    recoveryVisible: document.body.innerText.includes('Cambios locales recuperables'),
    curationInert: Boolean(document.querySelector('input[name="curationJson"]')?.closest('form')?.querySelector('[inert]')),
    latestStored: Boolean(sessionStorage.getItem('deuna:home-curation-draft:latest')),
  }))()`);
  return { ...modes, ...state };
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "deuna-home-live-recovery-"));
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
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: viewport.width,
      screenHeight: viewport.height,
      screenOrientation: { type: "portraitPrimary", angle: 0 },
    });
    cdp.on("Page.javascriptDialogOpening", () => {
      void cdp.send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
    });
    cdp.on("Runtime.exceptionThrown", (event) => report.runtimeIssues.push(event.exceptionDetails?.exception?.description ?? event.exceptionDetails?.text ?? "Excepción JavaScript sin detalle."));
    cdp.on("Runtime.consoleAPICalled", (event) => {
      if (event.type === "error") report.runtimeIssues.push(event.args?.map((arg) => arg.value ?? arg.description ?? arg.type).join(" ") ?? "console.error");
    });

    await loginAdmin(cdp);
    report.checks.hero = await testHero(cdp);
    report.checks.presentation = await testPresentation(cdp);
    report.checks.curation = await testCuration(cdp);

    const failures = [];
    if (report.checks.hero.recoveryVisible || report.checks.hero.topbarInert) failures.push("Hero se autoactivó como recovery durante la misma sesión.");
    if (report.checks.presentation.recoveryVisible || report.checks.presentation.presentationInert) failures.push("Presentación se autoactivó como recovery durante la misma sesión.");
    if (report.checks.curation.recoveryVisible || report.checks.curation.curationInert) failures.push("Curaduría se autoactivó como recovery durante la misma sesión.");
    if (report.runtimeIssues.length) failures.push(`Errores runtime: ${report.runtimeIssues.join(" | ")}`);

    await writeFile(path.join(outputDir, "home-live-recovery-runtime.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    requireCheck(failures.length === 0, failures.join(" "));
    console.log("[home-live-recovery] OK: Hero, Presentación y Curaduría distinguen edición activa de recuperación tras recarga.");
  } catch (error) {
    report.error = error instanceof Error ? error.stack ?? error.message : String(error);
    await writeFile(path.join(outputDir, "home-live-recovery-runtime.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8").catch(() => {});
    throw error;
  } finally {
    if (cdp) await clearHomeRecoveryStorage(cdp).catch(() => {});
    cdp?.close();
    browser.kill("SIGTERM");
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

await main();
