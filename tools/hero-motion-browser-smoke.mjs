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
    "Hero motion runtime smoke necesita Chrome/Chromium disponible en PATH."
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
          (target) =>
            target.type === "page" && target.webSocketDebuggerUrl
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
          pending.reject(
            new Error(`${pending.method}: ${message.error.message}`)
          );
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
      const timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timeout esperando ${method}.`));
      }, timeoutMs);
      const unsubscribe = this.on(method, (params) => {
        if (!predicate(params)) return;
        clearTimeout(timeout);
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
  const prepared = await cdp.evaluate(`
    (() => {
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
    })()
  `);
  if (!prepared) {
    throw new Error("No se pudo preparar el login real del Admin.");
  }

  const loaded = cdp.waitFor("Page.loadEventFired");
  await cdp.evaluate(`
    document.querySelector('form[action="/api/admin/auth/login"]')?.requestSubmit()
  `);
  await loaded;
  await delay(200);
  const pathname = await cdp.evaluate("location.pathname");
  if (pathname === "/admin/login") {
    throw new Error("El login visual del Admin fue rechazado.");
  }
}

async function capture(cdp, filePath) {
  const image = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  await writeFile(filePath, Buffer.from(image.data, "base64"));
}

function requireCheck(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "deuna-hero-motion-chrome-"));
  const browser = spawn(findChrome(), [
    "--headless=new", "--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox",
    "--remote-debugging-port=0", "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profileDir}`, `--window-size=${viewport.width},${viewport.height}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  browser.stderr.resume();

  let cdp = null;
  const report = { generatedAt: new Date().toISOString(), baseUrl, checks: {}, runtimeIssues: [] };

  const selectMotion = async (label, style) => {
    const clicked = await cdp.evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('button')).find((node) => node.textContent?.trim().startsWith(${JSON.stringify(label)}));
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()`);
    requireCheck(clicked, `No se encontró el selector ${label}.`);
    await waitUntil(cdp, `document.querySelector('iframe[title^="Hero real"]')?.contentDocument?.querySelector('[data-motion-style="${style}"]')`, `motionStyle ${style}`);
  };

  const play = async () => {
    const clicked = await cdp.evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('button')).find((node) => node.textContent?.includes('Probar funcionamiento'));
      if (!(button instanceof HTMLButtonElement)) return document.body.innerText.includes('Volver a editar');
      button.click();
      return true;
    })()`);
    requireCheck(clicked, 'No se pudo activar la prueba interactiva del Hero.');
    await waitUntil(cdp, `document.body.innerText.includes('Volver a editar')`, 'modo de prueba interactiva');
  };

  const replayAndMeasure = async (style) => {
    const before = await cdp.evaluate(`(() => {
      const frame = document.querySelector('iframe[title^="Hero real"]');
      const doc = frame?.contentDocument;
      const root = doc?.querySelector('[data-motion-style="${style}"]');
      const cards = Array.from(doc?.querySelectorAll('[data-position]') ?? []);
      if (frame?.contentWindow) frame.contentWindow.__heroV3Nodes = cards.map(node => ({ node, position: node.getAttribute('data-position') }));
      return { style: root?.getAttribute('data-motion-style') ?? null, main: doc?.querySelector('[data-position="main"]')?.getAttribute('aria-label') ?? null, cards: cards.length };
    })()`);
    const replay = await cdp.evaluate(`(() => {
      const button = Array.from(document.querySelectorAll('button')).find((node) => node.textContent?.includes('Repetir movimiento ahora'));
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click(); return true;
    })()`);
    requireCheck(replay, `No se pudo repetir ${style}.`);
    await delay(260);
    const after = await cdp.evaluate(`(() => {
      const frame = document.querySelector('iframe[title^="Hero real"]');
      const doc = frame?.contentDocument;
      const cards = Array.from(doc?.querySelectorAll('[data-position]') ?? []);
      const prior = frame?.contentWindow?.__heroV3Nodes ?? [];
      const retained = prior.filter(({node}) => cards.includes(node));
      const moved = retained.filter(({node, position}) => node.getAttribute('data-position') !== position);
      const active = doc?.querySelector('[data-position="main"]');
      return {
        main: active?.getAttribute('aria-label') ?? null,
        retained: retained.length,
        moved: moved.length,
        transitionDuration: active ? getComputedStyle(active).transitionDuration : null,
        mainScaleX: active ? getComputedStyle(active).getPropertyValue('--hero-motion-scale-x').trim() : null,
        sideScaleX: doc?.querySelector('[data-position="right1"]') ? getComputedStyle(doc.querySelector('[data-position="right1"]')).getPropertyValue('--hero-motion-scale-x').trim() : null,
        mainArtworkTransform: doc?.querySelector('[data-position="main"] [class*="motionArtwork"]') ? getComputedStyle(doc.querySelector('[data-position="main"] [class*="motionArtwork"]')).transform : null,
        sideArtworkTransform: doc?.querySelector('[data-position="right1"] [class*="motionArtwork"]') ? getComputedStyle(doc.querySelector('[data-position="right1"] [class*="motionArtwork"]')).transform : null,
      };
    })()`);
    requireCheck(after.main !== before.main, `${style} no cambió el juego principal.`);
    requireCheck(after.retained >= 2 && after.moved >= 1, `${style} no conservó nodos físicos entre slots (${after.retained}/${after.moved}).`);
    return { before, after };
  };

  try {
    const target = await waitForDebugger(profileDir, browser);
    cdp = new CdpSession(await openWebSocket(target.webSocketDebuggerUrl));
    await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable'), cdp.send('Network.enable')]);
    await setViewport(cdp);
    cdp.on('Runtime.exceptionThrown', (event) => report.runtimeIssues.push(event.exceptionDetails?.exception?.description ?? event.exceptionDetails?.text ?? 'Excepción JavaScript sin detalle.'));
    cdp.on('Runtime.consoleAPICalled', (event) => { if (event.type === 'error') report.runtimeIssues.push(event.args?.map((arg) => arg.value ?? arg.description ?? arg.type).join(' ') ?? 'console.error'); });

    await loginAdmin(cdp);
    await navigate(cdp, `${baseUrl}/admin/portada?seccion=hero`);
    await waitUntil(cdp, `document.querySelector('iframe[title^="Hero real"]')?.contentDocument?.querySelector('[data-motion-style]')`, 'preview real V3');

    const labels = await cdp.evaluate(`Array.from(document.querySelectorAll('[aria-label="Estilo de movimiento del Hero"] button b')).map(node => node.textContent?.trim())`);
    requireCheck(JSON.stringify(labels) === JSON.stringify(['Momentum','Morph','Parallax Sweep']), `El Admin debe exponer exactamente tres movimientos y expuso ${JSON.stringify(labels)}.`);
    report.checks.motionOptions = labels;

    await selectMotion('Momentum', 'momentum');
    await play();
    report.checks.momentum = await replayAndMeasure('momentum');
    requireCheck(parseFloat(report.checks.momentum.after.transitionDuration ?? '0') > 0, 'Momentum no tiene transición física activa.');

    const dragPoint = await cdp.evaluate(`(() => {
      const frame = document.querySelector('iframe[title^="Hero real"]');
      const doc = frame?.contentDocument;
      const viewportNode = doc?.querySelector('[class*="carouselViewport"]');
      if (!(frame instanceof HTMLIFrameElement) || !viewportNode || typeof viewportNode.getBoundingClientRect !== 'function') return null;
      const fr = frame.getBoundingClientRect(); const vr = viewportNode.getBoundingClientRect();
      if (!(vr.width > 0) || !(vr.height > 0)) return null;
      const sx = fr.width / Math.max(1, frame.clientWidth); const sy = fr.height / Math.max(1, frame.clientHeight);
      return { x: fr.left + (vr.left + vr.width * .55) * sx, y: fr.top + (vr.top + vr.height * .5) * sy };
    })()`);
    requireCheck(dragPoint, 'No se pudo resolver el punto físico del carril para drag.');
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: dragPoint.x, y: dragPoint.y, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: dragPoint.x - 86, y: dragPoint.y, button: 'left', buttons: 1 });
    await delay(80);
    const duringDrag = await cdp.evaluate(`(() => { const doc=document.querySelector('iframe[title^="Hero real"]')?.contentDocument; const root=doc?.querySelector('[data-motion-style]'); const card=doc?.querySelector('[data-position="main"]'); return { dragging: root?.getAttribute('data-dragging') ?? null, transform: card ? getComputedStyle(card).transform : null }; })()`);
    requireCheck(duringDrag.dragging === 'true', 'El drag real no activó el estado continuo antes del pointerup.');
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: dragPoint.x - 86, y: dragPoint.y, button: 'left', buttons: 0, clickCount: 1 });
    report.checks.drag = duringDrag;

    await cdp.evaluate(`Array.from(document.querySelectorAll('button')).find((node) => node.textContent?.includes('Volver a editar'))?.click()`);
    await waitUntil(cdp, `document.body.innerText.includes('Probar funcionamiento')`, 'vuelta a edición');
    await selectMotion('Morph', 'morph'); await play();
    report.checks.morph = await replayAndMeasure('morph');
    requireCheck(report.checks.morph.after.sideScaleX && report.checks.morph.after.sideScaleX !== '1', 'Morph no aplica expansión/compresión progresiva en tarjetas laterales.');

    await cdp.evaluate(`Array.from(document.querySelectorAll('button')).find((node) => node.textContent?.includes('Volver a editar'))?.click()`);
    await waitUntil(cdp, `document.body.innerText.includes('Probar funcionamiento')`, 'vuelta a edición parallax');
    await selectMotion('Parallax Sweep', 'parallax'); await play();
    report.checks.parallax = await replayAndMeasure('parallax');
    requireCheck(report.checks.parallax.after.mainArtworkTransform !== report.checks.parallax.after.sideArtworkTransform, 'Parallax Sweep no separa el recorrido del artwork entre slots.');

    await cdp.send('Emulation.setEmulatedMedia', { media: '', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await delay(120);
    const reduced = await cdp.evaluate(`(() => { const doc=document.querySelector('iframe[title^="Hero real"]')?.contentDocument; const card=doc?.querySelector('[data-position="main"]'); const art=doc?.querySelector('[data-position="main"] [class*="motionArtwork"]'); return { cardDuration: card ? getComputedStyle(card).transitionDuration : null, artworkDuration: art ? getComputedStyle(art).transitionDuration : null, animation: card?.querySelector('[class*="contentReveal"]') ? getComputedStyle(card.querySelector('[class*="contentReveal"] > *')).animationName : null }; })()`);
    report.checks.reducedMotion = reduced;
    requireCheck(reduced.cardDuration === '0s' && reduced.artworkDuration === '0s', `Reduced motion no anuló transiciones: ${JSON.stringify(reduced)}.`);

    await capture(cdp, path.join(outputDir, 'hero-motion-v3-desktop.png'));
    requireCheck(report.runtimeIssues.length === 0, `Errores runtime V3: ${report.runtimeIssues.join(' | ')}`);
    await writeFile(path.join(outputDir, 'hero-motion-runtime.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`[hero-motion-runtime] OK: 3 perfiles V3, nodos físicos estables, drag continuo y reduced motion.`);
  } catch (error) {
    report.error = error instanceof Error ? error.stack ?? error.message : String(error);
    await writeFile(path.join(outputDir, 'hero-motion-runtime.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8').catch(() => {});
    throw error;
  } finally {
    cdp?.close(); browser.kill('SIGTERM'); await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

await main();
