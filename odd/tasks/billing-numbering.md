# Billing numbering and issuance

## Scope and authority
Owner approved continuous per-issuer CC-0001-style numbering, independent of client/site, explicit initial configuration, last registered / next suggested display and validated manual selection before issuance. Drafts and copies consume no numbers; annulled numbers remain reserved. Worktree: b2-c4-drafts, branch feat/visual-system. Local work only; no push, PR, merge or destructive data operations.

## Tasks
- [x] N1 (done, 681/681): Add per-issuer numbering configuration and advisory reads, with generated migration, authorization, transactional audit and focused tests. No allocation or document status change.
- [x] N2 (done, 686/686): Numbering card on the issuer page — last registered here, next suggested, and an editable starting number. Browser check still pending.
- [x] N3 (done, 2026-10-21): atomic issuance in `src/billing/issuance.ts`. The numbering row is locked with the document, the document takes exactly the next number, and a refused issue consumes nothing — no gaps, and a partial unique index backs it. Annulling (which keeps its number reserved) is not built yet.
- [x] N4 (done, 2026-10-21): the document view reads issued cuentas with their consecutive and date, the draft page offers Emitir with the next number named, and Facturación lists Emitidas. Document layout per the owner (2026-10-21): letterhead is the brand only — issuer data signs at the bottom with the identification, no address anywhere — the title carries the emphasis, and "Favor consignar" prints the full account number in a prominent panel (masking stays in the pickers only).

## N1 acceptance
- Missing configuration is explicit, never an implicit start at one.
- Strict positive bounded integers and CC- minimum four-digit formatting.
- One configuration per issuer; serialize concurrent initial configuration and adjustments; forward-only changes with transactional audit and no-op handling.
- External starting baseline must not be represented as an internally issued document.
- Reads and advisory preflight neither reserve nor consume numbers. Draft create/save/discard do not alter numbering.
- Admin authorization before database access; synthetic test data only.
- Leave existing document schema draft-only; no issuance endpoint or fake issued identity.
- Generate only the new migration/snapshot/journal entry; never rewrite historical migrations or run schema push.

## N1 evidence
Table `billing_numbering` (migration 0009, additive only; no historical migration rewritten). `src/billing/numbering.ts` owns the series: `getNumbering`, `configureNumbering`, `previewConsecutive`, plus `formatConsecutive`/`parseConsecutive`. Admin-only `view_numbering` and `configure_numbering`. Rule codes `numbering_not_configured` and `numbering_backwards` with Spanish messages. Audit action `billing.numbering_configure` records ids and numbers only.

Tests written before the implementation existed; the first observed run of the 14 focused cases was GREEN, so the RED step was only the missing module, not a behavioural failure. Checks: focused 14/14, full suite 681/681, typecheck 0, Biome 0 errors (9 pre-existing warnings), build ok. Not yet exercised in a browser: N1 has no UI.

## N2 evidence
`NumberingSection` on `/settings/issuers/<id>`: "Último registrado aquí" (never a carried-over number), "Siguiente sugerido" (or "Sin configurar") and the editable starting number. `submitConfigureNumbering` plus `configureNumberingAction`, which revalidates the issuers layout. The Server Function guard test counts exported actions on purpose, so it moved from 13 to 14.

Checks: focused 5/5 UI, full suite 686/686, typecheck 0, Biome 0 errors (9 pre-existing warnings), build ok. Browser verification pending.

## Verification and evidence
Pending for N3 onward. Use isolated hv-c4 test runner after confirming its configuration. Observe RED then GREEN for applicable tests, run typecheck, Biome and regression tests. Source is read-only in test containers; do not assume formatter writes persist. Production volumes and secrets are protected.

## Other requested work
Reports (general/follow-up/diagnostic), client sites, independent dashboard, billing duplication and reference-like document polish remain separately pending; this foundation does not complete them.
