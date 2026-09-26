import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(
  await readFile("package.json", "utf8")
);
const launcher = await readFile(
  "tools/run-lan.mjs",
  "utf8"
);
const secureLauncher = await readFile(
  "tools/run-lan-https.mjs",
  "utf8"
);
const secureSetup = await readFile(
  "tools/setup-lan-https.mjs",
  "utf8"
);
const nextRunner = await readFile(
  "tools/run-next.mjs",
  "utf8"
);
const nextConfig = await readFile(
  "next.config.ts",
  "utf8"
);
const sessionSource = await readFile(
  "src/lib/admin/session.ts",
  "utf8"
);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  packageJson.scripts?.lan ===
    "node ./tools/run-lan.mjs",
  "npm run lan debe usar el launcher LAN dedicado."
);
assert(
  packageJson.scripts?.mobile ===
    "npm run lan",
  "npm run mobile debe delegar en el modo LAN seguro."
);
assert(
  packageJson.scripts?.["mobile:secure:setup"] ===
    "node ./tools/setup-lan-https.mjs",
  "mobile:secure:setup debe preparar certificados locales."
);
assert(
  packageJson.scripts?.["mobile:secure"] ===
    "node ./tools/run-lan-https.mjs",
  "mobile:secure debe usar el launcher HTTPS LAN dedicado."
);

for (const required of [
  "DEUNA_LAN_HOST",
  "DEUNA_LAN_ORIGIN",
  "NEXT_PUBLIC_SITE_URL",
  '"--hostname"',
  '"0.0.0.0"',
]) {
  assert(
    launcher.includes(required),
    `El launcher LAN perdió una garantía requerida: ${required}`
  );
}

assert(
  launcher.includes("isPrivateIpv4"),
  "El launcher LAN debe limitar el host detectado a una IPv4 privada."
);
assert(
  !launcher.includes("DEUNA_ADMIN_ORIGIN:"),
  "El modo LAN HTTP no debe ampliar ni sobrescribir DEUNA_ADMIN_ORIGIN."
);
assert(
  nextConfig.includes("allowedDevOrigins"),
  "Next debe declarar allowedDevOrigins para el host LAN confiable."
);
assert(
  nextConfig.includes("DEUNA_LAN_HOST"),
  "allowedDevOrigins debe derivarse del host LAN detectado en runtime."
);
assert(
  nextConfig.includes("isPrivateIpv4(lanHost)"),
  "Next sólo debe aceptar el origen de desarrollo si es una IPv4 privada."
);

for (const required of [
  "isPrivateIpv4",
  "DEUNA_LAN_SECURE_MODE",
  "NEXT_PUBLIC_SITE_URL",
  "DEUNA_ADMIN_ORIGIN",
  "DEUNA_ADMIN_ENABLED",
  '"--experimental-https"',
  '"--experimental-https-key"',
  '"--experimental-https-cert"',
  '"--experimental-https-ca"',
]) {
  assert(
    secureLauncher.includes(required),
    `El launcher HTTPS LAN perdió una garantía requerida: ${required}`
  );
}

assert(
  secureLauncher.includes(
    "DEUNA_ADMIN_ORIGIN: origin"
  ),
  "El admin LAN HTTPS debe fijar exactamente el origen privado detectado."
);
assert(
  secureLauncher.includes(
    'DEUNA_ADMIN_ENABLED: "true"'
  ),
  "El modo HTTPS LAN debe habilitar explícitamente el admin para esa ejecución."
);
assert(
  secureLauncher.includes(
    "certificateSupportsHost(lanHost)"
  ),
  "El launcher HTTPS debe comprobar que el certificado cubre la IP LAN actual."
);
assert(
  secureSetup.includes(
    "subjectAltName = @alt_names"
  ) &&
    secureSetup.includes(
      "IP.2 = ${lanHost}"
    ),
  "El certificado HTTPS LAN debe contener la IPv4 privada como SAN."
);
assert(
  secureSetup.includes(
    "deuna-games-lan-ca.key"
  ) &&
    secureSetup.includes(
      "deuna-games-lan-ca.cer"
    ),
  "La preparación HTTPS debe separar la CA privada del certificado público instalable."
);
assert(
  sessionSource.includes(
    "adminSessionUsesSecureTransport"
  ) &&
    sessionSource.includes(
      'new URL(configured).protocol === "https:"'
    ),
  "La cookie administrativa debe marcarse Secure también en HTTPS LAN de desarrollo."
);

assert(
  nextRunner.includes("prepareStandaloneRuntime") &&
    nextRunner.includes('".next"') &&
    nextRunner.includes('"standalone"') &&
    nextRunner.includes('"server.js"') &&
    nextRunner.includes("cpSync(") &&
    nextRunner.includes('"static"') &&
    nextRunner.includes('"public"') &&
    nextRunner.includes("standaloneStartConfig") &&
    nextRunner.includes('NODE_ENV:') &&
    nextRunner.includes('"production"'),
  "npm run start debe usar el runtime standalone soportado y preparar assets estáticos antes de arrancar."
);
assert(
  !nextRunner.includes('[nextCli, ...argumentsForNext]') ||
    nextRunner.includes("standaloneServer"),
  "El modo start no debe depender de next start cuando output=standalone."
);

assert(
  nextRunner.includes("startAutomaticDevelopmentWorker") &&
    nextRunner.includes("reserveLoopbackPort") &&
    nextRunner.includes('randomBytes(32).toString("hex")') &&
    nextRunner.includes("ops/worker/media-import-worker.mjs") &&
    nextRunner.includes("DEUNA_MEDIA_IMPORT_WORKER_URL") &&
    nextRunner.includes("DEUNA_MEDIA_IMPORT_WORKER_TOKEN"),
  "El launcher de desarrollo debe levantar automáticamente un worker multimedia efímero sobre loopback para habilitar lazy preview."
);
assert(
  nextRunner.includes("developmentMediaEnvFromFiles") &&
    nextRunner.includes('".env.development.local"') &&
    nextRunner.includes('".env.local"') &&
    nextRunner.includes("configuredDevelopmentWorker"),
  "El launcher debe respetar una configuración multimedia explícita antes de crear el worker automático."
);
assert(
  nextRunner.includes('process.once("SIGINT", shutdown)') &&
    nextRunner.includes('process.once("SIGTERM", shutdown)') &&
    nextRunner.includes("stopChild(worker)"),
  "El worker multimedia de desarrollo debe apagarse junto con Next y no quedar huérfano."
);
assert(
  !nextRunner.includes("console.log(token") &&
    !nextRunner.includes("console.error(token"),
  "El token efímero del worker local nunca debe imprimirse en consola."
);

console.log(
  "LAN mode invariants: OK (HTTP público conservador + HTTPS LAN con admin, certificado privado, cookie Secure y worker multimedia lazy efímero en desarrollo)."
);
