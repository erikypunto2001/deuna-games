import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { createRequire } from "node:module";
import { connect, createServer } from "node:net";
import path from "node:path";
import process from "node:process";
import { parseEnv } from "node:util";

const require = createRequire(import.meta.url);
const nextCli = require.resolve(
  "next/dist/bin/next"
);
const argumentsForNext = process.argv.slice(2);
const isDevelopment = argumentsForNext[0] === "dev";
const isProductionStart =
  argumentsForNext[0] === "start";
const MEDIA_ENV_KEYS = [
  "DEUNA_FFMPEG_PATH",
  "DEUNA_YTDLP_PATH",
  "DEUNA_YTDLP_BINARY",
  "DEUNA_YTDLP_JS_RUNTIME",
  "DEUNA_YTDLP_REMOTE_COMPONENT",
  "DEUNA_YTDLP_YOUTUBE_CLIENTS",
  "DEUNA_YTDLP_COOKIES_FILE",
  "DEUNA_YTDLP_PLUGIN_DIR",
  "DEUNA_YTDLP_POT_PROVIDER_URL",
  "DEUNA_YTDLP_DIAGNOSTICS",
  "DEUNA_MEDIA_IMPORT_WORKER_URL",
  "DEUNA_MEDIA_IMPORT_WORKER_TOKEN",
];

function standaloneStartConfig() {
  let hostname =
    process.env.HOSTNAME?.trim() ||
    "127.0.0.1";
  let port =
    process.env.PORT?.trim() ||
    "3000";

  for (
    let index = 1;
    index <
    argumentsForNext.length;
    index += 1
  ) {
    const argument =
      argumentsForNext[index];

    if (
      argument === "--hostname" ||
      argument === "-H"
    ) {
      const value =
        argumentsForNext[
          index + 1
        ]?.trim();
      if (!value) {
        throw new Error(
          "Falta el valor de --hostname."
        );
      }
      hostname = value;
      index += 1;
      continue;
    }

    if (
      argument === "--port" ||
      argument === "-p"
    ) {
      const value =
        argumentsForNext[
          index + 1
        ]?.trim();
      if (!value) {
        throw new Error(
          "Falta el valor de --port."
        );
      }
      port = value;
      index += 1;
      continue;
    }

    if (
      argument.startsWith(
        "--hostname="
      )
    ) {
      hostname =
        argument.slice(
          "--hostname=".length
        ).trim();
      continue;
    }

    if (
      argument.startsWith(
        "--port="
      )
    ) {
      port =
        argument.slice(
          "--port=".length
        ).trim();
      continue;
    }

    throw new Error(
      `Argumento no soportado por el runtime standalone: ${argument}`
    );
  }

  const portNumber =
    Number(port);
  if (
    !hostname ||
    !Number.isInteger(
      portNumber
    ) ||
    portNumber < 1 ||
    portNumber > 65_535
  ) {
    throw new Error(
      "HOSTNAME/PORT no son válidos para el runtime standalone."
    );
  }

  return {
    hostname,
    port:
      String(portNumber),
  };
}

function prepareStandaloneRuntime() {
  const standaloneRoot =
    path.resolve(
      ".next",
      "standalone"
    );
  const serverPath =
    path.join(
      standaloneRoot,
      "server.js"
    );
  const staticSource =
    path.resolve(
      ".next",
      "static"
    );
  const staticTarget =
    path.join(
      standaloneRoot,
      ".next",
      "static"
    );
  const publicSource =
    path.resolve("public");
  const publicTarget =
    path.join(
      standaloneRoot,
      "public"
    );

  if (
    !existsSync(serverPath) ||
    !existsSync(staticSource)
  ) {
    throw new Error(
      "Falta el runtime standalone. Ejecuta npm run build antes de npm run start."
    );
  }

  mkdirSync(
    path.dirname(
      staticTarget
    ),
    {
      recursive: true,
    }
  );

  rmSync(
    staticTarget,
    {
      recursive: true,
      force: true,
    }
  );
  cpSync(
    staticSource,
    staticTarget,
    {
      recursive: true,
    }
  );

  rmSync(
    publicTarget,
    {
      recursive: true,
      force: true,
    }
  );
  if (
    existsSync(
      publicSource
    )
  ) {
    cpSync(
      publicSource,
      publicTarget,
      {
        recursive: true,
      }
    );
  }

  return serverPath;
}

