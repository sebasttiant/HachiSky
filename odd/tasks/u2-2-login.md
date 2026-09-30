# U2.2 Login, Logout and Route Protection

## Objective

Let the bootstrapped administrator (and any future user) sign in with email and password, sign out, and reach app pages only with a valid session, enforced on the server.

## Problem

U2.1 delivered Better Auth 1.7.6, the auth schema and a bootstrapped admin, but `/api/auth` is not mounted, the web service has no auth environment, there is no login page, every page is public, and the shell does not show who is signed in.

## Why

The owner wants usable functionality: a real sign-in flow they can test locally before building features on top of it.

## Authorized scope (owner, 2026-09-30)

- Branch `feat/u2-2-login` from `main` at 8f7cdd3; worktree `HachiSky-worktrees/u2-2-login`.
- One delivery and one PR (`size:exception` accepted for this scope; do not split artificially). No deployment, no automatic merge.
- Mount `/api/auth` with only what sign-in needs; public sign-up stays disabled.
- `/login` page (Spanish UI copy, no app navigation), generic error message that does not reveal whether the email exists.
- Server-side protection of pages and data: every page requires a session except `/login`; `/api/health` stays public; auth endpoints needed for sign-in stay reachable without a session.
- After sign-in, return to the requested page; the return target accepts internal paths only (no open redirect).
- Header user area: name, job title (`jobTitle`), "Cerrar sesión".
- Logout deletes the session in the database, not only the cookie.
- Sessions last 7 days and are renewed with use (owner accepted).
- A banned user cannot access the app, including with a session created before the ban.
- Rate limiting on sign-in verified as actually active in the environment used (observed HTTP 429), not assumed.
- Compose `web` receives the auth environment; README documents the local test flow.

## Out of scope (U2.3 or later)

Creating/editing staff users in the UI, per-module role permissions, revoking other users' sessions, password recovery, deployment and real HTTPS.

## Constraints

- Owner conditions from U2.1 remain binding: only roles `admin`/`staff`, `jobTitle` separate from role, explicit cookies per environment, no direct inserts into auth tables.
- No credentials in chat, commits or logs.
- UI copy in Spanish (existing app language); code, comments and docs in English.

## TDD

- Mode: strict TDD **on** (source: user global config `Strict TDD Mode: enabled`).
- Runner: `node --test` via `pnpm test` inside the compose `test` profile (`apps/web/compose.yaml`, services `db-test` + `test`).
- RED observed before GREEN for every behavior.

## Tasks

- [ ] **L1** Auth wiring: mount `/api/auth` (sign-in, sign-out, get-session only; sign-up disabled), session 7 days with update on use, rate limit enabled and verified with real HTTP requests, web service auth env in compose, `.env.example` and README updates.
  - Route: delegated writer (writer trigger: 2+ non-trivial files).
  - RED: `node --test tests/auth/auth-http.test.ts` failed `ERR_MODULE_NOT_FOUND src/auth/http.ts`; `tests/auth/check-auth-env.test.ts` 3/3 failed (`Cannot find module src/auth/check-auth-env-cli.ts`); `tests/infra/compose.test.ts` 2 new tests failed (no `BETTER_AUTH_URL`/secret/preflight in `web`). After adding the handler only: the two rate-limit tests failed (limiter disabled because `NODE_ENV` is unset in the test container). New policy unit tests in `src/auth/auth.test.ts` failed 5/5 (session policy, `disableOriginCheck`, rate limit, sign-in rule, IP header). Session-lifetime/renewal/sign-out HTTP tests passed on first run against Better Auth defaults (guards for the now explicit config).
  - GREEN: auth + HTTP suites 31/31; preflight + compose 6/6; full compose test profile: typecheck clean, lint 0 errors (4 pre-existing `globals.css` warnings), `pnpm test` 159/159.
  - Decisions: HTTP allowlist in `src/auth/http.ts` (exact method + pathname: `POST sign-in/email`, `POST sign-out`, `GET get-session`; everything else 404, tested against every `auth.api` endpoint path) instead of `disabledPaths`; session 7 d / `updateAge` 1 d; `disableOriginCheck: false` explicit; rate limit enabled explicitly, memory storage, sign-in 10 per 300 s per IP, global 100 per 60 s; IP from `X-Forwarded-For` (spoofable without a proxy: documented limitation). Missing secret: compose keeps `${BETTER_AUTH_SECRET:-}`; the `web` command runs a preflight (`src/auth/check-auth-env-cli.ts`) that exits 1 naming keys only, then `exec pnpm start`.
  - Pending: real-HTTP 429 against a running `web` container (L4 demo).
- [ ] **L2** Server-side guard: session + banned check used by `proxy.ts` (optimistic redirect) and by every protected page/data access (authoritative), safe `next` handling, banned user with a pre-existing session denied.
- [ ] **L3** UI: `/login` page and form outside the app shell navigation, generic error, header user area with name, job title and logout; logout removes the DB session.
- [ ] **L4** Local demo: run the stack, sign in with the admin, walk the full flow (owner acceptance steps 1–7), record evidence without credentials.

## Acceptance criteria (owner test steps)

1. `http://127.0.0.1:3100/work` without a session redirects to `/login`.
2. Wrong password shows the generic error and stays on `/login`.
3. Correct credentials return to `/work`; the header shows name and job title.
4. Reload or new tab keeps the session.
5. "Cerrar sesión" returns to `/login`; Back or opening `/work` asks for sign-in again.
6. `/login?next=https://evil.example` then sign-in lands on `/`, not the external site.
7. `/api/health` answers without a session.
8. A banned user is denied, including with an existing session.
9. Repeated failed sign-ins receive HTTP 429 in the local environment.

## Checks

`pnpm typecheck`, `pnpm lint`, full `pnpm test` in the compose test profile; HTTP-level checks against the running `web` container.

## Delivery

- Strategy: `single-pr` (owner, 2026-09-30). Forecast ~500–800 authored lines.
- RDD: on (global). Assess work-unit commits with `--committed-only`; record the outcome honestly.

## Progress

- 2026-09-30: branch and worktree created from 8f7cdd3; document created.
- Engram mirror `odd/u2-2-login/tasks`: pending (Engram save failing with multiple active sessions).

## Next step

L1–L3 via one delegated writer (security-sensitive auth hot path; writer trigger: 2+ non-trivial files).
