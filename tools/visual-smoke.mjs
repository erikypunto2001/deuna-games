import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {
  spawn,
  spawnSync,
} from "node:child_process";
import {
  setTimeout as delay,
} from "node:timers/promises";


const baseUrl = (
  process.env.DEUNA_VISUAL_BASE_URL ??
  "http://127.0.0.1:3000"
).replace(/\/$/, "");
const outputDir = path.resolve(
  process.env.DEUNA_VISUAL_OUTPUT_DIR ??
  "artifacts/visual-smoke"
);
const adminUsername =
  process.env.DEUNA_VISUAL_ADMIN_USERNAME?.trim();
const adminPassword =
  process.env.DEUNA_VISUAL_ADMIN_PASSWORD;


const viewports = [
  {
    id: "desktop",
    width: 1440,
    height: 1000,
    mobile: false,
  },
  {
    id: "tablet",
    width: 1024,
    height: 900,
    mobile: false,
  },
  {
    id: "mobile",
    width: 390,
    height: 844,
    mobile: true,
  },
];


const publicPages = [
  {
    id: "home",
    pathname: "/",
    expectedSelector: "main#main-content",
    expectedText: null,
  },
];


const retiredEditorialHistoryTexts = [
  "Historial de publicaciones",
  "Historial de revisiones",
  "Historial de marca y apariencia",
  "Restaurar publicación",
  "Restaurar revisión",
  "REINICIAR HISTORIAL",
  "REINICIAR INICIO",
  "revisión recuperable",
];


const adminPages = [
  {
    id: "admin-dashboard",
    pathname: "/admin",
    expectedSelector: "main#main-content",
    expectedText: "Resumen",
  },
  {
    id: "admin-game-current",
    pathname: "/admin/juegos/elden-ring?seccion=ficha",
    expectedSelector: "main#main-content",
    expectedText: "JUEGO · REVISIÓN",
  },
  {
    id: "admin-game-publication",
    pathname: "/admin/juegos/elden-ring/publicacion",
    expectedSelector: "main#main-content",
    expectedText: "PUBLICACIÓN · REVISIÓN",
  },
  {
    id: "admin-catalog-publication",
    pathname: "/admin/catalogos?seccion=publicacion",
    expectedSelector: "main#main-content",
    expectedText: "Clasificaciones y etiquetas",
  },
  {
    id: "admin-configuration-publication",
    pathname: "/admin/configuracion?seccion=publicacion",
    expectedSelector: "main#main-content",
    expectedText: "Publicación de marca y apariencia",
  },
  {
    id: "admin-pages-publication",
    pathname: "/admin/paginas/presentacion?seccion=publicacion",
    expectedSelector: "main#main-content",
    expectedText: "Textos y cabeceras públicas",
  },
  {
    id: "admin-about-publication",
    pathname: "/admin/paginas/quienes-somos?seccion=publicacion",
    expectedSelector: "main#main-content",
    expectedText: "Quiénes somos",
  },
  {
    id: "admin-home-hero",
    pathname: "/admin/portada?seccion=hero",
    expectedSelector: "main#main-content",
    expectedText: "Editor de Hero",
  },
  {
    id: "admin-home-content",
    pathname: "/admin/portada?seccion=contenido",
    expectedSelector: "main#main-content",
    expectedText: "Resto de Inicio",
  },
  {
    id: "admin-home-publication",
    pathname: "/admin/portada?seccion=publicacion",
    expectedSelector: "main#main-content",
    expectedText: "INICIO · REVISIÓN",
  },
  {
    id: "admin-maintenance",
    pathname: "/admin/mantenimiento",
    expectedSelector: "main#main-content",
    expectedText: "Mantenimiento",
  },
];


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
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }
    );
    const resolved = result.stdout.trim();
    if (result.status === 0 && resolved) return resolved;
  }


  throw new Error(
    "Visual smoke necesita Chrome/Chromium disponible en PATH."
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
      const response = await fetch(
        `http://127.0.0.1:${port}/json/list`
      );
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find(
          (target) =>
            target.type === "page" &&
            target.webSocketDebuggerUrl
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
      lastError instanceof Error
        ? ` ${lastError.message}`
        : ""
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
            new Error(
              `${pending.method}: ${message.error.message}`
            )
          );
        } else {
          pending.resolve(message.result ?? {});
        }
        return;
      }


      if (!message.method) return;
      const listeners = this.listeners.get(message.method);
      if (!listeners) return;
      for (const listener of [...listeners]) {
        listener(message.params ?? {});
      }
    });
  }


  send(method, params = {}) {
    const id = this.nextId++;


    return new Promise((resolve, reject) => {
      this.pending.set(id, {
        method,
        resolve,
        reject,
      });
      this.socket.send(
        JSON.stringify({
          id,
          method,
          params,
        })
      );
    });
  }


  on(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);


    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.listeners.delete(method);
      }
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
    throw new Error(
      `No se pudo navegar a ${url}: ${navigation.errorText}`
    );
  }


  await loaded;
}


