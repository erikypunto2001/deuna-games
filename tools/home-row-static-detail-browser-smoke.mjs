import { spawn, spawnSync } from "node:child_process";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const baseUrl = (
  process.env.DEUNA_VISUAL_BASE_URL ?? "https://127.0.0.1:3443"
).replace(/\/$/, "");
const outputRoot = path.resolve(
  process.env.DEUNA_VISUAL_OUTPUT_DIR ?? "artifacts/visual-smoke"
);
const fixturePath = path.join(
  outputRoot,
  "home-row-static-detail-fixture.json"
);
const desktopScreenshotPath = path.join(
  outputRoot,
  "home-row-static-detail-desktop.png"
);
const mobileScreenshotPath = path.join(
  outputRoot,
  "home-row-static-detail-mobile.png"
);

function assertVisualCiOnly() {
  if (
    process.env.DEUNA_CARD_VIDEO_VISUAL_FIXTURE !== "1" ||
    process.env.CI !== "true" ||
    process.env.GITHUB_ACTIONS !== "true"
  ) {
    throw new Error(
      "Home row static detail browser smoke sólo puede ejecutarse con el fixture visual aislado de GitHub Actions."
    );
  }
}

function resolveExecutable(candidates, errorMessage) {
  for (const candidate of candidates.filter(Boolean)) {
    const result = spawnSync(
      "sh",
      ["-lc", `command -v ${JSON.stringify(candidate)}`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const resolved = result.stdout.trim();
    if (result.status === 0 && resolved) return resolved;
  }

  throw new Error(errorMessage);
}

function findChrome() {
  return resolveExecutable(
    [
      process.env.CHROME_BIN,
      "google-chrome-stable",
      "google-chrome",
      "chromium",
      "chromium-browser",
    ],
    "Home row static detail browser smoke necesita Chrome/Chromium."
  );
}

function findXvfbRun() {
  return resolveExecutable(
    ["xvfb-run"],
    "Home row static detail browser smoke necesita xvfb-run."
  );
}

async function waitForDebugger(profileDir) {
  const activePortPath = path.join(profileDir, "DevToolsActivePort");
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    try {
      const raw = await readFile(activePortPath, "utf8");
      const port = Number.parseInt(raw.split(/\r?\n/, 1)[0] ?? "", 10);
      if (!Number.isFinite(port)) throw new Error("Puerto DevTools inválido.");

      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        const page = targets.find(
          (target) => target.type === "page" && target.webSocketDebuggerUrl
        );
        if (page) return page.webSocketDebuggerUrl;
      }
    } catch {
      // Chrome tarda unos milisegundos en publicar DevToolsActivePort.
    }
    await delay(100);
  }

  throw new Error("Chrome no expuso DevTools a tiempo.");
}

function openWebSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      reject(new Error("Timeout conectando con Chrome DevTools."));
    }, 10_000);

    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timeout);
        resolve(socket);
      },
      { once: true }
    );
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timeout);
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

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
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
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
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
  const navigation = await cdp.send("Page.navigate", { url });
  if (navigation.errorText) {
    throw new Error(`No se pudo navegar a ${url}: ${navigation.errorText}`);
  }

  await waitFor(
    cdp,
    `document.readyState === "complete"`,
    `La página no terminó de cargar: ${url}`,
    20_000
  );
}

async function waitFor(cdp, expression, description, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastValue = null;

  while (Date.now() < deadline) {
    lastValue = await cdp.evaluate(expression);
    if (lastValue) return lastValue;
    await delay(100);
  }

  throw new Error(
    `${description}. Último estado: ${JSON.stringify(lastValue)}.`
  );
}

function cardLookup(slug) {
  return `
    (() => {
      const link = document.querySelector('a[href="/juegos/${slug}"]');
      return link instanceof Element ? link.closest("article") : null;
    })()
  `;
}

function playingVideoExpression(lookup) {
  return `(() => {
    const card = ${lookup};
    const video = card?.querySelector("video");
    if (!(video instanceof HTMLVideoElement)) return false;
    if (
      video.paused ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      return false;
    }
    const frame = video.parentElement;
    return {
      src: new URL(video.currentSrc || video.src, location.href).pathname,
      frameTransform:
        frame instanceof HTMLElement ? getComputedStyle(frame).transform : null,
      readyState: video.readyState,
      paused: video.paused,
    };
  })()`;
}

async function setViewport(cdp, width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width <= 520,
    screenWidth: width,
    screenHeight: height,
  });
}

async function scrollCardIntoView(cdp, lookup) {
  await waitFor(
    cdp,
    `(() => {
      const card = ${lookup};
      if (!(card instanceof HTMLElement)) return false;
      card.scrollIntoView({ block: "center", inline: "nearest" });
      return Object.keys(card).some((key) =>
        key.startsWith("__reactProps$") ||
        key.startsWith("__reactFiber$")
      );
    })()`,
    "No se hidrató la Card estática publicada"
  );
  await delay(300);
}

