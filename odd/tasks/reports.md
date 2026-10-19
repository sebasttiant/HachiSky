# Informes: general, seguimiento y diagnóstico

## Why this order
The module showed a hard-coded sample and Trabajo never saved anything, so a
report could only ever describe invented work. The owner's own rule is that a
report must never assert work nobody recorded. Activities had to become real
first; the templates are built on top of them, and AI assistance last.

## Tasks
- [x] R1 (done, 703/703): persist work activities — schema, validation, record-level authorization, service, audit and tests. No UI.
- [x] R2 (done, 699/699): record, list, edit and delete activities from Trabajo, replacing the preview. Verified in the browser: create, reload, edit, delete and an unreachable detail afterwards.
- [x] R3 (done, 745/745): storage, service and the fill-in screens. `SectionEditor` renders each section from its template `kind`, so one editor serves all five templates.
- [x] R4 (done, 745/745): `ReportSheet` and `/reports/[id]/documento`. One document view serves all five templates, rendering each section from its `kind`. See "R4 document evidence" below.
- [ ] R5: images with title and description. General attachments are NOT included — see the open question below.
  - [x] R5-S1: extract the shared sanitized-image pipeline from Billing. Commit `56a6d41`.
  - [x] R5-S2: additive `report_image` storage and the authorization-preserving service. Complete: full suite 770/770; independent high-risk verifier PASS. Commit `8159e80`.
  - [ ] R5-S3: authenticated upload/serve routes and the editing UI.
    - [x] R5-S3a: the HTTP boundary — guarded upload and private serving. Focused 74/74 plus a billing differential 54/54.
    - [x] R5-S3b: section-local editing UI (title, description, delete, reorder). Full suite 834/834.

## R5-S3b evidence: the editing screen

`ReportImagesEditor` sits inside each section's accordion as a SIBLING of the
section form, never nested: a form inside a form is invalid HTML and the
browser drops the inner one, which would silently break whichever control it
held. Each figure carries three sibling forms of its own — its text, its
order, its removal — and the move buttons name their direction on the button
itself, so one form serves both and the ends are simply disabled.

A figure now counts as section content: a step whose screenshot is the whole
explanation is not an empty section, so the summary says "Con contenido".

### Why there is a refresh action

The upload is the only report mutation that does not go through a Server
Function, so nothing revalidates the page for it. The first version called
`useRouter().refresh()`, which throws "invariant expected app router to be
mounted" under `renderToStaticMarkup` — how every UI test here renders — and
no other client component in this app uses the router. Rather than mount
Next's internal router context in the tests to keep one hook, the component
dispatches `refreshReportAction` through `useActionState`. That action runs
the same session and module guard as the rest, confirms the actor may still
reach the report, and writes nothing.

The form states the limits itself (1024 KB, 2000 × 2000, re-encoded to PNG
without the original metadata) instead of letting the server be the first to
mention them, and it says out loud when a section is full rather than only
greying the button out.

The preview reads the authenticated route like the rest: no public URL, no
object URL. `next/image` is deliberately not used — it would proxy private
bytes through the public optimizer — which is the same call, with the same
`biome-ignore`, that billing already made.

Checks: typecheck 0, Biome 0 errors and 14 warnings (the documented
baseline, unchanged), full suite 834/834 across 213 suites. An independent
verifier reviewed S3a and S3b together and returned PASS on authorization,
byte exposure, bounded bodies, audit minimization, guarded actions, UI form
nesting and slice boundaries; its one FAIL was the ordering text corrected
above. It did not rerun the suite itself.
  - [x] R5-S4: section-local figures in `ReportSheet` and print.
- [ ] R6: issued report with a preserved version and author snapshot.
- [ ] R7: AI assistance with the user's own model. Blocked on a product decision, see below.

## R5-S2 evidence