async function waitForApplication(cdp) {
  await cdp.evaluate(`
    (async () => {
      if (document.fonts?.ready) {
        await Promise.race([
          document.fonts.ready,
          new Promise((resolve) => setTimeout(resolve, 5000)),
        ]);
      }


      const freeze = document.createElement("style");
      freeze.setAttribute("data-visual-smoke", "true");
      freeze.textContent = [
        "*,*::before,*::after{",
        "animation-duration:0s!important;",
        "animation-delay:0s!important;",
        "transition-duration:0s!important;",
        "scroll-behavior:auto!important;",
        "caret-color:transparent!important;",
        "}",
        "nextjs-portal{display:none!important;}",
      ].join("");
      document.head.appendChild(freeze);


      const step = Math.max(240, Math.floor(window.innerHeight * 0.8));
      const maximum = Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight ?? 0
      );


      for (let y = 0; y < maximum; y += step) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 45));
      }
      window.scrollTo(0, 0);


      const images = Array.from(document.images);
      await Promise.race([
        Promise.all(
          images.map((image) =>
            image.complete
              ? Promise.resolve()
              : new Promise((resolve) => {
                  image.addEventListener("load", resolve, { once: true });
                  image.addEventListener("error", resolve, { once: true });
                })
          )
        ),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);


      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );
    })()
  `);


  await delay(180);
}


async function setViewport(cdp, viewport) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
    screenOrientation: {
      type: "portraitPrimary",
      angle: 0,
    },
  });
}


async function auditLayout(
  cdp,
  expectedSelector,
  expectedText,
  mobile,
  forbiddenTexts = []
) {
  return cdp.evaluate(`
    (() => {
      const expectedSelector = ${JSON.stringify(expectedSelector)};
      const expectedText = ${JSON.stringify(expectedText)};
      const forbiddenTexts = ${JSON.stringify(forbiddenTexts)};
      const viewportWidth = window.innerWidth;
      const root = document.documentElement;
      const body = document.body;
      const scrollWidth = Math.max(
        root.scrollWidth,
        body?.scrollWidth ?? 0
      );


      function isVisible(element) {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity || "1") > 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      }


      function isInsideHorizontalOverflow(element) {
        let parent = element.parentElement;
        while (parent && parent !== body) {
          const style = getComputedStyle(parent);
          const overflowX = style.overflowX;
          if (
            ["auto", "scroll", "hidden", "clip"].includes(overflowX) &&
            parent.scrollWidth > parent.clientWidth + 1
          ) {
            return true;
          }
          parent = parent.parentElement;
        }
        return false;
      }


      const interactive = Array.from(
        document.querySelectorAll(
          "a[href],button,input,select,textarea,summary"
        )
      ).filter(isVisible);
      const outsideViewport = interactive
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const outside =
            rect.left < -2 || rect.right > viewportWidth + 2;
          return outside && !isInsideHorizontalOverflow(element);
        })
        .slice(0, 20)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            text: (element.textContent ?? "").trim().slice(0, 100),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          };
        });
      const smallTouchTargets = ${mobile ? "interactive" : "[]"}
        .filter((element) => {
          if (element.tagName === "A") {
            const style = getComputedStyle(element);
            if (style.display === "inline") return false;
          }
          const rect = element.getBoundingClientRect();
          return rect.width < 44 || rect.height < 44;
        })
        .slice(0, 20)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            text: (element.textContent ?? "").trim().slice(0, 100),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        });


      return {
        url: location.href,
        title: document.title,
        viewportWidth,
        viewportHeight: window.innerHeight,
        scrollWidth,
        scrollHeight: Math.max(
          root.scrollHeight,
          body?.scrollHeight ?? 0
        ),
        horizontalOverflow: scrollWidth > viewportWidth + 2,
        outsideViewport,
        smallTouchTargets,
        expectedSelectorPresent: Boolean(
          document.querySelector(expectedSelector)
        ),
        expectedTextPresent:
          expectedText === null ||
          (body?.innerText ?? "").includes(expectedText),
        forbiddenTextsPresent: forbiddenTexts.filter((text) =>
          (body?.innerText ?? "").includes(text)
        ),
      };
    })()
  `);
}