async function staticCardState(cdp, lookup) {
  return cdp.evaluate(`(() => {
    const card = ${lookup};
    if (!(card instanceof HTMLElement)) return null;
    const slot = card.closest('[data-game-card-slot="true"]');
    const detail = card.querySelector('[data-card-face="detail"]');
    const media = card.querySelector('[data-card-detail-media="true"]');
    const image = media?.querySelector("img");
    if (
      !(slot instanceof HTMLElement) ||
      !(detail instanceof HTMLElement) ||
      !(media instanceof HTMLElement)
    ) {
      return null;
    }
    const slotRect = slot.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const detailRect = detail.getBoundingClientRect();
    const cardStyle = getComputedStyle(card);
    return {
      revealMode: card.dataset.cardRevealMode ?? null,
      detailVisible: card.dataset.detailVisible ?? null,
      expanded: card.dataset.cardExpanded ?? null,
      expansionScale: card.dataset.cardExpansionScale ?? null,
      tiltActive: card.hasAttribute("data-tilt-active"),
      position: cardStyle.position,
      transform: cardStyle.transform,
      detailOpacity: getComputedStyle(detail).opacity,
      mediaTransform: getComputedStyle(media).transform,
      imageTransform:
        image instanceof HTMLElement ? getComputedStyle(image).transform : null,
      slotWidth: slotRect.width,
      slotHeight: slotRect.height,
      cardWidth: cardRect.width,
      cardHeight: cardRect.height,
      detailWidth: detailRect.width,
      detailHeight: detailRect.height,
      cardBorderInline:
        Number.parseFloat(cardStyle.borderLeftWidth) +
        Number.parseFloat(cardStyle.borderRightWidth),
      cardBorderBlock:
        Number.parseFloat(cardStyle.borderTopWidth) +
        Number.parseFloat(cardStyle.borderBottomWidth),
      overflowX:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    };
  })()`);
}

function assertStaticState(state, label) {
  if (!state) throw new Error(`${label}: no se pudo medir la Card.`);
  if (
    state.revealMode !== "static-detail" ||
    state.detailVisible !== "true" ||
    state.expanded !== "false" ||
    state.expansionScale !== "1.000" ||
    state.tiltActive ||
    state.position === "fixed" ||
    state.transform !== "none" ||
    state.detailOpacity !== "1" ||
    state.mediaTransform !== "none" ||
    (state.imageTransform !== null && state.imageTransform !== "none")
  ) {
    throw new Error(
      `${label}: el detalle estático activó geometría/hover inesperado: ${JSON.stringify(state)}.`
    );
  }

  const footprintTolerance = 1.5;
  if (
    Math.abs(state.slotWidth - state.cardWidth) > footprintTolerance ||
    Math.abs(state.slotHeight - state.cardHeight) > footprintTolerance
  ) {
    throw new Error(
      `${label}: la Card estática alteró su footprint externo: ${JSON.stringify(state)}.`
    );
  }

  const contentBoxTolerance = 0.75;
  const expectedDetailWidth = state.cardWidth - state.cardBorderInline;
  const expectedDetailHeight = state.cardHeight - state.cardBorderBlock;
  if (
    Math.abs(expectedDetailWidth - state.detailWidth) > contentBoxTolerance ||
    Math.abs(expectedDetailHeight - state.detailHeight) > contentBoxTolerance
  ) {
    throw new Error(
      `${label}: la cara de detalle no coincide con el content box de la Card: ${JSON.stringify(state)}.`
    );
  }

  if (state.overflowX > 1) {
    throw new Error(
      `${label}: la Card estática introdujo overflow horizontal (${state.overflowX}px).`
    );
  }
}

async function capture(cdp, targetPath) {
  const screenshot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  await writeFile(
    targetPath,
    Buffer.from(screenshot.data, "base64")
  );
}

