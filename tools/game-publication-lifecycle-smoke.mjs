import { readFile } from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import process from "node:process";

import {
  representativeGameSlug,
} from "./browser-page-manifest.mjs";

const baseUrl = new URL(
  process.env.DEUNA_VISUAL_BASE_URL ??
    "https://127.0.0.1:3443"
);
const adminUsername =
  process.env.DEUNA_VISUAL_ADMIN_USERNAME?.trim();
const adminPassword =
  process.env.DEUNA_VISUAL_ADMIN_PASSWORD;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

if (
  baseUrl.protocol !== "https:" ||
  !["127.0.0.1", "localhost", "::1"].includes(baseUrl.hostname)
) {
  throw new Error(
    "El lifecycle editorial de juego sólo puede ejecutarse contra el runtime HTTPS local aislado."
  );
}

if (!adminUsername || !adminPassword) {
  throw new Error(
    "Faltan DEUNA_VISUAL_ADMIN_USERNAME/DEUNA_VISUAL_ADMIN_PASSWORD."
  );
}

function request(pathname, options = {}) {
  const url = new URL(pathname, baseUrl);

  if (url.origin !== baseUrl.origin) {
    throw new Error(
      `El lifecycle rechazó un destino fuera del origen visual: ${url.origin}.`
    );
  }

  const body = options.body ?? "";
  const bodyBytes = Buffer.isBuffer(body)
    ? body
    : Buffer.from(body, "utf8");
  const headers = { ...(options.headers ?? {}) };

  if (bodyBytes.length > 0) {
    headers["content-length"] = String(bodyBytes.length);
  }

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
            req.destroy(
              new Error(
                `La respuesta de ${url.pathname} superó ${MAX_RESPONSE_BYTES} bytes.`
              )
            );
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
    if (bodyBytes.length > 0) req.write(bodyBytes);
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

function mediaUploadHeaders(referer, cookie, boundary) {
  return {
    origin: baseUrl.origin,
    referer: new URL(referer, baseUrl).href,
    "sec-fetch-site": "same-origin",
    "content-type": `multipart/form-data; boundary=${boundary}`,
    ...(cookie ? { cookie } : {}),
  };
}

function multipartImageBody({
  boundary,
  revision,
  bytes,
  fileName,
  kind,
}) {
  const text = (value) => Buffer.from(value, "utf8");

  return Buffer.concat([
    text(
      `--${boundary}\r\nContent-Disposition: form-data; name="expectedRevision"\r\n\r\n${revision}\r\n`
    ),
    text(
      `--${boundary}\r\nContent-Disposition: form-data; name="kind"\r\n\r\n${kind}\r\n`
    ),
    text(
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${fileName}"\r\nContent-Type: image/webp\r\n\r\n`
    ),
    bytes,
    text(`\r\n--${boundary}--\r\n`),
  ]);
}

async function postImageUpload(
  slug,
  revision,
  cookie,
  bundledImage,
  kind,
  label
) {
  const relativePath = bundledImage.replace(/^\/+/, "");
  const bytes = await readFile(
    path.join(process.cwd(), "public", relativePath)
  );
  const boundary =
    `----deuna-game-lifecycle-${Date.now().toString(36)}-${process.pid.toString(36)}`;
  const response = await request(
    `/api/admin/content/games/${encodeURIComponent(slug)}/media-upload`,
    {
      method: "POST",
      headers: mediaUploadHeaders(
        `/admin/juegos/${encodeURIComponent(slug)}?seccion=multimedia`,
        cookie,
        boundary
      ),
      body: multipartImageBody({
        boundary,
        revision,
        bytes,
        fileName: path.basename(relativePath),
        kind,
      }),
    }
  );

  return redirectLocation(response, label);
}

async function uploadLibraryImage(
  slug,
  revision,
  cookie,
  bundledImage
) {
  const redirect = await postImageUpload(
    slug,
    revision,
    cookie,
    bundledImage,
    "library",
    "La carga del recurso multimedia base"
  );
  assertRedirectState(
    redirect,
    "recurso-subido",
    "Carga multimedia base"
  );
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

  if (cookies.length === 0) {
    throw new Error(
      "El login del lifecycle no devolvió una cookie de sesión."
    );
  }

  return cookies.join("; ");
}

function decodeHtml(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    )
    .replace(/&#([0-9]+);/g, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 10))
    )
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function visibleText(html) {
  return decodeHtml(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function firstH1(html) {
  const match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (!match) return "";

  return decodeHtml(match[1].replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function assertImageViewport(html, expected, label) {
  const position = `${(expected.x * 100).toFixed(2)}% ${(expected.y * 100).toFixed(2)}%`;
  const decoded = decodeHtml(html);
  const positionNeedle = `--game-image-position:${position}`;
  const zoomPattern = new RegExp(
    `--game-image-zoom:\\s*${String(expected.zoom).replace(".", "\\.")}(?:;|\\")`
  );

  if (!decoded.includes(positionNeedle) || !zoomPattern.test(decoded)) {
    throw new Error(
      `${label} no expuso el viewport multimedia esperado ${JSON.stringify(expected)}.`
    );
  }
}

function attributeValue(tag, attribute) {
  const pattern = new RegExp(
    `\\b${attribute}="([^"]*)"`,
    "i"
  );
  const match = tag.match(pattern);
  return match ? decodeHtml(match[1]) : null;
}

function inputValues(html, name) {
  const inputs = html.match(/<input\b[^>]*>/gi) ?? [];
  const matches = [];

  for (const input of inputs) {
    if (attributeValue(input, "name") !== name) continue;

    const value = attributeValue(input, "value");
    if (value === null) {
      throw new Error(
        `El input ${name} existe pero no expone un value SSR.`
      );
    }
    matches.push(value);
  }

  return matches;
}

function singleInputValue(html, name) {
  const unique = [...new Set(inputValues(html, name))];

  if (unique.length === 0) {
    throw new Error(`No se encontró el input SSR ${name}.`);
  }

  if (unique.length !== 1) {
    throw new Error(
      `${name} no tiene un único valor coherente (${unique.length} variantes).`
    );
  }

  return unique[0];
}

function positiveInputNumber(html, name) {
  const value = Number(singleInputValue(html, name));

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} no es válido: ${value}.`);
  }

  return value;
}

function selectOptionValues(html, name) {
  const selects = html.match(/<select\b[\s\S]*?<\/select>/gi) ?? [];

  for (const select of selects) {
    const opening = select.match(/^<select\b[^>]*>/i)?.[0] ?? "";
    if (attributeValue(opening, "name") !== name) continue;

    return (select.match(/<option\b[^>]*>/gi) ?? [])
      .map((option) => attributeValue(option, "value"))
      .filter((value) => typeof value === "string" && value.trim())
      .map((value) => value.trim());
  }

  return [];
}

function restoreActions(html) {
  const forms = html.match(/<form\b[\s\S]*?<\/form>/gi) ?? [];

  return forms
    .map((form) => {
      const opening = form.match(/^<form\b[^>]*>/i)?.[0] ?? "";
      return attributeValue(opening, "action");
    })
    .filter(
      (action) =>
        typeof action === "string" &&
        action.startsWith("/api/admin/content/publications/") &&
        action.endsWith("/restore")
    );
}

function redirectLocation(response, label) {
  if (response.status !== 303) {
    throw new Error(
      `${label} respondió ${response.status}; se esperaba 303.`
    );
  }

  const location = response.headers.location;
  if (!location) {
    throw new Error(`${label} no devolvió Location.`);
  }

  const url = new URL(location, baseUrl);
  if (url.origin !== baseUrl.origin) {
    throw new Error(
      `${label} intentó redirigir fuera del origen visual: ${url.origin}.`
    );
  }

  return url;
}

function requirePage(response, label, status = 200) {
  if (response.status !== status) {
    throw new Error(
      `${label} respondió ${response.status}; se esperaba ${status}.`
    );
  }

  return response;
}

function parseJson(response, label) {
  requirePage(response, label);

  try {
    return JSON.parse(response.body);
  } catch {
    throw new Error(`${label} no devolvió JSON válido.`);
  }
}

async function postAdminForm(pathname, referer, cookie, fields, label) {
  const response = await request(pathname, {
    method: "POST",
    headers: formHeaders(referer, cookie),
    body: new URLSearchParams(fields).toString(),
  });

  return redirectLocation(response, label);
}

async function assertRetiredAdminMutation(pathname, referer, cookie, label) {
  const response = await request(pathname, {
    method: "POST",
    headers: formHeaders(referer, cookie),
    body: "",
  });

  if (response.status !== 404) {
    throw new Error(
      `${label} respondió ${response.status}; una mutación legacy retirada debe responder 404.`
    );
  }
}

async function mediaSnapshot(slug, cookie) {
  return parseJson(
    await request(
      `/api/admin/content/games/${encodeURIComponent(slug)}/media-workspace`,
      { headers: { cookie } }
    ),
    `Workspace multimedia de ${slug}`
  );
}

async function backgroundSnapshot(slug, cookie) {
  return parseJson(
    await request(
      `/api/admin/content/games/${encodeURIComponent(slug)}/background-media`,
      { headers: { cookie } }
    ),
    `Fondo multimedia de ${slug}`
  );
}

async function postAdminJsonForm(
  pathname,
  referer,
  cookie,
  fields,
  label
) {
  return parseJson(
    await request(pathname, {
      method: "POST",
      headers: formHeaders(referer, cookie),
      body: new URLSearchParams(fields).toString(),
    }),
    label
  );
}

async function publicationPage(slug, cookie) {
  return requirePage(
    await request(
      `/admin/juegos/${encodeURIComponent(slug)}/publicacion`,
      { headers: { cookie } }
    ),
    `Publicación de ${slug}`
  ).body;
}

function assertRedirectState(url, expected, label) {
  if (url.searchParams.get("estado") !== expected) {
    throw new Error(
      `${label} no terminó en estado=${expected}: ${url.href}.`
    );
  }
}

const suffix = `${Date.now().toString(36)}-${process.pid.toString(36)}`;
const slug = `visual-lifecycle-${suffix}`.slice(0, 160);
const initialTitle = `Lifecycle privado ${suffix}`;
const markerA = `Lifecycle publicado A ${suffix}`;
const markerB = `Lifecycle borrador B ${suffix}`;
const updateVersion = `2.0.0-e2e-${suffix}`.slice(0, 80);
const updateSummary = `Actualización sintética E2E ${suffix}`;
const editorPath = `/admin/juegos/${encodeURIComponent(slug)}`;
const publicPath = `/juegos/${encodeURIComponent(slug)}`;

const loginResponse = await request("/api/admin/auth/login", {
  method: "POST",
  headers: formHeaders("/admin/login"),
  body: new URLSearchParams({
    username: adminUsername,
    password: adminPassword,
  }).toString(),
});
const loginRedirect = redirectLocation(
  loginResponse,
  "El login HTTP del lifecycle de juego"
);
if (loginRedirect.pathname !== "/admin") {
  throw new Error(
    `El login terminó en ${loginRedirect.pathname}; se esperaba /admin.`
  );
}
const cookie = sessionCookie(loginResponse.headers["set-cookie"]);

for (const [pathname, label] of [
  ["/api/admin/content/updates", "Alta legacy global de actualización"],
  [
    `/api/admin/content/games/${encodeURIComponent(representativeGameSlug)}`,
    "Mutación legacy core del juego",
  ],
  [
    `/api/admin/content/games/${encodeURIComponent(representativeGameSlug)}/advanced`,
    "Mutación legacy advanced del juego",
  ],
  [
    `/api/admin/content/games/${encodeURIComponent(representativeGameSlug)}/requirements`,
    "Mutación legacy aislada de requisitos",
  ],
  [
    `/api/admin/content/games/${encodeURIComponent(representativeGameSlug)}/media`,
    "Mutación multimedia bulk legacy",
  ],
  [
    `/api/admin/content/games/${encodeURIComponent(representativeGameSlug)}/preview-remove`,
    "Desasignación de video legacy",
  ],
]) {
  await assertRetiredAdminMutation(
    pathname,
    "/admin/juegos",
    cookie,
    label
  );
}

const newGamePage = requirePage(
  await request("/admin/juegos/nuevo", { headers: { cookie } }),
  "Alta de juego"
).body;
const categories = selectOptionValues(newGamePage, "category");
if (categories.length === 0) {
  throw new Error(
    "El alta de juego no expone ninguna clasificación editorial disponible."
  );
}
const category = categories[0];

const fixtureMedia = await mediaSnapshot(representativeGameSlug, cookie);
const fixtureRevisionBeforeRejectedVideoAssignment = fixtureMedia.revision;
const rejectedDirectVideoAssignment = await postAdminForm(
  `/api/admin/content/games/${encodeURIComponent(representativeGameSlug)}/preview-import`,
  `/admin/juegos/${encodeURIComponent(representativeGameSlug)}?seccion=multimedia`,
  cookie,
  {
    expectedRevision: String(fixtureRevisionBeforeRejectedVideoAssignment),
    sourceToken: "0".repeat(48),
    startSeconds: "0",
    endSeconds: "1",
    quality: "1080p",
    fps: "50",
    target: "card",
  },
  "La asignación directa legacy de video"
);
assertRedirectState(
  rejectedDirectVideoAssignment,
  "preview-destino-invalido",
  "Rechazo de asignación directa de video"
);
const fixtureAfterRejectedVideoAssignment =
  await mediaSnapshot(representativeGameSlug, cookie);
if (
  fixtureAfterRejectedVideoAssignment.revision !==
  fixtureRevisionBeforeRejectedVideoAssignment
) {
  throw new Error(
    `Rechazar la asignación directa de video avanzó la revisión (${fixtureRevisionBeforeRejectedVideoAssignment} -> ${fixtureAfterRejectedVideoAssignment.revision}).`
  );
}

const fixtureCandidates = [
  fixtureMedia.assignments?.coverImage,
  fixtureMedia.assignments?.heroImage,
  fixtureMedia.assignments?.cardImage,
  fixtureMedia.assignments?.detailImage,
  ...(Array.isArray(fixtureMedia.assignments?.screenshots)
    ? fixtureMedia.assignments.screenshots
    : []),
  ...(Array.isArray(fixtureMedia.resources)
    ? fixtureMedia.resources.map((resource) => resource?.src)
    : []),
].filter(
  (value) =>
    typeof value === "string" &&
    value.startsWith("/images/") &&
    value.toLowerCase().endsWith(".webp")
);
const sourceImage = [...new Set(fixtureCandidates)][0];
if (!sourceImage) {
  throw new Error(
    `El fixture ${representativeGameSlug} no expone un WebP bundled reutilizable para el lifecycle.`
  );
}

const createRedirect = await postAdminForm(
  "/api/admin/content/games",
  "/admin/juegos/nuevo",
  cookie,
  {
    slug,
    title: initialTitle,
    description:
      "Borrador sintético aislado para verificar el contrato editorial completo de un juego.",
    category,
    version: "1.0.0-e2e",
    badge: "",
    imageAlt: `Arte sintético de ${initialTitle}`,
  },
  "La creación del juego sintético"
);
if (createRedirect.pathname !== editorPath) {
  throw new Error(
    `El alta terminó fuera del editor esperado: ${createRedirect.href}.`
  );
}
assertRedirectState(createRedirect, "creado", "El alta");

requirePage(
  await request(publicPath),
  "Juego privado antes de publicar",
  404
);

let editorHtml = requirePage(
  await request(`${editorPath}?seccion=ficha`, { headers: { cookie } }),
  "Editor del juego recién creado"
).body;
let revision = positiveInputNumber(editorHtml, "expectedRevision");
const createdRevision = revision;

const informationA = await postAdminForm(
  `/api/admin/content/games/${encodeURIComponent(slug)}/information`,
  `${editorPath}?seccion=ficha`,
  cookie,
  {
    expectedRevision: String(revision),
    title: markerA,
    description:
      "Primera revisión sintética preparada para demostrar que editar y publicar son operaciones separadas.",
    shortTitle: "",
    highlightedTitle: "",
    developer: "",
    publisher: "",
    releaseDate: "",
    version: "1.0.0-e2e",
    badge: "",
    imageAlt: `Arte sintético de ${markerA}`,
  },
  "El guardado de Información A"
);
assertRedirectState(informationA, "guardado", "Información A");

editorHtml = requirePage(
  await request(`${editorPath}?seccion=ficha`, { headers: { cookie } }),
  "Editor después de guardar Información A"
).body;
revision = positiveInputNumber(editorHtml, "expectedRevision");
if (revision <= createdRevision) {
  throw new Error(
    `Guardar Información no avanzó revisión (${createdRevision} -> ${revision}).`
  );
}
if (singleInputValue(editorHtml, "title") !== markerA) {
  throw new Error(
    "El título A no quedó persistido en el borrador del juego."
  );
}

let media = await mediaSnapshot(slug, cookie);
if (media.revision !== revision) {
  throw new Error(
    `La Biblioteca partió de una revisión distinta (${revision} -> ${media.revision}).`
  );
}

const resourcesBeforeRejectedImageUpload = (
  Array.isArray(media.resources) ? media.resources : []
)
  .map((resource) => resource?.src)
  .filter((value) => typeof value === "string")
  .sort();

const rejectedDirectImageUpload = await postImageUpload(
  slug,
  revision,
  cookie,
  sourceImage,
  "cover",
  "La asignación directa legacy de imagen"
);
assertRedirectState(
  rejectedDirectImageUpload,
  "solicitud",
  "Rechazo de asignación directa de imagen"
);

const mediaAfterRejectedImageUpload =
  await mediaSnapshot(slug, cookie);
const resourcesAfterRejectedImageUpload = (
  Array.isArray(mediaAfterRejectedImageUpload.resources)
    ? mediaAfterRejectedImageUpload.resources
    : []
)
  .map((resource) => resource?.src)
  .filter((value) => typeof value === "string")
  .sort();

if (mediaAfterRejectedImageUpload.revision !== revision) {
  throw new Error(
    `Rechazar la asignación directa de imagen avanzó la revisión (${revision} -> ${mediaAfterRejectedImageUpload.revision}).`
  );
}
if (
  JSON.stringify(resourcesAfterRejectedImageUpload) !==
  JSON.stringify(resourcesBeforeRejectedImageUpload)
) {
  throw new Error(
    "Rechazar la asignación directa de imagen modificó la Biblioteca."
  );
}

media = mediaAfterRejectedImageUpload;
const resourcesBeforeUpload = new Set(
  (Array.isArray(media.resources) ? media.resources : [])
    .map((resource) => resource?.src)
    .filter((value) => typeof value === "string")
);

await uploadLibraryImage(
  slug,
  revision,
  cookie,
  sourceImage
);

media = await mediaSnapshot(slug, cookie);
revision = media.revision;
if (!Number.isInteger(revision) || revision <= 0) {
  throw new Error("La biblioteca multimedia no devolvió una revisión válida.");
}
const libraryImage = (Array.isArray(media.resources) ? media.resources : [])
  .find(
    (resource) =>
      resource?.kind === "image" &&
      typeof resource.src === "string" &&
      resource.src.startsWith(
        `/media/editorial/${slug}/`
      ) &&
      !resourcesBeforeUpload.has(resource.src)
  )?.src;

if (!libraryImage) {
  throw new Error(
    "La carga multimedia no apareció como un recurso nuevo de la Biblioteca del borrador."
  );
}

for (const target of [
  "cover-image",
  "hero-image",
  "card-image",
  "detail-image",
]) {
  const assigned = await postAdminForm(
    `/api/admin/content/games/${encodeURIComponent(slug)}/media-library`,
    `${editorPath}?seccion=multimedia`,
    cookie,
    {
      expectedRevision: String(revision),
      target,
      resource: libraryImage,
    },
    `La asignación ${target}`
  );
  assertRedirectState(assigned, "recurso-asignado", target);
  media = await mediaSnapshot(slug, cookie);
  revision = media.revision;
}

if (
  media.assignments?.coverArtworkSource !== "custom" ||
  media.assignments?.coverImage !== libraryImage ||
  media.assignments?.cardImage !== libraryImage
) {
  throw new Error(
    `Asignar Portada y Card por separado no preservó la intención custom previa al cambio de fuente: ${JSON.stringify(media.assignments)}.`
  );
}

const sharedCoverSource = await postAdminForm(
  `/api/admin/content/games/${encodeURIComponent(slug)}/media-library`,
  `${editorPath}?seccion=multimedia`,
  cookie,
  {
    expectedRevision: String(revision),
    target: "cover-source",
    resource: "card",
  },
  "La fuente compartida de Portada"
);
assertRedirectState(
  sharedCoverSource,
  "recurso-asignado",
  "Fuente compartida de Portada"
);
media = await mediaSnapshot(slug, cookie);
if (
  media.revision <= revision ||
  media.assignments?.coverArtworkSource !== "card" ||
  media.assignments?.coverImage !== libraryImage ||
  media.assignments?.coverImage !== media.assignments?.cardImage
) {
  throw new Error(
    `Portada no quedó compartiendo el master de Card: ${JSON.stringify({
      previousRevision: revision,
      revision: media.revision,
      coverArtworkSource: media.assignments?.coverArtworkSource,
      coverImage: media.assignments?.coverImage,
      cardImage: media.assignments?.cardImage,
    })}.`
  );
}
revision = media.revision;

const revisionBeforeRejectedGalleryLibraryTarget = revision;
const rejectedGalleryLibraryTarget = await postAdminForm(
  `/api/admin/content/games/${encodeURIComponent(slug)}/media-library`,
  `${editorPath}?seccion=multimedia`,
  cookie,
  {
    expectedRevision: String(revision),
    target: "gallery-image",
    resource: libraryImage,
  },
  "El target legacy de Galería en media-library"
);
assertRedirectState(
  rejectedGalleryLibraryTarget,
  "solicitud",
  "Rechazo de gallery-image en media-library"
);
media = await mediaSnapshot(slug, cookie);
if (media.revision !== revisionBeforeRejectedGalleryLibraryTarget) {
  throw new Error(
    `Rechazar gallery-image en media-library avanzó la revisión (${revisionBeforeRejectedGalleryLibraryTarget} -> ${media.revision}).`
  );
}
revision = media.revision;

const galleryAssigned = await postAdminForm(
  `/api/admin/content/games/${encodeURIComponent(slug)}/gallery-media`,
  `${editorPath}?seccion=multimedia`,
  cookie,
  {
    expectedRevision: String(revision),
    target: "gallery-add",
    kind: "image",
    resource: libraryImage,
  },
  "La asignación canónica de Galería"
);
assertRedirectState(
  galleryAssigned,
  "galeria-actualizada",
  "Asignación canónica de Galería"
);
media = await mediaSnapshot(slug, cookie);
revision = media.revision;

const revisionBeforeRejectedCoverMode = revision;
const rejectedCoverMode = await postAdminForm(
  `/api/admin/content/games/${encodeURIComponent(slug)}/media-library`,
  `${editorPath}?seccion=multimedia`,
  cookie,
  {
    expectedRevision: String(revision),
    target: "cover-mode",
    resource: "image",
  },
  "El target legacy de modo de Portada"
);
assertRedirectState(
  rejectedCoverMode,
  "solicitud",
  "Rechazo de cover-mode"
);
media = await mediaSnapshot(slug, cookie);
if (media.revision !== revisionBeforeRejectedCoverMode) {
  throw new Error(
    `Rechazar cover-mode avanzó la revisión (${revisionBeforeRejectedCoverMode} -> ${media.revision}).`
  );
}
if (
  media.assignments &&
  ("coverMode" in media.assignments || "coverVideo" in media.assignments)
) {
  throw new Error(
    "La Biblioteca multimedia volvió a exponer modo o video activo para Portada."
  );
}
revision = media.revision;

for (const target of ["hero", "card", "detail"]) {
  const mode = await postAdminForm(
    `/api/admin/content/games/${encodeURIComponent(slug)}/media-library`,
    `${editorPath}?seccion=multimedia`,
    cookie,
    {
      expectedRevision: String(revision),
      target: `${target}-mode`,
      resource: "image",
    },
    `El modo Imagen de ${target}`
  );
  assertRedirectState(mode, "recurso-asignado", `Modo ${target}`);

  media = await mediaSnapshot(slug, cookie);
  revision = media.revision;
  if (media.assignments?.[`${target}Mode`] !== "image") {
    throw new Error(
      `${target} no persistió el modo Imagen en Biblioteca multimedia.`
    );
  }
}

async function confirmCrop(
  target,
  aspect,
  resource,
  viewport = { x: 0.5, y: 0.5, zoom: 1 }
) {
  const crop = await postAdminForm(
    `/api/admin/content/games/${encodeURIComponent(slug)}/image-layout`,
    `${editorPath}?seccion=multimedia`,
    cookie,
    {
      expectedRevision: String(revision),
      target,
      viewportX: String(viewport.x),
      viewportY: String(viewport.y),
      viewportZoom: String(viewport.zoom),
      ...(aspect !== null ? { viewportAspect: aspect } : {}),
      ...(target === "gallery"
        ? {
            resource,
            viewportAspectRatio: "",
          }
        : {}),
    },
    `La confirmación de crop ${target}`
  );
  assertRedirectState(
    crop,
    "imagen-encuadre-guardado",
    `Crop ${target}`
  );

  media = await mediaSnapshot(slug, cookie);
  revision = media.revision;
}

await confirmCrop("cover", "4:5");
await confirmCrop("hero", "3:1");
await confirmCrop("card", "3:2");
const detailViewportA = { x: 0.41, y: 0.58, zoom: 1.15 };
const detailViewportB = { x: 0.67, y: 0.32, zoom: 1.35 };
await confirmCrop("detail", null, undefined, detailViewportA);
await confirmCrop("gallery", "16:9", libraryImage);

media = await mediaSnapshot(slug, cookie);
revision = media.revision;
if (
  media.assignments?.coverImage !== libraryImage ||
  media.requirements?.cover?.mode !== "image" ||
  media.requirements?.cover?.cropReady !== true
) {
  throw new Error(
    `Portada no quedó como imagen 4:5 confirmada: ${JSON.stringify({
      coverImage: media.assignments?.coverImage,
      cover: media.requirements?.cover,
    })}.`
  );
}
if (media.requirements?.ready !== true) {
  throw new Error(
    `El juego sintético no quedó listo en Multimedia: ${JSON.stringify(media.requirements)}.`
  );
}

const coverViewportBeforeSourceRoundtrip = JSON.stringify(
  media.assignments?.imageMedia?.cover ?? null
);
const customSameMaster = await postAdminForm(
  `/api/admin/content/games/${encodeURIComponent(slug)}/media-library`,
  `${editorPath}?seccion=multimedia`,
  cookie,
  {
    expectedRevision: String(revision),
    target: "cover-image",
    resource: libraryImage,
  },
  "El cambio de Portada shared a custom con el mismo master"
);
assertRedirectState(
  customSameMaster,
  "recurso-asignado",
  "Portada custom con el mismo master"
);
media = await mediaSnapshot(slug, cookie);
if (
  media.revision <= revision ||
  media.assignments?.coverArtworkSource !== "custom" ||
  JSON.stringify(media.assignments?.imageMedia?.cover ?? null) !==
    coverViewportBeforeSourceRoundtrip
) {
  throw new Error(
    "Cambiar Portada a custom con el mismo master no preservó el crop 4:5 confirmado."
  );
}
revision = media.revision;

const sharedSameMaster = await postAdminForm(
  `/api/admin/content/games/${encodeURIComponent(slug)}/media-library`,
  `${editorPath}?seccion=multimedia`,
  cookie,
  {
    expectedRevision: String(revision),
    target: "cover-source",
    resource: "card",
  },
  "El regreso de Portada custom a Card con el mismo master"
);
assertRedirectState(
  sharedSameMaster,
  "recurso-asignado",
  "Portada compartida con el mismo master"
);
media = await mediaSnapshot(slug, cookie);
if (
  media.revision <= revision ||
  media.assignments?.coverArtworkSource !== "card" ||
  JSON.stringify(media.assignments?.imageMedia?.cover ?? null) !==
    coverViewportBeforeSourceRoundtrip ||
  media.requirements?.cover?.cropReady !== true
) {
  throw new Error(
    "Cambiar Portada a Card con el mismo master no preservó el crop 4:5 confirmado."
  );
}
revision = media.revision;

const stableMultimediaRevision = revision;
const stableImageMedia = JSON.stringify(
  media.assignments?.imageMedia ?? null
);
for (const [target, resource] of [
  ["cover-source", "card"],
  ["hero-mode", "image"],
  ["card-mode", "image"],
  ["detail-mode", "image"],
  ["hero-image", libraryImage],
  ["card-image", libraryImage],
  ["detail-image", libraryImage],
]) {
  const repeated = await postAdminForm(
    `/api/admin/content/games/${encodeURIComponent(slug)}/media-library`,
    `${editorPath}?seccion=multimedia`,
    cookie,
    {
      expectedRevision: String(stableMultimediaRevision),
      target,
      resource,
    },
    `La reasignación idempotente ${target}`
  );
  assertRedirectState(
    repeated,
    "recurso-asignado",
    `Reasignación idempotente ${target}`
  );
  media = await mediaSnapshot(slug, cookie);
  if (media.revision !== stableMultimediaRevision) {
    throw new Error(
      `Repetir ${target} avanzó una revisión sin cambio (${stableMultimediaRevision} -> ${media.revision}).`
    );
  }
}
if (
  JSON.stringify(media.assignments?.imageMedia ?? null) !==
    stableImageMedia ||
  media.requirements?.ready !== true
) {
  throw new Error(
    "Repetir asignaciones equivalentes alteró crops confirmados o readiness multimedia."
  );
}
revision = stableMultimediaRevision;

let background = await backgroundSnapshot(slug, cookie);
if (background.revision !== revision) {
  throw new Error(
    `Fondo partió de una revisión distinta (${revision} -> ${background.revision}).`
  );
}

const selectedBackground = await postAdminJsonForm(
  `/api/admin/content/games/${encodeURIComponent(slug)}/background-media`,
  `${editorPath}?seccion=multimedia`,
  cookie,
  {
    expectedRevision: String(revision),
    action: "select-image",
    resource: libraryImage,
  },
  "La asignación de Fondo"
);
if (!Number.isInteger(selectedBackground.revision) || selectedBackground.revision <= revision) {
  throw new Error(
    `Asignar Fondo no avanzó revisión (${revision} -> ${selectedBackground.revision}).`
  );
}
revision = selectedBackground.revision;

const backgroundViewport = { x: 0.36, y: 0.62, zoom: 1.22 };
const savedBackgroundCrop = await postAdminJsonForm(
  `/api/admin/content/games/${encodeURIComponent(slug)}/background-media`,
  `${editorPath}?seccion=multimedia`,
  cookie,
  {
    expectedRevision: String(revision),
    action: "layout-image",
    resource: libraryImage,
    viewportX: String(backgroundViewport.x),
    viewportY: String(backgroundViewport.y),
    viewportZoom: String(backgroundViewport.zoom),
  },
  "El crop adaptable del Fondo"
);
if (!Number.isInteger(savedBackgroundCrop.revision) || savedBackgroundCrop.revision <= revision) {
  throw new Error(
    `Confirmar el Fondo no avanzó revisión (${revision} -> ${savedBackgroundCrop.revision}).`
  );
}
revision = savedBackgroundCrop.revision;
background = await backgroundSnapshot(slug, cookie);
const stableBackgroundViewport = JSON.stringify(
  background.assignment?.imageViewport ?? null
);
if (
  background.assignment?.mode !== "image" ||
  background.assignment?.image !== libraryImage ||
  background.assignment?.imageViewport?.confirmed !== true
) {
  throw new Error(
    `El Fondo no quedó confirmado antes de probar idempotencia: ${JSON.stringify(background.assignment)}.`
  );
}

for (const [action, resource, extra] of [
  ["select-image", libraryImage, {}],
  ["mode", "image", {}],
  [
    "layout-image",
    libraryImage,
    {
      viewportX: String(backgroundViewport.x),
      viewportY: String(backgroundViewport.y),
      viewportZoom: String(backgroundViewport.zoom),
    },
  ],
]) {
  const repeatedBackground = await postAdminJsonForm(
    `/api/admin/content/games/${encodeURIComponent(slug)}/background-media`,
    `${editorPath}?seccion=multimedia`,
    cookie,
    {
      expectedRevision: String(revision),
      action,
      resource,
      ...extra,
    },
    `La operación idempotente de Fondo ${action}`
  );
  if (repeatedBackground.revision !== revision) {
    throw new Error(
      `Repetir ${action} en Fondo avanzó revisión (${revision} -> ${repeatedBackground.revision}).`
    );
  }
}
background = await backgroundSnapshot(slug, cookie);
if (
  background.revision !== revision ||
  JSON.stringify(background.assignment?.imageViewport ?? null) !==
    stableBackgroundViewport
) {
  throw new Error(
    "Repetir operaciones equivalentes de Fondo alteró su revisión o crop confirmado."
  );
}
media = await mediaSnapshot(slug, cookie);
if (media.revision !== revision || media.requirements?.ready !== true) {
  throw new Error(
    `La idempotencia de Fondo dejó Multimedia inconsistente: ${JSON.stringify({
      revision,
      mediaRevision: media.revision,
      ready: media.requirements?.ready,
    })}.`
  );
}

const previewA = requirePage(
  await request(`${editorPath}/vista-previa`, { headers: { cookie } }),
  "Vista previa A"
);
if (!visibleText(previewA.body).includes(markerA)) {
  throw new Error(
    "La vista previa no renderizó el título A desde el borrador real."
  );
}
requirePage(
  await request(publicPath),
  "Juego todavía privado después del preview",
  404
);

let publicationHtml = await publicationPage(slug, cookie);
const publishRevisionA = positiveInputNumber(
  publicationHtml,
  "expectedRevision"
);
if (publishRevisionA !== revision) {
  throw new Error(
    `Publicación ve revisión ${publishRevisionA}, pero Multimedia terminó en ${revision}.`
  );
}
if (!visibleText(publicationHtml).includes("NUNCA PUBLICADO")) {
  throw new Error(
    "La publicación inicial no se presenta como NUNCA PUBLICADO."
  );
}
if (inputValues(publicationHtml, "expectedPublicationNumber").length !== 0) {
  throw new Error(
    "Un juego nunca publicado expuso un token de mutación de publicación antes de tener snapshot público."
  );
}
if (restoreActions(publicationHtml).length !== 0) {
  throw new Error(
    "Un juego nunca publicado expuso una restauración histórica inexistente."
  );
}

const firstPublish = await postAdminForm(
  `/api/admin/content/games/${encodeURIComponent(slug)}/publish`,
  `${editorPath}/publicacion`,
  cookie,
  { expectedRevision: String(revision) },
  "La primera publicación"
);
assertRedirectState(firstPublish, "publicado", "Primera publicación");

publicationHtml = await publicationPage(slug, cookie);
const publicationA = positiveInputNumber(
  publicationHtml,
  "expectedPublicationNumber"
);
if (restoreActions(publicationHtml).length !== 0) {
  throw new Error(
    "El snapshot público actual ofreció una restauración sobre sí mismo."
  );
}

const publicA = requirePage(
  await request(publicPath),
  "Juego público A"
);
if (!firstH1(publicA.body).includes(markerA)) {
  throw new Error(
    `La web pública no mostró el snapshot A. H1=${JSON.stringify(firstH1(publicA.body))}.`
  );
}
assertImageViewport(
  publicA.body,
  detailViewportA,
  "El snapshot público A"
);

editorHtml = requirePage(
  await request(`${editorPath}?seccion=ficha`, { headers: { cookie } }),
  "Editor antes del borrador B"
).body;
revision = positiveInputNumber(editorHtml, "expectedRevision");
const revisionA = revision;

const informationB = await postAdminForm(
  `/api/admin/content/games/${encodeURIComponent(slug)}/information`,
  `${editorPath}?seccion=ficha`,
  cookie,
  {
    expectedRevision: String(revision),
    title: markerB,
    description:
      "Segunda revisión sintética. Debe permanecer privada hasta una nueva publicación explícita.",
    shortTitle: "",
    highlightedTitle: "",
    developer: "",
    publisher: "",
    releaseDate: "",
    version: "1.0.0-e2e",
    badge: "",
    imageAlt: `Arte sintético de ${markerB}`,
  },
  "El guardado del borrador B"
);
assertRedirectState(informationB, "guardado", "Borrador B");

editorHtml = requirePage(
  await request(`${editorPath}?seccion=ficha`, { headers: { cookie } }),
  "Editor después del borrador B"
).body;
revision = positiveInputNumber(editorHtml, "expectedRevision");
if (revision <= revisionA) {
  throw new Error(
    `El borrador B no avanzó revisión (${revisionA} -> ${revision}).`
  );
}

await confirmCrop("detail", null, undefined, detailViewportB);
media = await mediaSnapshot(slug, cookie);
revision = media.revision;
const revisionB = revision;

const previewB = requirePage(
  await request(`${editorPath}/vista-previa`, { headers: { cookie } }),
  "Vista previa B"
);
if (!visibleText(previewB.body).includes(markerB)) {
  throw new Error("La vista previa no reflejó el borrador B.");
}
assertImageViewport(
  previewB.body,
  detailViewportB,
  "La Vista previa del borrador B"
);

const publicStillA = requirePage(
  await request(publicPath),
  "Web pública mientras B sigue en borrador"
);
const publicStillAH1 = firstH1(publicStillA.body);
if (
  !publicStillAH1.includes(markerA) ||
  publicStillAH1.includes(markerB)
) {
  throw new Error(
    `Guardar B filtró el borrador a la web pública: ${JSON.stringify(publicStillAH1)}.`
  );
}
assertImageViewport(
  publicStillA.body,
  detailViewportA,
  "La web pública mientras B sigue en borrador"
);

const secondPublish = await postAdminForm(
  `/api/admin/content/games/${encodeURIComponent(slug)}/publish`,
  `${editorPath}/publicacion`,
  cookie,
  { expectedRevision: String(revisionB) },
  "La publicación del snapshot B"
);
assertRedirectState(secondPublish, "publicado", "Publicación B");

publicationHtml = await publicationPage(slug, cookie);
const publicationB = positiveInputNumber(
  publicationHtml,
  "expectedPublicationNumber"
);
if (publicationB <= publicationA) {
  throw new Error(
    `La publicación B no avanzó (${publicationA} -> ${publicationB}).`
  );
}
const historicalAfterB = restoreActions(publicationHtml);
if (historicalAfterB.length !== 0) {
  throw new Error(
    `Después de publicar B aparecieron ${historicalAfterB.length} acciones de restauración; los juegos no deben exponer historial restaurable.`
  );
}
if (inputValues(publicationHtml, "expectedPublications").length !== 0) {
  throw new Error(
    "Publicación expuso un token de limpieza histórica de juegos retirado."
  );
}

const publicB = requirePage(
  await request(publicPath),
  "Juego público B"
);
if (!firstH1(publicB.body).includes(markerB)) {
  throw new Error("La web pública no reflejó el snapshot B.");
}
assertImageViewport(
  publicB.body,
  detailViewportB,
  "El snapshot público B"
);

await assertRetiredAdminMutation(
  `/api/admin/content/games/${encodeURIComponent(slug)}/history/publications/reset`,
  `${editorPath}/publicacion`,
  cookie,
  "La limpieza legacy de snapshots de juego"
);
await assertRetiredAdminMutation(
  `/api/admin/content/games/${encodeURIComponent(slug)}/history/reset`,
  `${editorPath}?seccion=ficha`,
  cookie,
  "La limpieza legacy del historial de juego"
);
await assertRetiredAdminMutation(
  "/api/admin/content/publications/00000000-0000-4000-8000-000000000000/restore",
  `${editorPath}/publicacion`,
  cookie,
  "La restauración legacy de publicación de juego"
);

const updateRedirect = await postAdminForm(
  `/api/admin/content/games/${encodeURIComponent(slug)}/publish-update`,
  `${editorPath}/actualizacion`,
  cookie,
  {
    expectedRevision: String(revisionB),
    version: updateVersion,
    type: "update",
    summary: updateSummary,
    featured: "false",
    releaseId: "pc-windows",
    packageId: "main",
    packageKind: "installer",
    sizeGb: "",
    fileCount: "",
    channel: "",
    checksumSha256: "",
    sourcesJson: JSON.stringify([
      {
        id: "primary",
        name: "Descarga E2E",
        href: `${publicPath}/descargar`,
        label: "Fuente sintética aislada",
        enabled: true,
        status: "available",
      },
    ]),
  },
  "La actualización integrada"
);
assertRedirectState(
  updateRedirect,
  "actualizacion-publicada",
  "Actualización integrada"
);

publicationHtml = await publicationPage(slug, cookie);
const revisionAfterUpdate = positiveInputNumber(
  publicationHtml,
  "expectedRevision"
);
const publicationAfterUpdate = positiveInputNumber(
  publicationHtml,
  "expectedPublicationNumber"
);
if (
  revisionAfterUpdate <= revisionB ||
  publicationAfterUpdate <= publicationB
) {
  throw new Error(
    `La actualización integrada no avanzó revisión/publicación (${revisionB}/${publicationB} -> ${revisionAfterUpdate}/${publicationAfterUpdate}).`
  );
}

const publicUpdatedGame = requirePage(
  await request(publicPath),
  "Juego después de actualización integrada"
);
if (!visibleText(publicUpdatedGame.body).includes(updateVersion)) {
  throw new Error(
    "La ficha pública no reflejó la versión de la actualización integrada."
  );
}

const publicUpdates = requirePage(
  await request("/actualizaciones"),
  "Listado público de actualizaciones"
);
if (!visibleText(publicUpdates.body).includes(updateSummary)) {
  throw new Error(
    "La actualización integrada no apareció en la superficie pública de Actualizaciones."
  );
}

publicationHtml = await publicationPage(slug, cookie);
if (restoreActions(publicationHtml).length !== 0) {
  throw new Error(
    "El juego volvió a exponer restauraciones históricas después de publicar la actualización."
  );
}
if (inputValues(publicationHtml, "expectedPublications").length !== 0) {
  throw new Error(
    "El juego volvió a exponer controles de compactación histórica retirados."
  );
}

const publicWithoutHistory = requirePage(
  await request(publicPath),
  "Juego público sin historial restaurable"
);
if (
  !firstH1(publicWithoutHistory.body).includes(markerB) ||
  !visibleText(publicWithoutHistory.body).includes(updateVersion)
) {
  throw new Error(
    "Retirar el historial restaurable alteró el snapshot público actual."
  );
}

const hideRedirect = await postAdminForm(
  `/api/admin/content/games/${encodeURIComponent(slug)}/hide`,
  `${editorPath}/publicacion`,
  cookie,
  {
    expectedPublicationNumber: String(publicationAfterUpdate),
  },
  "El ocultamiento final del juego"
);
assertRedirectState(hideRedirect, "oculto", "Ocultamiento final");

requirePage(
  await request(publicPath),
  "Juego oculto al final del lifecycle",
  404
);

const updatesAfterHide = requirePage(
  await request("/actualizaciones"),
  "Actualizaciones después de ocultar el juego"
);
if (visibleText(updatesAfterHide.body).includes(updateSummary)) {
  throw new Error(
    "Ocultar el juego dejó visible su actualización integrada en la web pública."
  );
}

console.log(
  `Game publication lifecycle smoke: OK (revisión ${createdRevision} -> ${revisionB} -> ${revisionAfterUpdate}; publicación ${publicationA} -> ${publicationB} -> ${publicationAfterUpdate}; Portada image-only con fuente custom↔Card y crop preservado, reasignaciones idempotentes con crops preservados, Fondo idempotente, viewport de Contenedor A/B, preview, separación draft/público, juego sin historial restaurable, update integrada, ocultamiento y mutaciones legacy retiradas verificadas).`
);
