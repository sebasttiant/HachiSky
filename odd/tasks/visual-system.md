# V1 Visual system: bring the IL Asesorías design language into HachiSky

## Objective

The owner's verdict: the app is "muy plano, le falta vida" next to the new IL Asesorías site
(`https://webnew.ilasesorias.com/`). Raise HachiSky to that design language while keeping its own
identity, accessibility and functionality. Functional and optimal first, beautiful with it.

## Why

HachiSky is the owner's product surface. A flat, lifeless UI undersells working software and does
not match the company's public identity.

## Source of truth: the real site tokens

Extracted read-only from the site's own stylesheets
(`/_next/static/chunks/0ytabacf01piu.css` and `0t7ull6i9a-ih.css`), not invented:

- **Shared already with HachiSky** — the site and the app use the same ink and background:
  `--color-ink: #102733` (app `--color-text`), `--color-ink-soft: #4b626e` (app `--color-text-muted`),
  `--color-bg: #f3f6f8` (app `--color-surface-alt`). The two are the same family; the app is the
  muted version of it.
- **The five worlds** (`"Cada color es un mundo"`): `--color-brand-tic: #09f`,
  `--color-brand-quality: #ffdb00`, `--color-brand-environment: #00ae00`,
  `--color-brand-safety: #e20001`, plus `--color-brand-deep: #004167` and
  `--color-brand-deep-strong: #002f4b`.
- **Layered shadows**, not single flat ones: `0 20px 60px #0041671f, 0 4px 12px #0041670f`;
  `0 12px 40px #0041671a`; `0 1px 3px #0041670a`; coloured glows `0 4px 12px #0099ff1a`.
- **Gradients**: `linear-gradient(135deg, var(--color-brand-deep), #00659e)`;
  the signature worlds bar `linear-gradient(90deg, tic, environment, quality, safety)`;
  cursor spotlight `radial-gradient(26rem circle at var(--mx), var(--my), #0099ff21, transparent 70%)`.
- **Motion**: `cubic-bezier(.4, 0, .2, 1)` at `.15s`–`.3s`, with a springy
  `cubic-bezier(.34, 1.56, .64, 1)` for reveals; arrows slide `translate(.25rem)` on hover.
- **Header**: translucent `#f3f6f8e0` with `backdrop-filter: blur(.8rem)`.
- **Type**: Roboto (`--font-roboto`); the app currently uses `system-ui`.
- **Pills**: `border-radius: 999px`.

## Constraints

- Keep HachiSky's essence: the navy/sky logo palette, the wordmark, the module tiles and navigation
  the owner already approved (`odd/tasks/visible-shell.md`).
- Accessibility is not negotiable. `app/globals.css` documents contrast ratios per token
  (border 4.0:1, focus 5.53:1, every status pair >= 4.5:1). Preserve them and never use
  `--color-accent` as body text on white.
- `app/globals.css` already has a `prefers-reduced-motion` block; every new transition must fall
  under it.
- Do not change behaviour, routes, permissions or data. This unit is presentation only.
- Keep the existing UI tests passing; they assert rendered markup, so class and structure changes
  must stay compatible or be updated with their reason.
- No real client data, amounts or signatures in code, fixtures or screenshots.

## Branch

