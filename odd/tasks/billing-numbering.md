# Billing numbering and issuance

## Scope and authority
Owner approved continuous per-issuer CC-0001-style numbering, independent of client/site, explicit initial configuration, last registered / next suggested display and validated manual selection before issuance. Drafts and copies consume no numbers; annulled numbers remain reserved. Worktree: b2-c4-drafts, branch feat/visual-system. Local work only; no push, PR, merge or destructive data operations.

## Tasks
- [x] N1 (done, 681/681): Add per-issuer numbering configuration and advisory reads, with generated migration, authorization, transactional audit and focused tests. No allocation or document status change.
- [ ] N2: Expose configuration and last/next display in admin UI, with functional checks.
- [ ] N3: Implement atomic issuance, immutable snapshots and uniqueness; preserve annulled numbers. Confirm whether manual issuance may skip forward before implementing that behavior.
- [ ] N4: Connect issued/draft document rendering and verify browser/print behavior.

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

## Verification and evidence
Pending for N2 onward. Use isolated hv-c4 test runner after confirming its configuration. Observe RED then GREEN for applicable tests, run typecheck, Biome and regression tests. Source is read-only in test containers; do not assume formatter writes persist. Production volumes and secrets are protected.

## Other requested work
Reports (general/follow-up/diagnostic), client sites, independent dashboard, billing duplication and reference-like document polish remain separately pending; this foundation does not complete them.
