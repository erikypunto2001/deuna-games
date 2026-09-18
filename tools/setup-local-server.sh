#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'
umask 077

readonly PROJECT_ROOT="$(
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
  pwd -P
)"
readonly MIGRATION_ENV="${PROJECT_ROOT}/.env.admin-migration.local"
readonly RUNTIME_ENV="${PROJECT_ROOT}/.env.local"

declare -a temporary_files=()
new_private_path=""
migration_password=""
runtime_password=""
account_data_key=""

cleanup() {
  migration_password=""
  runtime_password=""
  account_data_key=""
  unset \
    PGPASSWORD \
    DEUNA_SETUP_MIGRATION_PASSWORD \
    DEUNA_SETUP_RUNTIME_PASSWORD \
    DEUNA_SETUP_ACCOUNT_DATA_KEY

  local temporary_file
  for temporary_file in "${temporary_files[@]}"; do
    rm -f -- "${temporary_file}"
  done
}

clear_inherited_environment() {
  unset \
    NODE_ENV \
    NODE_OPTIONS \
    NEXT_PUBLIC_SITE_URL \
    DEUNA_ADMIN_ENABLED \
    DEUNA_ADMIN_SESSION_HOURS \
    DEUNA_ADMIN_ORIGIN \
    DEUNA_ADMIN_OWNER_USERNAME \
    DEUNA_ADMIN_OWNER_PASSWORD \
    DEUNA_ACCOUNT_SESSION_DAYS \
    DEUNA_ACCOUNT_DATA_KEY \
    DEUNA_ACCOUNT_REGISTRATION_ENABLED \
    DEUNA_DATABASE_HOST \
    DEUNA_DATABASE_PORT \
    DEUNA_DATABASE_NAME \
    DEUNA_DATABASE_USER \
    DEUNA_DATABASE_PASSWORD \
    DEUNA_DATABASE_SSL \
    DEUNA_DATABASE_MIGRATION_USER \
    DEUNA_DATABASE_MIGRATION_PASSWORD \
    PGHOST \
    PGPORT \
    PGUSER \
    PGDATABASE \
    PGPASSWORD \
    PGPASSFILE \
    PGSERVICE \
    PGOPTIONS
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

say() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf '\nERROR: %s\n' "$1" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 ||
    fail "Falta el comando requerido: $1"
}

read_env_value() {
  local file="$1"
  local key="$2"

  awk -v key="${key}" '
    index($0, key "=") == 1 {
      print substr($0, length(key) + 2)
      exit
    }
  ' "${file}"
}

env_has_key() {
  local file="$1"
  local key="$2"

  awk -v key="${key}" '
    index($0, key "=") == 1 {
      found = 1
      exit
    }
    END {
      exit found ? 0 : 1
    }
  ' "${file}"
}

require_env_value() {
  local file="$1"
  local key="$2"
  local expected="$3"
  local actual

  actual="$(read_env_value "${file}" "${key}")"
  [[ "${actual}" == "${expected}" ]] ||
    fail "${file} no tiene el valor local seguro esperado para ${key}."
}

require_generated_password() {
  local password="$1"
  local file="$2"

  [[ "${password}" =~ ^[0-9a-f]{64}$ ]] ||
    fail "${file} no contiene una credencial generada válida. No se modificó la base."
}

require_account_data_key() {
  local key="$1"
  local file="$2"

  [[ "${key}" =~ ^[A-Za-z0-9_-]{43}$ ]] ||
    fail "${file} no contiene una DEUNA_ACCOUNT_DATA_KEY base64url válida de 32 bytes."

  DEUNA_SETUP_ACCOUNT_DATA_KEY="${key}" node -e '
    const raw = process.env.DEUNA_SETUP_ACCOUNT_DATA_KEY ?? "";
    const decoded = Buffer.from(raw, "base64url");
    if (decoded.length !== 32 || decoded.toString("base64url") !== raw) {
      process.exit(1);
    }
  ' || fail "${file} no contiene una DEUNA_ACCOUNT_DATA_KEY canónica de 32 bytes."
}

