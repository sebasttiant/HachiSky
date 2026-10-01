# B1 Persistent Clients

## Objective

Replace the `/clients` placeholder with persistent client records: create, edit, search and deactivate/reactivate, validated on the server, permission-checked and audited. Foundation for B2 (cuentas de cobro), which is not authorized yet.

## Problem

`/clients` is a "coming soon" placeholder. Billing documents (B2) need real client records with the fiscal header fields used by the reference documents (name, identification, address, city).

## Why

The owner wants business functionality after closing U2.3: clients first, then cuentas de cobro.

## Authorized scope (owner, 2026-10-01)

- Branch `feat/b1-clients` from `feat/u2-3-permissions` at a338135 (B1 depends on U2.3 permissions and audit, not yet on `main`); worktree `HachiSky-worktrees/b1-clients`.
- Create, edit, search (list with filters), deactivate and reactivate. **No physical delete.**
- Server-side validation, module permissions, persistence tests.
- Local commits only. No push, PR, merge or deployment.
- B2 (cuentas de cobro) is NOT authorized: no billing tables, consecutives, taxes, advances or bank data.

## Data (minimal, no billing rules)

- Name / legal name (required).
- Identification type (required): `NIT`, `CC`, `CE`, `PP` (passport). Identification number (required, normalized: trimmed, no separators for NIT/CC).
- Address, city (optional), contact email (optional, validated format), contact phone (optional).
- Active flag; created/updated timestamps (`timestamptz`); creator/updater user ids.
- Uniqueness: one client per (identification type, normalized number), including inactive clients (reactivate instead of duplicating).
- New migration `0003` (new table only; earlier migrations untouched). No changes to auth tables.

## Permissions

- Module `clients` is already open to `admin` and `staff` (`src/auth/permissions.ts`). Per-operation rules (owner, 2026-10-01):

  | Operation | Roles |
  |---|---|
  | View and search | admin, staff |
  | Create | admin, staff |
  | Edit client data | admin, staff |
  | Deactivate | admin only |
  | Reactivate | admin only |

- Enforced on the server (service and Server Functions), not only by hiding buttons; tests must prove that staff is denied deactivate/reactivate (no state change, no audit row) and that a request without a session is denied for every operation.
- Every mutation is audited in the existing append-only `audit_log` (actor, action, target, details, IP, user agent).
- Guards on every page and Server Function (existing structural guard test must keep passing).

## Constraints

- Preserve U2.1–U2.3 behavior and conventions; Better Auth tables are never written directly.
- UI copy in Spanish (tú form, as in U2.3); code, comments and docs in English.
- No real client data in code, tests, fixtures, screenshots or logs (use obviously fictitious data).
- Disk guard: check free space before every image build; stop if under 5 GB. No new image pulls (no Playwright Docker image); browser checks use the Playwright install in the session scratchpad.
- No `down -v`, no prune, no touching stacks `hachisky` and `hachisky-u23fix-demo` or other projects' resources.

## TDD

- Mode: strict TDD **on** (source: user global config `Strict TDD Mode: enabled`).
- Runner: `node --test` via `pnpm test` in the compose `test` profile, isolated project and image tag.
- RED observed before GREEN for every behavior; behavior tests (DB state, HTTP/Server Function outcomes), not source-text inspection, except the existing structural guard test.

## Tasks

- [x] **K1** Schema + migration `0003` + client service (create, update, deactivate, reactivate, get, search with pagination) with server-side validation, uniqueness and audit; persistence tests.
- [x] **K2** UI: `/clients` list with search and status filter, `/clients/new`, `/clients/[id]` edit with deactivate/reactivate; Server Functions guarded; field errors in Spanish.
- [ ] **K3** Integrated verification (typecheck, lint, tests, build) done (see Progress); the isolated demo with a real browser walk-through is PENDING (owner order: no image builds or demo stacks for now).

## Acceptance criteria (owner test steps)

