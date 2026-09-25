import {
  createHash,
} from "node:crypto";
import https from "node:https";
import process from "node:process";

const baseUrl = new URL(
  process.env.DEUNA_VISUAL_BASE_URL ??
    "https://127.0.0.1:3443"
);
const adminUsername =
  process.env.DEUNA_VISUAL_ADMIN_USERNAME?.trim();
const adminPassword =
  process.env.DEUNA_VISUAL_ADMIN_PASSWORD;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const traceText = "private-raster-exporter-trace";
const originalFilename =
  "designer-private-camera-export-2026.png";
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47,
  0x0d, 0x0a, 0x1a, 0x0a,
]);

if (
  baseUrl.protocol !== "https:" ||
  !["127.0.0.1", "localhost", "::1"].includes(baseUrl.hostname)
) {
  throw new Error(
    "El smoke raster del logo sólo puede ejecutarse contra el runtime HTTPS local aislado."
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
      `El smoke raster rechazó un destino fuera del origen visual: ${url.origin}.`
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
            content,
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

function formHeaders(referer, cookie) {
  return {
    "content-type":
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
      "El login del smoke raster no devolvió una cookie de sesión."
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

function inputValues(html, name) {
  const inputs = html.match(/<input\b[^>]*>/gi) ?? [];
  const matches = [];

  for (const input of inputs) {
    const nameMatch = input.match(/\bname="([^"]*)"/i);
    if (!nameMatch || decodeHtml(nameMatch[1]) !== name) {
      continue;
    }

    const valueMatch = input.match(/\bvalue="([^"]*)"/i);
    if (!valueMatch) {
      throw new Error(
        `El input ${name} existe pero no expone un value SSR.`
      );
    }

    matches.push(decodeHtml(valueMatch[1]));
  }

  if (matches.length === 0) {
    throw new Error(`No se encontró el input SSR ${name}.`);
  }

  return matches;
}

function singleInputValue(html, name) {
  const values = inputValues(html, name);
  const unique = [...new Set(values)];

  if (unique.length !== 1) {
    throw new Error(
      `${name} no tiene un único valor coherente (${unique.length} variantes).`
    );
  }

  return unique[0];
}

function checkedInputValue(html, name) {
  const inputs = html.match(/<input\b[^>]*>/gi) ?? [];
  const matches = [];

  for (const input of inputs) {
    const nameMatch = input.match(/\bname="([^"]*)"/i);
    if (
      !nameMatch ||
      decodeHtml(nameMatch[1]) !== name ||
      !/\schecked(?:\s|=|>)/i.test(input)
    ) {
      continue;
    }

    const valueMatch = input.match(/\bvalue="([^"]*)"/i);
    if (!valueMatch) {
      throw new Error(
        `El input marcado ${name} no expone un value SSR.`
      );
    }

    matches.push(decodeHtml(valueMatch[1]));
  }

  if (matches.length !== 1) {
    throw new Error(
      `${name} debe exponer exactamente un radio marcado (${matches.length} encontrados).`
    );
  }

  return matches[0];
}

function textareaValue(html, name) {
  const pattern = new RegExp(
    `<textarea\\b[^>]*\\bname="${name}"[^>]*>([\\s\\S]*?)<\\/textarea>`,
    "i"
  );
  const match = html.match(pattern);

  if (!match) {
    throw new Error(`No se encontró el textarea SSR ${name}.`);
  }

  return decodeHtml(match[1]);
}

