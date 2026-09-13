import https from "node:https";
import process from "node:process";
import { isDeepStrictEqual } from "node:util";

const baseUrl = new URL(
  process.env.DEUNA_VISUAL_BASE_URL ?? "https://127.0.0.1:3443"
);
const adminUsername = process.env.DEUNA_VISUAL_ADMIN_USERNAME?.trim();
const adminPassword = process.env.DEUNA_VISUAL_ADMIN_PASSWORD;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

if (
  baseUrl.protocol !== "https:" ||
  !["127.0.0.1", "localhost", "::1"].includes(baseUrl.hostname)
) {
  throw new Error(
    "El smoke del borrador Hero sólo puede ejecutarse contra el runtime HTTPS local aislado."
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
    headers["content-length"] = String(Buffer.byteLength(body, "utf8"));
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

function formHeaders(referer, cookie, acceptJson = false) {
  return {
    "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
    origin: baseUrl.origin,
    referer: new URL(referer, baseUrl).href,
    "sec-fetch-site": "same-origin",
    ...(acceptJson ? { accept: "application/json" } : {}),
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
    throw new Error("El login del smoke no devolvió una cookie de sesión.");
  }
  return cookies.join("; ");
}

function decodeHtmlAttribute(value) {
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
    if (!nameMatch || decodeHtmlAttribute(nameMatch[1]) !== name) continue;
    const valueMatch = input.match(/\bvalue="([^"]*)"/i);
    if (!valueMatch) {
      throw new Error(`El input ${name} existe pero no expone un value SSR.`);
    }
    matches.push(decodeHtmlAttribute(valueMatch[1]));
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

function publicMotionStyle(html) {
  const match = html.match(/data-motion-style="(momentum|morph|parallax)"/);
  if (!match) {
    throw new Error("La Home pública no expone data-motion-style en el Hero SSR.");
  }
  return match[1];
}

function parseSaveResponse(response, label) {
  if (response.status !== 200) {
    throw new Error(`${label} respondió ${response.status}; se esperaba 200.`);
  }

  let payload;
  try {
    payload = JSON.parse(response.body);
  } catch {
    throw new Error(`${label} no devolvió JSON válido.`);
  }

  if (
    payload?.state !== "guardado" ||
    !Number.isInteger(payload.revision) ||
    payload.revision < 1
  ) {
    throw new Error(
      `${label} no confirmó una revisión guardada: ${response.body.slice(0, 300)}`
    );
  }
  return payload.revision;
}

async function loadHeroDraft(cookie) {
  const path = "/admin/portada?seccion=hero";
  const response = await request(path, { headers: { cookie } });
  if (response.status !== 200) {
    throw new Error(`El editor Hero respondió ${response.status}.`);
  }

  const expectedRevision = Number(singleValue(response.body, "expectedRevision"));
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
    throw new Error(`expectedRevision no es válida: ${expectedRevision}.`);
  }

  const heroJson = singleValue(response.body, "heroJson");
  let state;
  try {
    state = JSON.parse(heroJson);
  } catch {
    throw new Error("heroJson SSR no contiene JSON válido.");
  }

  if (!state?.presentation || !["momentum", "morph", "parallax"].includes(state.presentation.motionStyle)) {
    throw new Error("heroJson no expone un presentation.motionStyle V3 válido.");
  }

  return { expectedRevision, state };
}

async function saveHeroDraft(cookie, revision, state, label) {
  const body = new URLSearchParams({
    expectedRevision: String(revision),
    heroJson: JSON.stringify(state),
  }).toString();
  const response = await request("/api/admin/content/home/hero", {
    method: "POST",
    headers: formHeaders("/admin/portada?seccion=hero", cookie, true),
    body,
  });
  return parseSaveResponse(response, label);
}

const publicBefore = await request("/");
if (publicBefore.status !== 200) {
  throw new Error(`La Home pública respondió ${publicBefore.status} antes del smoke.`);
}
const publishedStyleBefore = publicMotionStyle(publicBefore.body);

const loginBody = new URLSearchParams({
  username: adminUsername,
  password: adminPassword,
}).toString();
const loginResponse = await request("/api/admin/auth/login", {
  method: "POST",
  headers: formHeaders("/admin/login"),
  body: loginBody,
});
if (loginResponse.status !== 303) {
  throw new Error(`El login del smoke respondió ${loginResponse.status}; se esperaba 303.`);
}
const cookie = sessionCookie(loginResponse.headers["set-cookie"]);

const original = await loadHeroDraft(cookie);
const originalStyle = original.state.presentation.motionStyle;
const targetStyle = originalStyle === "morph" ? "parallax" : "morph";

let activeRevision = original.expectedRevision;
let primaryError = null;

try {
  const changedState = structuredClone(original.state);
  changedState.presentation.motionStyle = targetStyle;
  activeRevision = await saveHeroDraft(
    cookie,
    activeRevision,
    changedState,
    `Guardar movimiento V3 ${targetStyle}`
  );

  const changedDraft = await loadHeroDraft(cookie);
  if (changedDraft.expectedRevision !== activeRevision) {
    throw new Error(
      `El Admin quedó en revisión ${changedDraft.expectedRevision}; se esperaba ${activeRevision}.`
    );
  }
  if (changedDraft.state.presentation.motionStyle !== targetStyle) {
    throw new Error(`El borrador no conservó motionStyle=${targetStyle} después del guardado.`);
  }

  const publicAfterDraft = await request("/");
  if (publicAfterDraft.status !== 200) {
    throw new Error(
      `La Home pública respondió ${publicAfterDraft.status} después del guardado de borrador.`
    );
  }
  const publishedStyleAfterDraft = publicMotionStyle(publicAfterDraft.body);
  if (publishedStyleAfterDraft !== publishedStyleBefore) {
    throw new Error(
      `Guardar el borrador filtró motionStyle a la Home pública (${publishedStyleBefore} → ${publishedStyleAfterDraft}).`
    );
  }
} catch (error) {
  primaryError = error;
} finally {
  try {
    const current = await loadHeroDraft(cookie);
    activeRevision = current.expectedRevision;
    if (!isDeepStrictEqual(current.state, original.state)) {
      activeRevision = await saveHeroDraft(
        cookie,
        current.expectedRevision,
        original.state,
        "Restaurar borrador Hero original"
      );
    }

    const restored = await loadHeroDraft(cookie);
    activeRevision = restored.expectedRevision;
    if (!isDeepStrictEqual(restored.state, original.state)) {
      throw new Error("La restauración no recuperó exactamente el payload Hero inicial.");
    }
  } catch (restoreError) {
    if (primaryError) {
      throw new AggregateError(
        [primaryError, restoreError],
        "El smoke falló y además no pudo restaurar el borrador Hero inicial."
      );
    }
    throw restoreError;
  }
}

if (primaryError) throw primaryError;

const publicAfterRestore = await request("/");
if (publicAfterRestore.status !== 200) {
  throw new Error(
    `La Home pública respondió ${publicAfterRestore.status} después de restaurar el borrador.`
  );
}
const publishedStyleAfterRestore = publicMotionStyle(publicAfterRestore.body);
if (publishedStyleAfterRestore !== publishedStyleBefore) {
  throw new Error(
    `La restauración del borrador alteró la Home pública (${publishedStyleBefore} → ${publishedStyleAfterRestore}).`
  );
}

console.log(
  `Hero motion draft lifecycle: OK (draft ${originalStyle} → ${targetStyle} → restored ${originalStyle}; public stayed ${publishedStyleBefore}; final revision ${activeRevision}).`
);
