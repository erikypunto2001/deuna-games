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
    "El smoke del ciclo editorial de Inicio sólo puede ejecutarse contra el runtime HTTPS local aislado."
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
  if (body) {
    headers["content-length"] = String(
      Buffer.byteLength(body, "utf8")
    );
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
    if (body) req.write(body);
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

function singleValue(html, name) {
  const values = inputValues(html, name);
  const unique = [...new Set(values)];
  if (unique.length !== 1) {
    throw new Error(
      `${name} no tiene un único valor coherente (${unique.length} variantes).`
    );
  }
  return unique[0];
}

function positiveNumberInput(html, name) {
  const value = Number(singleValue(html, name));
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
  if (!location) throw new Error(`${label} no devolvió Location.`);
  const url = new URL(location, baseUrl);
  if (url.origin !== baseUrl.origin) {
    throw new Error(
      `${label} intentó redirigir fuera del origen visual: ${url.origin}.`
    );
  }
  return url;
}

function publicHeading(html) {
  const match = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (!match) {
    throw new Error("La Home pública no expone un H1 verificable.");
  }
  return decodeHtml(
    match[1].replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function assertNoRestoreActions(html) {
  const actions = [...html.matchAll(/<form[^>]*action="([^"]+)"/gi)]
    .map((match) => decodeHtml(match[1]))
    .filter((action) => action.includes("/restore"));

  if (actions.length > 0) {
    throw new Error(`El panel todavía expone acciones de restauración: ${actions.join(", ")}.`);
  }
}

const marker =
  `Visual publication lifecycle ${Date.now().toString(36)}-${process.pid}`;
const contentPath = "/admin/portada?seccion=contenido";
const publicationPath = "/admin/portada?seccion=publicacion";

const publicBefore = await request("/");
if (publicBefore.status !== 200) {
  throw new Error(
    `La Home pública respondió ${publicBefore.status} antes del ciclo editorial.`
  );
}
const publishedHeadingBefore = publicHeading(publicBefore.body);
if (publicBefore.body.includes(marker)) {
  throw new Error(
    "La marca efímera del ciclo editorial ya existía públicamente."
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
const loginRedirect = redirectLocation(
  loginResponse,
  "El login HTTP del ciclo editorial"
);
if (loginRedirect.pathname !== "/admin") {
  throw new Error(
    `El login terminó en ${loginRedirect.pathname}, se esperaba /admin.`
  );
}
const cookie = sessionCookie(
  loginResponse.headers["set-cookie"]
);

const contentPage = await request(contentPath, {
  headers: { cookie },
});
if (contentPage.status !== 200) {
  throw new Error(
    `Resto de Inicio respondió ${contentPage.status} antes del ciclo editorial.`
  );
}

const revisionValues = inputValues(
  contentPage.body,
  "expectedRevision"
);
if (new Set(revisionValues).size !== 1) {
  throw new Error(
    "Curaduría y Presentación no comparten expectedRevision antes de publicar."
  );
}
const beforeRevision = Number(revisionValues[0]);
if (!Number.isInteger(beforeRevision) || beforeRevision <= 0) {
  throw new Error(
    `expectedRevision no es válida: ${revisionValues[0]}.`
  );
}

const curationJson = singleValue(
  contentPage.body,
  "curationJson"
);
const presentation = JSON.parse(
  singleValue(contentPage.body, "presentationJson")
);
if (
  !presentation?.copy?.hero ||
  typeof presentation.copy.hero.accessibleTitle !== "string"
) {
  throw new Error(
    "Presentación no expone copy.hero.accessibleTitle antes del ciclo editorial."
  );
}
presentation.copy.hero.accessibleTitle = marker;

const saveBody = new URLSearchParams({
  expectedRevision: String(beforeRevision),
  curationJson,
  presentationJson: JSON.stringify(presentation),
}).toString();
const saveResponse = await request(
  "/api/admin/content/home/content",
  {
    method: "POST",
    headers: formHeaders(contentPath, cookie),
    body: saveBody,
  }
);
const saveRedirect = redirectLocation(
  saveResponse,
  "El guardado previo a publicar"
);
if (
  saveRedirect.pathname !== "/admin/portada" ||
  saveRedirect.searchParams.get("seccion") !== "contenido" ||
  saveRedirect.searchParams.get("estado") !== "guardado"
) {
  throw new Error(
    `El guardado previo no terminó en estado=guardado: ${saveRedirect.href}.`
  );
}

const savedPage = await request(
  `${saveRedirect.pathname}${saveRedirect.search}`,
  { headers: { cookie } }
);
if (savedPage.status !== 200) {
  throw new Error(
    `El borrador previo a publicar no pudo releerse (${savedPage.status}).`
  );
}
const savedRevision = positiveNumberInput(
  savedPage.body,
  "expectedRevision"
);
const persistedPresentation = JSON.parse(
  singleValue(savedPage.body, "presentationJson")
);
if (savedRevision <= beforeRevision) {
  throw new Error(
    `El guardado previo no avanzó revisión (${beforeRevision} -> ${savedRevision}).`
  );
}
if (
  persistedPresentation?.copy?.hero?.accessibleTitle !== marker
) {
  throw new Error(
    "El título temporal no quedó persistido antes de publicar."
  );
}

const publicStillOld = await request("/");
if (
  publicStillOld.status !== 200 ||
  publicStillOld.body.includes(marker) ||
  publicHeading(publicStillOld.body) !== publishedHeadingBefore
) {
  throw new Error(
    "Guardar el borrador alteró la Home pública antes de publicar."
  );
}

const publicationBefore = await request(publicationPath, {
  headers: { cookie },
});
if (publicationBefore.status !== 200) {
  throw new Error(
    `Publicación respondió ${publicationBefore.status} antes de publicar.`
  );
}
const publishRevision = positiveNumberInput(
  publicationBefore.body,
  "expectedRevision"
);
if (publishRevision !== savedRevision) {
  throw new Error(
    `Publicación ve una revisión distinta del borrador (${publishRevision} != ${savedRevision}).`
  );
}
const publicationNumberBefore = positiveNumberInput(
  publicationBefore.body,
  "expectedPublicationNumber"
);
assertNoRestoreActions(publicationBefore.body);

const publishBody = new URLSearchParams({
  expectedRevision: String(savedRevision),
}).toString();
const publishResponse = await request(
  "/api/admin/content/home/publish",
  {
    method: "POST",
    headers: formHeaders(publicationPath, cookie),
    body: publishBody,
  }
);
const publishRedirect = redirectLocation(
  publishResponse,
  "La publicación de Inicio"
);
if (
  publishRedirect.pathname !== "/admin/portada" ||
  publishRedirect.searchParams.get("seccion") !== "publicacion" ||
  publishRedirect.searchParams.get("estado") !== "publicado"
) {
  throw new Error(
    `Publicar no terminó en estado=publicado: ${publishRedirect.href}.`
  );
}

const publicationAfterPublish = await request(
  `${publishRedirect.pathname}${publishRedirect.search}`,
  { headers: { cookie } }
);
if (publicationAfterPublish.status !== 200) {
  throw new Error(
    `El estado posterior a publicar no pudo releerse (${publicationAfterPublish.status}).`
  );
}
const publicationNumberAfterPublish = positiveNumberInput(
  publicationAfterPublish.body,
  "expectedPublicationNumber"
);
if (publicationNumberAfterPublish <= publicationNumberBefore) {
  throw new Error(
    `Publicar no avanzó el número de publicación (${publicationNumberBefore} -> ${publicationNumberAfterPublish}).`
  );
}

const publicPublished = await request("/");
if (publicPublished.status !== 200) {
  throw new Error(
    `La Home pública respondió ${publicPublished.status} después de publicar.`
  );
}
if (publicHeading(publicPublished.body) !== marker) {
  throw new Error(
    "La Home pública no reflejó el snapshot recién publicado."
  );
}

const draftAfterPublish = await request(contentPath, {
  headers: { cookie },
});
if (draftAfterPublish.status !== 200) {
  throw new Error(
    `El borrador no pudo releerse después de publicar (${draftAfterPublish.status}).`
  );
}
if (
  positiveNumberInput(draftAfterPublish.body, "expectedRevision") !== savedRevision ||
  JSON.parse(singleValue(draftAfterPublish.body, "presentationJson"))?.copy?.hero?.accessibleTitle !== marker
) {
  throw new Error(
    "Publicar modificó inesperadamente la revisión o el contenido del borrador."
  );
}

assertNoRestoreActions(publicationAfterPublish.body);

const publicAfterPublish = await request("/");
if (publicAfterPublish.status !== 200 || publicHeading(publicAfterPublish.body) !== marker) {
  throw new Error("La publicación vigente no permaneció activa después del flujo current-only.");
}

const draftAfterCurrentPublish = await request(contentPath, {
  headers: { cookie },
});
if (draftAfterCurrentPublish.status !== 200) {
  throw new Error(
    `El borrador no pudo releerse después de publicar (${draftAfterCurrentPublish.status}).`
  );
}
if (
  positiveNumberInput(draftAfterCurrentPublish.body, "expectedRevision") !== savedRevision ||
  JSON.parse(singleValue(draftAfterCurrentPublish.body, "presentationJson"))?.copy?.hero?.accessibleTitle !== marker
) {
  throw new Error("Publicar reescribió inesperadamente el borrador current-only.");
}

console.log(
  `Home publication lifecycle smoke: OK (revisión ${beforeRevision} -> ${savedRevision}; publicación ${publicationNumberBefore} -> ${publicationNumberAfterPublish}; sin historial ni acciones de restauración).`
);
