import {
  readFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  inspectSafeEditorialWebp,
  sanitizeEditorialWebp,
} from "../src/lib/media/safe-webp.ts";

const root = process.cwd();
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
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

function vp8xPayload(flags, width, height) {
  const payload = Buffer.alloc(10);
  payload[0] = flags;
  const widthMinusOne = width - 1;
  const heightMinusOne = height - 1;
  payload[4] = widthMinusOne & 0xff;
  payload[5] = (widthMinusOne >>> 8) & 0xff;
  payload[6] = (widthMinusOne >>> 16) & 0xff;
  payload[7] = heightMinusOne & 0xff;
  payload[8] = (heightMinusOne >>> 8) & 0xff;
  payload[9] = (heightMinusOne >>> 16) & 0xff;
  return payload;
}

const valid = riffWebp([
  chunk("VP8 ", vp8Payload()),
]);
const validInspection =
  inspectSafeEditorialWebp(valid);

assert(
  validInspection?.width === 320 &&
    validInspection?.height === 180 &&
    /^[0-9a-f]{64}$/.test(
      validInspection.digest
    ),
  "El validador multimedia debe aceptar un contenedor WebP estático seguro y calcular su hash."
);

const withExif = riffWebp([
  chunk("EXIF", Buffer.from("metadata")),
  chunk("VP8 ", vp8Payload()),
]);
assert(
  inspectSafeEditorialWebp(withExif) === null,
  "La inspección estricta debe rechazar EXIF sin normalizar."
);

const browserStyleMetadata = riffWebp([
  chunk(
    "VP8X",
    vp8xPayload(0x20 | 0x08 | 0x04, 320, 180)
  ),
  chunk("ICCP", Buffer.from("profile")),
  chunk("EXIF", Buffer.from("metadata")),
  chunk("XMP ", Buffer.from("metadata")),
  chunk("VP8 ", vp8Payload()),
]);
const sanitizedBrowserWebp =
  sanitizeEditorialWebp(browserStyleMetadata);
const sanitizedInspection = sanitizedBrowserWebp
  ? inspectSafeEditorialWebp(sanitizedBrowserWebp)
  : null;

assert(
  inspectSafeEditorialWebp(browserStyleMetadata) === null &&
    sanitizedBrowserWebp !== null &&
    sanitizedInspection?.width === 320 &&
    sanitizedInspection?.height === 180 &&
    !sanitizedBrowserWebp.includes(Buffer.from("ICCP")) &&
    !sanitizedBrowserWebp.includes(Buffer.from("EXIF")) &&
    !sanitizedBrowserWebp.includes(Buffer.from("XMP ")),
  "El servidor debe poder retirar ICC/EXIF/XMP de un WebP estático generado por navegador antes de aplicar la validación estricta."
);

const animated = riffWebp([
  chunk(
    "VP8X",
    vp8xPayload(0x02, 320, 180)
  ),
  chunk("VP8 ", vp8Payload()),
]);
assert(
  inspectSafeEditorialWebp(animated) === null &&
    sanitizeEditorialWebp(animated) === null,
  "La normalización nunca debe convertir una animación en una carga aceptable."
);

const hugeCanvas = riffWebp([
  chunk(
    "VP8X",
    vp8xPayload(0, 16_000, 16_000)
  ),
  chunk("VP8 ", vp8Payload()),
]);
assert(
  inspectSafeEditorialWebp(hugeCanvas) === null,
  "La carga multimedia debe rechazar dimensiones excesivas."
);

const invalidVp8 = riffWebp([
  chunk("VP8 ", Buffer.alloc(10)),
]);
assert(
  inspectSafeEditorialWebp(invalidVp8) === null,
  "La carga multimedia debe comprobar la firma del bitstream VP8."
);

const requestSecurity = await readFile(
  path.join(
    root,
    "src/lib/admin/request-security.ts"
  ),
  "utf8"
);
const mediaRequestSecurity = await readFile(
  path.join(
    root,
    "src/lib/admin/media-request-security.ts"
  ),
  "utf8"
);
const uploadRoute = await readFile(
  path.join(
    root,
    "src/app/api/admin/content/games/[slug]/media-upload/route.ts"
  ),
  "utf8"
);
const remoteRoute = await readFile(
  path.join(
    root,
    "src/app/api/admin/content/games/[slug]/media-source/route.ts"
  ),
  "utf8"
);
const uploadForm = await readFile(
  path.join(
    root,
    "src/components/admin/GameMediaUploadForm.tsx"
  ),
  "utf8"
);
const remoteSource = await readFile(
  path.join(
    root,
    "src/lib/media/remote-image-source.ts"
  ),
  "utf8"
);
const mediaStorage = await readFile(
  path.join(
    root,
    "src/lib/media/editorial-media.ts"
  ),
  "utf8"
);
const uploadStorage = await readFile(
  path.join(
    root,
    "src/lib/media/editorial-upload.ts"
  ),
  "utf8"
);
const publicRoute = await readFile(
  path.join(
    root,
    "src/app/media/editorial/[slug]/[filename]/route.ts"
  ),
  "utf8"
);
const systemd = await readFile(
  path.join(
    root,
    "ops/systemd/deuna-games.service.example"
  ),
  "utf8"
);

