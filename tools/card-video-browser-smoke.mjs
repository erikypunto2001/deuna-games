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
const fixturePath = path.join(outputRoot, "card-video-fixture.json");
const screenshotPath = path.join(
  outputRoot,
  "card-video-hogwarts-legacy-active-desktop.png"
);
const redDeadScreenshotPath = path.join(
  outputRoot,
  "card-video-red-dead-redemption-2-active-desktop.png"
);
const cyberpunkScreenshotPath = path.join(
  outputRoot,
  "card-video-cyberpunk-2077-previewclip-active-desktop.png"
);
const detailScreenshotPath = path.join(
  outputRoot,
  "detail-container-video-active-desktop.png"
);
const homeInteractionScreenshotPath = path.join(
  outputRoot,
  "home-popular-hogwarts-interaction-video-active-desktop.png"
);

function assertVisualCiOnly() {
  if (
    process.env.DEUNA_CARD_VIDEO_VISUAL_FIXTURE !== "1" ||
    process.env.CI !== "true" ||
    process.env.GITHUB_ACTIONS !== "true"
  ) {
    throw new Error(
      "Card video browser smoke sólo puede ejecutarse con el fixture visual aislado de GitHub Actions."
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
    "Card video browser smoke necesita Chrome/Chromium."
  );
}

function findXvfbRun() {
  return resolveExecutable(
    ["xvfb-run"],
    "Card video browser smoke necesita xvfb-run para reproducir un escritorio fine/hover real en CI."
  );
}

async function waitForDebugger(profileDir) {
  const activePortPath = path.join(profileDir, "DevToolsActivePort");
  const deadline = Date.now() + 15_000;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const raw = await readFile(activePortPath, "utf8");
      const port = Number.parseInt(raw.split(/\r?\n/, 1)[0] ?? "", 10);
      if (!Number.isFinite(port)) {
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
      if (listeners.size === 0) this.listeners.delete(method);
    };
  }

  waitFor(method, timeoutMs = 20_000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timeout esperando ${method}.`));
      }, timeoutMs);
      const unsubscribe = this.on(method, (params) => {
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

function cardLookup(slug) {
  return `
    (() => {
      const link = document.querySelector('a[href="/juegos/${slug}"]');
      return link instanceof Element ? link.closest("article") : null;
    })()
  `;
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

function detailVisibilityExpression(lookup, visible) {
  return `(() => {
    const card = ${lookup};
    return Boolean(
      card instanceof HTMLElement &&
      card.dataset.detailVisible === ${JSON.stringify(visible ? "true" : "false")}
    );
  })()`;
}

async function hoverCard(cdp, lookup) {
  await cdp.send("Page.bringToFront");

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: 1,
      y: 1,
      buttons: 0,
      pointerType: "mouse",
    });

    await waitFor(
      cdp,
      `(() => {
        const card = ${lookup};
        if (!(card instanceof HTMLElement)) return false;
        card.scrollIntoView({ block: "center", inline: "nearest" });
        return true;
      })()`,
      "No se pudo centrar la Card antes del hover"
    );
    await delay(150);

    const points = await waitFor(
      cdp,
      `(() => {
        const card = ${lookup};
        if (!(card instanceof HTMLElement)) return false;
        const rect = card.getBoundingClientRect();
        if (
          rect.width <= 0 ||
          rect.height <= 0 ||
          rect.bottom <= 0 ||
          rect.right <= 0 ||
          rect.top >= innerHeight ||
          rect.left >= innerWidth
        ) {
          return false;
        }

        const inside = {
          x: Math.min(
            innerWidth - 2,
            Math.max(2, rect.left + rect.width / 2)
          ),
          y: Math.min(
            innerHeight - 2,
            Math.max(2, rect.top + rect.height / 2)
          ),
        };
        const hit = document.elementFromPoint(inside.x, inside.y);
        if (!(hit instanceof Element) || !card.contains(hit)) {
          return false;
        }

        const leftOutside = rect.left - 12;
        const rightOutside = rect.right + 12;
        const outside = {
          x: leftOutside >= 2
            ? leftOutside
            : Math.min(innerWidth - 2, rightOutside),
          y: inside.y,
        };
        const outsideHit = document.elementFromPoint(outside.x, outside.y);
        if (outsideHit instanceof Element && card.contains(outsideHit)) {
          return false;
        }

        return { inside, outside };
      })()`,
      "No se pudo resolver una trayectoria visible de hover para la Card"
    );

    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: points.outside.x,
      y: points.outside.y,
      buttons: 0,
      pointerType: "mouse",
    });
    await delay(60);
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: points.inside.x,
      y: points.inside.y,
      buttons: 0,
      pointerType: "mouse",
    });

    try {
      await waitFor(
        cdp,
        detailVisibilityExpression(lookup, true),
        `El hover real no expandió la Card en el intento ${attempt}`,
        2_500
      );
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("El hover real no expandió la Card tras tres reentradas físicas.");
}

async function leaveCard(cdp, lookup) {
  await cdp.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: 1,
    y: 1,
    buttons: 0,
    pointerType: "mouse",
  });
  await waitFor(
    cdp,
    detailVisibilityExpression(lookup, false),
    "La Card no volvió a Portada al retirar el puntero"
  );
  await waitFor(
    cdp,
    `(() => {
      const card = ${lookup};
      return Boolean(card instanceof HTMLElement && !card.querySelector("video"));
    })()`,
    "La Card mantuvo el video montado fuera de interacción"
  );
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
    return {
      src: new URL(video.currentSrc || video.src, location.href).pathname,
      autoplay: video.autoplay,
      muted: video.muted,
      loop: video.loop,
      playsInline: video.playsInline,
      readyState: video.readyState,
      paused: video.paused,
      currentTime: video.currentTime,
      hidden: document.hidden,
      reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
  })()`;
}

function detailPlayingVideoExpression() {
  return `(() => {
    const scope = document.querySelector("[data-game-detail-media-scope]");
    const video = scope?.querySelector("video");
    if (!(video instanceof HTMLVideoElement)) return false;
    if (
      video.paused ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      return false;
    }
    return {
      src: new URL(video.currentSrc || video.src, location.href).pathname,
      autoplay: video.autoplay,
      muted: video.muted,
      loop: video.loop,
      playsInline: video.playsInline,
      readyState: video.readyState,
      paused: video.paused,
      hidden: document.hidden,
      reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
  })()`;
}

function popularFirstCardStateExpression(expectedSlug) {
  return `(() => {
    const regions = [...document.querySelectorAll(
      '[role="region"][aria-roledescription="carrusel"]'
    )];
    const popular = regions.find((region) =>
      (region.getAttribute("aria-label") ?? "")
        .toLowerCase()
        .includes("popular")
    );
    const firstCard = popular?.querySelector(
      '[data-game-card-slot="true"] article'
    );
    const link = firstCard?.querySelector('a[href^="/juegos/"]');
    return {
      found: firstCard instanceof HTMLElement,
      href: link instanceof HTMLAnchorElement ? link.getAttribute("href") : null,
      expectedHref: "/juegos/" + ${JSON.stringify(expectedSlug)},
      revealMode:
        firstCard instanceof HTMLElement
          ? firstCard.dataset.cardRevealMode ?? null
          : null,
      mediaMode:
        firstCard instanceof HTMLElement
          ? firstCard.dataset.cardMediaMode ?? null
          : null,
      detailVisible:
        firstCard instanceof HTMLElement
          ? firstCard.dataset.detailVisible ?? null
          : null,
      hasVideo: Boolean(firstCard?.querySelector("video")),
    };
  })()`;
}

async function verifyHomeInteractionFirstCard(cdp, fixture) {
  await navigate(cdp, `${baseUrl}/`);
  const expectedHref = `/juegos/${fixture.slug}`;

  const restState = await waitFor(
    cdp,
    popularFirstCardStateExpression(fixture.slug),
    "No se encontró la primera Card de la fila Popular en Home"
  );

  if (
    !restState.found ||
    restState.href !== expectedHref ||
    restState.revealMode !== "interaction" ||
    restState.mediaMode !== "video" ||
    restState.detailVisible !== "false" ||
    restState.hasVideo
  ) {
    throw new Error(
      `Home Popular no reproduce el contrato real de la captura: ${JSON.stringify(restState)}.`
    );
  }

  const lookup = cardLookup(fixture.slug);
  await hoverCard(cdp, lookup);

  const playing = await waitFor(
    cdp,
    `(() => {
      const card = ${lookup};
      const video = card?.querySelector("video");
      if (!(video instanceof HTMLVideoElement)) return false;
      if (
        video.paused ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        video.currentTime <= 0.02
      ) {
        return false;
      }
      return {
        src: new URL(video.currentSrc || video.src, location.href).pathname,
        readyState: video.readyState,
        paused: video.paused,
        currentTime: video.currentTime,
      };
    })()`,
    "Hogwarts primera Card de Home interaction no reprodujo el WebM"
  );

  if (
    playing.src !== fixture.clip ||
    playing.paused ||
    playing.readyState < 2 ||
    playing.currentTime <= 0.02
  ) {
    throw new Error(
      `Hogwarts primera Card de Home no reprodujo correctamente: ${JSON.stringify(playing)}.`
    );
  }

  const capture = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  await writeFile(
    homeInteractionScreenshotPath,
    Buffer.from(capture.data, "base64")
  );

  await leaveCard(cdp, lookup);

  return playing;
}

async function verifyLegacyCardPlayback(
  cdp,
  fixture,
  label,
  screenshotFile
) {
  const lookup = cardLookup(fixture.slug);
  await waitFor(
    cdp,
    `(() => {
      const card = ${lookup};
      if (
        !(card instanceof HTMLElement) ||
        document.readyState !== "complete"
      ) {
        return false;
      }
      card.scrollIntoView({ block: "center", inline: "nearest" });
      return Object.keys(card).some((key) =>
        key.startsWith("__reactProps$") ||
        key.startsWith("__reactFiber$")
      );
    })()`,
    `No se hidrató la Card legacy de ${label}`
  );
  await delay(300);

  const restState = await cdp.evaluate(`(() => {
    const card = ${lookup};
    return {
      found: card instanceof HTMLElement,
      mediaMode: card?.dataset.cardMediaMode ?? null,
      detailVisible: card?.dataset.detailVisible ?? null,
      hasVideo: Boolean(card?.querySelector("video")),
    };
  })()`);

  if (
    !restState?.found ||
    restState.mediaMode !== "video" ||
    restState.detailVisible !== "false" ||
    restState.hasVideo
  ) {
    throw new Error(
      `${label} no migró a Card Video en reposo: ${JSON.stringify(restState)}.`
    );
  }

  const asset = await cdp.evaluate(`
    fetch(${JSON.stringify(fixture.clip)}, { cache: "no-store" })
      .then(async (response) => ({
        ok: response.ok,
        status: response.status,
        contentType: response.headers.get("content-type"),
        bytes: (await response.arrayBuffer()).byteLength,
      }))
  `);

  if (
    !asset?.ok ||
    asset.status !== 200 ||
    asset.bytes < 128 ||
    !String(asset.contentType ?? "")
      .toLowerCase()
      .includes("video/webm")
  ) {
    throw new Error(
      `El WebM legacy de ${label} no se sirvió correctamente: ${JSON.stringify(asset)}.`
    );
  }

  await hoverCard(cdp, lookup);
  const playing = await waitFor(
    cdp,
    `(() => {
      const card = ${lookup};
      const video = card?.querySelector("video");
      if (!(video instanceof HTMLVideoElement)) return false;
      if (
        video.paused ||
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        video.currentTime <= 0.02
      ) {
        return false;
      }
      return {
        src: new URL(video.currentSrc || video.src, location.href).pathname,
        readyState: video.readyState,
        paused: video.paused,
        currentTime: video.currentTime,
      };
    })()`,
    `${label} montó el video pero no avanzó la reproducción`
  );

  if (
    playing.src !== fixture.clip ||
    playing.paused ||
    playing.readyState < 2 ||
    playing.currentTime <= 0.02
  ) {
    throw new Error(
      `${label} no reprodujo correctamente: ${JSON.stringify(playing)}.`
    );
  }

  const capture = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  await writeFile(
    screenshotFile,
    Buffer.from(capture.data, "base64")
  );
  await leaveCard(cdp, lookup);

  return playing;
}

async function main() {
  assertVisualCiOnly();
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  if (
    !fixture.slug ||
    !fixture.clip ||
    !Array.isArray(fixture.legacyCards) ||
    fixture.legacyCards.length !== 3
  ) {
    throw new Error("El descriptor del fixture Card video legacy es inválido.");
  }
  const redDeadFixture = fixture.legacyCards.find(
    (entry) => entry?.slug === "red-dead-redemption-2"
  );
  const cyberpunkFixture = fixture.legacyCards.find(
    (entry) => entry?.slug === "cyberpunk-2077"
  );
  if (
    fixture.slug !== "hogwarts-legacy" ||
    !redDeadFixture?.clip ||
    !cyberpunkFixture?.clip ||
    cyberpunkFixture.legacyMode !== "preview-clip-only"
  ) {
    throw new Error(
      "El fixture Card video debe cubrir Hogwarts Legacy, Red Dead Redemption 2 y Cyberpunk 2077 previewClip-only."
    );
  }

  const profileDir = await mkdtemp(
    path.join(os.tmpdir(), "deuna-card-video-chrome-")
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
    const target = await waitForDebugger(profileDir);
    cdp = new CdpSession(
      await openWebSocket(target.webSocketDebuggerUrl)
    );
    await Promise.all([
      cdp.send("Page.enable"),
      cdp.send("Runtime.enable"),
      cdp.send("Network.enable"),
    ]);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
      screenWidth: 1440,
      screenHeight: 1000,
    });
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-reduced-motion", value: "no-preference" },
      ],
    });

    await navigate(cdp, `${baseUrl}/juegos`);
    const lookup = cardLookup(fixture.slug);

    await waitFor(
      cdp,
      `(() => {
        const card = ${lookup};
        if (
          !(card instanceof HTMLElement) ||
          document.readyState !== "complete"
        ) {
          return false;
        }
        card.scrollIntoView({ block: "center", inline: "nearest" });
        return Object.keys(card).some((key) =>
          key.startsWith("__reactProps$") ||
          key.startsWith("__reactFiber$")
        );
      })()`,
      "No se hidrató la Card publicada del fixture"
    );
    await delay(300);

    const mediaState = await cdp.evaluate(`({
      fineHover: matchMedia("(hover: hover) and (pointer: fine)").matches,
      coarse: matchMedia("(pointer: coarse)").matches,
      reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
    })`);
    if (!mediaState?.fineHover || mediaState.coarse || mediaState.reduced) {
      throw new Error(
        `El smoke no reprodujo un escritorio fine/hover: ${JSON.stringify(mediaState)}.`
      );
    }

    const redDeadLookup = cardLookup(redDeadFixture.slug);
    await waitFor(
      cdp,
      `(() => {
        const card = ${redDeadLookup};
        if (
          !(card instanceof HTMLElement) ||
          document.readyState !== "complete"
        ) {
          return false;
        }
        card.scrollIntoView({ block: "center", inline: "nearest" });
        return Object.keys(card).some((key) =>
          key.startsWith("__reactProps$") ||
          key.startsWith("__reactFiber$")
        );
      })()`,
      "No se hidrató la Card legacy de Red Dead Redemption 2"
    );
    await delay(300);

    const redDeadRestState = await cdp.evaluate(`(() => {
      const card = ${redDeadLookup};
      return {
        found: card instanceof HTMLElement,
        mediaMode: card?.dataset.cardMediaMode ?? null,
        detailVisible: card?.dataset.detailVisible ?? null,
        hasVideo: Boolean(card?.querySelector("video")),
      };
    })()`);
    if (
      !redDeadRestState?.found ||
      redDeadRestState.mediaMode !== "video" ||
      redDeadRestState.detailVisible !== "false" ||
      redDeadRestState.hasVideo
    ) {
      throw new Error(
        `RDR2 legacy no migró a Card Video en reposo: ${JSON.stringify(redDeadRestState)}.`
      );
    }

    const redDeadAsset = await cdp.evaluate(`
      fetch(${JSON.stringify(redDeadFixture.clip)}, { cache: "no-store" })
        .then(async (response) => ({
          ok: response.ok,
          status: response.status,
          contentType: response.headers.get("content-type"),
          bytes: (await response.arrayBuffer()).byteLength,
        }))
    `);
    if (
      !redDeadAsset?.ok ||
      redDeadAsset.status !== 200 ||
      redDeadAsset.bytes < 128 ||
      !String(redDeadAsset.contentType ?? "")
        .toLowerCase()
        .includes("video/webm")
    ) {
      throw new Error(
        `El WebM legacy de RDR2 no se sirvió correctamente: ${JSON.stringify(redDeadAsset)}.`
      );
    }

    await hoverCard(cdp, redDeadLookup);
    const redDeadPlaying = await waitFor(
      cdp,
      `(() => {
        const card = ${redDeadLookup};
        const video = card?.querySelector("video");
        if (!(video instanceof HTMLVideoElement)) return false;
        if (
          video.paused ||
          video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
          video.currentTime <= 0.02
        ) {
          return false;
        }
        return {
          src: new URL(video.currentSrc || video.src, location.href).pathname,
          readyState: video.readyState,
          paused: video.paused,
          currentTime: video.currentTime,
        };
      })()`,
      "RDR2 legacy montó el video pero no avanzó la reproducción"
    );
    if (
      redDeadPlaying.src !== redDeadFixture.clip ||
      redDeadPlaying.paused ||
      redDeadPlaying.readyState < 2 ||
      redDeadPlaying.currentTime <= 0.02
    ) {
      throw new Error(
        `RDR2 legacy no reprodujo correctamente: ${JSON.stringify(redDeadPlaying)}.`
      );
    }

    const redDeadCapture = await cdp.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
    });
    await writeFile(
      redDeadScreenshotPath,
      Buffer.from(redDeadCapture.data, "base64")
    );
    await leaveCard(cdp, redDeadLookup);

    const cyberpunkPlaying = await verifyLegacyCardPlayback(
      cdp,
      cyberpunkFixture,
      "Cyberpunk 2077 previewClip-only",
      cyberpunkScreenshotPath
    );

    // Cada generación legacy debe poder verificarse desde un catálogo recién
    // hidratado. Evita que el hover/scroll de una Card previa contamine la
    // geometría o el estado de puntero de Hogwarts.
    await navigate(cdp, `${baseUrl}/juegos`);
    await waitFor(
      cdp,
      `(() => {
        const card = ${lookup};
        if (
          !(card instanceof HTMLElement) ||
          document.readyState !== "complete"
        ) {
          return false;
        }
        card.scrollIntoView({ block: "center", inline: "nearest" });
        return Object.keys(card).some((key) =>
          key.startsWith("__reactProps$") ||
          key.startsWith("__reactFiber$")
        );
      })()`,
      "No se rehidrató Hogwarts Legacy antes de su prueba aislada"
    );
    await delay(300);

    const restState = await cdp.evaluate(`(() => {
      const card = ${lookup};
      return {
        found: card instanceof HTMLElement,
        mediaMode: card?.dataset.cardMediaMode ?? null,
        detailVisible: card?.dataset.detailVisible ?? null,
        hasVideo: Boolean(card?.querySelector("video")),
      };
    })()`);
    if (
      !restState?.found ||
      restState.mediaMode !== "video" ||
      restState.detailVisible !== "false" ||
      restState.hasVideo
    ) {
      throw new Error(
        `La Card no respeta el estado de reposo Portada: ${JSON.stringify(restState)}.`
      );
    }

    const asset = await cdp.evaluate(`
      fetch(${JSON.stringify(fixture.clip)}, { cache: "no-store" })
        .then(async (response) => ({
          ok: response.ok,
          status: response.status,
          contentType: response.headers.get("content-type"),
          bytes: (await response.arrayBuffer()).byteLength,
        }))
    `);
    if (
      !asset?.ok ||
      asset.status !== 200 ||
      asset.bytes < 128 ||
      !String(asset.contentType ?? "")
        .toLowerCase()
        .includes("video/webm")
    ) {
      throw new Error(
        `El WebM aislado no se sirvió correctamente: ${JSON.stringify(asset)}.`
      );
    }

    await hoverCard(cdp, lookup);
    const visibleState = await waitFor(
      cdp,
      playingVideoExpression(lookup),
      "La Card expandida no llegó a reproducir el video continuo"
    );
    if (
      visibleState.src !== fixture.clip ||
      !visibleState.autoplay ||
      !visibleState.muted ||
      !visibleState.loop ||
      !visibleState.playsInline ||
      visibleState.paused ||
      visibleState.readyState < 2 ||
      visibleState.hidden ||
      visibleState.reduced
    ) {
      throw new Error(
        `El estado visible del video no respeta el contrato: ${JSON.stringify(visibleState)}.`
      );
    }

    const advancedState = await waitFor(
      cdp,
      `(() => {
        const card = ${lookup};
        const video = card?.querySelector("video");
        if (!(video instanceof HTMLVideoElement)) return false;
        return !video.paused && video.currentTime > 0.02
          ? { currentTime: video.currentTime, readyState: video.readyState }
          : false;
      })()`,
      "Hogwarts Legacy montó el video pero quedó pausado en 0.000 s"
    );
    if (
      advancedState.currentTime <= 0.02 ||
      advancedState.readyState < 2
    ) {
      throw new Error(
        `Hogwarts Legacy no avanzó la reproducción: ${JSON.stringify(advancedState)}.`
      );
    }

    const capture = await cdp.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
    });
    await writeFile(
      screenshotPath,
      Buffer.from(capture.data, "base64")
    );

    await leaveCard(cdp, lookup);
    await hoverCard(cdp, lookup);
    await waitFor(
      cdp,
      playingVideoExpression(lookup),
      "La Card no reanudó el video al volver a entrar con el puntero"
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
          card &&
          matchMedia("(prefers-reduced-motion: reduce)").matches &&
          !card.querySelector("video")
        );
      })()`,
      "Reduced-motion no desmontó el video de Card"
    );

    await cdp.send("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-reduced-motion", value: "no-preference" },
      ],
    });
    const resumedState = await waitFor(
      cdp,
      playingVideoExpression(lookup),
      "Al restaurar movimiento el video de Card no volvió a reproducirse"
    );
    if (
      resumedState.src !== fixture.clip ||
      resumedState.paused ||
      resumedState.readyState < 2 ||
      resumedState.reduced
    ) {
      throw new Error(
        `El video no reanudó correctamente tras reduced-motion: ${JSON.stringify(resumedState)}.`
      );
    }

    const backgroundTarget = await cdp.send("Target.createTarget", {
      url: "about:blank",
    });
    if (!backgroundTarget.targetId) {
      throw new Error("Chrome no creó la pestaña auxiliar para probar visibilitychange.");
    }
    await cdp.send("Target.activateTarget", {
      targetId: backgroundTarget.targetId,
    });
    const hiddenState = await waitFor(
      cdp,
      `(() => {
        const card = ${lookup};
        if (!(card instanceof HTMLElement)) return false;
        if (!document.hidden || document.visibilityState !== "hidden") {
          return false;
        }
        if (card.querySelector("video")) return false;
        return {
          hidden: document.hidden,
          visibilityState: document.visibilityState,
          hasVideo: false,
        };
      })()`,
      "La pestaña oculta no procesó visibilitychange o mantuvo el video de Card"
    );
    if (
      !hiddenState.hidden ||
      hiddenState.visibilityState !== "hidden" ||
      hiddenState.hasVideo
    ) {
      throw new Error(
        `La pestaña oculta no desmontó el video de Card: ${JSON.stringify(hiddenState)}.`
      );
    }

    await cdp.send("Target.activateTarget", { targetId: target.id });
    await waitFor(
      cdp,
      "document.hidden === false && document.visibilityState === 'visible'",
      "La pestaña principal no volvió a visible antes de probar Contenedor"
    );
    await navigate(cdp, `${baseUrl}/juegos/${fixture.slug}`);

    const detailVisibleState = await waitFor(
      cdp,
      detailPlayingVideoExpression(),
      "El Contenedor publicado no llegó a reproducir el WebM"
    );
    if (
      detailVisibleState.src !== fixture.clip ||
      !detailVisibleState.autoplay ||
      !detailVisibleState.muted ||
      !detailVisibleState.loop ||
      !detailVisibleState.playsInline ||
      detailVisibleState.paused ||
      detailVisibleState.readyState < 2 ||
      detailVisibleState.hidden ||
      detailVisibleState.reduced
    ) {
      throw new Error(
        `El video del Contenedor no respeta el contrato público: ${JSON.stringify(detailVisibleState)}.`
      );
    }

    const detailCapture = await cdp.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
    });
    await writeFile(
      detailScreenshotPath,
      Buffer.from(detailCapture.data, "base64")
    );

    await cdp.send("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-reduced-motion", value: "reduce" },
      ],
    });
    await waitFor(
      cdp,
      `(() => {
        const scope = document.querySelector("[data-game-detail-media-scope]");
        return Boolean(
          scope &&
          matchMedia("(prefers-reduced-motion: reduce)").matches &&
          !scope.querySelector("video") &&
          scope.querySelector("img")
        );
      })()`,
      "Reduced-motion no desmontó el video del Contenedor o perdió su imagen fallback"
    );

    await cdp.send("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-reduced-motion", value: "no-preference" },
      ],
    });
    const detailResumedState = await waitFor(
      cdp,
      detailPlayingVideoExpression(),
      "El Contenedor no reanudó el video al restaurar movimiento"
    );
    if (
      detailResumedState.src !== fixture.clip ||
      detailResumedState.paused ||
      detailResumedState.readyState < 2 ||
      detailResumedState.reduced
    ) {
      throw new Error(
        `El Contenedor no reanudó correctamente tras reduced-motion: ${JSON.stringify(detailResumedState)}.`
      );
    }

    await cdp.send("Target.activateTarget", {
      targetId: backgroundTarget.targetId,
    });
    const hiddenDetailState = await waitFor(
      cdp,
      `(() => {
        const scope = document.querySelector("[data-game-detail-media-scope]");
        if (!scope) return false;
        if (!document.hidden || document.visibilityState !== "hidden") {
          return false;
        }
        if (scope.querySelector("video")) return false;
        return {
          hidden: document.hidden,
          visibilityState: document.visibilityState,
          hasVideo: false,
        };
      })()`,
      "La pestaña oculta mantuvo el video del Contenedor"
    );
    if (
      !hiddenDetailState.hidden ||
      hiddenDetailState.visibilityState !== "hidden" ||
      hiddenDetailState.hasVideo
    ) {
      throw new Error(
        `La pestaña oculta no desmontó el video del Contenedor: ${JSON.stringify(hiddenDetailState)}.`
      );
    }

    const homeInteractionPlaying =
      await verifyHomeInteractionFirstCard(
        cdp,
        fixture
      );

    console.log(
      "Card + Contenedor video browser smoke: OK " +
        `(hogwarts=${fixture.slug}, rdr2=${redDeadFixture.slug}, cyberpunk=${cyberpunkFixture.slug}, bytes=${asset.bytes}, ` +
        `cardReady=${visibleState.readyState}, hogwartsTime=${advancedState.currentTime.toFixed(3)}, ` +
        `rdr2Time=${redDeadPlaying.currentTime.toFixed(3)}, cyberpunkTime=${cyberpunkPlaying.currentTime.toFixed(3)}, ` +
        `homeFirstTime=${homeInteractionPlaying.currentTime.toFixed(3)}, detailReady=${detailVisibleState.readyState}, ` +
        "Home interaction primera Card + tres generaciones legacy + hover/reduced/hidden y Contenedor autoplay/reduced/hidden verificados)."
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