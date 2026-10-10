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