async function captureScreenshot(
  cdp,
  filePath,
  viewport
) {
  const metrics = await cdp.send("Page.getLayoutMetrics");
  const contentSize =
    metrics.cssContentSize ?? metrics.contentSize;
  const contentHeight = Math.max(
    viewport.height,
    Math.ceil(contentSize.height)
  );
  const screenshotHeight = Math.min(contentHeight, 30_000);
  const capture = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
    clip: {
      x: 0,
      y: 0,
      width: viewport.width,
      height: screenshotHeight,
      scale: 1,
    },
  });


  await writeFile(filePath, Buffer.from(capture.data, "base64"));


  return {
    contentHeight,
    screenshotHeight,
    truncated: contentHeight > screenshotHeight,
  };
}


function issueText(event) {
  if (event.kind === "exception") return event.text;
  if (event.kind === "console") return event.text;
  if (event.kind === "network") {
    return `${event.method} ${event.url}: ${event.text}`;
  }
  return String(event.text ?? "Error visual desconocido.");
}


async function loginAdmin(cdp) {
  if (!adminUsername || !adminPassword) {
    throw new Error(
      "Faltan DEUNA_VISUAL_ADMIN_USERNAME/DEUNA_VISUAL_ADMIN_PASSWORD."
    );
  }


  await setViewport(cdp, viewports[0]);
  await navigate(cdp, `${baseUrl}/admin/login`);
  await waitForApplication(cdp);


  const prepared = await cdp.evaluate(`
    (() => {
      const username = document.querySelector("#admin-username");
      const password = document.querySelector("#admin-password");
      const form = document.querySelector('form[action="/api/admin/auth/login"]');
      if (!(username instanceof HTMLInputElement)) return false;
      if (!(password instanceof HTMLInputElement)) return false;
      if (!(form instanceof HTMLFormElement)) return false;


      username.value = ${JSON.stringify(adminUsername)};
      password.value = ${JSON.stringify(adminPassword)};
      username.dispatchEvent(new Event("input", { bubbles: true }));
      password.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()
  `);


  if (!prepared) {
    throw new Error("No se encontró el formulario real de login del Admin.");
  }


  const loaded = cdp.waitFor("Page.loadEventFired");
  await cdp.evaluate(`
    (() => {
      const form = document.querySelector('form[action="/api/admin/auth/login"]');
      if (!(form instanceof HTMLFormElement)) {
        throw new Error("El formulario de login desapareció antes del submit.");
      }
      form.requestSubmit();
    })()
  `);


  await loaded;
  await delay(250);


  const pathname = await cdp.evaluate("location.pathname");
  if (pathname === "/admin/login") {
    const search = await cdp.evaluate("location.search");
    throw new Error(
      `El login visual del Admin fue rechazado (${search || "sin estado"}).`
    );
  }
}


function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}


