# hachisky-web

Base infrastructure for the HachiSky web app: Next.js 16 + TypeScript 7 +
Drizzle ORM + PostgreSQL 18, fully Docker-first.

## Prerequisites

- Docker and the Compose plugin (`docker compose`).
- Port `3100` free on `127.0.0.1` (configurable, see below). Port `3000` is
  intentionally not published — it is used by another project on this host.

## Local secret

Create `apps/web/.env` (git-ignored) before starting the stack:

```bash
(umask 077; printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 24)" > apps/web/.env)
```

Never commit this file and never print its contents. `.env.example` documents
the shape without a real value.

## Starting the stack (without losing data)

From the repository root:

```bash
docker compose -p hachisky --project-directory apps/web -f apps/web/compose.yaml up -d --wait db web
```

This starts Postgres (`db`), runs pending migrations once (`migrate`, exits
after success), then starts the app (`web`) on
`http://127.0.0.1:${HACHISKY_WEB_PORT:-3100}`.

To stop the stack **without deleting data**:

```bash
docker compose -p hachisky --project-directory apps/web -f apps/web/compose.yaml stop
# or, to remove containers but keep the named volume:
docker compose -p hachisky --project-directory apps/web -f apps/web/compose.yaml down
```

**Never run `down -v` or `docker volume rm` against this project** — that
destroys the `pgdata` volume and all stored data. There is no backup/restore
tooling yet (see Limitations).

`scripts/verify-persistence.sh` automates a `down` + `up` cycle and asserts
that the database identity, the `app_instance.installed_at` timestamp, and
the applied-migrations count are unchanged afterwards. It resolves the
published web address with `docker compose port web 3000` instead of
assuming a port, so it works the same whether `HACHISKY_WEB_PORT` is set or
not.

## Health check

`GET /api/health` reports both database connectivity and migration status:

| Condition | HTTP | Body |
| --- | --- | --- |
| Database reachable, migrations applied | 200 | `{"status":"ok","database":"ok","migrations":N}` |
| Database unreachable | 503 | `{"status":"error","database":"unavailable"}` |
| Migration count query fails | 503 | `{"status":"error","database":"ok","migrations":"unavailable"}` |
| Zero migrations applied | 503 | `{"status":"error","database":"ok","migrations":"pending"}` |

No response body includes error text. Known limitation: a migration count
`>= 1` only proves the migrator ran and committed at least one migration; it
does not compare the count against the local Drizzle journal, so it cannot
prove every expected migration has been applied.

## Port configuration

Set `HACHISKY_WEB_PORT` (in `apps/web/.env` or the shell environment) to
change which host port on `127.0.0.1` the app is published on. Default:
`3100`.

## Running tests

Tests run only inside the disposable `test` profile, against a disposable,
non-persistent `db-test` service (tmpfs-backed, no volume, isolated
`test-net` network):

```bash
docker compose -p hachisky --project-directory apps/web -f apps/web/compose.yaml --profile test build
docker compose -p hachisky --project-directory apps/web -f apps/web/compose.yaml --profile test run --rm test
```

To also typecheck and lint in the same container:

```bash
docker compose -p hachisky --project-directory apps/web -f apps/web/compose.yaml --profile test run --rm test \
  sh -c 'pnpm typecheck && pnpm lint && pnpm test && pnpm build'
```

Clean up the disposable test database afterwards:

```bash
docker compose -p hachisky --project-directory apps/web -f apps/web/compose.yaml --profile test stop db-test
docker compose -p hachisky --project-directory apps/web -f apps/web/compose.yaml --profile test rm -f db-test
```

## Database migrations

Migrations are generated with Drizzle Kit and applied by
`src/db/migrate.ts`. To generate a new migration after changing
`src/db/schema/`, run `pnpm db:generate` inside a container that has
dependencies installed (never on the host). Migrations are applied
automatically by the `migrate` service on stack startup, or manually with
`pnpm db:migrate`.

On success, the migrator logs only `migrations before=N after=M`. On
failure, it logs `Migration failed (code=<SQLSTATE>)` (or `code=unknown`
when no 5-character alphanumeric SQLSTATE is available) — never the raw
error message, which can embed table names, column names, or literal
values.

## Limitations

- No backup/restore tooling yet — `pgdata` is a plain Docker volume with no
  automated snapshotting.
- The production `runtime` image keeps devDependencies and the full source
  tree instead of a slimmed, production-only install, to keep this
  infrastructure delivery simple. Revisit before a real production deploy.
- Only the `amd64` architecture has been validated for the pinned base
  images.
