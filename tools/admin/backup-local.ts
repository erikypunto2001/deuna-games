import {
  chmodSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Falta configurar ${name}.`);
  }

  return value;
}

function timestamp() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z")
    .replace("T", "-");
}

const MAX_LOCAL_BACKUPS = 3;
const LOCAL_BACKUP_PATTERN = /^deuna-games-pre-migration-\d{8}-\d{6}Z\.dump$/;

function pruneOldLocalBackups(directory: string) {
  const backups = readdirSync(directory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        LOCAL_BACKUP_PATTERN.test(entry.name)
    )
    .map((entry) => entry.name)
    .sort()
    .reverse();

  const stale = backups.slice(MAX_LOCAL_BACKUPS);
  for (const file of stale) {
    rmSync(path.join(directory, file), { force: true });
  }

  return stale.length;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const host = requiredEnvironment("DEUNA_DATABASE_HOST");
const port = requiredEnvironment("DEUNA_DATABASE_PORT");
const database = requiredEnvironment("DEUNA_DATABASE_NAME");
const user = requiredEnvironment("DEUNA_DATABASE_MIGRATION_USER");
const password = requiredEnvironment("DEUNA_DATABASE_MIGRATION_PASSWORD");

const backupDirectory = path.join(
  homedir(),
  ".deuna",
  "backups"
);
mkdirSync(backupDirectory, {
  recursive: true,
  mode: 0o700,
});
chmodSync(backupDirectory, 0o700);

const backupPath = path.join(
  backupDirectory,
  `deuna-games-pre-migration-${timestamp()}.dump`
);

const dump = spawnSync(
  "pg_dump",
  [
    `--host=${host}`,
    `--port=${port}`,
    `--username=${user}`,
    `--dbname=${database}`,
    "--format=custom",
    "--no-owner",
    "--no-acl",
    `--file=${backupPath}`,
  ],
  {
    env: {
      ...process.env,
      PGPASSWORD: password,
    },
    encoding: "utf8",
  }
);

if (dump.error && "code" in dump.error && dump.error.code === "ENOENT") {
  rmSync(backupPath, { force: true });
  fail(
    "Backup local: BLOQUEADO. No se encontró pg_dump en PATH. Instala las herramientas cliente de PostgreSQL antes de migrar."
  );
}

if (dump.status !== 0) {
  rmSync(backupPath, { force: true });
  fail(
    "Backup local: BLOQUEADO. pg_dump no pudo crear una copia válida. Revisa PostgreSQL y las credenciales privadas del migrador."
  );
}

chmodSync(backupPath, 0o600);

const size = statSync(backupPath).size;
if (size < 256) {
  rmSync(backupPath, { force: true });
  fail(
    "Backup local: BLOQUEADO. El archivo generado es demasiado pequeño para considerarse una copia válida."
  );
}

const verify = spawnSync(
  "pg_restore",
  ["--list", backupPath],
  {
    encoding: "utf8",
  }
);

if (verify.error && "code" in verify.error && verify.error.code === "ENOENT") {
  rmSync(backupPath, { force: true });
  fail(
    "Backup local: BLOQUEADO. No se encontró pg_restore en PATH para verificar la copia."
  );
}

if (verify.status !== 0 || !verify.stdout?.trim()) {
  rmSync(backupPath, { force: true });
  fail(
    "Backup local: BLOQUEADO. pg_restore no pudo verificar el archivo generado."
  );
}

const prunedBackups = pruneOldLocalBackups(backupDirectory);

console.log("Backup local PostgreSQL: OK");
console.log(`Copia verificada: ${backupPath}`);
console.log(
  `Retención local: ${MAX_LOCAL_BACKUPS} backups; eliminados=${prunedBackups}.`
);
console.log(`Tamaño: ${size} bytes`);
console.log(
  "La copia está fuera del repositorio y con permisos 0600. No la subas a Git ni la compartas sin cifrar."
);
