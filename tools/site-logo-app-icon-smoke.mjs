import https from "node:https";
import process from "node:process";

const baseUrl = new URL(
  process.env.DEUNA_VISUAL_BASE_URL ??
    "https://127.0.0.1:3443"
);
const MAX_RESPONSE_BYTES = 3 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47,
  0x0d, 0x0a, 0x1a, 0x0a,
]);

if (
  baseUrl.protocol !== "https:" ||
  !["127.0.0.1", "localhost", "::1"].includes(baseUrl.hostname)
) {
  throw new Error(
    "El smoke de iconos sólo puede ejecutarse contra el runtime HTTPS local aislado."
  );
}

function request(pathname) {
  const url = new URL(pathname, baseUrl);

  if (url.origin !== baseUrl.origin) {
    throw new Error(
      `El smoke rechazó un destino fuera del origen visual: ${url.origin}.`
    );
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "GET",
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
            body: Buffer.concat(chunks),
          });
        });
      }
    );

    req.on("error", reject);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertPng(response, expectedSize) {
  assert(
    response.status === 200,
    `El icono ${expectedSize}px respondió ${response.status}.`
  );
  assert(
    response.headers["content-type"]?.startsWith("image/png"),
    `El icono ${expectedSize}px no se sirvió como image/png.`
  );
  assert(
    response.headers["x-content-type-options"] === "nosniff",
    `El icono ${expectedSize}px debe servir nosniff.`
  );
  assert(
    !String(response.headers["cache-control"] ?? "").includes("immutable"),
    `El icono ${expectedSize}px no debe declarar immutable siendo identidad dinámica.`
  );
  assert(
    response.body.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE),
    `El icono ${expectedSize}px no contiene una firma PNG válida.`
  );
  assert(
    response.body.length >= 24,
    `El PNG de ${expectedSize}px quedó truncado.`
  );
  assert(
    response.body.readUInt32BE(16) === expectedSize &&
      response.body.readUInt32BE(20) === expectedSize,
    `El icono esperado ${expectedSize}x${expectedSize} tiene dimensiones distintas.`
  );
}

const home = await request("/");
assert(home.status === 200, `Home respondió ${home.status}.`);
const homeHtml = home.body.toString("utf8");
for (const size of [32, 64, 180]) {
  assert(
    homeHtml.includes(`/app-icon/${size}?v=`),
    `Metadata HTML no expone el icono versionado de ${size}px.`
  );
}

const manifestResponse = await request("/manifest.webmanifest");
assert(
  manifestResponse.status === 200,
  `Manifest respondió ${manifestResponse.status}.`
);
const manifest = JSON.parse(manifestResponse.body.toString("utf8"));
assert(Array.isArray(manifest.icons), "El manifest no contiene icons.");
for (const size of [192, 512]) {
  const expected = `${size}x${size}`;
  const entry = manifest.icons.find(
    (icon) =>
      icon?.sizes === expected &&
      icon?.type === "image/png" &&
      typeof icon?.src === "string" &&
      icon.src.includes(`/app-icon/${size}?v=`)
  );
  assert(entry, `El manifest no publica el icono ${expected}.`);
}

for (const size of [32, 64, 180, 192, 512]) {
  const response = await request(`/app-icon/${size}`);
  assertPng(response, size);
}

const favicon = await request("/favicon.ico");
assertPng(favicon, 32);

const invalid = await request("/app-icon/96");
assert(invalid.status === 404, "Un tamaño de icono no permitido debe responder 404.");
assert(
  String(invalid.headers["cache-control"] ?? "").includes("no-store"),
  "Los tamaños inválidos deben responder sin cache persistente."
);

console.log(
  "Site app icon smoke: OK (metadata, manifest, favicon dinámico, PNG 32/64/180/192/512 y rechazo de tamaños no permitidos)."
);
