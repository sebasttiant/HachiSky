# B2 Cuentas de Cobro (Billing Requests)

## Objective

Let an admin prepare, issue and annul cuentas de cobro issued by IL Asesorías for B1 clients, with a professional printable document, frozen data on issue and a safe consecutive. A cuenta de cobro is a payment request, not a received payment.

## Why

The owner's first useful business flow after clients: create a client, enter concepts, issue a cuenta de cobro and obtain a document to send.

## Owner decisions (2026-10-01; source of truth also in Engram `hachisky/b2-billing/*`)

- Single issuer: IL Asesorías; issuer data and identity configurable in the app, never hardcoded. Not DIAN electronic invoicing.
- Admin only (module `billing`).
- Lifecycle: editable draft without number (discardable); issue assigns `<n>TIC` in a locked transaction and freezes client, issuer, signer + exact signature version, bank account, payment terms, declaration (if any) and author; issued documents are immutable; annul requires a reason, keeps the number; numbers never reused; DB uniqueness.
- Numbering: format `<n>TIC`, continuous, no yearly reset. Owner keeps the external process until B2 is accepted; at cutover the owner confirms the last number used. The system never defaults to 1: issuing stays blocked until an admin sets the last external number (forward-only, audited). Tests and demos never consume real numbering.
- Items: PRODUCTO | DESCRIPCIÓN | CANTIDAD | PRECIO TOTAL; total entered per line; quantity is informative and does not multiply the amount (the form says so). Document total = sum of lines.
- Currency per document: COP default, USD optional; one currency per document, visible in amounts and total; no conversion. COP integer pesos, USD 2 decimals; stored as integer minor units; excess decimals rejected (no rounding).
- Bank accounts: configurable, selectable per document, independent of signers; show holder and currency; only accounts in the document currency are selectable.
- Payment terms: configurable default text, editable while draft.
- Signers: multiple admin-managed profiles (name, identification, job title, email, signature image); graphic signature, not a certified digital signature; validated format/size; protected, no public URL. Signer may differ from the author; keep both.
- Tax declaration: configurable texts, none by default. **Whether a declaration is mandatory is pending owner confirmation — do not implement an issue block for it, nor any default text.** The references contain two different texts; never present them as equivalent. The text used is frozen on issue.
- No taxes or retentions in the first version.
- Advances (option C): every cuenta is independent with its own consecutive; the concept may say "Anticipo 40 %"/"Saldo 60 %". No agreements, linked tranches or project totals (later evolution). Statuses only Borrador / Emitida / Anulada; never show balances or paid percentages.
- Printable A4 view following the owner's references; saved as PDF from the browser (no server PDF).
- No real data or signatures in code, fixtures, tests or screenshots.

## Authorized scope now (owner, 2026-10-01)

- **C1 only**: issuer settings, bank accounts and default payment terms; persistence, audit, admin-only access.
- Branch `feat/b2-billing` from `feat/b1-clients` at b89386a; worktree `HachiSky-worktrees/b2-billing`. Local commits only; no push, merge, demos, resource cleanup or unnecessary image rebuilds.

## Tasks

- [x] **C1** (observed checks below; `pnpm build` PENDING by disk guard) Issuer settings (single row), bank accounts (create, edit, deactivate/reactivate; no delete), default payment terms; migration `0004`; admin-only service + Configuración UI; audit with changed field names only (no account numbers in audit details).
- [ ] **C2** Signer profiles + versioned signature image (pending: validation approach to be verified and approved first; issuer logo upload belongs here too).
- [ ] **C3** Declaration text catalog (no default; mandatory-or-not pending).
- [ ] **C4** Drafts: document + lines, money module, draft CRUD.
- [ ] **C5** Numbering cutover, issue with snapshots, annul.
- [ ] **C6** Printable A4 view.
- [ ] **C7** Integrated verification (+ browser check only if separately authorized).

## TDD

- Mode: strict TDD **on** (source: user global config). Runner: `pnpm test` (node --test) in an isolated compose project using the existing `hachisky-web:u23fix` image with the worktree source bind-mounted (no image build; dependencies must be byte-identical), DB `postgres:18.6-trixie`.
- RED observed before GREEN for every behavior; behavior tests.

## Constraints

- Disk guard: check before every container run; stop the step if free < 5.5 GB. No image builds or pulls, no named volumes, no prune, no `down -v`, no touching other projects.
- Preserve existing behavior (U2.x, B1) and other agents' changes.

## Progress

