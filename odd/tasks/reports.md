# Informes: general, seguimiento y diagnóstico

## Why this order
The module showed a hard-coded sample and Trabajo never saved anything, so a
report could only ever describe invented work. The owner's own rule is that a
report must never assert work nobody recorded. Activities had to become real
first; the templates are built on top of them, and AI assistance last.

## Tasks
- [x] R1 (done, 703/703): persist work activities — schema, validation, record-level authorization, service, audit and tests. No UI.
- [x] R2 (done, 699/699): record, list, edit and delete activities from Trabajo, replacing the preview. Verified in the browser: create, reload, edit, delete and an unreachable detail afterwards.
- [ ] R3: seguimiento template built from recorded activities, saved as a draft.
- [ ] R4: diagnóstico and informe general templates.
- [ ] R5: attachments and images with title and description.
- [ ] R6: issued report with a preserved version and author snapshot.
- [ ] R7: AI assistance with the user's own model. Blocked on a product decision, see below.

## R2 evidence
- Full suite 699/699, typecheck and Biome clean (9 known `noImportantStyles` warnings). The total fell from 703 because the preview's own tests went with it.
- An independent verifier found two real defects, both fixed before closing: the
  client picker dropped every client after the first page, and the help text
  announced Informes as if it already worked.
- Browser run against the rebuilt stack created a synthetic activity, reloaded
  it, edited it, deleted it, and confirmed the detail is then not found. The
  synthetic record was removed; no demo data was left behind.
- Native review was unavailable (missing package-local binary), so the
  risk-gated plan ran with the independent verifier only. Review never
  authorizes delivery anyway.

## Owner decisions held
- Record access: staff read and edit only their own activities and reports; admin reaches all (2026-10-10).
- Client sites are a separate unit; no site column exists yet and none was invented.
- A reusable activity catalog is deferred, not dropped: the activity title is free text until the owner says who owns that catalog.
- AI assistance is bring-your-own-model, and the credential belongs to the ORGANIZATION, configured once by an administrator (2026-10-13). One secret to store, rotate and audit; one bill; collaborators never handle a key. Still undecided: which providers are allowed, and whether report content may leave the server at all.

## R3 design, settled before implementation

The owner asked for reports that can actually be filled in. Three templates
share one storage shape so a new section never needs a migration:

- `report` — type (`diagnostic` | `follow_up` | `general`), client, optional
  period start and end, title, author (who did the work, separate from who
  typed it, exactly as `work_activity`), status `draft`, audit columns.
- `report_section` — one row per section: report id, position, a stable `key`
  naming the section within its template, the heading as shown, and the body
  the person wrote. Storing sections as rows rather than as a column each is
  what lets the three templates differ without three tables.
- `report_activity` — the recorded activities a report covers: report id,
  activity id, position. A LINK while the report is a draft, so correcting an
  activity corrects the report. It is frozen into the issued version in R6,
  not before: a draft must not drift from the work it describes, and an issued
  document must not change after it is sent.

Sections per template, seeded when a report is created and editable
afterwards. The seeded headings are a starting point, never a claim:

- **Diagnóstico**: objetivo y alcance; situación encontrada; equipos y
  servicios revisados; hallazgos con impacto y prioridad; acciones realizadas;
  recomendaciones y plan de acción; conclusiones.
- **Seguimiento**: período; actividades realizadas (from `report_activity`);
  resultados; pendientes y próximos pasos.
- **General**: período; resumen ejecutivo; actividades agrupadas; resultados;
  pendientes; recomendaciones; conclusiones.

Rules that hold from R3 onward:

- A report never asserts work nobody recorded. Activity content is read from
  `work_activity`; the writer adds narrative around it and cannot invent a
  jornada through the report.
- Record access matches activities: staff reach only reports they authored,
  admin reaches all, and an unreachable report reads as not found.
- Audit rows carry ids and changed section keys only, never section bodies.
- Selecting an activity the author may not reach is refused, so a report
  cannot be used to read a colleague's work.

R3 delivers the persistence, the service and the fill-in screens for all three
templates. R5 adds images and attachments; R6 adds the issued version with the
author snapshot and the footer; printing must include every selected section
even when the screen has it collapsed.

## R4 design: specialised documents (owner, 2026-10-13)

The owner asked for two further document types, modelled on the references
they authorised. Their structure was read; no client data was copied.

- **Infraestructura** (diagnóstico or levantamiento): control del documento;
  fuentes de evidencia; resumen ejecutivo; semáforo por dominio; arquitectura
  identificada; inventario por sede; and one section per domain
  (virtualización y almacenamiento, respaldos y recuperación, red y
  switching, seguridad y accesos, continuidad), each carrying its findings.
- **Manual**: datos del documento; objetivo; el problema que resuelve;
  conceptos que deben quedar claros; qué se necesita; flujo completo; paso a
  paso con imágenes; evidencia de entrega.

### Why `report_section(body)` alone is not enough

The first three templates are prose. These two are not. A semáforo is a
status per domain, a finding carries impact and priority, an inventory is a
list of equipment per site, and a manual is ordered steps. Writing those as
free text would make them impossible to sort, colour, count or carry into the
next report, and the writer would have to re-type a table by hand.

So `report_section` gains a `kind`: `prose` | `findings` | `status_table` |
`inventory` | `steps`. Structured rows live in ONE child table rather than
four near-identical ones:

- `report_item` — section id, position, `label` (the domain, the finding, the
  equipment, the step), optional `body`, and three optional classifications:
  `status` (ok | watch | risk), `priority` (low | medium | high) and `impact`.
  Which of them apply is decided by the section's `kind`, and the service
  refuses the ones that do not.

`fuentes de evidencia` is a first-class section, not decoration: it is what
makes a diagnosis auditable, and it is the same rule as everywhere else — the
document states what was observed, not what was assumed.

`inventario por sede` is the first thing that genuinely needs client sites.
Until sites exist it stores a plain site label; it is upgraded to a real
reference when that unit lands, and existing rows keep their label.

### Credentials in a manual — needs an explicit decision

The reference manual distributes real usernames and passwords in a table, by
area and by server. Reproducing that faithfully would mean HachiSky stores
working credentials for a client's infrastructure in its database and prints
them into a shareable document. That is a different class of data from
everything else here, and it is not covered by any decision taken so far.

Until the owner decides, the manual template carries NO credentials section.
Nothing about this is implemented by guessing.

### Presentation bar

The references are finished documents: a status is a coloured chip, a
before/after is a comparison, steps carry their screenshots, and the whole
thing prints without losing a section. The templates are held to that, and
the rule from the cuenta de cobro applies unchanged — a draft says it is a
draft and never shows an identity it does not have.

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