1. Admin and staff open `/clients` and see an empty list with "Nuevo cliente".
2. Creating a client with missing name or identification shows field errors; nothing is saved.
3. Creating a valid client lists it; reloading keeps it (persisted).
4. Creating another client with the same identification type and number is rejected with a clear message.
5. Editing a client updates it; the change appears in Configuración → Actividad (admin).
6. Search by name or identification number finds the client; the status filter separates active/inactive.
7. An admin deactivating hides it from the default (active) list; it appears under "Inactivos" and an admin can reactivate it. There is no delete option. Staff sees no deactivate/reactivate controls, and a forged request from staff is rejected on the server.
8. A user without a session cannot reach `/clients` or its Server Functions.

## Checks

`pnpm typecheck`, `pnpm lint`, full `pnpm test`, `pnpm build` in an isolated compose project; browser walk-through on an isolated demo stack.

## Delivery

- Local commits only. Chained PRs (max ~400 lines each, Feature Branch Chain) will be planned with U2.3 when the owner authorizes publishing.
- RDD: on (global). Assess work-unit commits with `--committed-only`; record the outcome honestly.

## Progress

- 2026-10-01: disk freed by removing the superseded `u22`/`u23` demo stacks and images (owner-authorized; volumes kept): free space 7.01 GB → 9.38 GB. Branch and worktree created; document created.
- Engram mirror `odd/b1-clients/tasks`: pending.
- 2026-10-01: K1 started (delegated writer). Tests written first, uncommitted: `apps/web/src/clients/validation.test.ts` (normalization, Spanish field errors) and `apps/web/tests/clients/clients-service.test.ts` (create, update, deactivate/reactivate, search, pagination, uniqueness incl. inactive and concurrent creates, atomic audit).
  - RED observed: both files fail on import with `ERR_MODULE_NOT_FOUND` (`src/clients/service.ts`, `src/clients/validation.ts`); log `scratchpad/b1-k1-red.log` (session scratchpad, not versioned).
  - Proposed design (not implemented): one `client` table, uuid id, `unique(identification_type, identification_number)`, `created_by`/`updated_by` → `user` ON DELETE RESTRICT; the service validates and normalizes (actions cannot bypass it); client row + audit row in one transaction; audit `details` carry `clientId` and changed field names only (no email/phone/address values; the log is append-only), `target_user_id` null; `client.*` activity labels; `/clients` nav becomes available; status filter defaults to active.
- 2026-10-01: **BLOCKED (disk).** Free space fell from ~8.5 GB to 2.9 GB (99%) during K1 while the test image was built; the writer stopped at the 5 GB guard with no commits and no running containers. Later the environment changed without action from this workflow (all containers restarted, Docker build cache 0, the `hachisky-web-test:b1` image no longer present); free space then 7.4 GB. Cause of the drop not established. Owner: do not rebuild or resume B1 until authorized.