async function writeReport(results, failures) {
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    results,
    failures,
  };


  await writeFile(
    path.join(outputDir, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );


  const cards = results.map((result) => `
    <article>
      <h2>${htmlEscape(result.page)} · ${htmlEscape(result.viewport)}</h2>
      <p>${htmlEscape(result.audit.url)}</p>
      <img src="${htmlEscape(result.file)}" alt="Captura ${htmlEscape(result.page)} ${htmlEscape(result.viewport)}" loading="lazy">
      <pre>${htmlEscape(JSON.stringify({
        horizontalOverflow: result.audit.horizontalOverflow,
        outsideViewport: result.audit.outsideViewport,
        smallTouchTargets: result.audit.smallTouchTargets,
        forbiddenTextsPresent: result.audit.forbiddenTextsPresent,
        runtimeIssues: result.runtimeIssues,
        truncated: result.capture.truncated,
      }, null, 2))}</pre>
    </article>
  `).join("\n");


  await writeFile(
    path.join(outputDir, "index.html"),
    `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DeUna visual smoke</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#101114;color:#f3f5f7}main{max-width:1500px;margin:auto}article{margin:0 0 36px;padding:20px;background:#191b20;border:1px solid #30343c;border-radius:16px}img{display:block;max-width:100%;height:auto;margin:16px auto;background:#fff}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#0b0c0f;padding:16px;border-radius:10px}a{color:#8fc8ff}.fail{color:#ff9b9b}</style>
</head>
<body>
<main>
<h1>DeUna visual smoke</h1>
<p>Capturas reales de Chrome headless con animaciones congeladas únicamente para estabilizar la evidencia visual.</p>
${failures.length > 0
  ? `<h2 class="fail">Fallos</h2><pre>${htmlEscape(failures.join("\n"))}</pre>`
  : "<p>Sin fallos estructurales detectados.</p>"}
${cards}
</main>
</body>
</html>\n`,
    "utf8"
  );
}


