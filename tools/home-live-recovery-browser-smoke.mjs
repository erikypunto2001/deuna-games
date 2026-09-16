import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const baseUrl = (process.env.DEUNA_VISUAL_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const outputDir = path.resolve(process.env.DEUNA_VISUAL_OUTPUT_DIR ?? "artifacts/visual-smoke");
const adminUsername = process.env.DEUNA_VISUAL_ADMIN_USERNAME?.trim();
const adminPassword = process.env.DEUNA_VISUAL_ADMIN_PASSWORD;
const viewport = { width: 1440, height: 1000 };

function requireCheck(condition, message) {
  if (!condition) throw new Error(message);
}

function findChrome() {
  const candidates = [process.env.CHROME_BIN, "google-chrome-stable", "google-chrome", "chromium", "chromium-browser"].filter(Boolean);
  for (const candidate of candidates) {
    const result = spawnSync("sh", ["-lc", `command -v ${JSON.stringify(candidate)}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  throw new Error("Home live recovery smoke necesita Chrome/Chromium en PATH.");
}

async function waitForDebugger(profileDir, browser) {
  const activePortPath = path.join(profileDir, "DevToolsActivePort");
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (browser.exitCode !== null) throw new Error(`Chrome terminó antes de exponer DevTools (exit ${browser.exitCode}).`);
    try {
      const raw = await readFile(activePortPath, "utf8");
      const port = Number.parseInt(raw.split(/\r?\n/, 1)[0] ?? "", 10);
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
        if (page) return page;
      }
    } catch {}
    await delay(100);
  }
  throw new Error("Chrome no expuso DevTools a tiempo.");
}

function openWebSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error("Timeout conectando con Chrome DevTools.")), 10_000);
    socket.addEventListener("open", () => { clearTimeout(timer); resolve(socket); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("No se pudo abrir Chrome DevTools.")); }, { once: true });
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
  }
  waitFor(method, timeoutMs = 15_000) {
    return new Promise((resolve, reject) => {
      const listener = (params) => {
        clearTimeout(timer);
        this.listeners.get(method)?.delete(listener);
        resolve(params);
      };
      const timer = setTimeout(() => {
        this.listeners.get(method)?.delete(listener);
        reject(new Error(`Timeout esperando ${method}.`));
      }, timeoutMs);
      const listeners = this.listeners.get(method) ?? new Set();
      listeners.add(listener);
      this.listeners.set(method, listeners);
    });
  }
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "Runtime.evaluate falló.");
    return result.result?.value;
  }
  close() { this.socket.close(); }
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
  if (!adminUsername || !adminPassword) throw new Error("Faltan credenciales visuales del Admin.");
  await navigate(cdp, `${baseUrl}/admin/login`);
  await waitUntil(cdp, `document.querySelector('#admin-username')`, "login Admin");
  requireCheck(await cdp.evaluate(`(() => {
    const username = document.querySelector('#admin-username');
    const password = document.querySelector('#admin-password');
    const form = document.querySelector('form[action="/api/admin/auth/login"]');
    if (!(username instanceof HTMLInputElement) || !(password instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) return false;
    username.value = ${JSON.stringify(adminUsername)};
    password.value = ${JSON.stringify(adminPassword)};
    username.dispatchEvent(new Event('input', { bubbles: true }));
    password.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`), "No se pudo preparar el login Admin.");
  const loaded = cdp.waitFor("Page.loadEventFired");
  await cdp.evaluate(`document.querySelector('form[action="/api/admin/auth/login"]')?.requestSubmit()`);
  await loaded;
  requireCheck((await cdp.evaluate("location.pathname")) !== "/admin/login", "El login visual del Admin fue rechazado.");
}

async function clearRecoveryStorage(cdp) {
  await cdp.evaluate(`(() => {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key && (
        key.startsWith('deuna:hero-draft:') ||
        key === 'deuna:home-curation-draft:latest' ||
        key === 'deuna:home-presentation-draft:latest' ||
        key === 'deuna:home-row-reveal-draft:latest'
      )) keys.push(key);
    }
    keys.forEach((key) => sessionStorage.removeItem(key));
  })()`);
}

async function openClean(cdp, url, ready, label) {
  await clearRecoveryStorage(cdp);
  await navigate(cdp, url);
  await waitUntil(cdp, ready, label);
  await clearRecoveryStorage(cdp);
}

async function testHero(cdp) {
  await openClean(cdp, `${baseUrl}/admin/portada?seccion=hero`, `document.querySelector('[aria-label="Estilo de movimiento del Hero"]')`, "Hero");
  const choices = await cdp.evaluate(`(() => {
    const buttons = Array.from(document.querySelectorAll('[aria-label="Estilo de movimiento del Hero"] button'));
    const active = buttons.find((button) => button.getAttribute('aria-pressed') === 'true');
    return buttons.filter((button) => button !== active).slice(0, 2).map((button) => button.textContent?.trim());
  })()`);
  requireCheck(choices?.length === 2, "Hero no expuso dos movimientos alternativos.");
  for (const [index, choice] of choices.entries()) {
    requireCheck(await cdp.evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('[aria-label="Estilo de movimiento del Hero"] button')).find((node) => node.textContent?.trim() === ${JSON.stringify(choice)});
      if (!(button instanceof HTMLButtonElement)) return false; button.click(); return true;
    })()`), `No se pudo cambiar Hero (${index + 1}).`);
    if (index === 0) await waitUntil(cdp, `sessionStorage.getItem('deuna:hero-draft:latest')`, "copia local Hero");
    await delay(150);
  }
  return cdp.evaluate(`({
    recoveryVisible: document.body.innerText.includes('Hay cambios de esta revisión conservados en esta pestaña'),
    inert: Boolean(document.querySelector('[data-preview] header')?.inert),
    stored: Boolean(sessionStorage.getItem('deuna:hero-draft:latest'))
  })`);
}

async function applyPresentationTitle(cdp, value, label) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const dispatched = await cdp.evaluate(`(() => {
      const label = Array.from(document.querySelectorAll('label')).find((node) => node.textContent?.includes('Título SEO/accesible'));
      const input = label?.querySelector('input');
      if (!(input instanceof HTMLInputElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (typeof setter !== 'function') return false;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    if (dispatched) {
      await delay(80);
      const committed = await cdp.evaluate(`(() => {
        const hidden = document.querySelector('input[name="presentationJson"]');
        if (!(hidden instanceof HTMLInputElement)) return false;
        try {
          const parsed = JSON.parse(hidden.value);
          const dirty = hidden.closest('form')?.getAttribute('data-home-editor-dirty') === 'true';
          return dirty && parsed?.copy?.hero?.accessibleTitle === ${JSON.stringify(value)};
        } catch {
          return false;
        }
      })()`);
      if (committed) return;
    }
    await delay(100);
  }
  throw new Error(`Timeout esperando que React confirme ${label}.`);
}

async function waitForStoredPresentation(cdp, expectedTitle) {
  await waitUntil(cdp, `(() => {
    try {
      const raw = sessionStorage.getItem('deuna:home-presentation-draft:latest');
      if (!raw) return false;
      return JSON.parse(raw)?.copy?.hero?.accessibleTitle === ${JSON.stringify(expectedTitle)};
    } catch {
      return false;
    }
  })()`, "copia local Presentación");
}

async function testPresentation(cdp) {
  await openClean(cdp, `${baseUrl}/admin/portada?seccion=contenido`, `document.querySelector('input[name="presentationJson"]')`, "Presentación");
  const original = await cdp.evaluate(`(() => {
    const label = Array.from(document.querySelectorAll('label')).find((node) => node.textContent?.includes('Título SEO/accesible'));
    const input = label?.querySelector('input');
    return input instanceof HTMLInputElement ? input.value : null;
  })()`);
  requireCheck(typeof original === "string", "No se encontró el título de Presentación.");
  for (const suffix of ["sesión A", "sesión B"]) {
    const nextTitle = `${original} · ${suffix}`;
    await applyPresentationTitle(cdp, nextTitle, `Presentación (${suffix})`);
    if (suffix === "sesión A") await waitForStoredPresentation(cdp, nextTitle);
    await delay(150);
  }
  return cdp.evaluate(`({
    recoveryVisible: document.body.innerText.includes('Cambios locales recuperables'),
    inert: Boolean(document.querySelector('input[name="presentationJson"]')?.closest('form')?.querySelector('section[inert]')),
    stored: Boolean(sessionStorage.getItem('deuna:home-presentation-draft:latest'))
  })`);
}

async function testCuration(cdp) {
  await openClean(cdp, `${baseUrl}/admin/portada?seccion=contenido`, `document.querySelector('input[name="curationJson"]')`, "Curaduría");
  const choices = await cdp.evaluate(`(() => {
    const form = document.querySelector('input[name="curationJson"]')?.closest('form');
    const grid = form?.querySelector('[aria-label^="Modo de "]');
    const buttons = Array.from(grid?.querySelectorAll('button[aria-pressed]') ?? []);
    const active = buttons.find((button) => button.getAttribute('aria-pressed') === 'true');
    return buttons.filter((button) => button !== active).slice(0, 2).map((button) => button.textContent?.trim());
  })()`);
  requireCheck(choices?.length === 2, "Curaduría no expuso dos modos alternativos.");
  for (const [index, choice] of choices.entries()) {
    requireCheck(await cdp.evaluate(`(() => {
      const form = document.querySelector('input[name="curationJson"]')?.closest('form');
      const grid = form?.querySelector('[aria-label^="Modo de "]');
      const button = Array.from(grid?.querySelectorAll('button[aria-pressed]') ?? []).find((node) => node.textContent?.trim() === ${JSON.stringify(choice)});
      if (!(button instanceof HTMLButtonElement)) return false; button.click(); return true;
    })()`), `No se pudo cambiar Curaduría (${index + 1}).`);
    if (index === 0) {
      await waitUntil(cdp, `document.querySelector('input[name="curationJson"]')?.closest('form')?.getAttribute('data-home-editor-dirty') === 'true'`, "Curaduría sucia");
      await waitUntil(cdp, `sessionStorage.getItem('deuna:home-curation-draft:latest')`, "copia local Curaduría");
    }
    await delay(150);
  }
  return cdp.evaluate(`({
    recoveryVisible: document.body.innerText.includes('Cambios locales recuperables'),
    inert: Boolean(document.querySelector('input[name="curationJson"]')?.closest('form')?.querySelector('[inert]')),
    stored: Boolean(sessionStorage.getItem('deuna:home-curation-draft:latest'))
  })`);
}

async function currentHomeRevision(cdp) {
  const revision = await cdp.evaluate(`(() => {
    const input = document.querySelector('input[name="expectedRevision"]');
    return input instanceof HTMLInputElement ? Number(input.value) : NaN;
  })()`);
  requireCheck(Number.isInteger(revision) && revision >= 0, "No se pudo leer la revisión actual de Inicio.");
  return revision;
}

async function clickCoordinatedSave(cdp, nextRevision, label) {
  requireCheck(await cdp.evaluate(`(() => {
    const button = Array.from(document.querySelectorAll('button')).find((node) => node.textContent?.trim() === 'Guardar cambios');
    if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
    button.click();
    return true;
  })()`), `No se pudo activar Guardar cambios (${label}).`);

  await waitUntil(
    cdp,
    `(() => {
      const revision = document.querySelector('input[name="expectedRevision"]');
      const dirty = document.querySelector('form[data-home-editor-dirty="true"]');
      return revision instanceof HTMLInputElement &&
        Number(revision.value) === ${nextRevision} &&
        !dirty &&
        new URLSearchParams(location.search).get('estado') === 'guardado';
    })()`,
    `guardado coordinado ${label}`,
    20_000
  );
}

async function testCoordinatedSave(cdp) {
  await openClean(
    cdp,
    `${baseUrl}/admin/portada?seccion=contenido`,
    `document.querySelector('input[name="presentationJson"]') && Array.from(document.querySelectorAll('button')).some((node) => node.textContent?.trim() === 'Guardar cambios')`,
    "guardado coordinado"
  );

  const originalTitle = await cdp.evaluate(`(() => {
    const label = Array.from(document.querySelectorAll('label')).find((node) => node.textContent?.includes('Título SEO/accesible'));
    const input = label?.querySelector('input');
    return input instanceof HTMLInputElement ? input.value : null;
  })()`);
  requireCheck(typeof originalTitle === "string", "No se pudo leer el título original antes del guardado coordinado.");

  const initialRevision = await currentHomeRevision(cdp);
  const probeTitle = `${originalTitle} · smoke guardado coordinado`;
  await applyPresentationTitle(cdp, probeTitle, "guardado coordinado");
  await waitUntil(
    cdp,
    `Array.from(document.querySelectorAll('button')).some((node) => node.textContent?.trim() === 'Guardar cambios' && !node.disabled)`,
    "acción coordinada habilitada"
  );
  await clickCoordinatedSave(cdp, initialRevision + 1, "de prueba");

  await applyPresentationTitle(cdp, originalTitle, "restauración coordinada");
  await clickCoordinatedSave(cdp, initialRevision + 2, "de restauración");

  const finalTitle = await cdp.evaluate(`(() => {
    const label = Array.from(document.querySelectorAll('label')).find((node) => node.textContent?.includes('Título SEO/accesible'));
    const input = label?.querySelector('input');
    return input instanceof HTMLInputElement ? input.value : null;
  })()`);

  return {
    recoveryVisible: Boolean(await cdp.evaluate(`document.body.innerText.includes('Cambios locales recuperables')`)),
    inert: Boolean(await cdp.evaluate(`document.querySelector('form[data-home-editor-dirty="true"]')`)),
    initialRevision,
    finalRevision: await currentHomeRevision(cdp),
    restored: finalTitle === originalTitle,
  };
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "deuna-home-live-recovery-"));
  const browser = spawn(findChrome(), ["--headless=new", "--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox", "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profileDir}`, `--window-size=${viewport.width},${viewport.height}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  browser.stderr.resume();
  let cdp = null;
  const report = { generatedAt: new Date().toISOString(), baseUrl, checks: {}, runtimeIssues: [] };
  try {
    const target = await waitForDebugger(profileDir, browser);
    cdp = new CdpSession(await openWebSocket(target.webSocketDebuggerUrl));
    await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable")]);
    await cdp.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: false, screenWidth: viewport.width, screenHeight: viewport.height });
    cdp.on("Page.javascriptDialogOpening", () => { void cdp.send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {}); });
    cdp.on("Runtime.exceptionThrown", (event) => report.runtimeIssues.push(event.exceptionDetails?.exception?.description ?? event.exceptionDetails?.text ?? "Excepción JavaScript."));
    cdp.on("Runtime.consoleAPICalled", (event) => { if (event.type === "error") report.runtimeIssues.push(event.args?.map((arg) => arg.value ?? arg.description ?? arg.type).join(" ") ?? "console.error"); });
    await loginAdmin(cdp);
    report.checks.hero = await testHero(cdp);
    report.checks.presentation = await testPresentation(cdp);
    report.checks.curation = await testCuration(cdp);
    report.checks.coordinatedSave = await testCoordinatedSave(cdp);
    const failures = Object.entries(report.checks).filter(([, value]) => value.recoveryVisible || value.inert).map(([name]) => `${name} se autoactivó como recovery o quedó sucio durante la misma sesión.`);
    if (report.checks.coordinatedSave && !report.checks.coordinatedSave.restored) failures.push("El smoke de guardado coordinado no restauró el título editorial original.");
    if (report.runtimeIssues.length) failures.push(`Errores runtime: ${report.runtimeIssues.join(" | ")}`);
    await writeFile(path.join(outputDir, "home-live-recovery-runtime.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    requireCheck(failures.length === 0, failures.join(" "));
    console.log(`[home-live-recovery] OK: recovery estable y guardado coordinado real ${report.checks.coordinatedSave.initialRevision} -> ${report.checks.coordinatedSave.finalRevision} sin 403, con restauración editorial.`);
  } catch (error) {
    report.error = error instanceof Error ? error.stack ?? error.message : String(error);
    await writeFile(path.join(outputDir, "home-live-recovery-runtime.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8").catch(() => {});
    throw error;
  } finally {
    if (cdp) await clearRecoveryStorage(cdp).catch(() => {});
    cdp?.close();
    browser.kill("SIGTERM");
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

await main();
