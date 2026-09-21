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
import { setTimeout as delay } from "node:timers/promises";

import {
  adminLoginVisualPage,
  adminVisualPages,
  browserViewports,
  publicVisualPages,
  redirectChecks,
  representativeGameSlug,
} from "./browser-page-manifest.mjs";

const baseUrl = (
  process.env.DEUNA_VISUAL_BASE_URL ?? "http://127.0.0.1:3000"
).replace(/\/$/, "");
const baseOrigin = new URL(baseUrl).origin;
const outputRoot = path.resolve(
  process.env.DEUNA_VISUAL_OUTPUT_DIR ?? "artifacts/visual-smoke"
);
const outputDir = path.join(outputRoot, "sitewide");
const adminUsername = process.env.DEUNA_VISUAL_ADMIN_USERNAME?.trim();
const adminPassword = process.env.DEUNA_VISUAL_ADMIN_PASSWORD;
const minimumTouchTarget = 44;
const touchTolerance = 0.25;

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

  throw new Error("El smoke global necesita Chrome/Chromium disponible en PATH.");
}

async function waitForDebugger(profileDir) {
  const activePortPath = path.join(profileDir, "DevToolsActivePort");
  const deadline = Date.now() + 15_000;
  let lastError = null;

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
    const timer = setTimeout(
      () => reject(new Error("Timeout conectando con Chrome DevTools.")),
      10_000
    );
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
        if (message.error) {
          pending.reject(new Error(`${pending.method}: ${message.error.message}`));
        } else {
          pending.resolve(message.result ?? {});
        }
        return;
      }
      if (!message.method) return;
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
      if (listeners.size === 0) this.listeners.delete(method);
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

async function setViewport(cdp, viewport) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
    screenOrientation: { type: "portraitPrimary", angle: 0 },
  });
}

async function navigate(cdp, url) {
  const documentResponse = cdp.waitFor(
    "Network.responseReceived",
    (event) => event.type === "Document" &&
      typeof event.response?.url === "string" &&
      event.response.url.startsWith(baseOrigin),
    20_000
  );
  const loaded = cdp.waitFor("Page.loadEventFired", () => true, 20_000);
  const navigation = await cdp.send("Page.navigate", { url });
  if (navigation.errorText) {
    throw new Error(`No se pudo navegar a ${url}: ${navigation.errorText}`);
  }
  const response = await documentResponse;
  await loaded;
  return {
    status: response.response?.status ?? 0,
    responseUrl: response.response?.url ?? url,
  };
}

async function settleApplication(cdp, { dismissDialog = false } = {}) {
  await cdp.evaluate(`
    (async () => {
      if (document.fonts?.ready) {
        await Promise.race([
          document.fonts.ready,
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      }

      if (!document.querySelector('style[data-sitewide-browser-smoke]')) {
        const freeze = document.createElement("style");
        freeze.setAttribute("data-sitewide-browser-smoke", "true");
        freeze.textContent = [
          "*,*::before,*::after{",
          "animation-duration:0s!important;",
          "animation-delay:0s!important;",
          "transition-duration:0s!important;",
          "scroll-behavior:auto!important;",
          "caret-color:transparent!important;",
          "}",
        ].join("");
        document.head.appendChild(freeze);
      }

      const step = Math.max(320, Math.floor(window.innerHeight * 0.9));
      const maximum = Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight ?? 0
      );
      for (let y = 0; y < maximum; y += step) {
        window.scrollTo(0, y);
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      window.scrollTo(0, 0);

      await Promise.race([
        Promise.all(Array.from(document.images).map((image) =>
          image.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                image.addEventListener("load", resolve, { once: true });
                image.addEventListener("error", resolve, { once: true });
              })
        )),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);

      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      );
    })()
  `);

  if (dismissDialog) {
    const hasDialog = await cdp.evaluate(
      "Boolean(document.querySelector('[role=dialog][aria-modal=true]'))"
    );
    if (hasDialog) {
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
      });
      await cdp.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
      });
      await delay(80);
    }
  }

  await delay(100);
}

