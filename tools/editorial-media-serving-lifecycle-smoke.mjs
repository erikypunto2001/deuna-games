import {
  createHash,
} from "node:crypto";
import {
  mkdir,
  readdir,
  writeFile,
} from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import process from "node:process";

import {
  parseEditorialPayload,
} from "../src/lib/admin/content-validation.ts";
import {
  adminQuery,
} from "../src/lib/admin/database.ts";
import {
  evaluateGamePublicationReadiness,
} from "../src/lib/admin/game-publication-readiness.ts";
import {
  resolveGameDestinationMediaMode,
} from "../src/lib/media/game-video-media.ts";

const baseUrl = new URL(
  process.env.DEUNA_VISUAL_BASE_URL ??
    "https://127.0.0.1:3443"
);
const adminUsername =
  process.env.DEUNA_VISUAL_ADMIN_USERNAME?.trim();
const adminPassword =
  process.env.DEUNA_VISUAL_ADMIN_PASSWORD;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

if (
  process.env.CI !== "true" ||
  process.env.GITHUB_ACTIONS !== "true"
) {
  console.log(
    "Editorial media serving lifecycle smoke: omitido fuera de GitHub Actions para no mutar contenido local."
  );
  process.exit(0);
}

if (
  baseUrl.protocol !== "https:" ||
  !["127.0.0.1", "localhost", "::1"].includes(
    baseUrl.hostname
  )
) {
  throw new Error(
    "El smoke de serving multimedia sólo puede ejecutarse contra el runtime HTTPS local aislado."
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
      `El smoke rechazó un destino fuera del origen visual: ${url.origin}.`
    );
  }

  const body = options.body ?? "";
  const headers = { ...(options.headers ?? {}) };
  const bodyBytes = Buffer.isBuffer(body)
    ? body.length
    : Buffer.byteLength(body, "utf8");

  if (bodyBytes > 0) {
    headers["content-length"] = String(bodyBytes);
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
          const content = Buffer.concat(chunks);

          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: content.toString("utf8"),
            bytes: content.length,
            sha256: createHash("sha256")
              .update(content)
              .digest("hex"),
          });
        });
      }
    );

    req.on("error", reject);
    if (bodyBytes > 0) req.write(body);
    req.end();
  });
}

