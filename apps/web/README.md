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

### Test runner notes

- `pnpm test` runs `node --test` **without** `--conditions=react-server`.
  That condition was removed because it makes `react-dom/server` throw and
  hides client hooks such as `useState`, which prevented rendering real
  components in tests. No source module depends on the `react-server`
  export condition or on `server-only`, and the whole suite passes without
  it. The suite keeps covering the database layer (connection, migrations,
  health, pool limits), pure formatting and navigation logic, and renders
  `WorkdayPreview` to static markup to assert it cannot submit.
- `src/work/WorkdayPreview.test.ts` registers an in-process loader that
  compiles `.tsx` with the SWC build bundled inside Next
  (`next/dist/build/swc`, a Next.js internal, not a public API) and stubs
  CSS Modules. No extra dependency is installed, but a Next.js upgrade may
  move or change that internal and break the test. `next` is pinned to an
  exact version in `package.json`; when upgrading it, run the suite and fix
  the loader (or replace it with a public transform) before merging.

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

## Admin bootstrap

HachiSky has no public sign-up. The first administrator is created once by a
one-shot CLI that runs Better Auth's own `createUser` server-side (no
`/api/auth` route is mounted yet). Roles are only `admin` and `staff`.

### Running it

1. Add a Better Auth secret to `apps/web/.env` (git-ignored; never print it).
   It is only needed by this CLI for now; without it the CLI exits `1`:

   ```bash
   (umask 077; printf 'BETTER_AUTH_SECRET=%s\n' "$(openssl rand -base64 32)" >> apps/web/.env)
   ```

2. Start the database and run the CLI through the `ops` profile. The password
   is read from **stdin only**; it is rejected as an argument and ignored as an
   environment variable. Email, full name and job title are arguments (all
   required):

   ```bash
   read -rs -p 'Admin password: ' ADMIN_PASSWORD; echo
   printf '%s' "$ADMIN_PASSWORD" | docker compose -p hachisky --project-directory apps/web \
     -f apps/web/compose.yaml --profile ops run --rm -T bootstrap-admin \
     --email owner@example.test --name "Full Name" --job-title "Agency owner"
   unset ADMIN_PASSWORD
   ```

   The password must be 8 to 128 characters. One trailing line ending is
   stripped. The service waits for a healthy database and applied migrations.
   Output is a single status line (for example `bootstrap-admin: created`);
   it never contains the password, SQL or an error message.

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Admin created and bootstrap record committed |
| 2 | Bootstrap record already exists (checked first, even if that admin is banned); nothing done |
| 4 | Inconsistent state; manual intervention required; nothing is deleted or repaired |
| 1 | Usage or configuration error (bad arguments, weak password, missing or invalid environment, database unreachable before any write) |

Exit `4` covers: an admin exists without a bootstrap record (never adopted, even
if complete), a user already holds the target email, `createUser` failed, the
postcondition failed (not exactly one admin, or not exactly one credential
account for it), or the lock connection was lost.

### How it works and what it does NOT guarantee

Steps: (1) open a dedicated connection, `BEGIN`, take a transaction-scoped
advisory lock; (2) refuse with `2` if `admin_bootstrap` has a row; (3) refuse
with `4` if any admin exists or the target email is taken; (4) call
`auth.api.createUser` with role `admin` and the job title; (5) verify exactly
one admin, the created one, with exactly one credential account; (6) insert the
`admin_bootstrap` row and `COMMIT` on the lock connection.

- **No atomicity.** Step 4 runs on pool connections, outside the lock
  transaction. The user row, the credential account and the bootstrap record
  are three separate commits. Better Auth itself creates the user and then the
  credential account in two writes.
- **No exclusion after lock loss.** The lock is held by the connection. If that
  connection dies, the lock is released and another run can proceed. The
  interrupted run then exits `4` either way: the lock-loss check fires first
  when the loss was noticed, otherwise the postcondition sees two admins. Any
  admin the other run already created persists (covered by a test).
- Nothing is ever deleted or repaired automatically. `--recover` is **not
  implemented**.

### What each fault leaves persisted

