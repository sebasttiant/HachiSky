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

- Branch `feat/u2-3-permissions`, stacked on `feat/u2-2-login` (PR #6, not merged yet); worktree `HachiSky-worktrees/u2-3-permissions`. Retarget to `main` after #6 merges.
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
- [ ] **P2** Forced password change: app-owned `user_security` table (migration `0002`, one row per user, `must_change_password`, `password_changed_at`) so the auth tables stay Better Auth's; set for users created or reset by an admin; while set, every protected page redirects to a change-password page; cleared only by a successful change.
- [ ] **P3** Own password change: page reachable from the user menu; current password required; other sessions revoked on change. Done through a Server Function calling `auth.api.changePassword` with the user's own headers, so the HTTP allowlist does not grow.
- [ ] **P4** Administration panel (Configuración, admin only), see "Admin panel design" below.

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
- [ ] **P5** Judgment Day follow-ups from U2.2: test the clearing cookie on the page-guard denied path; restrict the proxy's public `/api/auth/*` prefix to the allowlist.
- [ ] **P6** Local demo and evidence; Judgment Day before the PR.

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

## Next step

P2 (forced password change) with strict TDD.
