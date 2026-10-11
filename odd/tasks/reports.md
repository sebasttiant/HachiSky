# Informes: general, seguimiento y diagnóstico

## Why this order
The module showed a hard-coded sample and Trabajo never saved anything, so a
report could only ever describe invented work. The owner's own rule is that a
report must never assert work nobody recorded. Activities had to become real
first; the templates are built on top of them, and AI assistance last.

## Tasks
- [x] R1 (done, 703/703): persist work activities — schema, validation, record-level authorization, service, audit and tests. No UI.
- [ ] R2: record and list activities from Trabajo, replacing the preview.
- [ ] R3: seguimiento template built from recorded activities, saved as a draft.
- [ ] R4: diagnóstico and informe general templates.
- [ ] R5: attachments and images with title and description.
- [ ] R6: issued report with a preserved version and author snapshot.
- [ ] R7: AI assistance with the user's own model. Blocked on a product decision, see below.

## Owner decisions held
- Record access: staff read and edit only their own activities and reports; admin reaches all (2026-10-10).
- Client sites are a separate unit; no site column exists yet and none was invented.
- A reusable activity catalog is deferred, not dropped: the activity title is free text until the owner says who owns that catalog.
- AI assistance is bring-your-own-model. Still undecided: whether the credential belongs to each colleague or to the organization, which providers are allowed, and whether report content may leave the server at all.

## R1 evidence
`work_activity` (migration 0010, additive): client, date, optional hours, title, description, outcome, status, next steps, author, audit columns. Every length, blank, enum and hour rule is a DB CHECK as well as a validation rule.

`author_user_id` is who did the work and is separate from `created_by`: an administrator may correct a colleague's entry without taking it over. Staff are scoped to their own rows on read, list, update and delete; a row they may not reach reads as not found rather than forbidden, so ids are not enumerable. Audit details carry ids and changed field names only — never description, outcome or next steps.

Test-first: tests written first, the audit-rollback case observed RED, then GREEN. Checks: focused 14/14, full suite 703/703, typecheck 0, Biome 0 errors (9 pre-existing warnings), build ok. No UI yet, so nothing to verify in a browser.

## Incident, 2026-10-10
A first version of the audit-rollback test added `CHECK (false)` to `audit_log`
with `ADD CONSTRAINT ... NOT VALID` followed by `VALIDATE`. The validate threw
outside the `try`, so the cleanup never ran and the constraint stayed in the
shared test database, failing eleven work tests and several billing suites.
Dropped with `ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_block`, and
the test now uses the established trigger-based `withAuditFault` helper from
tests/clients/clients-service.test.ts. Lesson: set up injected faults inside the
`try`, and reuse the existing helper instead of inventing one.