| Fault | Exit | `user` | credential `account` | `admin_bootstrap` | Next run |
| --- | --- | --- | --- | --- | --- |
| Interruption between the user and its credential account | 4 | admin row exists | missing | none | 4 (admin without record) |
| Interruption after complete creation, before the record | 4 | complete admin | present | none | 4 (admin without record) |
| Lock connection lost before the record | 4 | complete admin | present | none | 4 |
| Lock lost before creation while another run finishes | 4 for the stale run, 0 for the other | two admins | two | one (the other run's) | 2 |
| Record already exists | 2 | unchanged | unchanged | unchanged | 2 |

### Manual recovery procedure (documented only)

Do this with the owner; there is no tool for it. Never run destructive SQL
against the persistent `hachisky` database without a decision and a copy of
what you are about to change (there is no backup tooling yet).

1. Stop and read the exit status. Do not re-run the CLI hoping it fixes itself.
2. Inspect the state with **read-only** SQL:

   ```bash
   docker compose -p hachisky --project-directory apps/web -f apps/web/compose.yaml exec db \
     psql -U hachisky -d hachisky -c \
     "select id, email, role, banned, created_at from \"user\" order by created_at;" -c \
     "select user_id, provider_id, account_id from account order by created_at;" -c \
     "select * from admin_bootstrap;"
   ```

3. Decide with the owner which case applies. A partial admin (no credential
   account), a banned admin, or a second admin **still blocks the CLI** (exit
   `4`, "admin without record"), because the CLI counts every user with the
   `admin` role. Nothing here is automatic and no tool changes these rows.
   - **Complete single admin, no record** (for example after an interruption
     before the record): the owner may record it with
     `scripts/record-bootstrap-admin.sql`. It runs in one transaction, takes
     the same advisory lock key as the CLI, and inserts the
     `admin_bootstrap` row only when the given user id has the `admin` role,
     is not banned, is the only admin, has exactly one `credential` account and
     no record exists. If the insert does not affect exactly one row it raises an error
     and nothing is written.

     ```bash
     docker compose -p hachisky --project-directory apps/web \
       -f apps/web/compose.yaml exec -T db \
       psql -U hachisky -d hachisky -v ON_ERROR_STOP=1 -v admin_id='<user id>' -f - \
       < apps/web/scripts/record-bootstrap-admin.sql
     ```

     Afterwards the CLI exits `2`. Running it a second time fails (a record
     already exists) and changes nothing. A banned sole admin is refused too:
     decide with the owner whether to unban it by hand first.
   - **Two admins, or an admin that is not legitimate:** the owner decides
     which one is legitimate and must demote or remove the other **by hand,
     only with owner approval**. Demoting keeps the row and its history:

     ```sql
     -- run in a transaction; check that exactly 1 row is updated, else ROLLBACK
     BEGIN;
     UPDATE "user" SET role = 'staff' WHERE id = '<user id>' AND role = 'admin';
     -- expect: UPDATE 1
     COMMIT;
     ```

     Removing a partial user is a hand-written `DELETE` reviewed by the owner
     first (copy the rows out beforehand; there is no backup tooling).
   - **Admin without a credential account:** there is no tool to add one.
     Either the owner approves removing the partial user (see above) and
     bootstraps again, or demotes it as above.
4. **Delete protection.** `admin_bootstrap.admin_user_id` is
   `ON DELETE RESTRICT`. While the record exists, deleting the bootstrap admin
   fails with SQLSTATE `23001` (`update or delete on table "user" violates
   RESTRICT setting of foreign key constraint
   "admin_bootstrap_admin_user_id_user_id_fk" on table "admin_bootstrap"`).
   That is intended: demote the account (`role = 'staff'`) or ban it
   instead of deleting it. Removing the record itself is a separate,
   owner-approved manual step.
5. The state is consistent when there is one legitimate admin, one credential
   account and one record. Bootstrapping from scratch needs an explicit
   owner-approved manual cleanup of the partial rows first.

`--recover` is **not implemented**; this procedure is documentation only.

## Auth cookies

Cookie behavior is derived from the protocol of `BETTER_AUTH_URL` (`https`
means secure cookies, `http` means not) and set explicitly, never left to
library defaults. `APP_ENV` only adds a guard: `loadAuthEnv` rejects
`production` with an `http` URL. `/api/auth` is not mounted yet.

| Attribute | HTTPS URL (production) | HTTP URL (development / test) |
| --- | --- | --- |
| Session cookie name | `__Secure-better-auth.session_token` | `better-auth.session_token` |
| `useSecureCookies` | `true` | `false` |
| `Secure` | yes | no |
| `HttpOnly` | yes | yes |
| `SameSite` | `Lax` | `Lax` |
| `Path` | `/` | `/` |
| `Domain` | none (host-only) | none (host-only) |
| Cross-subdomain cookies | disabled | disabled |
| Custom `cookiePrefix` | none | none |
| Session cookie cache | disabled (revocation and bans apply on the next request) | disabled |

`BETTER_AUTH_URL` must be an origin (no path, query or credentials) and
`BETTER_AUTH_SECRET` at least 32 characters. Both are read only by the
auth-aware processes (`bootstrap-admin`, and later the web app).

## Limitations

- No backup/restore tooling yet — `pgdata` is a plain Docker volume with no
  automated snapshotting.
- The production `runtime` image keeps devDependencies and the full source
  tree instead of a slimmed, production-only install, to keep this
  infrastructure delivery simple. Revisit before a real production deploy.
- Only the `amd64` architecture has been validated for the pinned base
  images.