async function main() {
  await mkdir(outputDir, { recursive: true });
  const profileDir = await mkdtemp(
    path.join(os.tmpdir(), "deuna-visual-chrome-")
  );
  const chrome = findChrome();
  const browser = spawn(
    chrome,
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
    {
      stdio: ["ignore", "ignore", "pipe"],
    }
  );
  let browserError = "";
  browser.stderr.setEncoding("utf8");
  browser.stderr.on("data", (chunk) => {
    browserError += chunk;
    if (browserError.length > 20_000) {
      browserError = browserError.slice(-20_000);
    }
  });


  const results = [];
  const failures = [];
  let cdp = null;


  try {
    const target = await waitForDebugger(profileDir, browser);
    const socket = await openWebSocket(
      target.webSocketDebuggerUrl
    );
    cdp = new CdpSession(socket);


    await Promise.all([
      cdp.send("Page.enable"),
      cdp.send("Runtime.enable"),
      cdp.send("Network.enable"),
    ]);


    let currentContext = "browser";
    const runtimeEvents = [];


    cdp.on("Runtime.exceptionThrown", (event) => {
      runtimeEvents.push({
        context: currentContext,
        kind: "exception",
        text:
          event.exceptionDetails?.exception?.description ??
          event.exceptionDetails?.text ??
          "Excepción JavaScript sin detalle.",
      });
    });
    cdp.on("Runtime.consoleAPICalled", (event) => {
      if (event.type !== "error") return;
      runtimeEvents.push({
        context: currentContext,
        kind: "console",
        text: event.args
          ?.map((argument) =>
            argument.value ??
            argument.description ??
            argument.type
          )
          .join(" ") ?? "console.error sin detalle.",
      });
    });
    cdp.on("Network.loadingFailed", (event) => {
      if (event.canceled) return;
      runtimeEvents.push({
        context: currentContext,
        kind: "network",
        method: "LOAD",
        url: event.url ?? event.requestId,
        text: event.errorText ?? "Carga fallida.",
      });
    });
    cdp.on("Network.responseReceived", (event) => {
      const status = event.response?.status ?? 0;
      if (status < 400) return;
      if (
        ![
          "Document",
          "Script",
          "Stylesheet",
          "Image",
          "Font",
          "XHR",
          "Fetch",
        ].includes(event.type)
      ) {
        return;
      }
      runtimeEvents.push({
        context: currentContext,
        kind: "network",
        method: String(status),
        url: event.response?.url ?? event.requestId,
        text: event.response?.statusText ?? "Respuesta HTTP fallida.",
      });
    });


    for (const page of publicPages) {
      for (const viewport of viewports) {
        currentContext = `${page.id}-${viewport.id}`;
        const start = runtimeEvents.length;
        await setViewport(cdp, viewport);
        await navigate(cdp, `${baseUrl}${page.pathname}`);
        await waitForApplication(cdp);
        const audit = await auditLayout(
          cdp,
          page.expectedSelector,
          page.expectedText,
          viewport.mobile,
          []
        );
        const file = `${page.id}-${viewport.id}.png`;
        const capture = await captureScreenshot(
          cdp,
          path.join(outputDir, file),
          viewport
        );
        await delay(120);
        const runtimeIssues = runtimeEvents
          .slice(start)
          .map(issueText);


        results.push({
          page: page.id,
          viewport: viewport.id,
          file,
          audit,
          capture,
          runtimeIssues,
        });
      }
    }


    currentContext = "admin-login";
    await loginAdmin(cdp);


    for (const page of adminPages) {
      for (const viewport of viewports) {
        currentContext = `${page.id}-${viewport.id}`;
        const start = runtimeEvents.length;
        await setViewport(cdp, viewport);
        await navigate(cdp, `${baseUrl}${page.pathname}`);
        await waitForApplication(cdp);
        const audit = await auditLayout(
          cdp,
          page.expectedSelector,
          page.expectedText,
          viewport.mobile,
          retiredEditorialHistoryTexts
        );
        const file = `${page.id}-${viewport.id}.png`;
        const capture = await captureScreenshot(
          cdp,
          path.join(outputDir, file),
          viewport
        );
        await delay(120);
        const runtimeIssues = runtimeEvents
          .slice(start)
          .map(issueText);


        results.push({
          page: page.id,
          viewport: viewport.id,
          file,
          audit,
          capture,
          runtimeIssues,
        });
      }
    }


    for (const result of results) {
      const prefix = `${result.page}/${result.viewport}`;
      if (!result.audit.expectedSelectorPresent) {
        failures.push(
          `${prefix}: falta el contenedor principal esperado.`
        );
      }
      if (!result.audit.expectedTextPresent) {
        failures.push(
          `${prefix}: falta el texto de identidad esperado.`
        );
      }
      if (result.audit.forbiddenTextsPresent.length > 0) {
        failures.push(
          `${prefix}: todavía expone contratos editoriales retirados: ${result.audit.forbiddenTextsPresent.join(", ")}.`
        );
      }
      if (result.audit.horizontalOverflow) {
        failures.push(
          `${prefix}: scrollWidth ${result.audit.scrollWidth}px supera viewport ${result.audit.viewportWidth}px.`
        );
      }
      if (result.audit.outsideViewport.length > 0) {
        failures.push(
          `${prefix}: controles fuera del viewport sin contenedor de overflow: ${JSON.stringify(result.audit.outsideViewport)}.`
        );
      }
      if (result.runtimeIssues.length > 0) {
        failures.push(
          `${prefix}: errores runtime/red: ${result.runtimeIssues.join(" | ")}`
        );
      }
    }


    await writeReport(results, failures);


    for (const result of results) {
      console.log(
        `[visual] ${result.page}/${result.viewport}: ` +
        `${result.audit.viewportWidth}x${result.audit.viewportHeight}, ` +
        `alto ${result.audit.scrollHeight}px, ` +
        `${result.audit.smallTouchTargets.length} rectángulos visuales interactivos <44px (señal), ` +
        `${result.capture.truncated ? "captura truncada" : "captura completa"}`
      );
    }


    if (failures.length > 0) {
      console.error("\nVisual smoke: BLOQUEADO\n");
      failures.forEach((failure) => console.error(`- ${failure}`));
      process.exitCode = 1;
    } else {
      console.log(
        `\nVisual smoke: OK (${results.length} capturas reales, desktop/tablet/mobile, Home + Admin autenticado).`
      );
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.stack ?? error.message
        : String(error);
    failures.push(message);
    await writeReport(results, failures).catch(() => {});
    console.error(message);
    if (browserError.trim()) {
      console.error("\nChrome stderr:\n", browserError.trim());
    }
    process.exitCode = 1;
  } finally {
    cdp?.close();
    browser.kill("SIGTERM");
    await rm(profileDir, {
      recursive: true,
      force: true,
    }).catch(() => {});
  }
}


await main();