`feat/visual-system` from `eb32b1b` in worktree `HachiSky-worktrees/b2-c4-drafts` (reuses that
worktree's `.env`, `secrets/` and running stack). Local commits only; no push, PR or merge.

## Tasks

- [x] **V1a** Design tokens and type. Commit `9a9ea7f`.
  - `app/globals.css`: the four world colours, `--color-brand-deep/-strong/-mid`, a layered
    elevation scale (`--shadow-sm/md/lg` plus `--shadow-glow-tic`), `--gradient-brand` and
    `--gradient-worlds`, `--ease-out`/`--ease-spring`, `--duration-fast/base`,
    `--transition-interactive` and `--radius-pill`.
  - Roboto self-hosted through `next/font/local` (`app/fonts/roboto-latin.woff2` and
    `roboto-latin-ext.woff2`, the official Google variable subsets, Apache-2.0, 72 KB together).
    **`next/font/google` was rejected on purpose**: the runner builds with no network egress and
    would fail to fetch it. The stack still degrades to the previous system fonts.
  - GREEN: `pnpm build` exit 0 **with no network**, `pnpm typecheck` exit 0, biome clean apart
    from the 4 known `globals.css` warnings, full suite exit 0.
- [x] **V1b** Shell. Commit `d7d16b9`.
  - `AppHeader.module.css`: the flat grey bottom rule is replaced by the worlds gradient as the
    header's bottom edge; the bar is translucent and frosted only inside
    `@supports (backdrop-filter: blur(1px))`, so unsupporting browsers keep the solid surface;
    the wordmark scales on hover with the spring easing.
  - `MainNav.module.css`: token transitions, a TIC glow on the toggle, deeper and rounded mobile
    panel, and the active-page marker moved from `--color-link` to `--color-world-tic`.
- [x] **V1c** Home tiles. Commit `d7d16b9`. Hover and focus lift of 2px with
  `--shadow-lg, --shadow-glow-tic`, a brand accent that grows from the top edge (`scaleX`), the
  icon tile filling with the brand gradient, and the arrow stepping `0.25rem` toward the reader —
  the same affordance the site uses. The page header rule carries `--gradient-brand` via
  `border-image`.
  - **Decision, deliberate**: no per-module world colour. The four worlds name the company's
    service lines (TIC, Calidad, Ambiente, SST), not this app's modules, so colouring "Clientes"
    yellow would invent brand meaning. HachiSky lives in Mundo TIC, so the single TIC accent is
    used throughout and the worlds palette appears once, as the header signature. Reversible if
    the owner wants module colours.
- [x] **V1d** Shared admin surfaces. Commit `d7d16b9`. `admin.module.css`: `.card` and
  `.tableWrap` raised to ambient elevation (a flat `--shadow-sm` on a bordered box was the main
  source of the flat look), hub tiles matching the home tiles, sticky table headers with a brand
  hairline, hovered rows marked on the leading edge, token easings on controls, a TIC focus halo
  over the unchanged `--color-focus` border (its documented 5.53:1 is preserved), and a lift on
  primary and secondary buttons.
- [ ] **V1e** Corporate draft workspace and saved-document preview — owner authorized, in progress.
  - Exploration complete: use configured issuer identity/logo, existing design tokens and discreet
    "Hecho con HachiSky" attribution. The supplied delivery manual is a read-only structural
    reference; never copy client content, embedded assets or operational details.
  - Preserve existing uncommitted preview work. One bounded writer will organize the editor and
    saved preview, explicitly label persisted values, add regression coverage and fix print CSS
    that currently hides the document's own header and signature footer.
  - No issuance, numbering, schema changes, invented logo, default declaration or generic document
    builder. Manuals and reports remain separate future work.
  - GREEN (hv-c4 runner): full suite **659/659**, `pnpm typecheck` exit 0, `biome check` exit 0
    (9 pre-existing warnings on this branch, no errors), `pnpm build` compiled successfully.
  - Print defect fixed: `documento/page.module.css` no longer hides every `header`/`footer`/`nav`.
    The shell `AppHeader`/`AppFooter` now carry `data-app-chrome`, and only `[data-app-chrome]` is
    hidden on paper, so the sheet's own issuer header and signature footer survive the print. Added
    `@page { size: A4; margin: 1.5cm }`.
  - Maker's mark added bottom-right of the sheet: small greyscale HachiSky mark then **HachiSky**
    with smaller **by IL Asesorías**, muted so it stays subordinate to the issuer identity. Covered
    by a new document-ui regression test.
  - Diagnosed the previously-undiagnosed lint error: a Biome formatter break in
    `tests/billing/document-service.test.ts`; fixed.
  - **Not yet verified by any automated check: actual on-screen appearance, responsive layout and
    real browser print-to-PDF.** The owner's eyes remain the gate. Local stack rebuild pending.
- [ ] **V1f** Dark mode. The site ships a full dark palette (`--color-bg: #07141c`,
  `--color-surface: #0d1e28`, `--color-ink: #e7f2f7`, dark border and link ramps). Not started;
  it is a separate unit, not a token tweak.

## Verification per task

Runner `hv-c4` (image `hv-authhard-test:f8e14ee`, disposable DB `hachisky_test`, internal network,
read-only source mounts, disk guard 5.5 GB):

```sh
pnpm test
pnpm typecheck
pnpm exec biome check src app tests proxy.ts next.config.ts drizzle.config.ts
pnpm build
```

Then rebuild `hachisky-web:local` and restart the local stack so the owner can look at it.

## Progress

- 2026-10-09: branch created; site tokens extracted read-only; document created.
- 2026-10-09: V1a `9a9ea7f`, then V1b+V1c+V1d `d7d16b9`. Combined GREEN in the `hv-c4` runner:
  full suite **650/650**, `pnpm typecheck` exit 0, `biome check` exit 0 (4 known `globals.css`
  warnings), `pnpm build` exit 0.
- 2026-10-09: `hachisky-web:local` rebuilt and the local stack restarted for the owner. Verified
  on the running app: `/api/health` ok with 9 migrations; the Roboto subset is served from
  `/_next/static/media/roboto_latin-s.p.113jqrlu1v-_f.woff2` as **HTTP 200, `font/woff2`,
  43136 bytes**, byte-identical in size to the committed file; the shipped CSS contains the
  worlds gradient, `backdrop-filter`, `border-image`, the `scaleX(0)` accent, the row marker
  `inset 3px 0 0 var(--color-world-tic)`, `--ease-spring: cubic-bezier(.34, 1.56, .64, 1)`,
  `scale(1.04)` and the minified arrow `translate(.25rem)`.
- Not verified by any automated check: how it actually looks. The owner's eyes are the gate for
  this unit, exactly as for the C4 interaction findings.
