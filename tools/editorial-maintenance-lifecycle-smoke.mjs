import https from "node:https";
import process from "node:process";

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

let html = await maintenancePage(cookie);
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
  "Editorial maintenance lifecycle: OK (reauth negativa/positiva, Inicio acotado, concurrencia global y baseline global verificados por rutas HTTP reales)."
);