new_private_file() {
  local target="$1"

  new_private_path="$(mktemp "${target}.tmp.XXXXXX")"
  temporary_files+=("${new_private_path}")
  chmod 600 -- "${new_private_path}"
}

write_migration_environment() {
  local temporary_file
  new_private_file "${MIGRATION_ENV}"
  temporary_file="${new_private_path}"

  {
    printf '%s\n' '# Generado localmente por tools/setup-local-server.sh.'
    printf '%s\n' '# Privado: no versionar ni compartir.'
    printf '%s\n' 'NODE_ENV=production'
    printf '%s\n' 'DEUNA_DATABASE_HOST=127.0.0.1'
    printf '%s\n' 'DEUNA_DATABASE_PORT=5432'
    printf '%s\n' 'DEUNA_DATABASE_NAME=deuna_games'
    printf '%s\n' 'DEUNA_DATABASE_SSL=false'
    printf '%s\n' 'DEUNA_DATABASE_USER=deuna_runtime'
    printf '%s\n' 'DEUNA_DATABASE_MIGRATION_USER=deuna_migrator'
    printf 'DEUNA_DATABASE_MIGRATION_PASSWORD=%s\n' "${migration_password}"
  } >"${temporary_file}"

  mv -- "${temporary_file}" "${MIGRATION_ENV}"
  chmod 600 -- "${MIGRATION_ENV}"
}

write_runtime_environment() {
  local temporary_file
  new_private_file "${RUNTIME_ENV}"
  temporary_file="${new_private_path}"

  {
    printf '%s\n' '# Generado localmente por tools/setup-local-server.sh.'
    printf '%s\n' '# Privado: no versionar ni compartir.'
    printf '%s\n' 'NEXT_TELEMETRY_DISABLED=1'
    printf '%s\n' 'NEXT_PUBLIC_SITE_URL=http://localhost:3000'
    printf '%s\n' 'DEUNA_ADMIN_ENABLED=true'
    printf '%s\n' 'DEUNA_ADMIN_SESSION_HOURS=8'
    printf '%s\n' 'DEUNA_ADMIN_ORIGIN=http://localhost:3000'
    printf '%s\n' 'DEUNA_ACCOUNT_SESSION_DAYS=30'
    printf 'DEUNA_ACCOUNT_DATA_KEY=%s\n' "${account_data_key}"
    printf '%s\n' 'DEUNA_ACCOUNT_REGISTRATION_ENABLED=auto'
    printf '%s\n' 'DEUNA_DATABASE_HOST=127.0.0.1'
    printf '%s\n' 'DEUNA_DATABASE_PORT=5432'
    printf '%s\n' 'DEUNA_DATABASE_NAME=deuna_games'
    printf '%s\n' 'DEUNA_DATABASE_USER=deuna_runtime'
    printf 'DEUNA_DATABASE_PASSWORD=%s\n' "${runtime_password}"
    printf '%s\n' 'DEUNA_DATABASE_SSL=false'
  } >"${temporary_file}"

  mv -- "${temporary_file}" "${RUNTIME_ENV}"
  chmod 600 -- "${RUNTIME_ENV}"
}

append_runtime_env_value() {
  local key="$1"
  local value="$2"

  if env_has_key "${RUNTIME_ENV}" "${key}"; then
    fail "${RUNTIME_ENV} contiene ${key} vacío. Corrige ese valor antes de continuar."
  fi

  printf '%s=%s\n' "${key}" "${value}" >>"${RUNTIME_ENV}"
  chmod 600 -- "${RUNTIME_ENV}"
}

