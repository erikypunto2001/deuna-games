import https from "node:https";
import process from "node:process";

import {
  accountQuery,
} from "../src/lib/accounts/database.ts";
import {
  representativeGameSlug,
} from "./browser-page-manifest.mjs";
import {
  createVisualUpdateDraft,
} from "./admin-historical-update-visual-fixture.ts";

const baseUrl = new URL(
  process.env.DEUNA_VISUAL_BASE_URL ??
    "https://127.0.0.1:3443"
);
const adminUsername =
  process.env.DEUNA_VISUAL_ADMIN_USERNAME?.trim();
const adminPassword =
  process.env.DEUNA_VISUAL_ADMIN_PASSWORD;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

if (
  baseUrl.protocol !== "https:" ||
  !["127.0.0.1", "localhost", "::1"].includes(baseUrl.hostname)
) {
  throw new Error(
    "El runner de avisos sólo puede ejecutarse contra el runtime HTTPS local aislado."
  );
}

if (!adminUsername || !adminPassword) {
  throw new Error(
    "Faltan DEUNA_VISUAL_ADMIN_USERNAME/DEUNA_VISUAL_ADMIN_PASSWORD para provisionar el update efímero."
  );
}

function request(pathname, options = {}) {
  const url = new URL(pathname, baseUrl);

  if (url.origin !== baseUrl.origin) {
    throw new Error(
      `El fixture de avisos rechazó un destino fuera del origen visual: ${url.origin}.`
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
      "El login del fixture de avisos no devolvió una cookie de sesión."
    );
  }

  return cookies.join("; ");
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

async function postAdminForm(pathname, referer, cookie, fields, label) {
  const response = await request(pathname, {
    method: "POST",
    headers: formHeaders(referer, cookie),
    body: new URLSearchParams(fields).toString(),
  });

  return redirectLocation(response, label);
}

function assertState(url, expected, label) {
  if (url.searchParams.get("estado") !== expected) {
    throw new Error(
      `${label} no terminó en estado=${expected}: ${url.href}.`
    );
  }
}

async function readUpdateState(id) {
  const result = await accountQuery(
    `SELECT
       revision,
       publication_number,
       public_visible,
       published_payload
     FROM deuna_admin.editorial_items
     WHERE item_type = 'game_update'
       AND item_key = $1
     LIMIT 1`,
    [id]
  );
  const row = result.rows[0];

  if (!row) return null;

  return {
    revision: Number(row.revision),
    publicationNumber: Number(row.publication_number),
    publicVisible: Boolean(row.public_visible),
    publishedPayload: row.published_payload,
  };
}

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} no es un entero positivo: ${value}.`);
  }
}

const suffix =
  `${Date.now().toString(36)}-${process.pid.toString(36)}`
    .slice(-18);
const updateId =
  `avisos-e2e-${suffix}`
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .slice(0, 160);
const version = `avisos-e2e-${suffix}`.slice(0, 80);
/*
 * El formulario editorial guarda precisión de minutos. El minuto UTC actual
 * mantiene este único update de CI como el más reciente sin colocarlo después
 * de markAccountUpdatesSeen(), que persiste el límite con now().
 */
const publishedAt =
  `${new Date().toISOString().slice(0, 16)}:00.000Z`;
const summary =
  `Actualización sintética aislada para validar avisos de cuenta (${suffix}).`;

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
  "El login HTTP del fixture de avisos"
);
if (loginRedirect.pathname !== "/admin") {
  throw new Error(
    `El login del fixture terminó en ${loginRedirect.pathname}; se esperaba /admin.`
  );
}
const cookie = sessionCookie(loginResponse.headers["set-cookie"]);
let published = false;

try {
  await createVisualUpdateDraft({
    updateId,
    gameSlug: representativeGameSlug,
    version,
    publishedAt,
    type: "update",
    summary,
    featured: false,
    ownerUsername: adminUsername,
    auditMarker: "account-notifications",
  });

  const expectedEditorPath =
    `/admin/actualizaciones/${encodeURIComponent(updateId)}`;
  const draft = await readUpdateState(updateId);
  if (!draft) {
    throw new Error(
      "El update efímero no quedó persistido después de crear el borrador."
    );
  }
  assertPositiveInteger(draft.revision, "La revisión del update efímero");
  if (draft.publicVisible) {
    throw new Error(
      "El update efímero quedó público antes de la publicación explícita."
    );
  }

  const publishRedirect = await postAdminForm(
    `/api/admin/content/updates/${encodeURIComponent(updateId)}/publish`,
    `${expectedEditorPath}?seccion=publicacion`,
    cookie,
    {
      expectedRevision: String(draft.revision),
    },
    "La publicación del update efímero de avisos"
  );
  assertState(
    publishRedirect,
    "publicado",
    "La publicación del update efímero"
  );

  const publicUpdate = await readUpdateState(updateId);
  if (!publicUpdate?.publicVisible) {
    throw new Error(
      "El update efímero no quedó visible después de publicarlo."
    );
  }
  assertPositiveInteger(
    publicUpdate.publicationNumber,
    "La publicación del update efímero"
  );
  const payload = publicUpdate.publishedPayload;
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    payload.gameSlug !== representativeGameSlug ||
    payload.version !== version ||
    payload.publishedAt !== publishedAt
  ) {
    throw new Error(
      `El snapshot público del update efímero no coincide con el fixture esperado: ${JSON.stringify(payload)}.`
    );
  }
  published = true;

  await import("./account-notifications-browser-e2e.mjs");
} finally {
  if (published) {
    const current = await readUpdateState(updateId).catch(() => null);

    if (current?.publicVisible) {
      assertPositiveInteger(
        current.publicationNumber,
        "La publicación vigente antes de ocultar el update efímero"
      );
      const hideRedirect = await postAdminForm(
        `/api/admin/content/updates/${encodeURIComponent(updateId)}/hide`,
        `${`/admin/actualizaciones/${encodeURIComponent(updateId)}`}?seccion=publicacion`,
        cookie,
        {
          expectedPublicationNumber: String(
            current.publicationNumber
          ),
        },
        "El ocultamiento del update efímero de avisos"
      );
      assertState(
        hideRedirect,
        "oculto",
        "El ocultamiento del update efímero"
      );

      const hidden = await readUpdateState(updateId);
      if (!hidden || hidden.publicVisible) {
        throw new Error(
          "El update efímero siguió visible después de la limpieza del E2E de avisos."
        );
      }
    }
  }
}