async function auditPage(cdp, page, viewport) {
  return cdp.evaluate(`
    (() => {
      const expectedText = ${JSON.stringify(page.expectedText ?? null)};
      const pageId = ${JSON.stringify(page.id)};
      const minimum = ${minimumTouchTarget};
      const tolerance = ${touchTolerance};
      const mobile = ${viewport.mobile};
      const root = document.documentElement;
      const body = document.body;
      const viewportWidth = window.innerWidth;
      const scrollWidth = Math.max(root.scrollWidth, body?.scrollWidth ?? 0);

      function visible(element) {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity || "1") > 0 &&
          rect.width > 0 && rect.height > 0;
      }

      function insideHorizontalScroller(element) {
        let parent = element.parentElement;
        while (parent && parent !== body) {
          const style = getComputedStyle(parent);
          if (["auto", "scroll", "hidden", "clip"].includes(style.overflowX) &&
              parent.scrollWidth > parent.clientWidth + 1) {
            return true;
          }
          parent = parent.parentElement;
        }
        return false;
      }

      function labelled(element) {
        const aria = element.getAttribute("aria-label")?.trim();
        if (aria) return true;
        const labelledBy = element.getAttribute("aria-labelledby")?.trim();
        if (labelledBy && labelledBy.split(/\\s+/).every((id) => document.getElementById(id))) {
          return true;
        }
        if ("labels" in element && element.labels?.length) return true;

        // Chrome exposes native label relationships inconsistently for some
        // range controls through this DevTools evaluation path. Recognize the
        // two valid HTML labelling forms explicitly rather than weakening the
        // accessible-name requirement or adding per-page exceptions.
        const wrappingLabel = element.closest("label");
        if (wrappingLabel && (wrappingLabel.textContent ?? "").trim()) {
          return true;
        }
        const controlId = element.id?.trim();
        if (controlId) {
          const explicitLabel = Array.from(document.querySelectorAll("label[for]"))
            .find((label) =>
              label.htmlFor === controlId &&
              (label.textContent ?? "").trim()
            );
          if (explicitLabel) return true;
        }

        if ((element.textContent ?? "").trim()) return true;
        if (element.getAttribute("title")?.trim()) return true;
        if (element instanceof HTMLInputElement &&
            ["submit", "button", "reset"].includes(element.type) &&
            element.value.trim()) return true;
        return false;
      }

      function pseudoBox(element, pseudo) {
        const style = getComputedStyle(element, pseudo);
        if (!style || style.content === "none" || style.display === "none" ||
            style.visibility === "hidden" || style.pointerEvents === "none") {
          return null;
        }
        const width = Number.parseFloat(style.width);
        const height = Number.parseFloat(style.height);
        if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
        return { width, height };
      }

      function renderedScale(element, rect) {
        return {
          x: element.offsetWidth > 0 ? rect.width / element.offsetWidth : 1,
          y: element.offsetHeight > 0 ? rect.height / element.offsetHeight : 1,
        };
      }

      const interactive = Array.from(document.querySelectorAll(
        "a[href],button,input:not([type=hidden]),select,textarea,summary"
      )).filter((element) => {
        if ("disabled" in element && element.disabled) return false;
        return visible(element);
      });

      const outsideViewport = interactive
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return (rect.left < -2 || rect.right > viewportWidth + 2) &&
            !insideHorizontalScroller(element);
        })
        .slice(0, 20)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName.toLowerCase(),
            text: (element.textContent ?? "").trim().replace(/\\s+/g, " ").slice(0, 100),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
          };
        });

      const unlabeledControls = interactive
        .filter((element) => !labelled(element))
        .slice(0, 20)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          type: element.getAttribute("type") ?? "",
          name: element.getAttribute("name") ?? "",
        }));

      const enforceTouchTargets =
        mobile || pageId.startsWith("admin-");

      const touchFailures = enforceTouchTargets
        ? interactive
            .filter((element) => {
              if (element instanceof HTMLAnchorElement &&
                  getComputedStyle(element).display === "inline") {
                return false;
              }
              const rect = element.getBoundingClientRect();
              const scale = renderedScale(element, rect);
              const before = pseudoBox(element, "::before");
              const after = pseudoBox(element, "::after");
              const effectiveWidth = Math.max(
                rect.width,
                before ? before.width * scale.x : 0,
                after ? after.width * scale.x : 0
              );
              const effectiveHeight = Math.max(
                rect.height,
                before ? before.height * scale.y : 0,
                after ? after.height * scale.y : 0
              );
              element.__deunaEffectiveTarget = { effectiveWidth, effectiveHeight };
              return effectiveWidth < minimum - tolerance ||
                effectiveHeight < minimum - tolerance;
            })
            .slice(0, 20)
            .map((element) => ({
              tag: element.tagName.toLowerCase(),
              text: (element.getAttribute("aria-label") || element.textContent || "")
                .trim().replace(/\\s+/g, " ").slice(0, 100),
              width: Number(element.__deunaEffectiveTarget.effectiveWidth.toFixed(2)),
              height: Number(element.__deunaEffectiveTarget.effectiveHeight.toFixed(2)),
            }))
        : [];

      const ids = Array.from(document.querySelectorAll("[id]"))
        .map((element) => element.id)
        .filter(Boolean);
      const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))]
        .slice(0, 20);

      const brokenImages = Array.from(document.images)
        .filter((image) => {
          if (!image.complete || image.naturalWidth > 0) return false;
          try {
            return new URL(image.currentSrc || image.src, location.href).origin === location.origin;
          } catch {
            return true;
          }
        })
        .slice(0, 20)
        .map((image) => image.currentSrc || image.src);

      const text = body?.innerText ?? "";
      const badTextTokens = ["undefined", "[object Object]", "NaN"]
        .filter((token) => text.includes(token));
      const visibleH1 = Array.from(document.querySelectorAll("h1")).filter(visible);
      const adminGamesMobileReady =
        pageId !== "admin-games" || !mobile || (() => {
          const mobileList = document.querySelector('[data-admin-games-mobile-list="true"]');
          const desktopTable = document.querySelector('[data-admin-games-table="true"]');
          const mobileActions = mobileList?.querySelector('[data-mobile-actions="true"]');
          return mobileList instanceof HTMLElement &&
            visible(mobileList) &&
            (!desktopTable || !visible(desktopTable)) &&
            mobileActions instanceof HTMLElement &&
            visible(mobileActions);
        })();
      const adminGamesMobileCardCount =
        pageId === "admin-games" && mobile
          ? Array.from(document.querySelectorAll('[data-admin-games-mobile-card="true"]'))
              .filter((element) => element instanceof HTMLElement && visible(element))
              .length
          : null;
      const adminGamesMobilePaginationReady =
        pageId !== "admin-games" || !mobile || (() => {
          const pagination = document.querySelector(
            '[data-admin-games-mobile-pagination="true"]'
          );
          return pagination instanceof HTMLElement && visible(pagination);
        })();
      const homeContentSingleStep =
        pageId !== "admin-home-content" || (() => {
          const steps = [
            "home-content-structure",
            "home-content-curation",
            "home-content-cards",
          ]
            .map((id) => document.getElementById(id))
            .filter((element) => element instanceof HTMLElement);
          return steps.length === 3 &&
            steps.filter((element) => visible(element)).length === 1;
        })();
      const taxonomyVisibleRows =
        pageId === "admin-catalog-classifications" ||
        pageId === "admin-catalog-tags"
          ? Array.from(document.querySelectorAll('[data-taxonomy-term-row="true"]'))
              .filter((element) => element instanceof HTMLElement && visible(element))
              .length
          : null;
      const gameValuationNavigationReady =
        pageId === "admin-game-preview" ||
        !pageId.startsWith("admin-game-") ||
        Boolean(document.querySelector('a[href*="?seccion=valoracion"]'));
      const gameEditorSaveBarHeight =
        mobile && pageId.startsWith("admin-game-")
          ? (() => {
              const actions = document.querySelector(".admin-form-actions");
              if (!(actions instanceof HTMLElement) || !visible(actions)) return null;
              return Number(actions.getBoundingClientRect().height.toFixed(2));
            })()
          : null;
      const gamePreviewGalleryWidthRatio =
        pageId === "admin-game-preview"
          ? (() => {
              const galleryPanel = document.querySelector(
                '[data-game-detail-gallery-preview="true"]'
              );
              const hero = document.querySelector(
                '[data-game-detail-media-scope]'
              );
              if (
                !(galleryPanel instanceof HTMLElement) ||
                !(hero instanceof HTMLElement) ||
                !visible(galleryPanel) ||
                !visible(hero)
              ) {
                return null;
              }
              const galleryWidth = galleryPanel.getBoundingClientRect().width;
              const heroWidth = hero.getBoundingClientRect().width;
              if (galleryWidth <= 0 || heroWidth <= 0) return null;
              return Number((galleryWidth / heroWidth).toFixed(3));
            })()
          : null;
      const publicGameBackgroundReady =
        pageId !== "public-game-detail" || (() => {
          const layer = document.querySelector(
            '[data-game-detail-background-media="true"]'
          );
          if (!(layer instanceof HTMLElement) || !visible(layer)) return false;
          const host = layer.parentElement;
          return host instanceof HTMLElement &&
            getComputedStyle(host).position === "fixed";
        })();
      const adminGameBackgroundPreviewReady =
        pageId !== "admin-game-preview" || (() => {
          const panel = document.querySelector(
            '[data-game-detail-background-preview="true"]'
          );
          if (!(panel instanceof HTMLElement) || !visible(panel)) return false;
          const layers = Array.from(
            panel.querySelectorAll('[data-game-detail-background-media="true"]')
          ).filter((element) =>
            element instanceof HTMLElement && visible(element)
          );
          if (layers.length !== 2) return false;
          return layers.every((layer) => {
            const host = layer.parentElement;
            return host instanceof HTMLElement &&
              getComputedStyle(host).position === "relative" &&
              getComputedStyle(layer).position === "absolute";
          });
        })();
      const adminGameHeroPreviewReady =
        pageId !== "admin-game-preview" || (() => {
          const panel = document.querySelector(
            '[data-game-hero-public-preview="true"]'
          );
          if (!(panel instanceof HTMLElement) || !visible(panel)) return false;
          const devices = ["desktop", "tablet", "mobile"];
          return devices.every((device) => {
            const host = panel.querySelector(
              `[data-hero-preview-device="${device}"]`
            );
            if (!(host instanceof HTMLElement) || !visible(host)) return false;
            const frames = Array.from(host.querySelectorAll("iframe"));
            return frames.length === 1 &&
              frames[0] instanceof HTMLIFrameElement &&
              visible(frames[0]) &&
              frames[0].title.startsWith("Hero real en ");
          });
        })();


      return {
        url: location.href,
        title: document.title,
        viewportWidth,
        viewportHeight: window.innerHeight,
        scrollWidth,
        scrollHeight: Math.max(root.scrollHeight, body?.scrollHeight ?? 0),
        horizontalOverflow: scrollWidth > viewportWidth + 2,
        mainPresent: Boolean(document.querySelector("main")),
        h1Count: visibleH1.length,
        expectedTextPresent: expectedText === null || text.includes(expectedText),
        outsideViewport,
        unlabeledControls,
        touchFailures,
        duplicateIds,
        brokenImages,
        badTextTokens,
        adminGamesMobileReady,
        adminGamesMobileCardCount,
        adminGamesMobilePaginationReady,
        homeContentSingleStep,
        taxonomyVisibleRows,
        gameValuationNavigationReady,
        gameEditorSaveBarHeight,
        gamePreviewGalleryWidthRatio,
        publicGameBackgroundReady,
        adminGameBackgroundPreviewReady,
        adminGameHeroPreviewReady,
      };
    })()
  `);
}

