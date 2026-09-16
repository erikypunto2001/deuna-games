#!/usr/bin/env bash
set -euo pipefail

if [[
  "${CI:-}" != "true" ||
  "${GITHUB_ACTIONS:-}" != "true" ||
  -z "${GITHUB_ENV:-}"
]]; then
  echo "Card video visual runtime smoke: omitido fuera de GitHub Actions."
  exit 0
fi

if [[
  -z "${DEUNA_VISUAL_APP_PID:-}" ||
  -z "${DEUNA_VISUAL_BASE_URL:-}" ||
  -z "${DEUNA_EDITORIAL_MEDIA_ROOT:-}" ||
  -z "${RUNNER_TEMP:-}"
]]; then
  echo "Falta el runtime visual aislado antes de preparar el fixture Card video." >&2
  exit 1
fi

export NODE_ENV=production
export HOSTNAME=127.0.0.1
export PORT=3000
export DEUNA_CARD_VIDEO_VISUAL_FIXTURE=1

npm run visual:card-video-fixture
npm run visual:home-row-static-detail-fixture

kill "$DEUNA_VISUAL_APP_PID" 2>/dev/null || true
for _ in $(seq 1 50); do
  if ! kill -0 "$DEUNA_VISUAL_APP_PID" 2>/dev/null; then
    break
  fi
  sleep 0.1
done

if kill -0 "$DEUNA_VISUAL_APP_PID" 2>/dev/null; then
  echo "::error::El runtime visual anterior no se detuvo antes de activar el fixture Card video."
  exit 1
fi

node .next/standalone/server.js >> "$RUNNER_TEMP/deuna-visual-standalone.log" 2>&1 &
app_pid=$!
printf 'DEUNA_VISUAL_APP_PID=%s\n' "$app_pid" >> "$GITHUB_ENV"

for _ in $(seq 1 90); do
  if curl --insecure --fail --silent --show-error "$DEUNA_VISUAL_BASE_URL/" > /dev/null; then
    npm run visual:card-video-browser
    npm run visual:home-row-static-detail-browser
    exit 0
  fi

  if ! kill -0 "$app_pid" 2>/dev/null; then
    cat "$RUNNER_TEMP/deuna-visual-standalone.log"
    exit 1
  fi

  sleep 1
done

cat "$RUNNER_TEMP/deuna-visual-standalone.log"
echo "::error::El runtime visual no reinició para los fixtures de Card video/Home static detail."
exit 1