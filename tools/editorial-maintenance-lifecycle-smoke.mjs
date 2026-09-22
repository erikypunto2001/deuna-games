import {
  randomBytes,
  randomUUID,
} from "node:crypto";
import {
  access,
  mkdir,
  rm,
  unlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import process from "node:process";

import {
  adminQuery,
} from "../src/lib/admin/database.ts";
import {
  getEditorialMediaRoot,
} from "../src/lib/media/editorial-media.ts";
import {
  TAXONOMY_ICON_SLUG,
} from "../src/lib/media/taxonomy-icon-policy.ts";
import {
  SITE_BACKGROUND_MEDIA_SLUG,
} from "../src/lib/site/backgrounds.ts";

const baseUrl = new URL(
  process.env.DEUNA_VISUAL_BASE_URL ?? "https://127.0.0.1:3443"
);
const adminUsername = process.env.DEUNA_VISUAL_ADMIN_USERNAME?.trim();
const adminPassword = process.env.DEUNA_VISUAL_ADMIN_PASSWORD;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

if (
  baseUrl.protocol !== "https:" ||
  !["127.0.0.1", "localhost", "::1"].includes(baseUrl.hostname)
) {
  throw new Error(
    "El lifecycle de mantenimiento sólo puede ejecutarse contra el runtime HTTPS local aislado."
  );
}
if (!adminUsername || !adminPassword) {
  throw new Error("Faltan credenciales efímeras del Owner visual.");
}

function request(pathname, options = {}) {
  const url = new URL(pathname, baseUrl);
  if (url.origin !== baseUrl.origin) {
    throw new Error("Destino fuera del origen visual.");
  }

  const body = options.body ?? "";
  const bytes = Buffer.from(body, "utf8");
  const headers = { ...(options.headers ?? {}) };
  if (bytes.length) headers["content-length"] = String(bytes.length);

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: options.method ?? "GET",
        headers,
        rejectUnauthorized: false,
      },
      (response) => {
        const chunks = [];
        let size = 0;
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_RESPONSE_BYTES) {
            req.destroy(new Error("Respuesta demasiado grande."));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.on("error", reject);
    if (bytes.length) req.write(bytes);
    req.end();
  });
}

function formHeaders(referer, cookie) {
  return {
    "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    origin: baseUrl.origin,
    referer: new URL(referer, baseUrl).href,
    "sec-fetch-site": "same-origin",
    ...(cookie ? { cookie } : {}),
  };
}

function sessionCookie(setCookie) {
  const values = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  const cookies = values
    .map((value) => value.split(";", 1)[0]?.trim())
    .filter(Boolean);
  if (!cookies.length) {
    throw new Error("El login no devolvió cookie de sesión.");
  }
  return cookies.join("; ");
}

function redirectLocation(response, label) {
  if (response.status !== 303) {
    throw new Error(
      label + " respondió " + response.status + "; se esperaba 303."
    );
  }
  const location = response.headers.location;
  if (!location) throw new Error(label + " no devolvió Location.");
  const url = new URL(location, baseUrl);
  if (url.origin !== baseUrl.origin) {
    throw new Error(label + " redirigió fuera del origen.");
  }
  return url;
}

function assertState(url, state, label) {
  if (url.searchParams.get("estado") !== state) {
    throw new Error(
      label + " terminó en " + url.href + "; se esperaba estado=" + state + "."
    );
  }
}

function allInputValues(html, name) {
  const inputs = html.match(/<input\b[^>]*>/gi) ?? [];
  const values = [];
  for (const input of inputs) {
    const nameMatch = input.match(/\bname="([^"]*)"/i);
    if (nameMatch?.[1] !== name) continue;
    const valueMatch = input.match(/\bvalue="([^"]*)"/i);
    if (!valueMatch) continue;
    const value = Number(valueMatch[1]);
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(name + " no es un entero válido.");
    }
    values.push(value);
  }
  return values;
}

function lastInputValue(html, name) {
  const values = allInputValues(html, name);
  if (!values.length) throw new Error("No se encontró " + name + ".");
  return values[values.length - 1];
}


function stringInputValue(html, name) {
  const inputs = html.match(/<input\b[^>]*>/gi) ?? [];
  for (const input of inputs) {
    const nameMatch = input.match(/\bname="([^"]*)"/i);
    if (nameMatch?.[1] !== name) continue;
    const valueMatch = input.match(/\bvalue="([^"]*)"/i);
    if (valueMatch?.[1]) return valueMatch[1];
  }
  throw new Error("No se encontró " + name + ".");
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function maintenancePage(cookie) {
  const response = await request(
    "/admin/mantenimiento",
    { headers: { cookie } }
  );
  if (response.status !== 200) {
    throw new Error(
      "Mantenimiento respondió " + response.status + "."
    );
  }
  return response.body;
}

async function post(pathname, cookie, fields, label) {
  return redirectLocation(
    await request(pathname, {
      method: "POST",
      headers: formHeaders("/admin/mantenimiento", cookie),
      body: new URLSearchParams(fields).toString(),
    }),
    label
  );
}