- 2026-10-01: branch/worktree created from b89386a; document created. Free disk 6.1 GB at start.
- Engram mirror `odd/b2-billing/tasks`: pending (the delegated writer has no Engram write; the parent should mirror this document).
- 2026-10-01: **C1 done** (one local commit, route: delegated writer, writer trigger: 2+ non-trivial files). Runner: project `hachisky-b2-test`, image `hachisky-web:u23fix` (`package.json` and `pnpm-lock.yaml` verified byte-identical to the worktree's: sha256 `8dd7bcc7...` / `90bad479...`), worktree sources bind-mounted with `:z`, `postgres:18.6-trixie` on tmpfs; `down --remove-orphans` after each run; no image built, no volumes. Disk (`df -B1 /`): 6.51 GB free at start, 6.37 GB after the last full run (every run checked first; guard 5.5 GB never tripped).
  - **RED first** for every layer (tests written before any implementation, incl. UI and Server Function layer): focused run of `src/billing/validation.test.ts`, `tests/billing/*.test.ts`, `tests/auth/route-guards.test.ts`, `tests/db/auth-schema.test.ts` failed with `ERR_MODULE_NOT_FOUND` for `src/billing/validation.ts`, `service.ts`, `submit.ts`, `IssuerNotice.tsx`, `IssuerForm.tsx`, `BankAccountList.tsx`, `BankAccountForm.tsx`, `BankAccountStatusSection.tsx`; `ENOENT: ... '/app/src/billing/actions.ts'` (structural guard test); `labels billing configuration actions` failed because the activity list printed the raw `billing.issuer_configure` etc.; `applies cleanly and creates the auth tables` failed (`bank_account` and `issuer_settings` missing from the table list). Log in the session scratchpad (`b2/red.log`, not versioned).
  - **GREEN**: after the implementation and migration, the full `pnpm test` passed 417/417 (was 358 at B1 close). Failures found on the way and fixed: the guard test wants `await requireModule("settings", `/settings/bank-accounts/${id}`)` on one line (biome would wrap it; `biome-ignore format` with the reason), and an FK RESTRICT violation is SQLSTATE `23001`, not `23503` (test fixed).
  - **Mutation checks** (supporting evidence, restored afterwards): opening `save_issuer`, `view_bank_accounts` and `deactivate_bank_account` to staff, and removing the guard call from `setBankAccountActiveAction`, failed 4 tests (`refuses every operation to staff, no session and forged roles`, `refuses forged staff and anonymous requests with no state change and no audit row`, `refuses staff and no session in Spanish, changing nothing`, `every exported Server Function checks the settings module first`).
  - **What is operational** (admin only, enforced by the service `authorize()` first on every operation, reads included, plus `requireModule("settings", ...)` on every page and Server Function): Configuración > "Datos del emisor" (`/settings/issuer`: legal name, identification type and number, address, city, optional phone and email, optional default payment terms up to 1000 characters; shows "Sin configurar" until saved, no data is seeded or hardcoded); Configuración > "Cuentas bancarias" (`/settings/bank-accounts`, `/new`, `/[id]`: list showing bank, type, number, holder with identification, currency and status; create, edit, deactivate/reactivate with two-step confirmation; no delete anywhere). Activity labels added for the six `billing.*` audit actions.
  - **Data**: migration `drizzle/0004_billing_settings.sql` generated by `drizzle-kit generate` in the runner (tables `issuer_settings`, `bank_account` only; earlier migrations untouched; `meta/0004_snapshot.json` chains from `0003` by `prevId`; the journal `when` is greater than 0003's). `issuer_settings`: `id smallint` primary key pinned to 1 by a CHECK (a second row cannot exist), required legal name, identification, address, city (not blank), optional phone/email/payment terms (CHECK length <= 1000), `timestamptz`, `created_by`/`updated_by` RESTRICT. `bank_account`: uuid id, bank name, `ahorros`/`corriente`, account number (CHECK digits only, 4 to 20), holder name, holder identification type and number, currency `COP`/`USD`, `active`, `timestamptz`, `created_by`/`updated_by` RESTRICT.
  - **Decisions**: (1) Uniqueness `(lower(bank_name), account_number, currency)`, inactive rows included: the same account cannot be registered twice (case-insensitive bank name), currency is in the key because a bank can hold the same number in two currencies and a document uses one, and an inactive account is reactivated instead of duplicated. (2) Payment terms live in the issuer row and are saved with the issuer form (one form, one audit action `billing.issuer_configure`/`billing.issuer_update`), so they cannot be set before the issuer exists. (3) Required issuer fields: legal name, identification, address, city; phone and email optional (the brief did not mark them; this is a product assumption, easy to tighten). (4) Account number is digits only (spaces and dashes typed for readability are dropped, letters rejected, never guessed). (5) Audit `details` carry ids and changed field NAMES only (`changedFields`, `bankAccountId`); never bank names, holder names, account or identification numbers, phones or emails (tests assert none of those strings appear in the audit rows); no audit row for a no-op save. (6) Concurrent first issuer saves converge on one row (`INSERT ... ON CONFLICT DO NOTHING`, loser takes the update path); concurrent identical account creates have one winner. (7) The Server Function paths live in `src/billing/paths.ts` because a `"use server"` module may only export async functions. (8) Small refactor in B1 code: `src/clients/validation.ts` now exports `checkIdentificationNumber`, `isValidEmail`, `isValidPhone` (extracted unchanged, reused by billing validation); the existing client tests pass unchanged. (9) Shared `admin.module.css` gained `.fieldWide` and `.textarea`.
  - **Checks observed** (runner): `biome check src app tests proxy.ts next.config.ts drizzle.config.ts` exit 0 with the 4 known `globals.css` warnings (the plain `pnpm lint` also scans the image's old `.next`, so source paths were linted instead); `pnpm typecheck` exit 0; full `pnpm test` 417/417.
  - **Pending**: `pnpm build` (free space 6.37 GB, below the 6.5 GB threshold for this step), browser walk-through of the new screens (no demo stack was started), forged-request check over real HTTP (the Server Function transport is not tested; the submit layer and the guard structure are), phone-width layout and keyboard focus, Engram mirror, RDD assessment of the commit (parent). Logo upload and signers are C2 (not started).

## Next step

Parent: review C1, mirror this document to Engram, run `pnpm build` when disk allows (>= 6.5 GB free), then C2 only after the owner approves the signature-image validation approach.