- 2026-10-01: **B1 resumed** (disk 7.4 GB free, owner confirmed no builds/demos). Route: delegated writer, one writer (writer trigger: >2 non-trivial files). Test runner without building: compose override in the session scratchpad, own project `hachisky-b1-test`, existing image `hachisky-web:u23fix` reused read-only (its `/app/package.json` and `/app/pnpm-lock.yaml` verified byte-identical to the worktree's: sha256 `8dd7bcc7...` / `90bad479...`), worktree `src`, `app`, `tests`, `drizzle` and config files bind-mounted with `:z`. Containers removed with `down --remove-orphans` after each run; no image built, no demo started, no other project touched. Free space stayed 7.37-7.40 GB before and after every run (checked with `df -B1 /` before each).
- **K1 done** (commit `02b23f7`). RED: `ERR_MODULE_NOT_FOUND` for `src/clients/validation.ts` and `src/clients/service.ts` (both test files); the new permission tests were then also proven by mutation: with `deactivate`/`reactivate` opened to staff, 4 tests failed (`actual: 'no-error', expected: 'forbidden'` x2, `actual: 'not_found', expected: 'forbidden'`, matrix test), then the matrix was restored. GREEN: 42/42 (validation + service). Findings fixed in the tests while going GREEN: the fixture NIT `900.000.001-1` normalizes to `9000000011` (10 digits), the earlier draft expected 11.
  - Schema `src/db/schema/client.ts`; migration `drizzle/0003_clients.sql` generated by `drizzle-kit generate` inside the runner (only the new table: unique `(identification_type, identification_number)`, checks for type/blank name/blank number, `created_by`/`updated_by` ON DELETE RESTRICT, `timestamptz`); earlier migrations untouched, `meta/0003_snapshot.json` and the journal entry added.
  - Permissions (`src/clients/permissions.ts`, one matrix): view/create/edit admin+staff; deactivate/reactivate admin only. The service calls `authorize` first on every operation (before validation and before any query): no actor -> `unauthenticated`; unknown/forged role -> `forbidden`.
  - Service: validates and normalizes its own input; client row + audit row in one transaction; row lock (`FOR UPDATE`) on update/status changes; duplicate identification mapped from the unique violation (so concurrent creates have one winner); no-op update/status change writes no audit row; audit `details` carry `clientId`, name, and changed field names only (no email/phone/address); `target_user_id` null; there is no delete operation.
  - Tests added: `src/clients/validation.test.ts`, `tests/clients/clients-service.test.ts` (incl. permission suite), `tests/db/client-schema.test.ts`; `tests/db/auth-schema.test.ts` now expects the `client` table.
- **K2 done** (commit `7c6fe73`). Pages: `/clients` (search by name or identification with or without separators, status filter defaulting to active, pagination, empty states that say the true reason), `/clients/new`, `/clients/[id]` (edit; Estado section with deactivate/reactivate only for admin, staff sees why not). Server Functions `src/clients/actions.ts` start with `await clientContext(...)` (session + module guard) and delegate to `src/clients/submit.ts`, which maps validation and rule errors to Spanish messages; the service remains the authority. `/clients` nav is now "available". Client actions show in Configuración > Actividad with the client name. UI reuses `src/users/admin.module.css`.
  - Tests: `src/clients/filters.test.ts`; `tests/clients/clients-submit.test.ts` (DB-backed: Spanish field errors save nothing, duplicate message, forged staff deactivate/reactivate rejected with no state change and no audit row, no session rejected); `tests/clients/clients-ui.test.ts` (rendered markup: admin sees deactivate/reactivate, staff sees no controls, no delete option, list/empty/pagination, form labels, activity label); structural test in `tests/auth/route-guards.test.ts` that every client Server Function starts with `clientContext`; `navigation.test.ts` updated.
  - TDD note (honest): for K2 the presentational code and its tests were written in the same pass, not RED-first. The permission-critical behaviors were proven by mutation instead: with the staff check removed from `ClientStatusSection`, with `setClientActiveAction` no longer calling `clientContext`, and with Clientes marked unavailable, 4 tests failed (`shows staff no deactivate or reactivate control`, `every exported Server Function checks the clients module first`, 2 navigation tests); all restored afterwards. The existing structural route-guard tests (every page declares its module, every Server Function module calls a guard) pass unchanged and now cover `/clients/new` and `/clients/[id]`.
- Verification (runner from `hachisky-web:u23fix` with the worktree mounted, 2026-10-01): `biome check src app tests proxy.ts next.config.ts drizzle.config.ts` exit 0 with the 4 known `globals.css` warnings (the plain `pnpm lint` also scans the image's pre-existing `.next` directory and is not meaningful in this runner; source paths were linted instead); `pnpm typecheck` exit 0; full `pnpm test` 358/358 (K1 run: 326/326); `pnpm build` exit 0 inside the runner with `.next` in the container filesystem (routes `/clients`, `/clients/new`, `/clients/[id]` built; free space 7.37 GB before and after); no build artifacts in the worktree (`git status` clean besides this document).
- Engram mirror `odd/b1-clients/tasks`: pending (the delegated writer has no Engram write; the parent should mirror this document).
- RDD assessment of the two work-unit commits (`gentle-ai review assess --committed-only`): not run by the writer; pending for the parent.

## Pending

- Browser walk-through (no demo stack was started). Owner steps, on an isolated demo when authorized (acceptance criteria 1-8):
  1. Admin and staff open `/clients`: empty list with "Nuevo cliente".
  2. Create with empty name or number: Spanish field errors, nothing saved.
  3. Create a valid (fictitious) client: it is listed; reload keeps it.
  4. Create another with the same type and number (try `900.000.001-1` vs `9000000011`): rejected with a clear message.
  5. Edit it: change appears; Configuración > Actividad (admin) shows "Editó un cliente" with the name and no contact data.
  6. Search by name fragment and by number with separators; status filter Activos/Inactivos/Todos; more than 25 clients paginate.
  7. Admin: Desactivar cliente (two-step) hides it from Activos, shows it under Inactivos, Reactivar restores it; no delete option anywhere. Staff: no deactivate/reactivate controls.
  8. Signed out: `/clients`, `/clients/new` and `/clients/<id>` go to the login page.
  Also check phone widths (cards under the table breakpoint) and keyboard focus on the forms.
- Forged-request check from staff in a real browser/HTTP session (the service and `submit` behavior are tested, the Server Function transport is not).
- Judgment Day / PR review, Engram mirror and RDD assessment of the commits (parent).

## Next step

Owner authorizes an isolated demo for the browser walk-through (K3), then Judgment Day and the PR plan together with U2.3 (chained PRs; B1 forecast about 2,300 authored lines including tests, so it must be split: data+service, UI).

## Native review (RDD)

- 2026-10-01: `review assess --base-ref a338135 --committed-only` → risk high (auth hot path `tests/auth/route-guards.test.ts`), review due. Owner granted consent. Four lenses (risk, resilience, readability, reliability) over target `sha256:28af626f…`; lineage `review-0649ba63fb763246` **approved**, acknowledged, authority burned. No correction opened.
- Advisory findings (non-blocking, separate later work): WARNING `R4-unexpected-error-log-drops-pg-code` (`submit.ts:60-64`, log the SQLSTATE with the error name); WARNING `R2-id-type-list-drift` (DB CHECK literal vs `IDENTIFICATION_TYPES`); WARNING `R3-empty-page-misreports` (`ClientList.tsx:62`, empty page > 1 says "Todavía no hay clientes" without a pager back); WARNING `R3-activity-details-unwired`: checked by the coordinator and **not confirmed**: `listAudit` selects `audit_log.details` (`src/users/service.ts:188`, `:217`) and the activity page passes the items unchanged to `ActivityList`; still unproven in a browser. Plus 9 SUGGESTIONs (incl. `R1-001`: audit IP taken from `X-Forwarded-For`, already a recorded deployment condition).

## Status and limits (owner, 2026-10-01)

B1 is **implemented, not fully validated end to end**. Implementation and native review accepted by the owner; no further review rounds now.

- TDD: K1 had RED before GREEN. **K2 did not have RED before implementation**; the later mutation checks (staff check, guard call, nav status) are supporting evidence and do not replace that TDD step.
- Checks observed: `pnpm test` 358/358, `pnpm typecheck` exit 0, `pnpm build` exit 0. **Lint ran on source paths** (`biome check` over `src app tests` and config files: 0 errors, 4 known warnings), **not the full `pnpm lint` command** (in the borrowed runner image it also scans an old `.next`).
- Pending: browser walk-through of acceptance criteria 1–8; a forged staff request over real HTTP against the Server Function.
- Non-blocking review warnings stay recorded above (not fixed by owner decision).