async function main() {
  assertVisualCiOnly();
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  if (!fixture.slug || !fixture.clip) {
    throw new Error("El descriptor del fixture Home estático es inválido.");
  }

  const profileDir = await mkdtemp(
    path.join(os.tmpdir(), "deuna-home-static-detail-chrome-")
  );
  const browser = spawn(
    findXvfbRun(),
    [
      "--auto-servernum",
      "--server-args=-screen 0 1440x1000x24",
      findChrome(),
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--ignore-certificate-errors",
      "--no-first-run",
      "--ozone-platform=x11",
      "--remote-debugging-port=0",
      "--remote-debugging-address=127.0.0.1",
      `--user-data-dir=${profileDir}`,
      "--window-size=1440,1000",
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );

  let cdp = null;
  let browserError = "";
  browser.stderr.setEncoding("utf8");
  browser.stderr.on("data", (chunk) => {
    browserError += chunk;
    if (browserError.length > 20_000) {
      browserError = browserError.slice(-20_000);
    }
  });

  try {
    cdp = new CdpSession(
      await openWebSocket(await waitForDebugger(profileDir))
    );
    await Promise.all([
      cdp.send("Page.enable"),
      cdp.send("Runtime.enable"),
      cdp.send("Network.enable"),
    ]);
    await setViewport(cdp, 1440, 1000);
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-reduced-motion", value: "no-preference" },
      ],
    });

    await navigate(cdp, `${baseUrl}/`);
    const lookup = cardLookup(fixture.slug);
    await scrollCardIntoView(cdp, lookup);

    const desktopState = await staticCardState(cdp, lookup);
    assertStaticState(desktopState, "Desktop");

    const playing = await waitFor(
      cdp,
      playingVideoExpression(lookup),
      "La Card estática visible no reprodujo su WebM"
    );
    if (
      playing.src !== fixture.clip ||
      playing.paused ||
      playing.readyState < 2 ||
      playing.frameTransform !== "none"
    ) {
      throw new Error(
        `El video estático no respeta el contrato visual: ${JSON.stringify(playing)}.`
      );
    }

    const hoverPoint = await cdp.evaluate(`(() => {
      const card = ${lookup};
      if (!(card instanceof HTMLElement)) return null;
      const rect = card.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    })()`);
    if (!hoverPoint) throw new Error("No se pudo medir el centro de la Card.");
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: hoverPoint.x,
      y: hoverPoint.y,
      buttons: 0,
      pointerType: "mouse",
    });
    await delay(300);
    assertStaticState(
      await staticCardState(cdp, lookup),
      "Desktop tras hover"
    );

    await capture(cdp, desktopScreenshotPath);

    const scrolledAway = await cdp.evaluate(`(() => {
      const card = ${lookup};
      const region = card?.closest('[role="region"][aria-roledescription="carrusel"]');
      const track = region?.querySelector('[tabindex="0"]');
      if (!(track instanceof HTMLElement)) return false;
      if (track.scrollWidth <= track.clientWidth) return false;
      track.scrollLeft = track.scrollWidth;
      track.dispatchEvent(new Event("scroll", { bubbles: true }));
      return true;
    })()`);
    if (!scrolledAway) {
      throw new Error(
        "El carrusel del fixture no tenía recorrido suficiente para probar una Card offscreen."
      );
    }
    await waitFor(
      cdp,
      `(() => {
        const card = ${lookup};
        return Boolean(card instanceof HTMLElement && !card.querySelector("video"));
      })()`,
      "La Card fuera del viewport horizontal mantuvo el video montado"
    );

    await cdp.evaluate(`(() => {
      const card = ${lookup};
      const region = card?.closest('[role="region"][aria-roledescription="carrusel"]');
      const track = region?.querySelector('[tabindex="0"]');
      if (track instanceof HTMLElement) {
        track.scrollLeft = 0;
        track.dispatchEvent(new Event("scroll", { bubbles: true }));
      }
    })()`);
    await waitFor(
      cdp,
      playingVideoExpression(lookup),
      "El video no volvió al reingresar la Card al viewport del carrusel"
    );

    await cdp.send("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-reduced-motion", value: "reduce" },
      ],
    });
    await waitFor(
      cdp,
      `(() => {
        const card = ${lookup};
        return Boolean(
          card instanceof HTMLElement &&
          card.dataset.detailVisible === "true" &&
          card.dataset.cardExpanded === "false" &&
          !card.querySelector("video")
        );
      })()`,
      "Reduced-motion no mantuvo detalle estático con imagen y sin video"
    );

    await cdp.send("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-reduced-motion", value: "no-preference" },
      ],
    });
    await waitFor(
      cdp,
      playingVideoExpression(lookup),
      "El video estático no se restauró al desactivar reduced-motion"
    );

    await setViewport(cdp, 390, 844);
    await delay(250);
    await scrollCardIntoView(cdp, lookup);
    assertStaticState(
      await staticCardState(cdp, lookup),
      "Mobile"
    );
    await waitFor(
      cdp,
      playingVideoExpression(lookup),
      "La Card estática mobile visible no reprodujo su WebM"
    );
    await capture(cdp, mobileScreenshotPath);

    console.log(
      "Home row static detail browser smoke: OK " +
        `(slug=${fixture.slug}, desktop/mobile=detalle estable, ` +
        "hover=sin expansión/tilt, offscreen=sin video, " +
        "reingreso=reproduciendo, reduced-motion=imagen)."
    );
  } catch (error) {
    if (browserError.trim()) {
      console.error("\nChrome stderr:\n", browserError.trim());
    }
    throw error;
  } finally {
    cdp?.close();
    browser.kill("SIGTERM");
    await delay(100);
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

await main();