ensure_runtime_account_environment() {
  [[ -f "${RUNTIME_ENV}" && ! -L "${RUNTIME_ENV}" ]] ||
    fail "${RUNTIME_ENV} debe ser un archivo regular y no un enlace."
  [[ -O "${RUNTIME_ENV}" ]] ||
    fail "${RUNTIME_ENV} debe pertenecer al usuario actual."

  local value

  value="$(read_env_value "${RUNTIME_ENV}" DEUNA_ACCOUNT_SESSION_DAYS)"
  if [[ -z "${value}" ]]; then
    append_runtime_env_value DEUNA_ACCOUNT_SESSION_DAYS 30
  fi

  value="$(read_env_value "${RUNTIME_ENV}" DEUNA_ACCOUNT_DATA_KEY)"
  if [[ -z "${value}" ]]; then
    account_data_key="$(
      node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url"))'
    )"
    append_runtime_env_value DEUNA_ACCOUNT_DATA_KEY "${account_data_key}"
  fi

  value="$(read_env_value "${RUNTIME_ENV}" DEUNA_ACCOUNT_REGISTRATION_ENABLED)"
  if [[ -z "${value}" ]]; then
    append_runtime_env_value DEUNA_ACCOUNT_REGISTRATION_ENABLED auto
  fi
}

validate_migration_environment() {
  [[ -f "${MIGRATION_ENV}" && ! -L "${MIGRATION_ENV}" ]] ||
    fail "${MIGRATION_ENV} debe ser un archivo regular y no un enlace."
  [[ -O "${MIGRATION_ENV}" ]] ||
    fail "${MIGRATION_ENV} debe pertenecer al usuario actual."

  require_env_value "${MIGRATION_ENV}" NODE_ENV production
  require_env_value "${MIGRATION_ENV}" DEUNA_DATABASE_HOST 127.0.0.1
  require_env_value "${MIGRATION_ENV}" DEUNA_DATABASE_PORT 5432
  require_env_value "${MIGRATION_ENV}" DEUNA_DATABASE_NAME deuna_games
  require_env_value "${MIGRATION_ENV}" DEUNA_DATABASE_SSL false
  require_env_value "${MIGRATION_ENV}" DEUNA_DATABASE_USER deuna_runtime
  require_env_value "${MIGRATION_ENV}" DEUNA_DATABASE_MIGRATION_USER deuna_migrator

  migration_password="$(
    read_env_value "${MIGRATION_ENV}" DEUNA_DATABASE_MIGRATION_PASSWORD
  )"
  require_generated_password "${migration_password}" "${MIGRATION_ENV}"
  chmod 600 -- "${MIGRATION_ENV}"
}

validate_runtime_environment() {
  [[ -f "${RUNTIME_ENV}" && ! -L "${RUNTIME_ENV}" ]] ||
    fail "${RUNTIME_ENV} debe ser un archivo regular y no un enlace."
  [[ -O "${RUNTIME_ENV}" ]] ||
    fail "${RUNTIME_ENV} debe pertenecer al usuario actual."

  require_env_value "${RUNTIME_ENV}" NEXT_TELEMETRY_DISABLED 1
  require_env_value "${RUNTIME_ENV}" NEXT_PUBLIC_SITE_URL http://localhost:3000
  require_env_value "${RUNTIME_ENV}" DEUNA_ADMIN_ENABLED true
  require_env_value "${RUNTIME_ENV}" DEUNA_ADMIN_SESSION_HOURS 8
  require_env_value "${RUNTIME_ENV}" DEUNA_ADMIN_ORIGIN http://localhost:3000
  require_env_value "${RUNTIME_ENV}" DEUNA_DATABASE_HOST 127.0.0.1
  require_env_value "${RUNTIME_ENV}" DEUNA_DATABASE_PORT 5432
  require_env_value "${RUNTIME_ENV}" DEUNA_DATABASE_NAME deuna_games
  require_env_value "${RUNTIME_ENV}" DEUNA_DATABASE_USER deuna_runtime
  require_env_value "${RUNTIME_ENV}" DEUNA_DATABASE_SSL false

  runtime_password="$(
    read_env_value "${RUNTIME_ENV}" DEUNA_DATABASE_PASSWORD
  )"
  require_generated_password "${runtime_password}" "${RUNTIME_ENV}"

  account_data_key="$(
    read_env_value "${RUNTIME_ENV}" DEUNA_ACCOUNT_DATA_KEY
  )"
  require_account_data_key "${account_data_key}" "${RUNTIME_ENV}"

  local account_session_days
  account_session_days="$(
    read_env_value "${RUNTIME_ENV}" DEUNA_ACCOUNT_SESSION_DAYS
  )"
  [[ "${account_session_days}" =~ ^[0-9]+$ ]] &&
    (( account_session_days >= 1 && account_session_days <= 90 )) ||
    fail "${RUNTIME_ENV} debe configurar DEUNA_ACCOUNT_SESSION_DAYS entre 1 y 90."

  chmod 600 -- "${RUNTIME_ENV}"
}

