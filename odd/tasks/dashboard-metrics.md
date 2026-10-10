# Dashboard metrics for the home page

Branch `feat/visual-system`, worktree `b2-c4-drafts`.

The owner asked for a dashboard with metrics instead of the "Estado del sistema"
panel, which reads as a technical panel rather than something useful for running
the business.

## Hard rule

**Only real data.** Every number comes from a query against the database. No
estimates, no placeholders, no sample figures. A module whose screens are still
a preview with sample data (Trabajo, Informes) contributes no metric, because it
stores nothing real.

## Role finding

The application defines **exactly two roles, `admin` and `staff`**
(`src/auth/access-control.ts`, deliberate). There is no "super admin" role, so
the dashboard is for `admin`, the top role. No role is invented.

## Metrics (all backed by a table)

| Metric | Source |
| --- | --- |
| Active clients / total | `client.active` |
| Drafts in progress | `billing_document.status = 'draft'` |
| Draft value per currency | `sum(billing_document_line.amount_minor)` grouped by `billing_document.currency` |
| Team members | auth `user` table |
| Billing setup readiness | active `issuer_profile`, `signer_profile`, `bank_account`, `declaration_text` |

Amounts are never summed across currencies: COP and USD are reported separately,
in minor units, formatted by the existing money helpers.

## Tasks

- [x] **D1** Failing tests first: RED was `Cannot find module src/dashboard/metrics.ts`,
  then five tests covering active-vs-total clients (one deactivated through
  `setClientActive`), draft counts, per-currency totals, team and billing setup
  counts, zero drafts, and admin-only access.
- [x] **D2** `src/dashboard/metrics.ts`: `getDashboardMetrics` with its own admin
  guard and `DashboardRuleError`. Counts run in one `Promise.all`; the draft
  value is `sum(amount_minor)` joined from the lines and **grouped by currency**,
  so COP and USD are never added together.
- [x] **D3** `DashboardMetrics` server component with a Suspense fallback,
  rendered at the top of the home page for admins only. Four metric cards plus a
  per-currency value block. The system status panel stays where it was.
- [x] **D4** GREEN: focused **5/5**, full suite **665/665**, typecheck 0, biome 0
  errors (9 pre-existing warnings), build ok.

## Still open

- The owner has not looked at it yet; appearance is owner-gated as always.
- No metric exists for Trabajo or Informes on purpose: those screens are
  previews over sample data and store nothing real.

## Verification

Runner `hv-c4`; then rebuild `hachisky-web:local` and restart the local stack
without `down -v`.

## D5 — the side column stopped being a status light

The owner's words: "estado del sistema, esto no me dice nada". "Base de datos
conectada" never changes, so it carried no decision.

For administrators the side column now answers *what still needs a decision*:
drafts without concepts, without a signer or without a bank account, and billing
settings that are not configured yet. Each item links to the screen that fixes
it, and when nothing is pending it says so instead of padding the space. Below
it sit the three actions an administrator starts from. Staff keep the system
status, since they do not manage billing.

The pending counts are real columns: `signer_profile_id IS NULL`,
`bank_account_id IS NULL` and a `NOT EXISTS` over the document lines. They
describe the same gaps the document already prints as "Sin firmante", "Sin
cuenta" and "Sin conceptos"; they are not a rule about issuing, which does not
exist yet.

GREEN: focused **7/7**, full suite **667/667**, typecheck 0, biome 0 errors, build ok.
