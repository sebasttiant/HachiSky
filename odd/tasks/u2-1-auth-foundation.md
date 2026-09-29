# U2.1 Auth Foundation

## Objective

Integrate Better Auth 1.7.6 (without mounting `/api/auth`), add the auth schema migration, explicit per-environment cookie configuration, and a guarded admin bootstrap CLI.

## Problem

HachiSky has no users. U2.2 (login/logout, route protection) and U2.3 (permissions, revocation) need a verified auth foundation and exactly one bootstrapped administrator first.

## Why

The owner chose maintained auth (Better Auth) over custom sessions, with only two roles (`admin`, `staff`) and the author's job title stored separately from the access role.

## Authorized scope (owner, 2026-09-29)

- Branch `feat/u2-1-auth-foundation` (from `feat/visible-shell` at 128dd49).
- Install `better-auth@1.7.6` (exact) and its CLI 1.7.6 as a dev dependency.
- Local work-unit commits only. **No push, PR or merge.**
- Stop and consult the owner if any limitation changes the bootstrap guarantees below.

## Owner conditions (binding)

1. Bootstrap uses `auth.api.createUser` plus a dedicated advisory lock. No direct inserts into auth tables.
2. No automatic adoption: an existing admin without a bootstrap record → stop, exit `4`, require explicit intervention.
3. Concurrency: clean database, no faults, 10 processes → exactly one exit `0` and nine exit `2`.
4. Fault tests: interruption between user and credential account; interruption between complete creation and bootstrap record; loss of the lock-holding connection. Document what persists. Do not promise atomicity, nor exclusion after lock loss.
5. Roles configured explicitly: only `admin` and `staff`, `defaultRole: "staff"`; `user` must never be produced. Job title field named `jobTitle`, separate from role.
6. Recovery (`--recover`) is documented as a procedure only; not implemented in U2.1.
7. New migration `0001`; `0000_baseline` untouched. `timestamptz` with timezone tests; unique indexes with tests that Better Auth API still works. Explicit cookies per environment. `/api/auth` not mounted.

## Bootstrap exit codes

| Code | Meaning |
|------|---------|
| 0 | Admin created and bootstrap record committed |
| 2 | Bootstrap record already exists (even if the admin is deactivated); nothing done |
| 4 | Inconsistent state (admin without record, partial user, 2+ admins, postcondition failed, lock lost); manual intervention, nothing deleted |
| 1 | Usage/configuration error |

## TDD

- Mode: strict TDD **on** (source: user global config `Strict TDD Mode: enabled` + owner instruction 2026-09-29).
- Runner: `node --test` via `pnpm test` inside the compose `test` profile (`apps/web/compose.yaml`, services `db-test` + `test`).
- RED observed before GREEN for every behavior.

## Tasks

- [x] **A1** Dependencies + auth config: `better-auth@1.7.6`, roles `admin`/`staff`, `defaultRole: "staff"`, `jobTitle` additional field, explicit cookie config per environment (prod HTTPS: `useSecureCookies: true`, HttpOnly, Path=/, no Domain, cookieCache off; dev HTTP: explicit no Secure/no prefix). No `/api/auth` route.
  - Route: delegated writer (2+ non-trivial files; trigger: writer trigger).
  - Checks: unit tests for config/roles/cookies; typecheck; lint.
  - Evidence: RED (`node --test src/shared/config/env.test.ts` failed: no `loadAuthEnv` export; `node --test src/auth/auth.test.ts` failed: `ERR_MODULE_NOT_FOUND access-control.ts`), then GREEN (env 11/11, auth 14/14); compose test profile `pnpm typecheck && pnpm lint && pnpm test`: typecheck clean, lint 0 errors (4 pre-existing `globals.css` warnings), 91/91 tests pass.
  - Decisions: `jobTitle` is `required: false`, `input: false` (admin `createUser` `data` sets it; a user's self-service update is rejected with 400 `FIELD_NOT_ALLOWED`). CLI package is `auth@1.7.6` (devDependency). Auth env (`loadAuthEnv`) is separate from `loadEnv`, so migrate/web need no auth secrets yet.
- [ ] **A2** Migration `0001`: Better Auth tables (+admin plugin columns, `job_title`) as `timestamptz`; unique `(provider_id, account_id)`; partial unique `user_id WHERE provider_id = 'credential'`; `admin_bootstrap` singleton table.
  - Route: delegated writer.
  - Checks: migration test; timezone round-trip test (TZ ≠ UTC); index tests that Better Auth API calls still succeed and duplicates are rejected.
- [ ] **A3** Bootstrap CLI `src/auth/bootstrap-admin.ts` + compose `ops` profile service; password via stdin only.
  - Route: delegated writer.
  - Checks: happy path; 10-process concurrency (1×`0`, 9×`2`); existing record → `2`; admin without record → `4`; fault tests (user without credential; complete admin without record; lock connection terminated) with documented persisted state.
- [ ] **A4** Docs: bootstrap operation, exit codes, fault/persistence table, manual recovery procedure, cookie matrix; tracking update.
  - Route: delegated writer (together with A3 if natural).
  - Checks: structural readback.

## Acceptance criteria

- All owner conditions above hold and are covered by tests with observed results.
- `pnpm typecheck`, `pnpm lint`, full `pnpm test` pass in the compose test profile.
- No real client or personal data; no secrets committed.

## Delivery

- Strategy: `ask-on-risk`. Forecast ~900–1300 authored lines (above the ~400 budget); chain strategy will be asked when a PR is requested (not authorized now).
- RDD: on (global). Assess each work-unit commit with `--committed-only`; known Gentle AI #4890 may make review unavailable — record honestly.

## Progress

- 2026-09-29: branch created; document created.
- 2026-09-29: A1 done (delegated writer). Commit hash recorded in the A2 progress entry.

## Next step

A2.