function formHeaders(referer, cookie, contentType) {
  return {
    "content-type":
      contentType ??
      "application/x-www-form-urlencoded;charset=UTF-8",
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

  if (cookies.length === 0) {
    throw new Error(
      "El login del smoke no devolvió una cookie de sesión."
    );
  }

  return cookies.join("; ");
}

function redirectState(response) {
  const location = String(
    response.headers.location ?? ""
  );

  if (!location) return null;

  try {
    return new URL(location, baseUrl).searchParams.get(
      "estado"
    );
  } catch {
    return null;
  }
}

function expectRedirect(
  response,
  label,
  expectedState = null
) {
  const location = String(
    response.headers.location ?? ""
  );
  const state = redirectState(response);

  if (
    response.status !== 303 ||
    (expectedState !== null && state !== expectedState)
  ) {
    throw new Error(
      `${label} respondió status=${response.status}, location=${location}, estado=${String(state)}; ` +
        `se esperaba 303${expectedState ? ` con estado=${expectedState}` : ""}. ` +
        response.body.slice(0, 240)
    );
  }
}

function riffWebp(chunks) {
  const body = Buffer.concat([
    Buffer.from("WEBP", "ascii"),
    ...chunks,
  ]);
  const header = Buffer.alloc(8);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

function chunk(type, payload) {
  const header = Buffer.alloc(8);
  header.write(type, 0, "ascii");
  header.writeUInt32LE(payload.length, 4);

  return Buffer.concat([
    header,
    payload,
    payload.length % 2
      ? Buffer.from([0])
      : Buffer.alloc(0),
  ]);
}

function vp8Payload(width = 320, height = 180) {
  const payload = Buffer.alloc(10);
  payload[0] = 0;
  payload[1] = 0;
  payload[2] = 0;
  payload[3] = 0x9d;
  payload[4] = 0x01;
  payload[5] = 0x2a;
  payload.writeUInt16LE(width, 6);
  payload.writeUInt16LE(height, 8);
  return payload;
}

function multipartLibraryImage(revision, image) {
  const boundary =
    `----deuna-media-serving-${Date.now().toString(36)}-${process.pid}`;
  const before = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="expectedRevision"\r\n\r\n${revision}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="kind"\r\n\r\nlibrary\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="image"; filename="serving-boundary.webp"\r\n` +
      `Content-Type: image/webp\r\n\r\n`,
    "utf8"
  );
  const after = Buffer.from(
    `\r\n--${boundary}--\r\n`,
    "utf8"
  );

  return {
    body: Buffer.concat([before, image, after]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function assertPrivatePreview(response, label) {
  const cacheControl = String(
    response.headers["cache-control"] ?? ""
  ).toLowerCase();

  if (
    response.status !== 200 ||
    !String(response.headers["content-type"] ?? "")
      .toLowerCase()
      .startsWith("image/webp") ||
    !cacheControl.includes("private") ||
    !cacheControl.includes("no-store") ||
    response.headers.etag
  ) {
    throw new Error(
      `${label} no respetó preview privado: status=${response.status}, cache=${cacheControl}, etag=${String(response.headers.etag ?? "")}.`
    );
  }
}

function assertAnonymousPrivate(response, label) {
  const cacheControl = String(
    response.headers["cache-control"] ?? ""
  ).toLowerCase();

  if (
    response.status !== 404 ||
    !cacheControl.includes("no-store")
  ) {
    throw new Error(
      `${label} expuso un asset nunca publicado: status=${response.status}, cache=${cacheControl}.`
    );
  }
}

function assertPublicImmutable(response, label, digest) {
  const cacheControl = String(
    response.headers["cache-control"] ?? ""
  ).toLowerCase();

  if (
    response.status !== 200 ||
    !String(response.headers["content-type"] ?? "")
      .toLowerCase()
      .startsWith("image/webp") ||
    !cacheControl.includes("public") ||
    !cacheControl.includes("immutable") ||
    response.sha256 !== digest ||
    !response.headers.etag
  ) {
    throw new Error(
      `${label} no quedó público/inmutable: status=${response.status}, cache=${cacheControl}, digest=${response.sha256}, etag=${String(response.headers.etag ?? "")}.`
    );
  }
}

const fixtureResult = await adminQuery(
  `SELECT
     id::text,
     item_key,
     draft_payload,
     revision,
     publication_number
   FROM deuna_admin.editorial_items
   WHERE item_type = 'game'
     AND public_visible = false
     AND item_key LIKE 'visual-lifecycle-%'
   ORDER BY updated_at DESC`
);
const fixture = fixtureResult.rows.find((row) => {
  try {
    const game = parseEditorialPayload(
      "game",
      row.draft_payload
    );
    const readiness =
      evaluateGamePublicationReadiness(game);

    return (
      resolveGameDestinationMediaMode(
        game,
        "cover"
      ) === "image" &&
      readiness.essentialsReady
    );
  } catch {
    return false;
  }
});

if (!fixture) {
  throw new Error(
    "El smoke necesita el juego sintético oculto y listo para publicar creado por game-publication-lifecycle-smoke."
  );
}

const slug = fixture.item_key;
const initialGame = parseEditorialPayload(
  "game",
  fixture.draft_payload
);
const initialReadiness =
  evaluateGamePublicationReadiness(initialGame);

if (!initialReadiness.essentialsReady) {
  throw new Error(
    "El fixture sintético dejó de cumplir la preparación editorial esencial antes del smoke multimedia."
  );
}

const initialHistoryResult = await adminQuery(
  `SELECT
     (
       SELECT count(*)::int
         FROM deuna_admin.editorial_revisions
        WHERE item_id = $1
     ) AS revisions,
     (
       SELECT count(*)::int
         FROM deuna_admin.editorial_publications
        WHERE item_id = $1
     ) AS publications`,
  [fixture.id]
);
const initialHistory = initialHistoryResult.rows[0];

if (
  !initialHistory ||
  initialHistory.revisions !== 0 ||
  initialHistory.publications !== 0
) {
  throw new Error(
    `El fixture multimedia conserva historial restaurable de juego (revisiones=${String(initialHistory?.revisions)}, publicaciones=${String(initialHistory?.publications)}).`
  );
}

const loginBody = new URLSearchParams({
  username: adminUsername,
  password: adminPassword,
}).toString();
const loginResponse = await request(
  "/api/admin/auth/login",
  {
    method: "POST",
    headers: formHeaders("/admin/login"),
    body: loginBody,
  }
);
expectRedirect(
  loginResponse,
  "El login del smoke multimedia"
);
const cookie = sessionCookie(
  loginResponse.headers["set-cookie"]
);

const image = riffWebp([
  chunk("VP8 ", vp8Payload()),
]);
const digest = createHash("sha256")
  .update(image)
  .digest("hex");
const publicPath =
  `/media/editorial/${slug}/${digest}.webp`;
const upload = multipartLibraryImage(
  fixture.revision,
  image
);
const editorPath =
  `/admin/juegos/${encodeURIComponent(slug)}?seccion=multimedia`;
const uploadResponse = await request(
  `/api/admin/content/games/${encodeURIComponent(slug)}/media-upload`,
  {
    method: "POST",
    headers: formHeaders(
      editorPath,
      cookie,
      upload.contentType
    ),
    body: upload.body,
  }
);
expectRedirect(
  uploadResponse,
  "La carga aislada a biblioteca",
  "recurso-subido"
);

assertAnonymousPrivate(
  await request(publicPath),
  "El GET anónimo después del upload"
);
assertPrivatePreview(
  await request(publicPath, {
    headers: { cookie },
  }),
  "El GET Admin después del upload"
);

const saveBody = new URLSearchParams({
  expectedRevision: String(fixture.revision),
  target: "cover-image",
  resource: publicPath,
}).toString();
const saveResponse = await request(
  `/api/admin/content/games/${encodeURIComponent(slug)}/media-library`,
  {
    method: "POST",
    headers: formHeaders(editorPath, cookie),
    body: saveBody,
  }
);
expectRedirect(
  saveResponse,
  "La asignación del asset como Portada personalizada",
  "recurso-asignado"
);

const savedResult = await adminQuery(
  `SELECT draft_payload, revision, publication_number
   FROM deuna_admin.editorial_items
   WHERE id = $1`,
  [fixture.id]
);
const saved = savedResult.rows[0];
const savedGame = saved
  ? parseEditorialPayload("game", saved.draft_payload)
  : null;

if (
  !saved ||
  saved.revision !== fixture.revision + 1 ||
  saved.publication_number !== fixture.publication_number ||
  savedGame?.coverArtworkSource !== "custom" ||
  savedGame.coverImage !== publicPath ||
  savedGame.imageMedia?.cover?.source !== publicPath ||
  savedGame.imageMedia.cover.confirmed === true
) {
  throw new Error(
    "Asignar el asset no produjo exactamente una nueva revisión privada con Portada custom y crop pendiente ligado a su source."
  );
}

assertAnonymousPrivate(
  await request(publicPath),
  "El GET anónimo con asset sólo en borrador"
);
assertPrivatePreview(
  await request(publicPath, {
    headers: { cookie },
  }),
  "El GET Admin con asset sólo en borrador"
);

const cropBody = new URLSearchParams({
  expectedRevision: String(saved.revision),
  target: "cover",
  viewportX: "0.5",
  viewportY: "0.5",
  viewportZoom: "1",
  viewportAspect: "4:5",
}).toString();
const cropResponse = await request(
  `/api/admin/content/games/${encodeURIComponent(slug)}/image-layout`,
  {
    method: "POST",
    headers: formHeaders(editorPath, cookie),
    body: cropBody,
  }
);
expectRedirect(
  cropResponse,
  "La confirmación del recorte de Portada",
  "imagen-encuadre-guardado"
);

const croppedResult = await adminQuery(
  `SELECT draft_payload, revision, publication_number
   FROM deuna_admin.editorial_items
   WHERE id = $1`,
  [fixture.id]
);
const cropped = croppedResult.rows[0];
const croppedGame = cropped
  ? parseEditorialPayload(
      "game",
      cropped.draft_payload
    )
  : null;

if (
  !cropped ||
  cropped.revision !== saved.revision + 1 ||
  cropped.publication_number !== fixture.publication_number ||
  croppedGame?.coverArtworkSource !== "custom" ||
  croppedGame.coverImage !== publicPath ||
  croppedGame.imageMedia?.cover?.confirmed !== true ||
  croppedGame.imageMedia.cover.source !== publicPath ||
  croppedGame.imageMedia.cover.aspect !== "4:5"
) {
  throw new Error(
    "Confirmar el crop no dejó el nuevo recurso custom listo para la publicación sin alterar el snapshot público."
  );
}

const croppedReadiness =
  evaluateGamePublicationReadiness(croppedGame);

if (!croppedReadiness.essentialsReady) {
  const missingEssentials = croppedReadiness.items
    .filter(
      (item) =>
        item.priority === "essential" &&
        !item.complete
    )
    .map((item) => item.id)
    .join(", ");

  throw new Error(
    `El draft del smoke dejó de estar listo para publicar después del crop: ${missingEssentials || "sin detalle"}.`
  );
}

assertAnonymousPrivate(
  await request(publicPath),
  "El GET anónimo después de confirmar el crop privado"
);
assertPrivatePreview(
  await request(publicPath, {
    headers: { cookie },
  }),
  "El GET Admin después de confirmar el crop privado"
);

const publishBody = new URLSearchParams({
  expectedRevision: String(cropped.revision),
}).toString();
const publishResponse = await request(
  `/api/admin/content/games/${encodeURIComponent(slug)}/publish`,
  {
    method: "POST",
    headers: formHeaders(
      `/admin/juegos/${encodeURIComponent(slug)}/publicacion`,
      cookie
    ),
    body: publishBody,
  }
);
expectRedirect(
  publishResponse,
  "La publicación del asset",
  "publicado"
);

const publishedResult = await adminQuery(
  `SELECT
     draft_payload,
     published_payload,
     revision,
     publication_number,
     public_visible,
     (
       SELECT count(*)::int
         FROM deuna_admin.editorial_revisions
        WHERE item_id = $1
     ) AS revisions,
     (
       SELECT count(*)::int
         FROM deuna_admin.editorial_publications
        WHERE item_id = $1
     ) AS publications
   FROM deuna_admin.editorial_items
   WHERE id = $1`,
  [fixture.id]
);
const published = publishedResult.rows[0];
const publishedNumber = published?.publication_number;
const publishedGame = published
  ? parseEditorialPayload("game", published.published_payload)
  : null;

if (
  !published ||
  publishedNumber !== fixture.publication_number + 1 ||
  published.public_visible !== true ||
  publishedGame?.coverImage !== publicPath ||
  published.revisions !== 0 ||
  published.publications !== 0
) {
  throw new Error(
    "Publicar no dejó exactamente el snapshot actual esperado con cero historial restaurable de juego."
  );
}

assertPublicImmutable(
  await request(publicPath),
  "El GET anónimo después de publicar",
  digest
);

const protectedDeleteBody = new URLSearchParams({
  expectedRevision: String(published.revision),
  target: "image-delete",
  resource: publicPath,
}).toString();
const protectedDelete = await request(
  `/api/admin/content/games/${encodeURIComponent(slug)}/media-resource-delete`,
  {
    method: "POST",
    headers: formHeaders(editorPath, cookie),
    body: protectedDeleteBody,
  }
);
expectRedirect(
  protectedDelete,
  "La eliminación de un master usado por el borrador actual",
  "recurso-en-uso"
);

const hideBody = new URLSearchParams({
  expectedPublicationNumber: String(publishedNumber),
}).toString();
const hideResponse = await request(
  `/api/admin/content/games/${encodeURIComponent(slug)}/hide`,
  {
    method: "POST",
    headers: formHeaders(
      `/admin/juegos/${encodeURIComponent(slug)}/publicacion`,
      cookie
    ),
    body: hideBody,
  }
);
expectRedirect(
  hideResponse,
  "El ocultamiento del snapshot actual",
  "oculto"
);

assertAnonymousPrivate(
  await request(publicPath),
  "El GET anónimo después de ocultar el juego"
);
assertPrivatePreview(
  await request(publicPath, {
    headers: { cookie },
  }),
  "El GET Admin del master aún usado por el borrador oculto",
  digest
);

const switchCoverBody = new URLSearchParams({
  expectedRevision: String(published.revision),
  target: "cover-source",
  resource: "card",
}).toString();
const switchCoverResponse = await request(
  `/api/admin/content/games/${encodeURIComponent(slug)}/media-library`,
  {
    method: "POST",
    headers: formHeaders(editorPath, cookie),
    body: switchCoverBody,
  }
);
expectRedirect(
  switchCoverResponse,
  "La salida del master custom del borrador actual",
  "recurso-asignado"
);

const detachedResult = await adminQuery(
  `SELECT
     draft_payload,
     revision,
     publication_number,
     public_visible,
     (
       SELECT count(*)::int
         FROM deuna_admin.editorial_revisions
        WHERE item_id = $1
     ) AS revisions,
     (
       SELECT count(*)::int
         FROM deuna_admin.editorial_publications
        WHERE item_id = $1
     ) AS publications
   FROM deuna_admin.editorial_items
   WHERE id = $1`,
  [fixture.id]
);
const detached = detachedResult.rows[0];
const detachedGame = detached
  ? parseEditorialPayload("game", detached.draft_payload)
  : null;

if (
  !detached ||
  detached.revision !== published.revision + 1 ||
  detached.publication_number !== publishedNumber ||
  detached.public_visible !== false ||
  detachedGame?.coverArtworkSource !== "card" ||
  detachedGame.coverImage === publicPath ||
  detached.revisions !== 0 ||
  detached.publications !== 0
) {
  throw new Error(
    "Desasignar el master no conservó el estado actual del juego sin recrear historial."
  );
}

const orphanDeleteBody = new URLSearchParams({
  expectedRevision: String(detached.revision),
  target: "image-delete",
  resource: publicPath,
}).toString();
const orphanDelete = await request(
  `/api/admin/content/games/${encodeURIComponent(slug)}/media-resource-delete`,
  {
    method: "POST",
    headers: formHeaders(editorPath, cookie),
    body: orphanDeleteBody,
  }
);
expectRedirect(
  orphanDelete,
  "La eliminación del master ya huérfano",
  "recurso-eliminado"
);

assertAnonymousPrivate(
  await request(publicPath),
  "El GET anónimo del master eliminado"
);

const deleteStateResult = await adminQuery(
  `SELECT revision, publication_number
   FROM deuna_admin.editorial_items
   WHERE id = $1`,
  [fixture.id]
);
const deleteState = deleteStateResult.rows[0];

if (!deleteState) {
  throw new Error(
    "El fixture desapareció antes de probar el hard-delete."
  );
}

const deleteReferer =
  `/admin/juegos/${encodeURIComponent(slug)}/publicacion`;
const rejectedDeleteBody = new URLSearchParams({
  expectedRevision: String(deleteState.revision),
  deletePublicationNumber: String(deleteState.publication_number),
  confirmSlug: slug,
  currentPassword: `${adminPassword}-incorrecta`,
}).toString();
const rejectedDelete = await request(
  `/api/admin/content/games/${encodeURIComponent(slug)}/delete`,
  {
    method: "POST",
    headers: formHeaders(deleteReferer, cookie),
    body: rejectedDeleteBody,
  }
);
expectRedirect(
  rejectedDelete,
  "El hard-delete con contraseña incorrecta",
  "reauth"
);

const preservedAfterRejectedDelete = await adminQuery(
  `SELECT count(*)::int AS count
   FROM deuna_admin.editorial_items
   WHERE id = $1`,
  [fixture.id]
);
if (preservedAfterRejectedDelete.rows[0]?.count !== 1) {
  throw new Error(
    "Una reautenticación incorrecta alteró el fixture."
  );
}

const mediaRoot =
  process.env.DEUNA_EDITORIAL_MEDIA_ROOT;
if (!mediaRoot) {
  throw new Error(
    "El hard-delete E2E requiere DEUNA_EDITORIAL_MEDIA_ROOT aislado."
  );
}

const physicalPath = path.join(
  mediaRoot,
  slug,
  `${digest}.webp`
);
await mkdir(path.dirname(physicalPath), {
  recursive: true,
  mode: 0o700,
});
await writeFile(
  physicalPath,
  Buffer.from("corrupt-after-preflight", "utf8")
);

const deleteBody = new URLSearchParams({
  expectedRevision: String(deleteState.revision),
  deletePublicationNumber: String(deleteState.publication_number),
  confirmSlug: slug,
  currentPassword: adminPassword,
}).toString();
const deleted = await request(
  `/api/admin/content/games/${encodeURIComponent(slug)}/delete`,
  {
    method: "POST",
    headers: formHeaders(deleteReferer, cookie),
    body: deleteBody,
  }
);
expectRedirect(
  deleted,
  "El hard-delete con fallo físico recuperable",
  "eliminado-media-pendiente"
);

const remainingItem = await adminQuery(
  `SELECT count(*)::int AS count
   FROM deuna_admin.editorial_items
   WHERE id = $1`,
  [fixture.id]
);
if (remainingItem.rows[0]?.count !== 0) {
  throw new Error(
    "El hard-delete no eliminó el registro editorial."
  );
}

const pendingCleanup = await adminQuery(
  `SELECT deuna_admin.is_game_media_cleanup_pending($1) AS pending`,
  [slug]
);
if (pendingCleanup.rows[0]?.pending !== true) {
  throw new Error(
    "El hard-delete fallido no dejó una limpieza multimedia durable y reintentable."
  );
}

const blockedReuse = await adminQuery(
  `SELECT deuna_admin.is_game_media_cleanup_pending($1) AS pending`,
  [slug]
);
if (blockedReuse.rows[0]?.pending !== true) {
  throw new Error(
    "El slug eliminado dejó de estar bloqueado mientras existía limpieza pendiente."
  );
}

await writeFile(physicalPath, image, { mode: 0o600 });

const retryBody = new URLSearchParams({
  confirmSlug: slug,
  currentPassword: adminPassword,
}).toString();
const retryCleanup = await request(
  `/api/admin/content/maintenance/media-cleanup/${encodeURIComponent(slug)}`,
  {
    method: "POST",
    headers: formHeaders("/admin/mantenimiento", cookie),
    body: retryBody,
  }
);
expectRedirect(
  retryCleanup,
  "El reintento de limpieza multimedia pendiente",
  "limpieza-media-completa"
);

const queueAfterRetry = await adminQuery(
  `SELECT deuna_admin.is_game_media_cleanup_pending($1) AS pending`,
  [slug]
);
if (queueAfterRetry.rows[0]?.pending !== false) {
  throw new Error(
    "La cola multimedia siguió pendiente después de una limpieza física exitosa."
  );
}

let residualMedia = [];
try {
  residualMedia = await readdir(
    path.join(mediaRoot, slug)
  );
} catch (error) {
  if (
    !(
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    )
  ) {
    throw error;
  }
}

if (residualMedia.length !== 0) {
  throw new Error(
    `El reintento dejó entradas residuales en el namespace multimedia: ${residualMedia.join(", ")}.`
  );
}

console.log(
  "Editorial media serving lifecycle smoke: OK " +
    `(slug=${slug}, bytes=${image.length}, ` +
    "upload=anon404/admin-private, draft=custom-pending-private, " +
    "crop=confirmed-private, published=current-public, hidden=private, " +
    "draft/current-only-protection, orphan=deletable, no-game-history, hard-delete=pending+retry+physical-clean)."
);