assert(
  !requestSecurity.includes("multipart/form-data"),
  "Los formularios administrativos normales deben seguir rechazando multipart."
);
assert(
  mediaRequestSecurity.includes(
    "hasTrustedAdminOrigin"
  ) &&
    mediaRequestSecurity.includes(
      "content-length"
    ) &&
    mediaRequestSecurity.includes(
      "MAX_ADMIN_MEDIA_REQUEST_BYTES"
    ) &&
    mediaRequestSecurity.includes(
      "request.formData()"
    ),
  "Multipart debe quedar aislado detrás de origen confiable y límites de tamaño."
);
assert(
  uploadRoute.includes(
    "hasExactAdminMediaFormFields"
  ) &&
    uploadRoute.includes(
      "expectedRevisionSchema"
    ) &&
    uploadRoute.includes(
      'kind !== "library"'
    ) &&
    uploadRoute.includes(
      "storeEditorialWebp"
    ) &&
    uploadRoute.includes(
      "clearEditorialImageDeletionMarker"
    ) &&
    !uploadRoute.includes(
      "saveGameMediaDraft"
    ) &&
    !uploadRoute.includes(
      "reconcileGameImageMedia"
    ),
  "La carga debe validar campos/revisión y crear sólo un master de Biblioteca, sin asignar destinos ni mutar el borrador."
);
assert(
  uploadForm.includes('"use client"') &&
    uploadForm.includes("createImageBitmap") &&
    uploadForm.includes('"image/webp"') &&
    uploadForm.includes("MAX_OUTPUT_BYTES") &&
    uploadForm.includes('value="url"') &&
    uploadForm.includes('value="manual"') &&
    uploadForm.includes("media-source") &&
    uploadForm.includes("application/x-www-form-urlencoded") &&
    uploadForm.includes('<input type="hidden" name="kind" value="library" />') &&
    uploadForm.includes('resultState !== "recurso-subido"') &&
    uploadForm.includes("uploadRedirectError") &&
    !uploadForm.includes("libraryOnly") &&
    !uploadForm.includes("screenshotCount") &&
    !uploadForm.includes('"imagen-subida"'),
  "El editor debe normalizar/importar la imagen y guardarla siempre como master de Biblioteca, conservando la pantalla si el servidor rechaza el intento."
);
assert(
  remoteRoute.includes(
    "authorizeAdminFormRequest"
  ) &&
    remoteRoute.includes(
      "hasExactAdminFormFields"
    ) &&
    remoteRoute.includes(
      "fetchRemoteEditorialImage"
    ) &&
    remoteRoute.includes(
      '"Cache-Control": "no-store, max-age=0"'
    ),
  "La importación remota debe permanecer autenticada, con campos exactos y sin cachear la imagen origen."
);
assert(
  remoteSource.includes("BlockList") &&
    remoteSource.includes("lookup") &&
    remoteSource.includes("httpsRequest") &&
    remoteSource.includes("MAX_REMOTE_IMAGE_BYTES") &&
    remoteSource.includes('url.protocol !== "https:"') &&
    remoteSource.includes("MAX_REDIRECTS") &&
    remoteSource.includes('"127.0.0.0"') &&
    remoteSource.includes('"192.168.0.0"') &&
    remoteSource.includes('"fc00::"') &&
    remoteSource.includes('"fe80::"'),
  "Las URLs de imagen deben limitarse a HTTPS público, resolver DNS de forma controlada y bloquear loopback, redes privadas y redirecciones abusivas."
);
assert(
  mediaStorage.includes(
    "DEUNA_EDITORIAL_MEDIA_ROOT"
  ) &&
    mediaStorage.includes(
      "debe quedar fuera del directorio desplegado"
    ) &&
    mediaStorage.includes(
      "[a-f0-9]{64}"
    ),
  "El almacén debe ser persistente, externo al deploy y usar nombres por hash."
);
assert(
  uploadStorage.includes('flag: "wx"') &&
    uploadStorage.includes("sanitizeEditorialWebp") &&
    uploadStorage.includes("inspectSafeEditorialWebp") &&
    uploadStorage.includes("isSymbolicLink"),
  "Los archivos de imagen deben sanear metadatos, crearse sin sobrescritura, validarse y rechazar enlaces simbólicos."
);
assert(
  publicRoute.includes(
    "const isSiteLogoAsset = slug === SITE_BRAND_LOGO_SLUG"
  ) &&
    publicRoute.includes(
      "siteBrandRasterContentType"
    ) &&
    publicRoute.includes(
      "!isSvg && !isWebm && !isWebp && !isSiteLogoAsset"
    ) &&
    publicRoute.includes(': "image/webp"') &&
    publicRoute.includes("immutable") &&
    publicRoute.includes("isSymbolicLink"),
  "La ruta pública debe mantener WebP como formato normal, permitir MIME raster adicional sólo dentro del namespace validado del logo y seguir sirviendo assets inmutables sin symlinks."
);
assert(
  systemd.includes(
    "StateDirectory=deuna-games"
  ) &&
    systemd.includes(
      "/var/lib/deuna-games"
    ) &&
    systemd.includes(
      "ProtectSystem=strict"
    ),
  "El servicio debe reservar estado persistente sin relajar el aislamiento del filesystem."
);

if (failures.length > 0) {
  console.error("");
  console.error("Seguridad multimedia administrativa: ERROR");
  console.error("");

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

console.log(
  "Seguridad multimedia administrativa: OK (imágenes WebP, multipart, URLs HTTPS, almacenamiento y ruta pública verificados)."
);