function developmentMediaEnvFromFiles() {
  if (!isDevelopment) return {};

  const result = {};
  const files = [
    ".env.development.local",
    ".env.local",
    ".env.development",
    ".env",
  ];

  for (const filename of files) {
    if (!existsSync(filename)) continue;

    let parsed;
    try {
      parsed = parseEnv(readFileSync(filename, "utf8"));
    } catch {
      continue;
    }

    for (const key of MEDIA_ENV_KEYS) {
      if (
        process.env[key] === undefined &&
        result[key] === undefined &&
        typeof parsed[key] === "string"
      ) {
        result[key] = parsed[key];
      }
    }
  }

  return result;
}

function mediaValue(key, fileEnvironment) {
  return process.env[key] ?? fileEnvironment[key] ?? "";
}

function mediaRuntimeEnvironment(fileEnvironment) {
  if (!isDevelopment || process.platform === "win32") {
    return {};
  }

  const wrapper = path.resolve(
    "ops/worker/yt-dlp-node-wrapper.sh"
  );

  if (!existsSync(wrapper)) return {};

  const configuredPath =
    mediaValue("DEUNA_YTDLP_PATH", fileEnvironment).trim();
  const configuredBinary =
    mediaValue("DEUNA_YTDLP_BINARY", fileEnvironment).trim();

  return {
    DEUNA_YTDLP_PATH: wrapper,
    ...(configuredBinary
      ? { DEUNA_YTDLP_BINARY: configuredBinary }
      : configuredPath && configuredPath !== wrapper
        ? { DEUNA_YTDLP_BINARY: configuredPath }
        : {}),
  };
}

function configuredDevelopmentWorker(fileEnvironment) {
  const raw = mediaValue(
    "DEUNA_MEDIA_IMPORT_WORKER_URL",
    fileEnvironment
  ).trim();
  if (!raw) return null;

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      "DEUNA_MEDIA_IMPORT_WORKER_URL no es una URL válida."
    );
  }

  const loopback = [
    "127.0.0.1",
    "localhost",
    "[::1]",
    "::1",
  ].includes(url.hostname);
  if (
    url.protocol !== "http:" ||
    !loopback ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "El worker multimedia de desarrollo debe usar HTTP sobre loopback sin credenciales, query ni fragmento."
    );
  }

  const token = mediaValue(
    "DEUNA_MEDIA_IMPORT_WORKER_TOKEN",
    fileEnvironment
  ).trim();
  if (token.length < 32 || token.length > 256) {
    throw new Error(
      "DEUNA_MEDIA_IMPORT_WORKER_TOKEN debe tener entre 32 y 256 caracteres."
    );
  }

  return {
    DEUNA_MEDIA_IMPORT_WORKER_URL: url.toString(),
    DEUNA_MEDIA_IMPORT_WORKER_TOKEN: token,
  };
}

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port =
        address && typeof address === "object"
          ? address.port
          : 0;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (!Number.isInteger(port) || port <= 0) {
          reject(new Error(
            "No se pudo reservar un puerto loopback para el worker multimedia."
          ));
          return;
        }
        resolve(port);
      });
    });
  });
}

function waitForWorker(child, port) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 5_000;
    let settled = false;

    const finish = (error) => {
      if (settled) return;
      settled = true;
      child.removeListener("exit", onExit);
      if (error) reject(error);
      else resolve();
    };

    const onExit = (code) => {
      finish(new Error(
        `El worker multimedia local terminó antes de iniciar${code === null ? "" : ` (código ${code})`}.`
      ));
    };

    const attempt = () => {
      if (settled) return;
      const socket = connect({
        host: "127.0.0.1",
        port,
      });
      socket.once("connect", () => {
        socket.end();
        finish(null);
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() >= deadline) {
          finish(new Error(
            "El worker multimedia local no respondió en loopback."
          ));
          return;
        }
        setTimeout(attempt, 75);
      });
    };

    child.once("exit", onExit);
    attempt();
  });
}

