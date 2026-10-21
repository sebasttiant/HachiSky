# U2.3 Permissions, User Management and Revocation

## Objective

Let an administrator manage staff accounts from the app and enforce per-module access by role on the server, so HachiSky can be used by more than the bootstrapped admin.

## Problem

After U2.2 any signed-in user reaches every module, users can only be created with the bootstrap CLI, nobody can change a password from the app, and an administrator cannot cut off another user's access.

## Why

The owner wants the team (staff) using HachiSky, with billing and configuration reserved for administrators.

## Owner decisions (2026-09-30)

- Staff may use Inicio, Clientes, Trabajo and Informes. Facturación and Configuración are admin only.
- New users get a temporary password set by an admin and must change it at first sign-in.
- Users are only deactivated (ban), never deleted, so their history is kept.
- Every user can change their own password from their user menu.

## Authorized scope

- Branch `feat/u2-3-permissions`, stacked on `feat/u2-2-login` (PR #6, merged into `main` on 2026-09-30); worktree `HachiSky-worktrees/u2-3-permissions`.
- Local work-unit commits. Push and PR only with owner authorization.

## Constraints

- Binding from U2.1/U2.2: only roles `admin`/`staff`; `jobTitle` separate from role; no direct inserts into auth tables (use `auth.api.*`); explicit cookies; HTTP allowlist in `src/auth/http.ts`.
- Authorization is enforced on the server (pages, Server Functions, route handlers). Hiding a link is presentation only.
- The system can never be left without an active admin; an admin cannot deactivate or demote themselves.
- Deactivating a user revokes all their sessions immediately.
- No credentials in chat, commits or logs. UI copy in Spanish (tú form); code and docs in English.
- New migration `0002`; earlier migrations untouched.

## TDD

- Mode: strict TDD **on**. Runner: `node --test` via `pnpm test` in the compose `test` profile, isolated project with `:u23` image tags so the running stacks stay untouched.
- RED observed before GREEN for every behavior.

## Tasks

- [x] **P1** Module permissions: a role → module matrix used by `requireSession` (or a `requireModule` guard) on every page and Server Function; navigation shows only allowed modules; a direct URL to a forbidden module is refused on the server. Test enforces that every module page declares its module.
- [x] **P2** Forced password change: app-owned `user_security` table (migration `0002`, one row per user, `must_change_password`, `password_changed_at`) so the auth tables stay Better Auth's; set for users created or reset by an admin; while set, every protected page redirects to a change-password page; cleared only by a successful change.
- [x] **P3** Own password change: page reachable from the user menu; current password required; other sessions revoked on change. Done through a Server Function calling `auth.api.changePassword` with the user's own headers, so the HTTP allowlist does not grow.
- [x] **P4** Administration panel (Configuración, admin only), see "Admin panel design" below. The activity view filters by action only; person and date filters are open.

## Admin panel design (owner request 2026-09-30)

Reference: the owner's `swdrogueriaespecifica` admin module (read-only review). HachiSky takes its good patterns and fixes its weak spots; it does not copy its code (different stack: Prisma/Tailwind there, Better Auth/Drizzle/CSS Modules here).

Taken from the reference:

- The panel is a tool, not a dashboard: search comes first; "Crear usuario" sits behind a native `<details>` so it never pushes the list off a phone screen.
- One filter contract (`q`, `role`, `status`) parsed, normalized and serialized in one module; anything invalid in the URL falls back to the default and never breaks the page; changing a filter drops pagination.
- Thin Server Functions: Zod → server-side admin check → service → audit → `revalidatePath`. Business rules live in the service and fail with typed rule codes mapped to Spanish messages (self-deactivation, self-demotion, last active admin, not found, duplicate email).
- The last-admin check is serialized with a transaction-scoped advisory lock so two concurrent demotions cannot leave the system without an admin.
- Destructive actions use a two-step inline confirmation naming the person.
- Cards on small screens, a compact table on wide ones; 44 px touch targets; role and status badges; empty states that say the true reason (no users vs. no matches).
- Emails trimmed and lower-cased before validation; the edit page answers 404 for unknown ids.
- Audit trail: who, when, what, on which user, before/after (never a password), IP and user agent; a read-only "Actividad" view with filters.

Improved here:

- Deactivating is a Better Auth ban and revokes every session at once; the session guard already refuses banned users on the next request.
- An admin reset sets a new temporary password, forces the change at next sign-in and revokes the user's sessions; the admin never learns the final password.
- "Cerrar sesiones" per user.
- No archive/hard delete (owner decision): deactivated users stay listed under "Inactivos" with their history.
- Mutations go through `auth.api.*` with the acting admin's headers (no direct writes to auth tables); app state (`user_security`, `audit_log`) lives in app-owned tables.
- Audit writes for rule-checked mutations happen while the advisory lock is held, so the trail matches the order of changes.

Screens:

- `/settings`: Configuración hub (Usuarios, Actividad).
- `/settings/users`: search and filters, create panel, list with Editar, Desactivar/Reactivar.
- `/settings/users/[id]`: datos (nombre, cargo), rol, restablecer contraseña, cerrar sesiones, estado, and that user's recent activity.
- `/settings/activity`: audit log, newest first, filter by action, person and date.

Delivery: expected well over the 400-line review budget; split into chained PRs (permissions + passwords, users panel, activity view) before publishing.
- [x] **C1** (closure finding F1) `createUser` fail-closed: an account whose forced change or audit could not be recorded must never give app access. Route: delegated writer (writer trigger).
- [x] **C2** (closure finding F2) Mutations vs audit: Better Auth commits on its own connections, outside the audit transaction. Make each mutation leave observable, recoverable evidence without promising atomicity and without schema changes. Route: delegated writer (writer trigger).
- [x] **C3** (closure finding F3, hypothesis confirmed) `changeOwnPassword` vs admin `resetPassword` race. Confirm only with a controlled barrier test; fix only if RED. Route: delegated writer (writer trigger).
- [x] **C4** Record deployment conditions (X-Forwarded-For trust, health check scope) in this document and the README. Documentation only.
- [ ] **P5** Judgment Day follow-ups from U2.2: test the clearing cookie on the page-guard denied path; restrict the proxy's public `/api/auth/*` prefix to the allowlist.
- [x] **P6** Local demo and evidence; Judgment Day before the PR. Demo evidence is the 2026-10-01 headless run (18/18). Judgment Day of `863c25b~1..a338135` is recorded below.

## Closure findings (2026-10-01)

Route for C1–C3: delegated writer (writer trigger: `service.ts`, its tests and presentation are more than one non-trivial file). Strict TDD, runner `node --test` in the isolated compose project `hachisky-u23fix-test` (images tagged `:u23fix` through a scratch compose override; the shared `:local`, `:u22`, `:u23` tags and stacks untouched). Fault injection uses test-only `BEFORE INSERT` triggers on the test database and an `auth` wrapper whose admin endpoints reject; no source-text inspection.

Risk identified in code vs failure reproduced: all three findings were reproduced by a failing test against 35d7b10 before any fix (F3 needed only the new test seams).

### C1 / F1 — createUser fail-closed (5bce5e6)

- Reproduced (RED at 35d7b10): with the `user_security` insert failing and `banUser`/`unbanUser` rejecting, `createUser` threw but the account signed in with the temporary password, `resolveSession` authenticated it and `getMustChangePassword` was false: `actual: 'full', expected: 'sign_in_refused'`. Same with the `user.create` audit insert failing (`actual: 'full'`; the transaction also rolled back the forced change). With a working compensating ban, reactivating the account from the panel gave `actual: 'full', expected: 'forced_change'`.
- Fix: the account is created banned (`data.banned`, ban reason `Alta incompleta`; Better Auth 1.7.6 `createUser` accepts ban fields from a caller with the `ban` permission), the forced change is committed, then the account is unbanned. No compensation, nothing swallowed: the first error reaches the caller. `setActive(true)` records `must_change_password = true` (insert, never overwrite) before unbanning a user with no `user_security` row, except the recorded bootstrap admin (`admin_bootstrap.admin_user_id`), whose missing row keeps its meaning.
- Not changed: `getMustChangePassword` still reads a missing row as "nothing pending". A row-less, non-bootstrap user reactivated from the panel now has to change the password (only accounts left incomplete by the old code or created outside the panel are row-less).
- The "final activation fails" test is new-design coverage, not a defect reproduction (35d7b10 had no unban step).

### C2 / F2 — mutations vs audit (b173960)

- Reproduced (RED at 35d7b10): with the completion audit insert failing, `setActive(false)`, `setActive(true)`, `updateUser`, `resetPassword`, `revokeSessions` and `createUser` threw, the change persisted (asserted: inactive, active, role `admin`, temporary password with forced change, 0 sessions) and the trail had no trace: `actual: [], expected: [['user.deactivate.requested', <id>]]` (one per mutation).
- Decision (no schema change, no atomicity promised): append-only request protocol in `service.ts` (`auditRequest`). After the rule checks and before the first Better Auth call, `<action>.requested` with a fresh `requestId` is committed on its own (autocommit). After every step, `<action>` with the same `requestId`. The existing `audit_log` (action format check, append-only trigger, nullable target) allows this as is. Activity views hide a request once its completion exists; an unresolved one shows as "… (sin confirmar)". The UI shows the generic error.
- What persists per fault:

| Fault | Change | Audit | Caller |
| --- | --- | --- | --- |
| Rule check fails | none | none | rule message |
| Request row fails | none | none | generic error |
| Better Auth call fails | not applied, or partly (e.g. `adminUpdateUser` done, `setRole` failed) | request only | generic error |
| Completion row fails | applied | request only, shown "sin confirmar" | generic error |
| createUser, any step after the account exists | account stays banned (`Alta incompleta`) until the forced change is committed and the unban succeeds | request only | generic error |

- Reconciliation (manual): compare an unresolved request with the user's current state; repeating deactivate, activate, edit, reset or close sessions from the panel is safe. A failed creation leaves an inactive user: reactivate it (forced change recorded first) or leave it inactive. The creation request has no target id (it is written before the account exists); match it by `details.email`.
- Not covered: `changeOwnPassword` keeps its single transaction (flag + audit). If it fails after Better Auth changed the password, the flag stays as it was (still forced if pending) and there is no audit row.
- Label RED: `actual: 'user.deactivate.requested', expected: 'Desactivó la cuenta (sin confirmar)'`.

### C3 / F3 — reset vs own change race (f4ad9e9)

- Hypothesis confirmed (RED at 35d7b10 plus seams only): test hooks `afterPasswordChange` and `afterResetFlag` (in `UsersDeps.hooks`, never set by the app) hold one operation with deferred-promise barriers; the other runs until it finishes or waits on an advisory lock (checked in `pg_locks`, no sleeps). Both interleavings ended with the admin-known temporary password and no forced change: `actual: 'full', expected: 'forced_change'` (2 tests).
- Fix: `withPasswordLock` takes `pg_advisory_xact_lock(74332012, hashtext(user_id))` (two-int key space, separate from `ADMIN_LOCK_KEY` and the bootstrap key) in `resetPassword` and `changeOwnPassword`, held from before the Better Auth call until the flag is written. GREEN: the second operation is observed `blocked` and the final state is `forced_change` (3 repeated runs). A late own change after a reset is refused (session revoked, password replaced).
- Load: one holder uses at most two pool connections (lock transaction plus one borrowed by Better Auth or an autocommit write); a waiter gives up at the 4 s `statement_timeout`. Contention only between operations on the same user.

### C4 — Deployment conditions (c1a2dd9, also in `apps/web/README.md`)

1. The rate limit trusts `X-Forwarded-For`; a trusted proxy boundary that overwrites it is required before public exposure.
2. The health check accepts a positive migration count; it does not certify that the schema is up to date.

### Verification (2026-10-01)

- Fresh `hachisky-web-test:u23fix` image, no mounts: `pnpm typecheck` exit 0; `pnpm lint` exit 0 (4 known `globals.css` warnings); `pnpm test` 280/280; `pnpm build` exit 0.
- Isolated demo `hachisky-u23fix-demo` at http://127.0.0.1:3103 (own volume, `hachisky-web:u23fix`): migrate, bootstrap admin via the `ops` profile (password in a scratch file, never printed), then a real headless Chromium run (Playwright 1.63.0 installed in the session scratch directory): 18/18 checks — admin sign-in, admin sees and opens Facturación/Configuración, creates a staff user, activity shows the creation with no unconfirmed request, logout; staff signs in with the temporary password, is held on `/account/password`, changes it, nav hides admin modules, `/work` 200, `/billing` and `/settings/users` 403, logout, temporary password refused, new password accepted. Database afterwards: staff active, `must_change_password` false, `user.create.requested` + `user.create` paired, `user.password_change`.

## Acceptance criteria

1. A staff user does not see Facturación or Configuración, and opening `/billing` directly is refused.
2. An admin creates a staff user; that user signs in with the temporary password and is forced to change it before anything else.
3. A user changes their own password; their other sessions stop working.
4. An admin deactivates a user; that user's open session stops working at the next request, and they cannot sign in.
5. Reactivating restores access with the same history.
6. The last active admin cannot be deactivated or demoted, and an admin cannot deactivate or demote themselves.

## Delivery

- Strategy: `ask-on-risk`; size forecast ~1,200–1,800 authored lines. Propose a split before the PR if it exceeds the budget.

## Progress

- 2026-09-30: worktree created from `feat/u2-2-login` at cea20de; owner decisions recorded.
- 2026-09-30: P1 done. `src/auth/permissions.ts` holds the role → module matrix (billing admin only; Configuración joins in P4). Every module page calls `requireModule(<module>, <href>)`, which answers a forbidden module with `forbidden()` (HTTP 403, `app/forbidden.tsx`, `experimental.authInterrupts`). The layout passes `visibleModules(role)` to the header and the home tiles use the same list. RED observed first (missing module, pages without `requireModule`, no 403 page). Isolated `hachisky-u23-test`: typecheck, lint, 215/215 tests and `next build` green (`.verification/u23-p1-*.log`).

- 2026-09-30: migration `0002` (`user_security`, append-only `audit_log`) and the users service (caa0cd6, f81e53f). The last-admin rule holds under a transaction-scoped advisory lock; a barrier-hook race test fails when the lock is removed.
- 2026-09-30: P4 done (2247bf7). Configuración hub, users list with search/filters and create panel, user profile (edit, temporary password, close sessions, deactivate/reactivate), activity log. The signed-in 403 renders inside the app shell (`app/(app)/forbidden.tsx`). Browser demo on the isolated `hachisky-u23-demo` stack (127.0.0.1:3102): create, per-field validation, edit, deactivate/reactivate, audit trail, staff refused on `/settings` and `/billing`.
- 2026-09-30: P2 + P3 done (bbb205d). `requireSession` redirects to `/account/password?next=…` while `must_change_password` is set; the layout hides the modules meanwhile; a key button in the header opens the own change. `changeOwnPassword` calls `auth.api.changePassword` (revokeOtherSessions) with the user's headers, then clears the flag, sets `password_changed_at` and audits `user.password_change`. Found in the demo and fixed: the Server Action must copy Better Auth's new session cookie into `cookies()` and always redirect, because a re-render in the same request still reads the revoked cookie and lands on `/login` (structural test added). Isolated suite: typecheck, lint, 266/266 tests, `next build` green (`.verification/u23-f-*.log`).

Acceptance criteria 1, 2, 3, 4, 5 and 6 were checked in the browser demo or by Postgres-backed tests.

Open points:

- No attempt limit on the own password change (server-side `auth.api` calls skip Better Auth's HTTP rate limit); needs a session to exploit. Decide in Judgment Day.
- Demo credentials for `admin@hachisky.test` and `laura.martinez@il.test` appeared in chat; rotate or drop the demo stack before showing it.

- 2026-10-01: closure findings F1–F3 reproduced and fixed (5bce5e6, b173960, f4ad9e9), deployment conditions recorded (c1a2dd9). See "Closure findings".

Pending:

- Accounts left row-less and active by 35d7b10's createUser (demo stacks only) cannot be told apart from other row-less users; recreate demo data instead of reusing it.
- Activity views hide resolved requests with a `NOT EXISTS` over `details->>'requestId'` (no index; fine at current volume, an expression index would need a migration).
- **Open (not resolved):** `changeOwnPassword` audit is not covered by the C2 request/completion scheme. Better Auth commits the new password first; the flag update and the `user.password_change` audit row share one later transaction. If that transaction fails, the password is changed, the forced-change flag stays as it was (safe side) and no audit row exists. Fixing it needs the same two-phase audit as C2; not done in this closure.
- Owner decision (2026-10-01): a user without a `user_security` row must change the password on (re)activation, except the identified bootstrap admin.

## Next step

P5 (U2.2 follow-ups) stays open and moves to its own pre-deploy branch. The password-change attempt limit stays an owner decision.

## Judgment Day (2026-10-06)

Two blind read-only judges inspected `git diff 863c25b~1 a338135` (65 files, +6064/−38). Native review stayed on. One round. No fix round. This judgment is not delivery approval.

- Judge A (`00b8c77b-a67f-4229-8b27-18d868a37d53`): one WARNING. `apps/web/src/users/service.ts:272-275` — `notResolvedRequest` scans `audit_log` by `details->>'requestId'` with no expression index, so the activity lists grow with the table.
- Judge B (`5c573f66-e54e-4c26-922e-736d16b6eeec`): the same WARNING at `apps/web/src/users/service.ts:272-276`.
- Confirmed by both: that WARNING only. Severe findings: none. Contradiction: none. Suspect: none.
- INFO: the missing index was already noted above as fine at current volume; an expression index would need a migration and was not added. The missing attempt limit on the own password change stays an open owner decision; neither judge treated it as a severe defect.
- Skill resolution: paths injected (`typescript`, `react-19`, `nextjs-15`, `zod-4`).
- JUDGMENT: APPROVED.
