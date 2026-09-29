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
- [x] **A2** Migration `0001`: Better Auth tables (+admin plugin columns, `job_title`) as `timestamptz`; unique `(provider_id, account_id)`; partial unique `user_id WHERE provider_id = 'credential'`; `admin_bootstrap` singleton table.
  - Route: delegated writer (trigger: writer trigger).
  - Checks: migration test; timezone round-trip test (TZ ≠ UTC); index tests that Better Auth API calls still succeed and duplicates are rejected.
  - Evidence: RED (`node --test tests/db/auth-schema.test.ts` failed in `before`: tables and schema exports absent), then GREEN 9/9 after schema + generated `0001_auth_foundation.sql`. Mutation check: making `user.created_at` a plain `timestamp` in a copy of the migration fails the fresh-DB type test and the timezone round trip (process TZ `Asia/Kolkata`, session TimeZone `America/Bogota`). Compose test profile `pnpm typecheck && pnpm lint && pnpm test`: typecheck clean, lint 0 errors (4 pre-existing warnings), 100/100 pass.
  - Findings: server-side `auth.api.createUser` (no headers) sets `role: "admin"` and `data.jobTitle` without a session; the credential account is created by a separate `linkAccount` call, so user and account are not one transaction. Both unique indexes coexist with `createUser`/`signInEmail`. `admin_bootstrap.admin_user_id` is `ON DELETE RESTRICT` (SQLSTATE 23001), so the bootstrap admin cannot be hard-deleted while the record exists.
- [x] **A3** Bootstrap CLI `src/auth/bootstrap-admin.ts` + compose `ops` profile service; password via stdin only.
  - Route: delegated writer (trigger: writer trigger).
  - Evidence: RED `node --test tests/auth/bootstrap-admin.test.ts` failed with `ERR_MODULE_NOT_FOUND bootstrap-admin.ts`; GREEN 17/17 (incl. 10 real processes: one `0`, nine `2`; fault A/B/C and C2 interleaving). Mutation: removing the advisory lock query makes the 10-process test fail. Compose test profile `pnpm typecheck && pnpm lint && pnpm test`: typecheck clean, lint 0 errors (4 pre-existing warnings), 117/117 pass. Ops service happy path against a throwaway compose project (`hachisky-opscheck`, own volume, separate image tag, all removed afterwards): first run `created` exit 0, second `already_bootstrapped` exit 2, DB shows one admin with job title, one credential account, one record.
  - Decisions: `createUser` runs on pool connections, outside the lock transaction (documented in code). Lock client has its own 60 s statement limit (the pool's 4 s would abort waiting runs). Better Auth logging is disabled in the CLI so errors cannot echo SQL parameters. Compose uses `${BETTER_AUTH_SECRET:-}` (not `:?`) because compose validates all services and a required variable would break `up db web` and the test profile; an empty secret makes the CLI exit 1. `.env.example` could not be updated (path denied to the writer); it still needs a `BETTER_AUTH_SECRET=` line.
  - Checks: happy path; 10-process concurrency (1×`0`, 9×`2`); existing record → `2`; admin without record → `4`; fault tests (user without credential; complete admin without record; lock connection terminated) with documented persisted state.
- [x] **A4** Docs: bootstrap operation, exit codes, fault/persistence table, manual recovery procedure, cookie matrix; tracking update.
  - Route: delegated writer (together with A3 if natural).
  - Checks: structural readback.
  - Evidence: structural readback of `apps/web/README.md` after the edit: sections "Admin bootstrap" (run via `ops` profile, exit codes, algorithm and non-guarantees, fault persistence table, manual recovery procedure documented only, `--recover` not implemented) and "Auth cookies" (production HTTPS vs development HTTP matrix) are present. Route: delegated writer.

## Acceptance criteria

- All owner conditions above hold and are covered by tests with observed results.
- `pnpm typecheck`, `pnpm lint`, full `pnpm test` pass in the compose test profile.
- No real client or personal data; no secrets committed.

## Delivery

- Strategy: `ask-on-risk`. Forecast ~900–1300 authored lines (above the ~400 budget); chain strategy will be asked when a PR is requested (not authorized now).
- RDD: on (global). Assess each work-unit commit with `--committed-only`; known Gentle AI #4890 may make review unavailable — record honestly.

## Progress

- 2026-09-29: branch created; document created.
- 2026-09-29: A1 done (delegated writer), commit ef46081.
- 2026-09-29: A2 done (delegated writer); commit 4f556c1.
- 2026-09-29: A3 done (delegated writer), commit 1a432f4. A4 done (delegated writer), commit 4af1bba. Verification in the compose test profile: 117/117 tests, typecheck clean, lint 0 errors.
- 2026-09-29: Bounded correction after independent verification (delegated writer, one `fix(auth)` commit; hash recorded by the coordinator): CLI entry is now a dedicated file that always runs `main()` (default exit code 1), with tests for a path with spaces and for symlinks; recovery SQL moved to `apps/web/scripts/record-bootstrap-admin.sql` (same advisory lock key, guarded insert, tested for success, two admins, non-admin target, no credential account; README documents it, the guarded demote, and `ON DELETE RESTRICT` / SQLSTATE 23001); fault B reason is `interrupted`; fault C uses `pg_terminate_backend(pid, 5000)`; `adminUpdateUser` with role `user` is rejected (guard test); README wording and cookie-derivation fixes; vacuous lock test removed. RED: symlink+space entry test and fault B reason failed before the fix; the new SQL, adminUpdateUser and terminate-timeout tests are guards that passed on first run. Full suite in the compose test profile: 123/123, typecheck clean, lint 0 errors. Commit c472e9a.
- 2026-09-29: Coordinator checks: diff reviewed (correction touches none of migration 0001, the env example, .gitignore); full suite re-run in the compose test profile: 123/123 pass, 0 fail. Independent delta verification (0ea1063..c472e9a): fit with follow-ups, no CRITICAL.
- RDD: range 128dd49..HEAD assessed high (auth hot path, review due); native review unavailable because of Gentle AI #4890 (intended-untracked selection). Recorded as unavailable; no approval claimed.
- Owner decisions: `jobTitle` required at the CLI; ON DELETE RESTRICT kept and documented; `.gitignore` (.atl/) stays out of U2.1 commits.

## Pending follow-ups

- Entry test pins only that `main()` is reached; no test fails if a main-module guard is reintroduced (add a static or "main removed" test).
- Lock-key test is a substring check; tighten to an exact `pg_advisory_xact_lock(<key>)` match.
- Recovery SQL can record a sole banned admin; add a not-banned guard or document it. No test for running the script twice.
- `src/db/migrate.ts` uses the same fragile `file://${argv[1]}` entry check.
- Optional DB CHECK on `user.role` (admin/staff); README cosmetic line breaks in the recovery command.
- Add `BETTER_AUTH_SECRET=` to `apps/web/.env.example` (agents cannot edit it).
- Throwaway `ops` service check not re-run after c472e9a.

## Next step

Owner review of U2.1. No push/PR/merge until owner approval.