function stopChild(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  try {
    child.kill();
  } catch {}
}

async function startAutomaticDevelopmentWorker(
  fileEnvironment,
  runtimeEnvironment
) {
  const workerScript = path.resolve(
    "ops/worker/media-import-worker.mjs"
  );
  if (!existsSync(workerScript)) {
    throw new Error(
      "Falta ops/worker/media-import-worker.mjs; no se puede habilitar streaming parcial en desarrollo."
    );
  }

  const port = await reserveLoopbackPort();
  const token = randomBytes(32).toString("hex");
  const workerEnvironment = {
    ...fileEnvironment,
    ...process.env,
    ...runtimeEnvironment,
    NODE_ENV: "development",
    DEUNA_MEDIA_IMPORT_WORKER_PORT: String(port),
    DEUNA_MEDIA_IMPORT_WORKER_TOKEN: token,
  };
  const child = spawn(
    process.execPath,
    [workerScript],
    {
      stdio: "inherit",
      windowsHide: true,
      env: workerEnvironment,
    }
  );

  await waitForWorker(child, port);

  return {
    child,
    nextEnvironment: {
      DEUNA_MEDIA_IMPORT_WORKER_URL:
        `http://127.0.0.1:${port}`,
      DEUNA_MEDIA_IMPORT_WORKER_TOKEN: token,
    },
  };
}

async function main() {
  if (argumentsForNext.length === 0) {
    throw new Error(
      "Falta indicar el comando de Next.js."
    );
  }

  const fileEnvironment = developmentMediaEnvFromFiles();
  const runtimeEnvironment =
    mediaRuntimeEnvironment(fileEnvironment);
  let worker = null;
  let workerEnvironment = {};

  if (isDevelopment) {
    const configured =
      configuredDevelopmentWorker(fileEnvironment);
    if (configured) {
      workerEnvironment = configured;
    } else {
      const automatic =
        await startAutomaticDevelopmentWorker(
          fileEnvironment,
          runtimeEnvironment
        );
      worker = automatic.child;
      workerEnvironment = automatic.nextEnvironment;
      console.log(
        "Media worker local: streaming parcial habilitado sobre loopback."
      );
    }
  }

  const startConfig =
    isProductionStart
      ? standaloneStartConfig()
      : null;
  const standaloneServer =
    isProductionStart
      ? prepareStandaloneRuntime()
      : null;
  const childArguments =
    standaloneServer
      ? [standaloneServer]
      : [
          nextCli,
          ...argumentsForNext,
        ];

  const child = spawn(
    process.execPath,
    childArguments,
    {
      stdio: "inherit",
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...runtimeEnvironment,
        ...workerEnvironment,
        ...(startConfig
          ? {
              NODE_ENV:
                "production",
              HOSTNAME:
                startConfig.hostname,
              PORT:
                startConfig.port,
            }
          : {}),
        NEXT_TELEMETRY_DISABLED: "1",
      },
    }
  );

  let shuttingDown = false;

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopChild(child);
    stopChild(worker);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  child.once("error", () => {
    shuttingDown = true;
    stopChild(worker);
    console.error(
      "No se pudo iniciar Next.js."
    );
    process.exitCode = 1;
  });

  child.once("exit", (code) => {
    shuttingDown = true;
    stopChild(worker);
    process.exitCode = code ?? 1;
  });

  if (worker) {
    worker.once("exit", (code) => {
      if (shuttingDown || child.exitCode !== null || child.killed) return;
      shuttingDown = true;
      console.error(
        `El worker multimedia local se detuvo inesperadamente${code === null ? "" : ` (código ${code})`}.`
      );
      stopChild(child);
      process.exitCode = 1;
    });
  }
}

void main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "No se pudo preparar el launcher de Next.js."
  );
  process.exitCode = 1;
});