function positiveNumberInput(html, name) {
  const value = Number(singleInputValue(html, name));

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} no es válido: ${value}.`);
  }

  return value;
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

function assertNoRestoreActions(html) {
  const actions = [...html.matchAll(/<form[^>]*action="([^"]+)"/gi)]
    .map((match) => decodeHtml(match[1]))
    .filter((action) => action.includes("/restore"));

  if (actions.length > 0) {
    throw new Error(`El panel todavía expone acciones de restauración: ${actions.join(", ")}.`);
  }
}

function publicLogoIdentity(html) {
  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0];
  if (!htmlTag) {
    throw new Error(
      "La respuesta pública no contiene un elemento html verificable."
    );
  }

  const modeMatch = htmlTag.match(
    /\bdata-site-logo="([^"]+)"/i
  );
  const colorModeMatch = htmlTag.match(
    /\bdata-site-logo-color-mode="([^"]+)"/i
  );
  const styleMatch = htmlTag.match(/\bstyle="([^"]*)"/i);

  if (!modeMatch || !colorModeMatch || !styleMatch) {
    throw new Error(
      "La identidad pública no expone modo, modo de color y variables CSS del logo."
    );
  }

  const style = decodeHtml(styleMatch[1]);
  const color = style
    .match(/--site-logo-color:([^;]+)/i)?.[1]
    ?.trim();
  const image = style
    .match(/--site-logo-image:([^;]+)/i)?.[1]
    ?.trim();

  if (!color || !image) {
    throw new Error(
      "La identidad pública no expone color e imagen del logo de forma verificable."
    );
  }

  return {
    mode: decodeHtml(modeMatch[1]),
    colorMode: decodeHtml(colorModeMatch[1]),
    color: color.toLowerCase(),
    image,
  };
}

function sameIdentity(left, right) {
  return (
    left.mode === right.mode &&
    left.colorMode === right.colorMode &&
    left.color === right.color &&
    left.image === right.image
  );
}

async function socialSnapshot() {
  const [openGraph, twitter] = await Promise.all([
    request("/opengraph-image"),
    request("/twitter-image"),
  ]);

  for (const [label, response] of [
    ["Open Graph", openGraph],
    ["Twitter", twitter],
  ]) {
    const contentType = String(
      response.headers["content-type"] ?? ""
    ).toLowerCase();

    if (
      response.status !== 200 ||
      !contentType.startsWith("image/png") ||
      response.bytes < 1_024
    ) {
      throw new Error(
        `${label} no generó un PNG social válido durante el lifecycle raster del logo.`
      );
    }
  }

  return {
    openGraph: openGraph.sha256,
    twitter: twitter.sha256,
  };
}

function sameSocialSnapshot(left, right) {
  return (
    left.openGraph === right.openGraph &&
    left.twitter === right.twitter
  );
}

function appIconRefFromHtml(html, size) {
  const match = html.match(
    new RegExp(`/app-icon/${size}\\?v=([a-z0-9-]+)`, "i")
  );

  if (!match) {
    throw new Error(
      `La metadata pública no expone app-icon ${size}px versionado.`
    );
  }

  return `/app-icon/${size}?v=${match[1]}`;
}

function appIconRefFromManifest(manifest, size) {
  const expected = `${size}x${size}`;
  const entry = Array.isArray(manifest?.icons)
    ? manifest.icons.find(
        (icon) =>
          icon?.sizes === expected &&
          typeof icon?.src === "string" &&
          icon.src.startsWith(`/app-icon/${size}?v=`)
      )
    : null;

  if (!entry) {
    throw new Error(
      `El manifest no expone app-icon ${expected} versionado.`
    );
  }

  return entry.src;
}

async function appIconSnapshot() {
  const [home, manifestResponse] = await Promise.all([
    request("/"),
    request("/manifest.webmanifest"),
  ]);

  if (home.status !== 200 || manifestResponse.status !== 200) {
    throw new Error(
      `No se pudo capturar identidad de app-icons (${home.status}/${manifestResponse.status}).`
    );
  }

  const manifest = JSON.parse(manifestResponse.body);

  return {
    32: appIconRefFromHtml(home.body, 32),
    64: appIconRefFromHtml(home.body, 64),
    180: appIconRefFromHtml(home.body, 180),
    192: appIconRefFromManifest(manifest, 192),
    512: appIconRefFromManifest(manifest, 512),
  };
}

function sameAppIconSnapshot(left, right) {
  return [32, 64, 180, 192, 512].every(
    (size) => left[size] === right[size]
  );
}

async function assertAppIcon(ref, size) {
  const response = await request(ref);
  const contentType = String(
    response.headers["content-type"] ?? ""
  ).toLowerCase();

  if (
    response.status !== 200 ||
    !contentType.startsWith("image/png") ||
    String(
      response.headers["x-content-type-options"] ?? ""
    ).toLowerCase() !== "nosniff" ||
    response.content.length < 24 ||
    !response.content
      .subarray(0, PNG_SIGNATURE.length)
      .equals(PNG_SIGNATURE) ||
    response.content.readUInt32BE(16) !== size ||
    response.content.readUInt32BE(20) !== size
  ) {
    throw new Error(
      `El app-icon publicado de ${size}px no conserva PNG/MIME/dimensiones/nosniff.`
    );
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc =
        (crc >>> 1) ^
        (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  typeBuffer.copy(header, 4);
  const footer = Buffer.alloc(4);
  footer.writeUInt32BE(
    crc32(Buffer.concat([typeBuffer, data])),
    0
  );

  return Buffer.concat([header, data, footer]);
}

function privacyTracePng() {
  const trace = Buffer.from(traceText, "utf8");
  const base = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64"
  );
  const iendStart =
    base.indexOf(Buffer.from("IEND", "ascii")) - 4;

  return Buffer.concat([
    base.subarray(0, iendStart),
    pngChunk(
      "tEXt",
      Buffer.concat([
        Buffer.from("Software\0", "utf8"),
        trace,
      ])
    ),
    base.subarray(iendStart),
    trace,
  ]);
}

function multipartRasterLogo(revision) {
  const boundary =
    `----deuna-site-logo-raster-${Date.now().toString(36)}-${process.pid}`;
  const png = privacyTracePng();
  const before = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="expectedRevision"\r\n\r\n${revision}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="logo"; filename="${originalFilename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    "utf8"
  );
  const after = Buffer.from(
    `\r\n--${boundary}--\r\n`,
    "utf8"
  );

  return {
    body: Buffer.concat([before, png, after]),
    contentType:
      `multipart/form-data; boundary=${boundary}`,
  };
}

const identityPath =
  "/admin/configuracion?seccion=identidad";
const publicationPath =
  "/admin/configuracion?seccion=publicacion";

const publicBefore = await request("/");
if (publicBefore.status !== 200) {
  throw new Error(
    `La Home pública respondió ${publicBefore.status} antes del ciclo raster.`
  );
}
const publishedIdentityBefore = publicLogoIdentity(
  publicBefore.body
);
const socialBefore = await socialSnapshot();
const appIconsBefore = await appIconSnapshot();

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
const loginRedirect = redirectLocation(
  loginResponse,
  "El login HTTP del ciclo raster"
);
if (loginRedirect.pathname !== "/admin") {
  throw new Error(
    `El login raster terminó en ${loginRedirect.pathname}, se esperaba /admin.`
  );
}
const cookie = sessionCookie(
  loginResponse.headers["set-cookie"]
);

const identityPage = await request(identityPath, {
  headers: { cookie },
});
if (identityPage.status !== 200) {
  throw new Error(
    `Identidad respondió ${identityPage.status} antes del ciclo raster.`
  );
}

const beforeRevision = positiveNumberInput(
  identityPage.body,
  "expectedRevision"
);
const currentFields = {
  logoScale: singleInputValue(
    identityPage.body,
    "logoScale"
  ),
  name: singleInputValue(identityPage.body, "name"),
  shortName: singleInputValue(
    identityPage.body,
    "shortName"
  ),
  description: textareaValue(
    identityPage.body,
    "description"
  ),
  language: "es",
  themeColor: singleInputValue(
    identityPage.body,
    "themeColor"
  ),
  brandColor: singleInputValue(
    identityPage.body,
    "brandColor"
  ),
  footerTagline: singleInputValue(
    identityPage.body,
    "footerTagline"
  ),
};
const currentCustomColor = singleInputValue(
  identityPage.body,
  "logoCustomColor"
).toLowerCase();
const attemptedCustomColor =
  currentCustomColor === "#12ab34"
    ? "#34ab12"
    : "#12ab34";

const multipart = multipartRasterLogo(beforeRevision);
const uploadResponse = await request(
  "/api/admin/content/configuration/logo-upload",
  {
    method: "POST",
    headers: {
      "content-type": multipart.contentType,
      origin: baseUrl.origin,
      referer: new URL(identityPath, baseUrl).href,
      "sec-fetch-site": "same-origin",
      cookie,
    },
    body: multipart.body,
  }
);

if (uploadResponse.status !== 200) {
  throw new Error(
    `La carga raster respondió ${uploadResponse.status}: ${uploadResponse.body.slice(0, 240)}`
  );
}
if (
  uploadResponse.body.includes(originalFilename) ||
  uploadResponse.body.includes(traceText)
) {
  throw new Error(
    "La respuesta del upload filtró el nombre original o metadata identificable del archivo raster."
  );
}

const uploadPayload = JSON.parse(uploadResponse.body);
const publicPath =
  typeof uploadPayload?.publicPath === "string"
    ? uploadPayload.publicPath
    : "";
if (
  uploadPayload?.format !== "png" ||
  !/^\/media\/editorial\/site-brand-logo\/[a-f0-9]{64}\.png$/.test(
    publicPath
  )
) {
  throw new Error(
    `La carga raster no devolvió un PNG canónico por contenido: ${publicPath}.`
  );
}

const pathDigest = publicPath.match(
  /\/([a-f0-9]{64})\.png$/
)?.[1];
const anonymousDraftAsset = await request(publicPath);
if (
  anonymousDraftAsset.status !== 404 ||
  !String(
    anonymousDraftAsset.headers["cache-control"] ?? ""
  ).includes("no-store")
) {
  throw new Error(
    "Un logo recién subido pero no publicado quedó accesible de forma anónima."
  );
}

const uploadedAsset = await request(publicPath, {
  headers: { cookie },
});
const uploadedContentType = String(
  uploadedAsset.headers["content-type"] ?? ""
).toLowerCase();
const uploadedCacheControl = String(
  uploadedAsset.headers["cache-control"] ?? ""
).toLowerCase();
if (
  uploadedAsset.status !== 200 ||
  !uploadedContentType.startsWith("image/png") ||
  String(
    uploadedAsset.headers["x-content-type-options"] ?? ""
  ).toLowerCase() !== "nosniff" ||
  !uploadedCacheControl.includes("private") ||
  !uploadedCacheControl.includes("no-store") ||
  uploadedCacheControl.includes("immutable") ||
  uploadedAsset.content.includes(
    Buffer.from(traceText, "utf8")
  ) ||
  uploadedAsset.sha256 !== pathDigest
) {
  throw new Error(
    "El PNG saneado de borrador no se sirve sólo al Admin con MIME/hash/cache privados o conserva metadata identificable."
  );
}

const saveBody = new URLSearchParams({
  expectedRevision: String(beforeRevision),
  ...currentFields,
  logoAsset: publicPath,
  // Se envía deliberadamente un modo incompatible. El servidor debe ser la
  // autoridad y normalizar raster a original antes de persistir el borrador.
  logoColorMode: "custom",
  logoCustomColor: attemptedCustomColor,
}).toString();
const saveResponse = await request(
  "/api/admin/content/configuration?seccion=identidad",
  {
    method: "POST",
    headers: formHeaders(identityPath, cookie),
    body: saveBody,
  }
);
const saveRedirect = redirectLocation(
  saveResponse,
  "El guardado del logo raster"
);
if (
  saveRedirect.pathname !== "/admin/configuracion" ||
  saveRedirect.searchParams.get("seccion") !== "identidad" ||
  saveRedirect.searchParams.get("estado") !== "guardado"
) {
  throw new Error(
    `El guardado raster no terminó en estado=guardado: ${saveRedirect.href}.`
  );
}

const savedPage = await request(
  `${saveRedirect.pathname}${saveRedirect.search}`,
  { headers: { cookie } }
);
if (savedPage.status !== 200) {
  throw new Error(
    `El borrador raster no pudo releerse (${savedPage.status}).`
  );
}
const savedRevision = positiveNumberInput(
  savedPage.body,
  "expectedRevision"
);
if (savedRevision <= beforeRevision) {
  throw new Error(
    `Guardar el raster no avanzó revisión (${beforeRevision} -> ${savedRevision}).`
  );
}
if (
  singleInputValue(savedPage.body, "logoAsset") !==
    publicPath ||
  checkedInputValue(savedPage.body, "logoColorMode") !==
    "original"
) {
  throw new Error(
    "El servidor no normalizó el logo raster a colores originales al rehidratar el borrador."
  );
}

const anonymousSavedAsset = await request(publicPath);
if (anonymousSavedAsset.status !== 404) {
  throw new Error(
    "Guardar el logo raster como borrador hizo público el asset antes de publicar."
  );
}

const publicStillOld = await request("/");
if (
  publicStillOld.status !== 200 ||
  !sameIdentity(
    publicLogoIdentity(publicStillOld.body),
    publishedIdentityBefore
  )
) {
  throw new Error(
    "Guardar el logo raster en borrador alteró la identidad pública antes de publicar."
  );
}
const socialStillOld = await socialSnapshot();
if (!sameSocialSnapshot(socialStillOld, socialBefore)) {
  throw new Error(
    "Guardar el logo raster en borrador alteró OG/Twitter antes de publicar."
  );
}
const appIconsStillOld = await appIconSnapshot();
if (!sameAppIconSnapshot(appIconsStillOld, appIconsBefore)) {
  throw new Error(
    "Guardar el logo raster en borrador alteró favicon/Apple/PWA antes de publicar."
  );
}

const publicationBefore = await request(
  publicationPath,
  { headers: { cookie } }
);
if (publicationBefore.status !== 200) {
  throw new Error(
    `Publicación respondió ${publicationBefore.status} antes de publicar el raster.`
  );
}
const publishRevision = positiveNumberInput(
  publicationBefore.body,
  "expectedRevision"
);
if (publishRevision !== savedRevision) {
  throw new Error(
    `Publicación ve una revisión distinta del raster (${publishRevision} != ${savedRevision}).`
  );
}
const publicationNumberBefore = positiveNumberInput(
  publicationBefore.body,
  "expectedPublicationNumber"
);
assertNoRestoreActions(publicationBefore.body);

const publishResponse = await request(
  "/api/admin/content/configuration/publish",
  {
    method: "POST",
    headers: formHeaders(publicationPath, cookie),
    body: new URLSearchParams({
      expectedRevision: String(savedRevision),
    }).toString(),
  }
);
const publishRedirect = redirectLocation(
  publishResponse,
  "La publicación del logo raster"
);
if (
  publishRedirect.pathname !== "/admin/configuracion" ||
  publishRedirect.searchParams.get("seccion") !==
    "publicacion" ||
  publishRedirect.searchParams.get("estado") !== "publicado"
) {
  throw new Error(
    `Publicar el raster no terminó en estado=publicado: ${publishRedirect.href}.`
  );
}

const publicationAfterPublish = await request(
  `${publishRedirect.pathname}${publishRedirect.search}`,
  { headers: { cookie } }
);
const publicationNumberAfterPublish = positiveNumberInput(
  publicationAfterPublish.body,
  "expectedPublicationNumber"
);
if (
  publicationNumberAfterPublish <= publicationNumberBefore
) {
  throw new Error(
    `Publicar el raster no avanzó publicación (${publicationNumberBefore} -> ${publicationNumberAfterPublish}).`
  );
}

const publicPublished = await request("/");
if (publicPublished.status !== 200) {
  throw new Error(
    `La Home pública respondió ${publicPublished.status} después de publicar el raster.`
  );
}
const publishedIdentity = publicLogoIdentity(
  publicPublished.body
);
if (
  publishedIdentity.mode !== "custom" ||
  publishedIdentity.colorMode !== "original" ||
  publishedIdentity.color !==
    currentFields.brandColor.toLowerCase() ||
  !publishedIdentity.image.includes(publicPath)
) {
  throw new Error(
    `La identidad pública no aplicó el raster con modo original (${JSON.stringify(publishedIdentity)}).`
  );
}

const socialPublished = await socialSnapshot();
if (
  socialPublished.openGraph === socialBefore.openGraph ||
  socialPublished.twitter === socialBefore.twitter
) {
  throw new Error(
    "Publicar el logo raster no modificó las imágenes OG/Twitter."
  );
}

const appIconsPublished = await appIconSnapshot();
if (sameAppIconSnapshot(appIconsPublished, appIconsBefore)) {
  throw new Error(
    "Publicar el logo raster no versionó favicon/Apple/PWA."
  );
}
await assertAppIcon(appIconsPublished[32], 32);
await assertAppIcon(appIconsPublished[192], 192);

const publicAsset = await request(publicPath);
const publicAssetCacheControl = String(
  publicAsset.headers["cache-control"] ?? ""
).toLowerCase();
if (
  publicAsset.status !== 200 ||
  !String(
    publicAsset.headers["content-type"] ?? ""
  ).toLowerCase().startsWith("image/png") ||
  !publicAssetCacheControl.includes("public") ||
  !publicAssetCacheControl.includes("immutable") ||
  publicAsset.sha256 !== pathDigest ||
  publicAsset.content.includes(
    Buffer.from(traceText, "utf8")
  )
) {
  throw new Error(
    "El asset raster publicado no conserva el contrato saneado, content-addressed, público e inmutable."
  );
}

const draftAfterPublish = await request(identityPath, {
  headers: { cookie },
});
if (
  draftAfterPublish.status !== 200 ||
  positiveNumberInput(
    draftAfterPublish.body,
    "expectedRevision"
  ) !== savedRevision ||
  singleInputValue(
    draftAfterPublish.body,
    "logoAsset"
  ) !== publicPath ||
  checkedInputValue(
    draftAfterPublish.body,
    "logoColorMode"
  ) !== "original"
) {
  throw new Error(
    "Publicar el logo raster modificó inesperadamente el borrador."
  );
}

assertNoRestoreActions(publicationAfterPublish.body);

const publicCurrentOnly = await request("/");
if (publicCurrentOnly.status !== 200) {
  throw new Error(`La Home pública respondió ${publicCurrentOnly.status} después de publicar.`);
}
const draftCurrentOnly = await request(identityPath, { headers: { cookie } });
if (draftCurrentOnly.status !== 200 || positiveNumberInput(draftCurrentOnly.body, "expectedRevision") !== savedRevision) {
  throw new Error("El flujo current-only no preservó el borrador después de publicar.");
}

console.log(
  `Site logo raster publication lifecycle smoke: OK (revisión ${beforeRevision} -> ${savedRevision}; publicación ${publicationNumberBefore} -> ${publicationNumberAfterPublish}; PNG saneado, favicon/PWA y OG/Twitter current-only, sin historial restaurable).`
);
