import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const toolsDirectory = path.dirname(
  fileURLToPath(import.meta.url)
);
const root = path.resolve(
  toolsDirectory,
  ".."
);
const serverPath = path.join(
  root,
  ".next",
  "standalone",
  "server.js"
);

const host = "127.0.0.1";
const port = 3107;
const baseUrl = `http://${host}:${port}`;

const forbiddenPublicMarkers = [
  /\bArgentina\b/i,
  /Buenos[_\s]Aires/i,
  /America\/Argentina/i,
  /\bes[-_]AR\b/i,
  /T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?[+-]\d{2}:\d{2}\b/,
  /[A-Za-z]:\\Users\\[^\\\s]+/,
  /\/Users\/[^/\s]+/,
];

function fail(message) {
  throw new Error(message);
}

function tagAttribute(tag, name) {
  return tag.match(
    new RegExp(
      `\\b${name}=["']([^"']+)["']`,
      "i"
    )
  )?.[1] ?? null;
}

function canonicalFrom(html) {
  const tags =
    html.match(/<link\b[^>]*>/gi) ?? [];

  const tag = tags.find(
    (candidate) =>
      tagAttribute(candidate, "rel")?.toLowerCase() ===
      "canonical"
  );

  return tag
    ? tagAttribute(tag, "href")
    : null;
}

function robotsFrom(html) {
  const tags =
    html.match(/<meta\b[^>]*>/gi) ?? [];

  const tag = tags.find(
    (candidate) =>
      tagAttribute(candidate, "name")?.toLowerCase() ===
      "robots"
  );

  return tag
    ? tagAttribute(tag, "content")
    : null;
}

function expectedAbsolute(pathname) {
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "http://localhost:3000";

  return new URL(pathname, `${origin}/`).toString();
}

function sameUrl(actual, expected) {
  if (!actual) {
    return false;
  }

  try {
    return (
      new URL(actual).toString() ===
      new URL(expected).toString()
    );
  } catch {
    return false;
  }
}

function redirectPathnames(value) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      try {
        return new URL(entry, baseUrl).pathname;
      } catch {
        return null;
      }
    });
}

function assertPublicHtmlPrivacy(
  label,
  html
) {
  if (!/<html\b[^>]*\blang=["']es["']/i.test(html)) {
    fail(`${label}: falta lang="es" neutral.`);
  }

  for (const pattern of forbiddenPublicMarkers) {
    if (pattern.test(html)) {
      fail(`${label}: el HTML contiene una huella regional o local prohibida.`);
    }
  }
}

async function request(pathname, options) {
  return fetch(`${baseUrl}${pathname}`, {
    redirect: "manual",
    ...options,
  });
}

async function waitForServer(child) {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      fail(
        `El servidor terminó antes del smoke test (código ${child.exitCode}).`
      );
    }

    try {
      const response = await request("/");

      if (response.status === 200) {
        return;
      }
    } catch {
      // El proceso todavía puede estar iniciando.
    }

    await new Promise((resolve) =>
      setTimeout(resolve, 250)
    );
  }

  fail("El servidor no quedó disponible dentro de 15 segundos.");
}

async function stopServer(child) {
  if (child.exitCode !== null) {
    return;
  }

  child.kill();

  await Promise.race([
    new Promise((resolve) =>
      child.once("exit", resolve)
    ),
    new Promise((resolve) =>
      setTimeout(resolve, 3_000)
    ),
  ]);

  if (child.exitCode === null) {
    child.kill("SIGKILL");
  }
}

async function assertStatus(pathname, expectedStatus) {
  const response = await request(pathname);

  if (response.status !== expectedStatus) {
    fail(
      `${pathname}: se esperaba HTTP ${expectedStatus} y respondió ${response.status}.`
    );
  }

  return response;
}

async function assertPngImage(pathname) {
  const response = await assertStatus(pathname, 200);
  const contentType =
    response.headers.get("content-type")?.toLowerCase() ?? "";

  if (!contentType.startsWith("image/png")) {
    fail(
      `${pathname}: se esperaba image/png y respondió ${contentType || "sin Content-Type"}.`
    );
  }

  const bytes = (await response.arrayBuffer()).byteLength;

  if (bytes < 1_024) {
    fail(
      `${pathname}: la imagen social generada es sospechosamente pequeña (${bytes} bytes).`
    );
  }
}

await access(serverPath).catch(() => {
  fail(
    "No existe .next/standalone/server.js. Ejecuta npm run build antes del smoke test."
  );
});