const login = await request("/api/admin/auth/login", {
  method: "POST",
  headers: formHeaders("/admin/login"),
  body: new URLSearchParams({
    username: adminUsername,
    password: adminPassword,
  }).toString(),
});
redirectLocation(login, "Login de mantenimiento");
const cookie = sessionCookie(login.headers["set-cookie"]);

const owner = await adminQuery(
  `SELECT id
     FROM deuna_admin.admin_users
    WHERE role = 'owner'
      AND active = true
    LIMIT 1`
);
const ownerId = owner.rows[0]?.id;
if (!ownerId) {
  throw new Error("Falta el Owner visual para mantenimiento.");
}

const junkSessionId = randomUUID();
await adminQuery(
  `INSERT INTO deuna_admin.admin_sessions (
     id, user_id, token_hash, expires_at
   )
   VALUES ($1, $2, $3, now() + interval '1 hour')`,
  [
    junkSessionId,
    ownerId,
    randomBytes(32).toString("hex"),
  ]
);
await adminQuery(
  `UPDATE deuna_admin.admin_sessions
      SET revoked_at = now()
    WHERE id = $1`,
  [junkSessionId]
);

const activeGame = await adminQuery(
  `SELECT item_key
     FROM deuna_admin.editorial_items
    WHERE item_type = 'game'
    ORDER BY item_key
    LIMIT 1`
);
const activeGameSlug = activeGame.rows[0]?.item_key;
if (!activeGameSlug) {
  throw new Error("Falta un juego activo para probar marcadores multimedia.");
}

const mediaRoot = getEditorialMediaRoot();
const backgroundDirectory = path.join(
  mediaRoot,
  SITE_BACKGROUND_MEDIA_SLUG
);
const taxonomyDirectory = path.join(
  mediaRoot,
  TAXONOMY_ICON_SLUG
);
const gameDirectory = path.join(
  mediaRoot,
  activeGameSlug
);
const unknownNamespace = `manual-review-${randomBytes(4).toString("hex")}`;
const unknownDirectory = path.join(
  mediaRoot,
  unknownNamespace
);
const oldName = `${randomBytes(32).toString("hex")}.webp`;
const recentName = `${randomBytes(32).toString("hex")}.webp`;
const markerTarget = `${randomBytes(32).toString("hex")}.webp`;
const markerName = `.delete-${markerTarget}`;
const oldPath = path.join(
  backgroundDirectory,
  oldName
);
const recentPath = path.join(
  backgroundDirectory,
  recentName
);
const markerPath = path.join(
  gameDirectory,
  markerName
);
const unknownPath = path.join(
  unknownDirectory,
  "manual.txt"
);

await mkdir(backgroundDirectory, { recursive: true });
await mkdir(taxonomyDirectory, { recursive: true });
await mkdir(gameDirectory, { recursive: true });
await mkdir(unknownDirectory, { recursive: true });
await writeFile(oldPath, "old-orphan", { mode: 0o640 });
await writeFile(recentPath, "recent-orphan", { mode: 0o640 });
await writeFile(markerPath, "marker", { mode: 0o600 });
await writeFile(unknownPath, "manual", { mode: 0o600 });
const oldDate = new Date(
  Date.now() - 25 * 60 * 60 * 1_000
);
await utimes(oldPath, oldDate, oldDate);

let html = await maintenancePage(cookie);
const initialFingerprint =
  stringInputValue(
    html,
    "snapshotFingerprint"
  );

const rejectedGeneral = await post(
  "/api/admin/content/maintenance/site-cleanup",
  cookie,
  {
    confirmation: "LIMPIAR BASURA SEGURA",
    currentPassword: adminPassword + "-incorrecta",
    snapshotFingerprint: initialFingerprint,
  },
  "Limpieza general con contraseña incorrecta"
);
assertState(
  rejectedGeneral,
  "reauth",
  "Reautenticación de limpieza general"
);

if (
  !(await pathExists(oldPath)) ||
  !(await pathExists(markerPath))
) {
  throw new Error(
    "La reautenticación fallida alteró basura multimedia."
  );
}

const staleFingerprint =
  initialFingerprint[0] === "a"
    ? `b${initialFingerprint.slice(1)}`
    : `a${initialFingerprint.slice(1)}`;
const staleGeneral = await post(
  "/api/admin/content/maintenance/site-cleanup",
  cookie,
  {
    confirmation: "LIMPIAR BASURA SEGURA",
    currentPassword: adminPassword,
    snapshotFingerprint: staleFingerprint,
  },
  "Limpieza general con snapshot obsoleto"
);
assertState(
  staleGeneral,
  "limpieza-general-conflicto",
  "Concurrencia de limpieza general"
);

html = await maintenancePage(cookie);
const currentFingerprint =
  stringInputValue(
    html,
    "snapshotFingerprint"
  );
