#!/usr/bin/env bash
# Verifies that stopping and restarting the stack (`down` / `up`, never
# `down -v`) preserves the Postgres data volume: the database's own
# system_identifier, the app_instance.installed_at timestamp, and the
# applied-migrations count must all be identical before and after.
set -euo pipefail

if [ "$#" -ne 0 ]; then
  echo "verify-persistence.sh takes no arguments" >&2
  exit 1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
repo_root="$(cd -- "${script_dir}/../../.." >/dev/null 2>&1 && pwd)"
cd "${repo_root}"

C="docker compose -p hachisky --project-directory apps/web -f apps/web/compose.yaml"

identity_query="select (select system_identifier from pg_control_system())::text || '|' || (select installed_at from app_instance where id = 1)::text || '|' || (select count(*) from drizzle.__drizzle_migrations)::text"

echo "Reading persistence identity BEFORE restart..."
before="$(${C} exec -T db psql -U hachisky -d hachisky -AtX -c "${identity_query}")"
echo "BEFORE: ${before}"

echo "Stopping the stack (down, without -v: the pgdata volume is kept)..."
${C} down

echo "Starting the stack again..."
${C} up -d --wait db web

echo "Reading persistence identity AFTER restart..."
after="$(${C} exec -T db psql -U hachisky -d hachisky -AtX -c "${identity_query}")"
echo "AFTER: ${after}"

# Ask Compose for the address it actually published, instead of guessing a
# port from the shell environment: Compose itself resolves the configured
# port from its own env sources, which this script never reads directly.
echo "Resolving the published web port from Compose..."
web_address="$(${C} port web 3000)"
web_address="${web_address%$'\r'}"
if ! [[ "${web_address}" =~ ^127\.0\.0\.1:[0-9]{1,5}$ ]]; then
  echo "Could not resolve a valid 127.0.0.1:<port> address for the web service (got: '${web_address}')" >&2
  exit 1
fi
web_port="${web_address#127.0.0.1:}"
if ((10#${web_port} < 1 || 10#${web_port} > 65535)); then
  echo "Resolved web port out of range: ${web_port}" >&2
  exit 1
fi

echo "Checking web health at ${web_address}/api/health ..."
health_body="$(curl -fsS "http://${web_address}/api/health")" || {
  echo "Health check failed at ${web_address}/api/health" >&2
  exit 1
}
if [[ "${health_body}" != *'"status":"ok"'* ]]; then
  echo "Health check body did not report status ok: ${health_body}" >&2
  exit 1
fi
echo "Health check OK."

if [ "${before}" != "${after}" ]; then
  echo "PERSISTENCE FAILURE: identity changed across restart." >&2
  echo "  before: ${before}" >&2
  echo "  after:  ${after}" >&2
  exit 1
fi

echo "Persistence verified: identity unchanged across restart."
