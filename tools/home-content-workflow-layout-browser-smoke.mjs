import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const baseUrl = (process.env.DEUNA_VISUAL_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const outputDir = path.resolve(process.env.DEUNA_VISUAL_OUTPUT_DIR ?? "artifacts/visual-smoke");
const adminUsername = process.env.DEUNA_VISUAL_ADMIN_USERNAME?.trim();
const adminPassword = process.env.DEUNA_VISUAL_ADMIN_PASSWORD;
const workflowLabel = "Flujo de edición de Resto de Inicio";
const expectedLabels = ["Estructura y textos", "Curaduría", "Cards"];
const viewports = [
  { name: "tablet", width: 1024, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];

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
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }

  throw new Error("Workflow responsive smoke necesita Chrome/Chromium en PATH.");
}

async function waitForDebugger(profileDir, browser) {
  const activePortPath = path.join(profileDir, "DevToolsActivePort");
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    if (browser.exitCode !== null) {
      throw new Error(`Chrome terminó antes de exponer DevTools (exit ${browser.exitCode}).`);
    }

    try {
      const { readFile } = await import("node:fs/promises");
      const raw = await readFile(activePortPath, "utf8");
      const port = Number.parseInt(raw.split(/\r?\n/, 1)[0] ?? "", 10);
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find(
          (target) => target.type === "page" && target.webSocketDebuggerUrl
        );
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
        reject(new Error("No se pudo abrir Chrome DevTools."));
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

      for (const listener of this.listeners.get(message.method) ?? []) {
        listener(message.params ?? {});
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
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
    await delay(80);
  }
  throw new Error(`Timeout esperando ${label}.`);
}

async function loginAdmin(cdp) {
  if (!adminUsername || !adminPassword) {
    throw new Error("Faltan credenciales visuales del Admin.");
  }

  await navigate(cdp, `${baseUrl}/admin/login`);
  await waitUntil(cdp, `document.querySelector('#admin-username')`, "login Admin");

  requireCheck(
    await cdp.evaluate(`(() => {
      const username = document.querySelector('#admin-username');
      const password = document.querySelector('#admin-password');
      const form = document.querySelector('form[action="/api/admin/auth/login"]');
      if (!(username instanceof HTMLInputElement) || !(password instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) return false;
      username.value = ${JSON.stringify(adminUsername)};
      password.value = ${JSON.stringify(adminPassword)};
      username.dispatchEvent(new Event('input', { bubbles: true }));
      password.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`),
    "No se pudo preparar el login Admin."
  );

  const loaded = cdp.waitFor("Page.loadEventFired");
  await cdp.evaluate(
    `document.querySelector('form[action="/api/admin/auth/login"]')?.requestSubmit()`
  );
  await loaded;
  requireCheck(
    (await cdp.evaluate("location.pathname")) !== "/admin/login",
    "El login visual del Admin fue rechazado."
  );
}

async function inspectViewport(cdp, viewport) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
  });

  await navigate(cdp, `${baseUrl}/admin/portada?seccion=contenido`);
  await waitUntil(
    cdp,
    `document.querySelector('nav[aria-label=${JSON.stringify(workflowLabel)}]')`,
    `workflow ${viewport.name}`
  );
  await delay(120);

  const result = await cdp.evaluate(`(() => {
    const nav = document.querySelector('nav[aria-label=${JSON.stringify(workflowLabel)}]');
    if (!(nav instanceof HTMLElement)) return null;
    const links = Array.from(nav.querySelectorAll('a[href^="#home-content-"]'));
    const labels = links.map((link) => link.querySelector('strong'));
    const navRect = nav.getBoundingClientRect();
    const linkRects = links.map((link) => link.getBoundingClientRect());
    const epsilon = 1;
    const style = getComputedStyle(nav);
    return {
      labels: labels.map((label) => label?.textContent?.trim() ?? ''),
      display: style.display,
      overflowX: style.overflowX,
      navOverflow: nav.scrollWidth > nav.clientWidth + epsilon,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + epsilon,
      linksInside: linkRects.every((rect) => rect.left >= navRect.left - epsilon && rect.right <= navRect.right + epsilon),
      linksOverlap: linkRects.some((rect, index) => index > 0 && rect.left < linkRects[index - 1].right - epsilon),
      labelsClipped: labels.some((label) => label instanceof HTMLElement && (label.scrollWidth > label.clientWidth + epsilon || label.scrollHeight > label.clientHeight + epsilon)),
      linkWidths: linkRects.map((rect) => Math.round(rect.width)),
      navWidth: Math.round(navRect.width),
    };
  })()`);

  requireCheck(result, `No se pudo medir el workflow en ${viewport.name}.`);
  requireCheck(
    JSON.stringify(result.labels) === JSON.stringify(expectedLabels),
    `${viewport.name}: las etiquetas del workflow no están completas.`
  );
  requireCheck(result.display === "grid", `${viewport.name}: el workflow debe seguir siendo grid.`);
  requireCheck(
    result.overflowX !== "auto" && result.overflowX !== "scroll",
    `${viewport.name}: el workflow no debe convertirse en carrusel horizontal.`
  );
  requireCheck(!result.navOverflow, `${viewport.name}: el workflow desborda su propio ancho.`);
  requireCheck(!result.pageOverflow, `${viewport.name}: Resto de Inicio genera overflow horizontal de página.`);
  requireCheck(result.linksInside, `${viewport.name}: uno de los tres pasos queda fuera del workflow.`);
  requireCheck(!result.linksOverlap, `${viewport.name}: los pasos del workflow se superponen.`);
  requireCheck(!result.labelsClipped, `${viewport.name}: una etiqueta del workflow quedó recortada.`);

  return result;
}

async function main() {
  const profileDir = await mkdtemp(
    path.join(os.tmpdir(), "deuna-home-workflow-layout-")
  );
  const browser = spawn(
    findChrome(),
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--remote-debugging-port=0",
      "--remote-debugging-address=127.0.0.1",
      `--user-data-dir=${profileDir}`,
      "--window-size=1440,1000",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
  browser.stderr.resume();

  let cdp = null;
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    checks: {},
  };

  try {
    const target = await waitForDebugger(profileDir, browser);
    cdp = new CdpSession(await openWebSocket(target.webSocketDebuggerUrl));
    await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable")]);
    await loginAdmin(cdp);

    for (const viewport of viewports) {
      report.checks[viewport.name] = await inspectViewport(cdp, viewport);
    }

    await writeFile(
      path.join(outputDir, "home-content-workflow-layout-runtime.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8"
    );

    console.log(
      "[home-content-workflow-layout] OK: los 3 pasos permanecen completos y contenidos en tablet/mobile, sin scroll horizontal ni truncamiento."
    );
  } catch (error) {
    report.error = error instanceof Error ? error.stack ?? error.message : String(error);
    await writeFile(
      path.join(outputDir, "home-content-workflow-layout-runtime.json"),
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