const cleanGeneral = await post(
  "/api/admin/content/maintenance/site-cleanup",
  cookie,
  {
    confirmation: "LIMPIAR BASURA SEGURA",
    currentPassword: adminPassword,
    snapshotFingerprint: currentFingerprint,
  },
  "Limpieza general segura"
);
assertState(
  cleanGeneral,
  "limpieza-general-completa",
  "Limpieza general segura"
);

const junkSession = await adminQuery(
  `SELECT count(*)::int AS count
     FROM deuna_admin.admin_sessions
    WHERE id = $1`,
  [junkSessionId]
);
if (junkSession.rows[0]?.count !== 0) {
  throw new Error(
    "La limpieza general dejó la sesión revocada de prueba."
  );
}

if (
  await pathExists(oldPath) ||
  await pathExists(markerPath) ||
  await pathExists(taxonomyDirectory)
) {
  throw new Error(
    "La limpieza general dejó un huérfano viejo, marcador o namespace vacío."
  );
}

if (
  !(await pathExists(recentPath)) ||
  !(await pathExists(unknownPath))
) {
  throw new Error(
    "La limpieza general eliminó un archivo reciente o un namespace de revisión manual."
  );
}

html = await maintenancePage(cookie);
if (
  !html.includes("Revisión manual") ||
  !html.includes(unknownNamespace)
) {
  throw new Error(
    "Mantenimiento no mostró el namespace desconocido como revisión manual."
  );
}

await unlink(recentPath).catch(() => {});
await rm(unknownDirectory, {
  recursive: true,
  force: true,
});
await rm(backgroundDirectory, {
  recursive: true,
  force: true,
}).catch(() => {});

let homeRevisions = allInputValues(html, "expectedRevisions")[0];
let homePublications = allInputValues(html, "expectedPublications")[0];
if (
  !Number.isInteger(homeRevisions) ||
  !Number.isInteger(homePublications)
) {
  throw new Error("Mantenimiento no expuso conteos de Inicio.");
}

const rejectedHome = await post(
  "/api/admin/content/maintenance/history-reset/home",
  cookie,
  {
    confirmation: "REINICIAR INICIO",
    currentPassword: adminPassword + "-incorrecta",
    expectedRevisions: String(homeRevisions),
    expectedPublications: String(homePublications),
  },
  "Compactación de Inicio con contraseña incorrecta"
);
assertState(rejectedHome, "reauth", "Reautenticación de Inicio");

html = await maintenancePage(cookie);
homeRevisions = allInputValues(html, "expectedRevisions")[0];
homePublications = allInputValues(html, "expectedPublications")[0];

const compactHome = await post(
  "/api/admin/content/maintenance/history-reset/home",
  cookie,
  {
    confirmation: "REINICIAR INICIO",
    currentPassword: adminPassword,
    expectedRevisions: String(homeRevisions),
    expectedPublications: String(homePublications),
  },
  "Compactación de Inicio"
);
assertState(
  compactHome,
  "inicio-historial-compactado",
  "Compactación de Inicio"
);

html = await maintenancePage(cookie);
const globalItems = lastInputValue(html, "expectedItems");
const globalRevisions = lastInputValue(html, "expectedRevisions");
const globalPublications = lastInputValue(html, "expectedPublications");

const staleGlobal = await post(
  "/api/admin/content/maintenance/history-reset",
  cookie,
  {
    confirmation: "REINICIAR HISTORIAL",
    currentPassword: adminPassword,
    expectedItems: String(globalItems),
    expectedRevisions: String(globalRevisions + 1),
    expectedPublications: String(globalPublications),
  },
  "Compactación global con snapshot obsoleto"
);
assertState(
  staleGlobal,
  "mantenimiento-conflicto",
  "Concurrencia de compactación global"
);

html = await maintenancePage(cookie);
const currentItems = lastInputValue(html, "expectedItems");
const currentRevisions = lastInputValue(html, "expectedRevisions");
const currentPublications = lastInputValue(html, "expectedPublications");

const compactGlobal = await post(
  "/api/admin/content/maintenance/history-reset",
  cookie,
  {
    confirmation: "REINICIAR HISTORIAL",
    currentPassword: adminPassword,
    expectedItems: String(currentItems),
    expectedRevisions: String(currentRevisions),
    expectedPublications: String(currentPublications),
  },
  "Compactación global"
);
assertState(
  compactGlobal,
  "historial-compactado",
  "Compactación global"
);

const finalHtml = await maintenancePage(cookie);
const finalItems = lastInputValue(finalHtml, "expectedItems");
const finalRevisions = lastInputValue(finalHtml, "expectedRevisions");
const finalPublications = lastInputValue(finalHtml, "expectedPublications");

if (
  finalRevisions !== finalItems ||
  finalPublications !== finalItems
) {
  throw new Error(
    "La compactación global no dejó un baseline por registro (" +
      finalItems + "/" + finalRevisions + "/" + finalPublications + ")."
  );
}

console.log(
  "Editorial maintenance lifecycle: OK (limpieza general con reauth/conflicto/filesystem, revisión manual preservada, Inicio acotado y baseline global verificados por rutas HTTP reales)."
);
