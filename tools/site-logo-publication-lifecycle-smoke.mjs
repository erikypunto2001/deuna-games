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

if (
  baseUrl.protocol !== "https:" ||
  !["127.0.0.1", "localhost", "::1"].includes(baseUrl.hostname)
) {
  throw new Error(
    "El smoke del logo sólo puede ejecutarse contra el runtime HTTPS local aislado."
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

  if (cookies.length === 0) {
    throw new Error(
      "El login del smoke no devolvió una cookie de sesión."
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
    if (!nameMatch || decodeHtml(nameMatch[1]) !== name) continue;
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

function currentPublicationNumber(html) {
  const match = html.match(
    /<span>Publicación actual<\/span>\s*<strong>([\s\S]*?)<\/strong>/i
  );
  const visibleValue = decodeHtml(
    (match?.[1] ?? "").replace(/<[^>]+>/g, "")
  ).replace(/\s+/g, " ").trim();
  const numberMatch = visibleValue.match(/^#([0-9]+)$/);
  const value = Number(numberMatch?.[1]);

  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      "El panel no expone un número de publicación actual verificable."
    );
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
  if (!location) throw new Error(`${label} no devolvió Location.`);
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
    throw new Error("La respuesta pública no contiene un elemento html verificable.");
  }

  const modeMatch = htmlTag.match(/\bdata-site-logo="([^"]+)"/i);
  const styleMatch = htmlTag.match(/\bstyle="([^"]*)"/i);
  if (!modeMatch || !styleMatch) {
    throw new Error(
      "La identidad pública no expone data-site-logo y variables CSS del logo."
    );
  }

  const style = decodeHtml(styleMatch[1]);
  const color = style.match(/--site-logo-color:([^;]+)/i)?.[1]?.trim();
  const image = style.match(/--site-logo-image:([^;]+)/i)?.[1]?.trim();

  if (!color || !image) {
    throw new Error(
      "La identidad pública no expone color e imagen del logo de forma verificable."
    );
  }

  return {
    mode: decodeHtml(modeMatch[1]),
    color: color.toLowerCase(),
    image,
  };
}

function sameIdentity(left, right) {
  return (
    left.mode === right.mode &&
    left.color === right.color &&
    left.image === right.image
  );
}

async function socialSnapshot() {
  const [openGraph, twitter] = await Promise.all([
    request("/opengraph-image"),
    request("/twitter-image"),
  ]);
  const entries = [
    ["Open Graph", openGraph],
    ["Twitter", twitter],
  ];

  for (const [label, response] of entries) {
    const contentType = String(
      response.headers["content-type"] ?? ""
    ).toLowerCase();
    if (
      response.status !== 200 ||
      !contentType.startsWith("image/png") ||
      response.bytes < 1_024
    ) {
      throw new Error(
        `${label} no generó un PNG social válido durante el lifecycle del logo.`
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

function multipartLogo(revision) {
  const boundary =
    `----deuna-site-logo-${Date.now().toString(36)}-${process.pid}`;
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 5h18v14H3z"/><circle cx="9" cy="12" r="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="16" cy="10" r="1.5"/></svg>\n',
    "utf8"
  );
  const before = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="expectedRevision"\r\n\r\n${revision}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="logo"; filename="brand-logo.svg"\r\nContent-Type: image/svg+xml\r\n\r\n`,
    "utf8"
  );
  const after = Buffer.from(
    `\r\n--${boundary}--\r\n`,
    "utf8"
  );

  return {
    body: Buffer.concat([before, svg, after]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

const identityPath = "/admin/configuracion?seccion=identidad";
const publicationPath = "/admin/configuracion?seccion=publicacion";

const publicBefore = await request("/");
if (publicBefore.status !== 200) {
  throw new Error(
    `La Home pública respondió ${publicBefore.status} antes del ciclo del logo.`
  );
}
const publishedIdentityBefore = publicLogoIdentity(publicBefore.body);
const socialBefore = await socialSnapshot();

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
  "El login HTTP del ciclo del logo"
);
if (loginRedirect.pathname !== "/admin") {
  throw new Error(
    `El login terminó en ${loginRedirect.pathname}, se esperaba /admin.`
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
    `Identidad respondió ${identityPage.status} antes del ciclo del logo.`
  );
}

const beforeRevision = positiveNumberInput(
  identityPage.body,
  "expectedRevision"
);
const currentFields = {
  logoScale: singleInputValue(identityPage.body, "logoScale"),
  name: singleInputValue(identityPage.body, "name"),
  shortName: singleInputValue(identityPage.body, "shortName"),
  description: textareaValue(identityPage.body, "description"),
  language: "es",
  themeColor: singleInputValue(identityPage.body, "themeColor"),
  brandColor: singleInputValue(identityPage.body, "brandColor"),
  footerTagline: singleInputValue(identityPage.body, "footerTagline"),
};
const currentCustomColor = singleInputValue(
  identityPage.body,
  "logoCustomColor"
).toLowerCase();
const testColor = currentCustomColor === "#12ab34"
  ? "#34ab12"
  : "#12ab34";

const multipart = multipartLogo(beforeRevision);
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
    `La carga segura del logo respondió ${uploadResponse.status}: ${uploadResponse.body.slice(0, 240)}`
  );
}
const uploadPayload = JSON.parse(uploadResponse.body);
const publicPath = typeof uploadPayload?.publicPath === "string"
  ? uploadPayload.publicPath
  : "";
if (!/^\/media\/editorial\/site-brand-logo\/[a-f0-9]{64}\.svg$/.test(publicPath)) {
  throw new Error(
    `La carga no devolvió un asset de logo canónico: ${publicPath}.`
  );
}

const saveBody = new URLSearchParams({
  expectedRevision: String(beforeRevision),
  ...currentFields,
  logoAsset: publicPath,
  logoColorMode: "custom",
  logoCustomColor: testColor,
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
  "El guardado del logo"
);
if (
  saveRedirect.pathname !== "/admin/configuracion" ||
  saveRedirect.searchParams.get("seccion") !== "identidad" ||
  saveRedirect.searchParams.get("estado") !== "guardado"
) {
  throw new Error(
    `El guardado del logo no terminó en estado=guardado: ${saveRedirect.href}.`
  );
}

const savedPage = await request(
  `${saveRedirect.pathname}${saveRedirect.search}`,
  { headers: { cookie } }
);
if (savedPage.status !== 200) {
  throw new Error(
    `El borrador del logo no pudo releerse (${savedPage.status}).`
  );
}
const savedRevision = positiveNumberInput(
  savedPage.body,
  "expectedRevision"
);
if (savedRevision <= beforeRevision) {
  throw new Error(
    `Guardar el logo no avanzó revisión (${beforeRevision} -> ${savedRevision}).`
  );
}
if (
  singleInputValue(savedPage.body, "logoAsset") !== publicPath ||
  checkedInputValue(savedPage.body, "logoColorMode") !== "custom" ||
  singleInputValue(savedPage.body, "logoCustomColor").toLowerCase() !== testColor
) {
  throw new Error(
    "El editor no rehidrató el mismo logo y color guardados en el borrador."
  );
}

const publicStillOld = await request("/");
if (publicStillOld.status !== 200) {
  throw new Error(
    `La Home pública respondió ${publicStillOld.status} tras guardar el borrador.`
  );
}
if (
  !sameIdentity(
    publicLogoIdentity(publicStillOld.body),
    publishedIdentityBefore
  )
) {
  throw new Error(
    "Guardar el logo en borrador alteró la identidad pública antes de publicar."
  );
}
const socialStillOld = await socialSnapshot();
if (!sameSocialSnapshot(socialStillOld, socialBefore)) {
  throw new Error(
    "Guardar el logo en borrador alteró OG/Twitter antes de publicar."
  );
}

const publicationBefore = await request(publicationPath, {
  headers: { cookie },
});
if (publicationBefore.status !== 200) {
  throw new Error(
    `Publicación respondió ${publicationBefore.status} antes de publicar el logo.`
  );
}
const publishRevision = positiveNumberInput(
  publicationBefore.body,
  "expectedRevision"
);
if (publishRevision !== savedRevision) {
  throw new Error(
    `Publicación ve una revisión distinta del logo (${publishRevision} != ${savedRevision}).`
  );
}
const publicationNumberBefore = currentPublicationNumber(
  publicationBefore.body
);
assertNoRestoreActions(publicationBefore.body);

const publishBody = new URLSearchParams({
  expectedRevision: String(savedRevision),
}).toString();
const publishResponse = await request(
  "/api/admin/content/configuration/publish",
  {
    method: "POST",
    headers: formHeaders(publicationPath, cookie),
    body: publishBody,
  }
);
const publishRedirect = redirectLocation(
  publishResponse,
  "La publicación del logo"
);
if (
  publishRedirect.pathname !== "/admin/configuracion" ||
  publishRedirect.searchParams.get("seccion") !== "publicacion" ||
  publishRedirect.searchParams.get("estado") !== "publicado"
) {
  throw new Error(
    `Publicar el logo no terminó en estado=publicado: ${publishRedirect.href}.`
  );
}

const publicationAfterPublish = await request(
  `${publishRedirect.pathname}${publishRedirect.search}`,
  { headers: { cookie } }
);
const publicationNumberAfterPublish = currentPublicationNumber(
  publicationAfterPublish.body
);
if (publicationNumberAfterPublish <= publicationNumberBefore) {
  throw new Error(
    `Publicar el logo no avanzó el número de publicación (${publicationNumberBefore} -> ${publicationNumberAfterPublish}).`
  );
}

const publicPublished = await request("/");
if (publicPublished.status !== 200) {
  throw new Error(
    `La Home pública respondió ${publicPublished.status} después de publicar el logo.`
  );
}
const publishedIdentity = publicLogoIdentity(
  publicPublished.body
);
if (
  publishedIdentity.mode !== "custom" ||
  publishedIdentity.color !== testColor ||
  !publishedIdentity.image.includes(publicPath)
) {
  throw new Error(
    `La identidad pública no aplicó el snapshot del logo (${JSON.stringify(publishedIdentity)}).`
  );
}
const socialPublished = await socialSnapshot();
if (
  socialPublished.openGraph === socialBefore.openGraph ||
  socialPublished.twitter === socialBefore.twitter
) {
  throw new Error(
    "Publicar el logo personalizado no modificó las imágenes OG/Twitter."
  );
}

const publicAsset = await request(publicPath);
if (
  publicAsset.status !== 200 ||
  !String(publicAsset.headers["content-type"] ?? "").startsWith("image/svg+xml") ||
  !String(publicAsset.headers["content-security-policy"] ?? "").includes("default-src 'none'")
) {
  throw new Error(
    "El asset publicado del logo no se sirve como SVG revalidado y aislado por CSP."
  );
}

const draftAfterPublish = await request(identityPath, {
  headers: { cookie },
});
if (
  draftAfterPublish.status !== 200 ||
  positiveNumberInput(draftAfterPublish.body, "expectedRevision") !== savedRevision ||
  singleInputValue(draftAfterPublish.body, "logoAsset") !== publicPath
) {
  throw new Error(
    "Publicar el logo modificó inesperadamente el borrador."
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
  `Site logo publication lifecycle smoke: OK (revisión ${beforeRevision} -> ${savedRevision}; publicación ${publicationNumberBefore} -> ${publicationNumberAfterPublish}; SVG + OG/Twitter seguros, current-only y sin acciones de restauración).`
);