async function captureScreenshot(cdp, filePath, viewport) {
  const metrics = await cdp.send("Page.getLayoutMetrics");
  const contentSize = metrics.cssContentSize ?? metrics.contentSize;
  const contentHeight = Math.max(viewport.height, Math.ceil(contentSize.height));
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

function isBlockingRuntimeIssue(event, expectedDocumentStatus) {
  if (event.kind === "exception" || event.kind === "console") return true;
  if (event.kind !== "network") return false;
  if (event.document && event.status === expectedDocumentStatus) return false;
  try {
    const url = new URL(event.url, baseUrl);
    return url.origin === baseOrigin;
  } catch {
    return true;
  }
}

function issueText(event) {
  if (event.kind === "network") {
    return `${event.status || "LOAD"} ${event.url}: ${event.text}`;
  }
  return event.text;
}

async function loginAdmin(cdp) {
  if (!adminUsername || !adminPassword) {
    throw new Error("Faltan credenciales del Owner visual.");
  }
  await setViewport(cdp, browserViewports[0]);
  await navigate(cdp, `${baseUrl}/admin/login`);
  await settleApplication(cdp);
  const prepared = await cdp.evaluate(`
    (() => {
      const username = document.querySelector("#admin-username");
      const password = document.querySelector("#admin-password");
      const form = document.querySelector('form[action="/api/admin/auth/login"]');
      if (!(username instanceof HTMLInputElement) ||
          !(password instanceof HTMLInputElement) ||
          !(form instanceof HTMLFormElement)) return false;
      const set = (input, value) => {
        const setter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype, "value"
        )?.set;
        setter?.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      };
      set(username, ${JSON.stringify(adminUsername)});
      set(password, ${JSON.stringify(adminPassword)});
      form.requestSubmit();
      return true;
    })()
  `);
  if (!prepared) throw new Error("No se encontró el login real del Admin.");
  await cdp.waitFor("Page.loadEventFired", () => true, 20_000);
  await delay(150);
  const pathname = await cdp.evaluate("location.pathname");
  if (pathname === "/admin/login") {
    throw new Error("El Owner visual no pudo iniciar sesión.");
  }
}

async function readFixtureValues() {
  const gamesSource = await readFile(
    path.resolve("src/data/games.ts"),
    "utf8"
  );
  const gameSlugs = [...gamesSource.matchAll(/\bslug:\s*"([^"]+)"/g)]
    .map((match) => match[1]);

  if (!gameSlugs.includes(representativeGameSlug)) {
    throw new Error(
      `El fixture representativo ${representativeGameSlug} ya no existe.`
    );
  }

  return {
    gameSlugs: [...new Set(gameSlugs)],
  };
}

async function checkRedirect(cdp, check) {
  const navigation = await navigate(cdp, `${baseUrl}${check.pathname}`);
  await settleApplication(cdp);
  const state = await cdp.evaluate(`({
    pathname: location.pathname,
    search: Object.fromEntries(new URLSearchParams(location.search)),
    h1: document.querySelector("h1")?.textContent?.trim() ?? "",
  })`);
  if (navigation.status >= 400) {
    throw new Error(`${check.id}: respondió ${navigation.status}.`);
  }
  if (state.pathname !== check.finalPathname) {
    throw new Error(`${check.id}: terminó en ${state.pathname}; se esperaba ${check.finalPathname}.`);
  }
  for (const [key, value] of Object.entries(check.finalSearch)) {
    if (state.search[key] !== value) {
      throw new Error(`${check.id}: query ${key}=${state.search[key] ?? "<ausente>"}; se esperaba ${value}.`);
    }
  }
}

function validateAudit(result, failures) {
  const prefix = `${result.page}/${result.viewport}`;
  const audit = result.audit;
  if (!audit.mainPresent) failures.push(`${prefix}: falta <main>.`);
  if (audit.h1Count < 1) failures.push(`${prefix}: no hay h1 visible.`);
  if (!audit.expectedTextPresent) failures.push(`${prefix}: falta el texto de identidad esperado.`);
  if (audit.horizontalOverflow) {
    failures.push(`${prefix}: scrollWidth ${audit.scrollWidth}px supera viewport ${audit.viewportWidth}px.`);
  }
  if (audit.outsideViewport.length) {
    failures.push(`${prefix}: controles fuera de viewport: ${JSON.stringify(audit.outsideViewport)}.`);
  }
  if (audit.unlabeledControls.length) {
    failures.push(`${prefix}: controles sin nombre accesible: ${JSON.stringify(audit.unlabeledControls)}.`);
  }
  if (audit.touchFailures.length) {
    failures.push(`${prefix}: targets táctiles efectivos <44px: ${JSON.stringify(audit.touchFailures)}.`);
  }
  if (audit.duplicateIds.length) {
    failures.push(`${prefix}: IDs duplicados: ${audit.duplicateIds.join(", ")}.`);
  }
  if (audit.brokenImages.length) {
    failures.push(`${prefix}: imágenes locales rotas: ${audit.brokenImages.join(", ")}.`);
  }
  if (audit.badTextTokens.length) {
    failures.push(`${prefix}: tokens de render inválidos: ${audit.badTextTokens.join(", ")}.`);
  }
  if (!audit.adminGamesMobileReady) {
    failures.push(`${prefix}: Juegos móvil no expone su lista y acciones canónicas sin tabla horizontal.`);
  }
  if (
    audit.adminGamesMobileCardCount !== null &&
    audit.adminGamesMobileCardCount > 8
  ) {
    failures.push(
      `${prefix}: Juegos móvil muestra ${audit.adminGamesMobileCardCount} cards; el máximo operativo es 8.`
    );
  }
  if (!audit.adminGamesMobilePaginationReady) {
    failures.push(`${prefix}: Juegos móvil perdió la paginación operativa.`);
  }
  if (!audit.homeContentSingleStep) {
    failures.push(`${prefix}: Resto de Inicio debe mostrar un único paso de edición a la vez.`);
  }
  const taxonomyMaxRows =
    result.page === "admin-catalog-classifications"
      ? 6
      : result.page === "admin-catalog-tags"
        ? 12
        : null;
  if (
    taxonomyMaxRows !== null &&
    audit.taxonomyVisibleRows !== null &&
    audit.taxonomyVisibleRows > taxonomyMaxRows
  ) {
    failures.push(
      `${prefix}: Catálogos muestra ${audit.taxonomyVisibleRows} filas; el máximo operativo es ${taxonomyMaxRows}.`
    );
  }
  if (!audit.gameValuationNavigationReady) {
    failures.push(`${prefix}: el editor de juego perdió el acceso canónico a Valoración.`);
  }
  if (
    audit.gameEditorSaveBarHeight !== null &&
    audit.gameEditorSaveBarHeight > 80
  ) {
    failures.push(
      `${prefix}: la barra fija de guardado mide ${audit.gameEditorSaveBarHeight}px y tapa demasiado contenido móvil.`
    );
  }
  if (
    result.page === "admin-game-preview" &&
    (
      audit.gamePreviewGalleryWidthRatio === null ||
      audit.gamePreviewGalleryWidthRatio < 0.9
    )
  ) {
    failures.push(
      `${prefix}: la Galería de Vista previa ocupa sólo ${audit.gamePreviewGalleryWidthRatio ?? "ancho desconocido"}x del Hero; debe usar el ancho de la ficha pública.`
    );
  }
  if (!audit.publicGameBackgroundReady) {
    failures.push(
      `${prefix}: la ficha pública no montó el Fondo confirmado dentro del host fixed canónico.`
    );
  }
  if (!audit.adminGameBackgroundPreviewReady) {
    failures.push(
      `${prefix}: Vista previa no montó exactamente dos Fondos contenidos con el renderer canónico.`
    );
  }
  if (!audit.adminGameHeroPreviewReady) {
    failures.push(
      `${prefix}: Vista previa no montó el Hero público real en escritorio, tableta y móvil.`
    );
  }
  if (result.runtimeIssues.length) {
    failures.push(`${prefix}: runtime/red: ${result.runtimeIssues.join(" | ")}.`);
  }
  if (result.documentStatus !== result.expectedDocumentStatus) {
    failures.push(`${prefix}: documento HTTP ${result.documentStatus}; se esperaba ${result.expectedDocumentStatus}.`);
  }
}

function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function writeReport(results, sweeps, failures) {
  await writeFile(
    path.join(outputDir, "report.json"),
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      baseUrl,
      results,
      sweeps,
      failures,
    }, null, 2)}\n`,
    "utf8"
  );
  const cards = results.map((result) => `
    <article>
      <h2>${htmlEscape(result.page)} · ${htmlEscape(result.viewport)}</h2>
      <p>${htmlEscape(result.audit.url)}</p>
      <img src="${htmlEscape(result.file)}" alt="${htmlEscape(result.page)} ${htmlEscape(result.viewport)}">
      <pre>${htmlEscape(JSON.stringify({
        documentStatus: result.documentStatus,
        horizontalOverflow: result.audit.horizontalOverflow,
        touchFailures: result.audit.touchFailures,
        unlabeledControls: result.audit.unlabeledControls,
        outsideViewport: result.audit.outsideViewport,
        runtimeIssues: result.runtimeIssues,
        publicGameBackgroundReady: result.audit.publicGameBackgroundReady,
        adminGameBackgroundPreviewReady: result.audit.adminGameBackgroundPreviewReady,
        adminGameHeroPreviewReady: result.audit.adminGameHeroPreviewReady,
        truncated: result.capture.truncated,
      }, null, 2))}</pre>
    </article>
  `).join("\n");
  await writeFile(
    path.join(outputDir, "index.html"),
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DeUna site-wide smoke</title><style>body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#0e1116;color:#f5f7fa}main{max-width:1500px;margin:auto}article{margin:0 0 32px;padding:18px;border:1px solid #303641;border-radius:14px;background:#171b22}img{display:block;max-width:100%;height:auto;margin:14px auto;background:#fff}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#090b0f;padding:14px;border-radius:9px}.fail{color:#ff9c9c}</style></head><body><main><h1>DeUna · cobertura browser global</h1><p>${results.length} capturas y ${sweeps.length} recorridos dinámicos/redirect.</p>${failures.length ? `<h2 class="fail">Fallos</h2><pre>${htmlEscape(failures.join("\n"))}</pre>` : "<p>Sin regresiones estructurales detectadas.</p>"}${cards}</main></body></html>\n`,
    "utf8"
  );
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const fixture = await readFixtureValues();
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "deuna-sitewide-chrome-"));
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
  let browserError = "";
  browser.stderr.setEncoding("utf8");
  browser.stderr.on("data", (chunk) => {
    browserError += chunk;
    if (browserError.length > 20_000) browserError = browserError.slice(-20_000);
  });

  const results = [];
  const sweeps = [];
  const failures = [];
  const runtimeEvents = [];
  let currentContext = "browser";
  let cdp = null;

  try {
    const target = await waitForDebugger(profileDir);
    cdp = new CdpSession(await openWebSocket(target.webSocketDebuggerUrl));
    await Promise.all([
      cdp.send("Page.enable"),
      cdp.send("Runtime.enable"),
      cdp.send("Network.enable"),
    ]);

    cdp.on("Runtime.exceptionThrown", (event) => {
      runtimeEvents.push({
        context: currentContext,
        kind: "exception",
        text: event.exceptionDetails?.exception?.description ??
          event.exceptionDetails?.text ?? "Excepción JavaScript sin detalle.",
      });
    });
    cdp.on("Runtime.consoleAPICalled", (event) => {
      if (event.type !== "error") return;
      runtimeEvents.push({
        context: currentContext,
        kind: "console",
        text: event.args?.map((argument) =>
          argument.value ?? argument.description ?? argument.type
        ).join(" ") ?? "console.error sin detalle.",
      });
    });
    cdp.on("Network.loadingFailed", (event) => {
      if (event.canceled) return;
      runtimeEvents.push({
        context: currentContext,
        kind: "network",
        status: 0,
        document: event.type === "Document",
        url: event.url ?? event.requestId,
        text: event.errorText ?? "Carga fallida.",
      });
    });
    cdp.on("Network.responseReceived", (event) => {
      const status = event.response?.status ?? 0;
      if (status < 400) return;
      if (!["Document", "Script", "Stylesheet", "Image", "Font", "XHR", "Fetch"].includes(event.type)) return;
      runtimeEvents.push({
        context: currentContext,
        kind: "network",
        status,
        document: event.type === "Document",
        url: event.response?.url ?? event.requestId,
        text: event.response?.statusText ?? "Respuesta HTTP fallida.",
      });
    });

    async function capturePage(page, viewport, authenticated) {
      currentContext = `${page.id}-${viewport.id}`;
      const start = runtimeEvents.length;
      await setViewport(cdp, viewport);
      const navigation = await navigate(cdp, `${baseUrl}${page.pathname}`);
      await settleApplication(cdp, page);
      const expectedDocumentStatus = page.expectedDocumentStatus ?? 200;
      const audit = await auditPage(cdp, page, viewport);
      const file = `${page.id}-${viewport.id}.png`;
      const capture = await captureScreenshot(cdp, path.join(outputDir, file), viewport);
      await delay(50);
      const runtimeIssues = runtimeEvents
        .slice(start)
        .filter((event) => event.context === currentContext)
        .filter((event) => isBlockingRuntimeIssue(event, expectedDocumentStatus))
        .map(issueText);
      const result = {
        page: page.id,
        viewport: viewport.id,
        authenticated,
        file,
        documentStatus: navigation.status,
        expectedDocumentStatus,
        audit,
        capture,
        runtimeIssues,
      };
      results.push(result);
      validateAudit(result, failures);
    }

    for (const page of publicVisualPages) {
      for (const viewport of browserViewports) {
        await capturePage(page, viewport, false);
      }
    }

    await setViewport(cdp, browserViewports[0]);
    for (const slug of fixture.gameSlugs) {
      currentContext = `game-sweep-${slug}`;
      const navigation = await navigate(cdp, `${baseUrl}/juegos/${encodeURIComponent(slug)}`);
      await settleApplication(cdp);
      const state = await cdp.evaluate(`({
        pathname: location.pathname,
        h1: document.querySelector("h1")?.textContent?.trim() ?? "",
        main: Boolean(document.querySelector("main")),
      })`);
      if (navigation.status !== 200 || state.pathname !== `/juegos/${slug}` || !state.main || !state.h1) {
        failures.push(`game-sweep/${slug}: status=${navigation.status}, path=${state.pathname}, h1=${JSON.stringify(state.h1)}.`);
      }
      sweeps.push({ id: `game:${slug}`, status: navigation.status, finalPathname: state.pathname });

      currentContext = `download-sweep-${slug}`;
      const downloadNavigation = await navigate(
        cdp,
        `${baseUrl}/juegos/${encodeURIComponent(slug)}/descargar`
      );
      await settleApplication(cdp);
      const finalPathname = await cdp.evaluate("location.pathname");
      const allowed = finalPathname === `/juegos/${slug}/descargar` ||
        finalPathname === `/juegos/${slug}`;
      if (downloadNavigation.status !== 200 || !allowed) {
        failures.push(`download-sweep/${slug}: status=${downloadNavigation.status}, final=${finalPathname}.`);
      }
      sweeps.push({ id: `download:${slug}`, status: downloadNavigation.status, finalPathname });
    }

    for (const check of redirectChecks.filter((entry) => !entry.authenticated)) {
      currentContext = check.id;
      try {
        await checkRedirect(cdp, check);
        sweeps.push({ id: check.id, ok: true });
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }

    for (const viewport of browserViewports) {
      await capturePage(adminLoginVisualPage, viewport, false);
    }
    currentContext = "admin-login-flow";
    await loginAdmin(cdp);

    for (const page of adminVisualPages) {
      for (const viewport of browserViewports) {
        await capturePage(page, viewport, true);
      }
    }

    for (const check of redirectChecks.filter((entry) => entry.authenticated)) {
      currentContext = check.id;
      try {
        await checkRedirect(cdp, check);
        sweeps.push({ id: check.id, ok: true });
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }

    await writeReport(results, sweeps, failures);

    for (const result of results) {
      console.log(
        `[sitewide] ${result.page}/${result.viewport}: ${result.audit.viewportWidth}x${result.audit.viewportHeight}, ` +
        `alto ${result.audit.scrollHeight}px, touch=${result.audit.touchFailures.length}, labels=${result.audit.unlabeledControls.length}, ` +
        `${result.capture.truncated ? "captura truncada" : "captura completa"}`
      );
    }

    if (failures.length) {
      console.error("\nSite-wide browser smoke: BLOQUEADO\n");
      for (const failure of failures) console.error(`- ${failure}`);
      process.exitCode = 1;
    } else {
      console.log(
        `\nSite-wide browser smoke: OK (${results.length} capturas; ${fixture.gameSlugs.length} fichas públicas; ${fixture.gameSlugs.length} rutas de descarga; ${adminVisualPages.length} estados Admin; ${redirectChecks.length} redirects).`
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    failures.push(message);
    await writeReport(results, sweeps, failures).catch(() => {});
    console.error(message);
    if (browserError.trim()) console.error("\nChrome stderr:\n", browserError.trim());
    process.exitCode = 1;
  } finally {
    cdp?.close();
    browser.kill("SIGTERM");
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

await main();
