#!/usr/bin/env bash
# PEAC reference-verifier end-to-end smoke test.
#
# Builds the Docker image, brings up the compose stack, waits for the health
# endpoint, posts a known bad payload to /v1/verify (must return an RFC 9457
# Problem Details response), and brings the stack down.

set -euo pipefail

cd "$(dirname "$0")"

log() {
  printf '[smoke] %s\n' "$1"
}

cleanup() {
  log 'bringing stack down'
  docker compose down --remove-orphans || true
}
trap cleanup EXIT

log 'building image'
docker compose build --quiet

log 'starting stack'
docker compose up -d

log 'waiting for /health'
for i in {1..30}; do
  if curl -fsS http://localhost:3000/health >/dev/null 2>&1; then
    log 'health OK'
    break
  fi
  if [ "$i" -eq 30 ]; then
    log 'health never came up'
    docker compose logs --no-color
    exit 1
  fi
  sleep 1
done

log 'POST /v1/verify with a malformed body (must return 400 + application/problem+json)'
response_body="$(mktemp)"
http_code="$(curl -s -o "$response_body" -w '%{http_code}' \
  -X POST http://localhost:3000/v1/verify \
  -H 'Content-Type: application/json' \
  --data '{"not_a_receipt":true}')"

content_type="$(curl -s -D - -o /dev/null \
  -X POST http://localhost:3000/v1/verify \
  -H 'Content-Type: application/json' \
  --data '{"not_a_receipt":true}' | tr -d '\r' | awk -F': ' 'tolower($1)=="content-type"{print $2; exit}')"

log "/v1/verify -> HTTP $http_code, Content-Type: $content_type"
if [ "$http_code" != '400' ]; then
  log "FAIL: expected 400, got $http_code"
  cat "$response_body"
  exit 1
fi
if [[ "$content_type" != application/problem+json* ]]; then
  log "FAIL: expected application/problem+json, got $content_type"
  exit 1
fi

log 'smoke passed'
