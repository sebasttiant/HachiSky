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

- [ ] **P1** Module permissions: a role → module matrix used by `requireSession` (or a `requireModule` guard) on every page and Server Function; navigation shows only allowed modules; a direct URL to a forbidden module is refused on the server. Test enforces that every module page declares its module.
- [ ] **P2** Forced password change: `mustChangePassword` user field (migration `0002`); set for users created by an admin; while set, every protected page redirects to a change-password page; cleared only by a successful change.
- [ ] **P3** Own password change: page reachable from the user menu; current password required; other sessions revoked on change; rate limited through the HTTP handler (allowlist extended on purpose).
- [ ] **P4** User administration (Configuración → Usuarios, admin only): list users; create staff/admin with name, email, job title, role and temporary password; edit name, job title and role; deactivate and reactivate (ban/unban, sessions revoked); "close all sessions". Last-admin and self-protection rules.
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

## Next step

P1 (module permissions) with strict TDD.