const server = spawn(
  process.execPath,
  [serverPath],
  {
    cwd: root,
    env: {
      ...process.env,
      HOSTNAME: host,
      PORT: String(port),
      NEXT_TELEMETRY_DISABLED: "1",
      DEUNA_ADMIN_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  }
);

let serverOutput = "";

server.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

try {
  await waitForServer(server);

  const home = await assertStatus("/", 200);
  const homeHtml = await home.text();
  const homeCanonical = canonicalFrom(homeHtml);

  assertPublicHtmlPrivacy("Home", homeHtml);

  if (
    !sameUrl(
      homeCanonical,
      expectedAbsolute("/")
    )
  ) {
    fail(
      `Home: canonical inesperado (${homeCanonical ?? "ausente"}).`
    );
  }

  const requiredHeaders = new Map([
    ["content-security-policy", null],
    ["x-content-type-options", "nosniff"],
    ["x-frame-options", "DENY"],
    ["referrer-policy", "no-referrer"],
    ["permissions-policy", null],
  ]);

  for (const [name, expectedValue] of requiredHeaders) {
    const value = home.headers.get(name);

    if (!value) {
      fail(`Home: falta el header ${name}.`);
    }

    if (
      expectedValue !== null &&
      value !== expectedValue
    ) {
      fail(
        `Home: ${name} debía ser "${expectedValue}" y fue "${value}".`
      );
    }
  }

  if (home.headers.has("x-powered-by")) {
    fail("Home: no debe exponer X-Powered-By.");
  }

  const permissionsPolicy =
    home.headers.get("permissions-policy") ?? "";

  if (!permissionsPolicy.includes("geolocation=()")) {
    fail("Home: Permissions-Policy debe bloquear geolocalización.");
  }

  await assertPngImage("/opengraph-image");
  await assertPngImage("/twitter-image");

  const disabledAdmin = await assertStatus(
    "/admin",
    404
  );
  const adminRobotsHeader =
    disabledAdmin.headers
      .get("x-robots-tag")
      ?.toLowerCase() ?? "";
  const adminCacheHeader =
    disabledAdmin.headers
      .get("cache-control")
      ?.toLowerCase() ?? "";

  if (!adminRobotsHeader.includes("noindex")) {
    fail(
      "Admin deshabilitado: falta X-Robots-Tag noindex."
    );
  }

  if (!adminCacheHeader.includes("no-store")) {
    fail(
      "Admin deshabilitado: falta Cache-Control no-store."
    );
  }

  for (const [label, pathname] of [
    ["Colecciones", "/colecciones"],
    ["Programas", "/programas"],
  ]) {
    const response = await assertStatus(pathname, 200);
    const html = await response.text();

    assertPublicHtmlPrivacy(label, html);

    if (
      !sameUrl(
        canonicalFrom(html),
        expectedAbsolute(pathname)
      )
    ) {
      fail(`${label}: canonical incorrecto.`);
    }
  }

  const filtered = await assertStatus(
    "/juegos?q=elden",
    200
  );
  const filteredHtml = await filtered.text();

  assertPublicHtmlPrivacy("Filtro de Juegos", filteredHtml);

  if (
    !sameUrl(
      canonicalFrom(filteredHtml),
      expectedAbsolute("/juegos")
    )
  ) {
    fail("Filtro de Juegos: canonical incorrecto.");
  }

  const filteredRobots =
    robotsFrom(filteredHtml)?.toLowerCase() ?? "";

  if (!filteredRobots.includes("noindex")) {
    fail("Filtro de Juegos: falta robots noindex.");
  }

  const detail = await assertStatus(
    "/juegos/elden-ring",
    200
  );
  const detailHtml = await detail.text();

  assertPublicHtmlPrivacy("Ficha de juego", detailHtml);

  if (
    !sameUrl(
      canonicalFrom(detailHtml),
      expectedAbsolute("/juegos/elden-ring")
    )
  ) {
    fail("Ficha de juego: canonical incorrecto.");
  }

  const unavailableDownload = await request(
    "/juegos/elden-ring/descargar"
  );

  if (![307, 308].includes(unavailableDownload.status)) {
    fail(
      `Descarga no configurada: se esperaba redirect 307/308 y respondió ${unavailableDownload.status}.`
    );
  }

  const downloadLocation =
    unavailableDownload.headers.get("location");
  const downloadPaths =
    redirectPathnames(downloadLocation);

  if (
    downloadPaths.length === 0 ||
    downloadPaths.some(
      (pathname) =>
        pathname !== "/juegos/elden-ring"
    )
  ) {
    fail(
      `Descarga no configurada: destino inesperado (${downloadLocation ?? "ausente"}).`
    );
  }

  const missing = await assertStatus(
    "/ruta-que-no-existe-smoke-test",
    404
  );
  const missingHtml = await missing.text();

  assertPublicHtmlPrivacy("404", missingHtml);

  if (canonicalFrom(missingHtml) !== null) {
    fail("404: no debe heredar un canonical de otra página.");
  }

  const robots = await assertStatus("/robots.txt", 200);
  const robotsText = await robots.text();

  if (!robotsText.includes("Sitemap:")) {
    fail("robots.txt: falta la referencia al sitemap.");
  }

  if (
    !robotsText.includes("Disallow: /admin") ||
    !robotsText.includes("Disallow: /api/admin/")
  ) {
    fail(
      "robots.txt: debe excluir las rutas administrativas."
    );
  }

  const sitemap = await assertStatus("/sitemap.xml", 200);
  const sitemapText = await sitemap.text();

  if (
    !sitemapText.includes(
      expectedAbsolute("/juegos/elden-ring")
    )
  ) {
    fail("sitemap.xml: falta una ficha de juego esperada.");
  }

  for (const pathname of ["/colecciones", "/programas"]) {
    if (
      !sitemapText.includes(
        expectedAbsolute(pathname)
      )
    ) {
      fail(
        `sitemap.xml: falta la ruta pública ${pathname}.`
      );
    }
  }

  console.log(
    "Smoke: OK (runtime, privacidad pública, metadata social, admin cerrado, Colecciones/Programas, canonicals, noindex, descarga fallback, 404, sitemap y headers verificados)."
  );
} catch (error) {
  if (serverOutput.trim()) {
    console.error("\nSalida del servidor:\n");
    console.error(serverOutput.trim());
  }

  throw error;
} finally {
  await stopServer(server);
}