check_listen_addresses() {
  local configured="$1"
  local normalized="${configured//[[:space:]]/}"
  local address
  local -a addresses=()

  IFS=',' read -r -a addresses <<<"${normalized}"

  for address in "${addresses[@]}"; do
    case "${address}" in
      localhost|127.0.0.1|::1) ;;
      *)
        fail "PostgreSQL escucha en '${address}'. Debe escuchar sólo en localhost."
        ;;
    esac
  done
}

if [[ "$-" == *x* ]]; then
  fail "No ejecutes este instalador con bash -x: podría mostrar secretos."
fi

[[ "${EUID}" -ne 0 ]] ||
  fail "Ejecuta el instalador como tu usuario normal, no como root."
[[ "$(uname -s)" == "Linux" ]] ||
  fail "Este instalador local requiere Linux o Ubuntu dentro de WSL2."

case "${PROJECT_ROOT}" in
  /mnt/*)
    fail "Mueve el repositorio al sistema Linux, por ejemplo a ~/projects/deuna-games."
    ;;
esac

cd -- "${PROJECT_ROOT}"
[[ -f package.json && -f package-lock.json ]] ||
  fail "No se encontró la raíz de DeUna Games."

clear_inherited_environment

for required in awk git node npm openssl pg_isready psql sudo systemctl; do
  require_command "${required}"
done

node_major="$(node -p 'process.versions.node.split(".")[0]')"
[[ "${node_major}" =~ ^[0-9]+$ ]] ||
  fail "No se pudo identificar la versión de Node.js."
(( node_major >= 24 )) ||
  fail "DeUna Games requiere Node.js 24 o superior."

git check-ignore -q -- .env.local ||
  fail ".env.local debe permanecer ignorado por Git."
git check-ignore -q -- .env.admin-migration.local ||
  fail ".env.admin-migration.local debe permanecer ignorado por Git."

export NEXT_TELEMETRY_DISABLED=1
export npm_config_update_notifier=false

say "Verificando PostgreSQL privado"
printf '%s\n' 'Si sudo pide contraseña, escríbela normalmente aunque no se vea.'
sudo -v

if ! pg_isready -q -h 127.0.0.1 -p 5432; then
  sudo systemctl start postgresql
fi

pg_isready -q -h 127.0.0.1 -p 5432 ||
  fail "PostgreSQL no responde en 127.0.0.1:5432."

postgres_version="$(
  sudo -u postgres psql -X -Atqc 'SHOW server_version' postgres
)"
postgres_major="${postgres_version%%.*}"
[[ "${postgres_major}" =~ ^[0-9]+$ ]] ||
  fail "No se pudo identificar la versión de PostgreSQL."
(( postgres_major >= 18 )) ||
  fail "DeUna Games requiere PostgreSQL 18 o superior para esta instalación."

data_checksums="$(
  sudo -u postgres psql -X -Atqc 'SHOW data_checksums' postgres
)"
[[ "${data_checksums}" == "on" ]] ||
  fail "PostgreSQL debe tener data_checksums=on."

listen_addresses="$(
  sudo -u postgres psql -X -Atqc 'SHOW listen_addresses' postgres
)"
check_listen_addresses "${listen_addresses}"

say "Instalando dependencias reproducibles"
npm ci \
  --no-audit \
  --no-fund \
  --ignore-scripts=false \
  --registry=https://registry.npmjs.org/

say "Preparando archivos privados"
if [[ -e "${MIGRATION_ENV}" ]]; then
  validate_migration_environment
else
  migration_password="$(openssl rand -hex 32)"
  write_migration_environment
  validate_migration_environment
fi

if [[ -e "${RUNTIME_ENV}" ]]; then
  ensure_runtime_account_environment
  validate_runtime_environment
else
  runtime_password="$(openssl rand -hex 32)"
  account_data_key="$(
    node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64url"))'
  )"
  write_runtime_environment
  validate_runtime_environment
fi

say "Creando roles mínimos y base administrativa"
sudo -u postgres psql -X --set=ON_ERROR_STOP=1 --dbname=postgres <<SQL
SET password_encryption = 'scram-sha-256';

SELECT 'CREATE ROLE deuna_migrator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS'
WHERE NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = 'deuna_migrator'
) \gexec

SELECT 'CREATE ROLE deuna_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS'
WHERE NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = 'deuna_runtime'
) \gexec

ALTER ROLE deuna_migrator
  LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  PASSWORD '${migration_password}';
ALTER ROLE deuna_runtime
  LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  PASSWORD '${runtime_password}';

SELECT 'CREATE DATABASE deuna_games OWNER deuna_migrator ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (
  SELECT 1 FROM pg_database WHERE datname = 'deuna_games'
) \gexec

ALTER DATABASE deuna_games OWNER TO deuna_migrator;
REVOKE ALL ON DATABASE deuna_games FROM PUBLIC;
GRANT CONNECT ON DATABASE deuna_games TO deuna_migrator, deuna_runtime;
SQL

sudo -u postgres psql -X --set=ON_ERROR_STOP=1 --dbname=deuna_games <<'SQL'
REVOKE ALL ON SCHEMA public FROM PUBLIC;
SQL

say "Aplicando migraciones y contenido editorial"
npm run db:migrate
npm run admin:import-content
npm run admin:purge-junk

owner_count="$(
  PGPASSWORD="${migration_password}" \
    psql \
      -X \
      -h 127.0.0.1 \
      -p 5432 \
      -U deuna_migrator \
      -d deuna_games \
      -Atqc 'SELECT count(*) FROM deuna_admin.admin_users WHERE active = true'
)"

case "${owner_count}" in
  0)
    say "Creando la única cuenta propietaria"
    printf '%s\n' 'La contraseña debe tener al menos 16 caracteres, una letra, un número y un símbolo.'
    printf '%s\n' 'Cuando la escribas no aparecerán letras, puntos ni asteriscos. Es normal.'
    npm run admin:create-owner
    ;;
  1)
    say "La cuenta propietaria ya existe; no se modificó"
    ;;
  *)
    fail "La base contiene más de una cuenta propietaria activa."
    ;;
esac

say "Ejecutando controles de privacidad y privilegios"
npm run check:privacy
npm run check:admin-security
npm run admin:preflight:migration
npm run admin:preflight:local

NODE_ENV=production \
NEXT_PUBLIC_SITE_URL=https://localhost \
DEUNA_ADMIN_ENABLED=false \
DEUNA_ADMIN_ORIGIN=https://localhost \
  node --env-file="${RUNTIME_ENV}" ./tools/admin/preflight.ts --purpose=runtime

npm run audit:deps

say "Servidor local preparado"
printf '%s\n' 'Inicia la web con: npm run dev'
printf '%s\n' 'Web:   http://localhost:3000'
printf '%s\n' 'Panel: http://localhost:3000/admin'
printf '%s\n' 'No uses npm run lan mientras el panel local esté habilitado.'