Migration `0012_report_images.sql` is additive. Images belong to seeded report
sections, retain a bounded contiguous order, and cascade with their report.
The service reuses report ownership rules for every read and mutation; private
bytes are selected only after ownership metadata authorizes the actor. Audit
rows contain ids and section keys, never title, caption or bytes.

Test-first evidence: the new test module was observed RED before the migration
and service existed. Final checks: typecheck clean, Biome clean, focused schema
and image service tests 26/26 under the independent verifier, and the complete
suite 770/770 across 201 suites. The verifier returned PASS for authorization,
data exposure, transaction/order integrity, audit minimization and slice
boundaries. Native assessment was unavailable because its package-local binary
was missing, so the risk-gated independent verifier supplied the outside view.
Risk: item 2 — authenticated image bytes and mutations cross staff/admin
ownership boundaries.

## R5-S3a evidence: the HTTP boundary

Two routes, both guarded before anything else happens:

- `POST /api/reports/[id]/sections/[key]/images` — multipart with the image,
  its title and its optional description.
- `GET /api/reports/images/[id]` — one stored figure, private headers, a
  fixed filename. There is no public URL for these bytes.

### Why multipart here, and why that needed a bound first

Billing uploads a raw body, because a logo arrives alone. A figure arrives
with its text and the title is required, so this route is multipart. That
matters for one reason: `Request.formData()` has no size limit of its own.
So the body is read through the shared bounded reader FIRST and the multipart
is parsed from that buffer, never from the live stream. A client that
declares no `Content-Length`, or lies about it, still cannot make the server
hold an unbounded body — there is a test that streams past the bound with no
declared length and expects 413.

`readLimitedBody` moved from `src/billing/image-upload.ts` to
`src/images/body.ts` rather than being copied: duplicating the one piece of
code that stops an unbounded read is how the two copies drift apart. The
extraction is mechanical, and the billing suites were run against it
separately (54/54), including "checks the byte limit before reading or
decoding the upload".

### What the boundary refuses, in order

Inside the handler: Origin and `Sec-Fetch-Site`, then session, then role,
then media type, then the declared length, then the streamed bound — and
only then is anything parsed.

At the public surface the route resolves the session first, because calling
the guard first is what `tests/auth/route-guards.test.ts` requires of a route
file. So a cross-origin request costs one session lookup before Origin
refuses it. An independent verifier raised this as a mismatch with an earlier
version of this section, and it was the text that was wrong, not the code:
resolving a session reads and never writes, and the body, the pipeline and
the service all stay behind the Origin check. The billing upload route has
the same shape, and its own comment still describes the handler order as if
it were the public order — worth correcting when billing is next touched.

The declared part type and the filename are never trusted: the shared
pipeline decides from the bytes, so an SVG named `captura.png` with
`image/png` is refused. Nothing is written for any refusal.

Figure text is never echoed back in an error, and the served response
carries a fixed `imagen.png`, so nothing the author typed reaches a header.

### Defect found by these tests

An id that is not a uuid reached PostgreSQL as a malformed value and came
back as a 500. That answered differently from an id that does not exist,
which is itself something to probe, and it read as an outage when nothing was
wrong. Fixed in `src/reports/images.ts`, where S2 already owns the rule that
unreachable and absent answer alike — not in the response layer by sniffing
Postgres error codes, which does not work anyway because Drizzle wraps the
driver error.

Risk: item 2 — a new authenticated public surface that serves stored bytes
and accepts uploads across ownership boundaries.

## R5-S4 evidence: figures in the document

`ReportSheet` now takes the figures alongside the report and prints each one
under the section that holds it, in the order the author put them in. A step
carries its own screenshot; nothing lands in an appendix the reader has to
hunt for.

Three rules this slice holds to:

- **A figure is content.** `hasContent` counts figures, so a section whose
  only content is a screenshot still prints. Dropping it would lose the one
  thing that section had to say. A section with neither text nor figures is
  still left out.
- **The title prints, not just the image.** A reference in the text still
  means something on paper, and a figure that fails to load is still named
  instead of leaving a blank.
- **A figure does not split across pages.** `break-inside: avoid` on the
  figure, and a height bound so a tall screenshot is scaled rather than
  clipped. A caption stranded away from its image says nothing.

The bytes come from the same authenticated route as the editor, so the
document has no public URL for them either. `reportImagePath` moved to
`paths.ts` so the server-rendered document can name the route without
importing the client component that also uses it.

Test-first: six document tests observed RED before `ReportSheet` accepted
the prop, then GREEN.

## R5 delivery slices

The feature branch already contains the earlier visual-system work and is far
past the preferred review size as a whole. R5 therefore continues as separate
local work-unit commits: S1 is the pipeline-only boundary, S2 is storage and
service with its migration/tests, S3 is routes and editing UI, and S4 is the
document/print renderer. Tests and documentation stay in the same commit as
the behavior they prove. No push, PR, merge or deployment is part of R5.

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

## R3 storage, as built
`0011_reports.sql`, additive only: four new tables, no drop.

- `report` — type, client, optional open-ended period, title, author separate
  from creator, status `draft`, audit columns.
- `report_section` — one row per section: position, stable `key`, `kind`,
  heading and body. Rows and not columns, so a new kind or a renamed heading
  is data, never a migration.
- `report_item` — one table for every structured section, because a finding,
  a domain in the semáforo, a piece of equipment and a step are all "a
  labelled line with optional detail and an optional classification".
  `ITEM_FIELDS` decides which of status, priority and impact each kind
  accepts; the service refuses the rest instead of storing them silently.
- `report_activity` — the recorded activities the report is built from.

Rules the service enforces, none of which a screen may relax:
- An activity the author could not open is refused with the same answer as
  one that does not exist. Otherwise a report would be a side door into a
  colleague's work.
- A draft links activities live and the link is dropped when the activity is
  deleted: a report must not keep asserting work whose record is gone. R6
  freezes the issued copy.
- The type cannot change after creation, because the type is what decided
  which sections exist.
- Audit rows carry ids and the section keys that changed, never the text.

Verified: 26 focused tests, full suite green, typecheck and Biome clean.

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

## R3 screens evidence
Commit a0b4f80. The static `ReportSheet` preview and `sample-report` are gone.
In their place: `ReportList` (module index), `/reports/new` and `/reports/[id]`,
with `actions.ts` and `submit.ts` between the form and the service.

`SectionEditor` renders each section from its template `kind` rather than from
the report type, so the same editor serves all five seeded templates. The
activity picker attaches `work_activity` rows to a report.

Route guards and shell navigation cover the new paths. Checks: full suite
passed, typecheck 0, Biome 0, image rebuilt and `/api/health` reports ok with
12 migrations.

## R4 document evidence
`ReportSheet` plus `/reports/[id]/documento`. One view serves all five
templates because it renders each section from its `kind`, the same decision
the editor makes: prose as paragraphs, findings with priority and impact, the
semáforo and the inventory as tables, the manual as numbered steps.

Three rules the document holds to:
- A section with no content is left out. A document handed to a client does
  not show hollow headings; the gaps belong on the editing screen.
- A status carries its word as well as its colour, so a black-and-white print
  still says "En riesgo".
- A draft says it is a draft, exactly like the cuenta de cobro.

`getReport` now carries `authorName` and `authorJobTitle` so the document can
say who signs it. Read live while it is a draft; R6 freezes the snapshot.

Test-first: both author-field tests observed RED (26 pass, 2 fail) before the
join existed, then GREEN. Checks: 10 document tests, 28 service tests,
745/745 overall, typecheck 0, Biome 0 errors.

Biome warnings went from 9 to 14: the five added are the print-override
`!important` rules copied from the billing document route, where beating the
app chrome is the point. Weakening them would break the printed page.
