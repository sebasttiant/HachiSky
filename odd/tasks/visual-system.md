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

- [ ] **V1a** Design tokens and type: extend `app/globals.css` with the worlds palette, layered
  shadow scale, gradient and motion tokens and the pill radius; load Roboto through `next/font`
  in `app/layout.tsx`. No component changes yet.
- [ ] **V1b** Shell: translucent sticky header with blur, the worlds accent bar, navigation hover
  and active states on the TIC colour, footer polish.
- [ ] **V1c** Home module tiles: hover lift with coloured glow, per-module world colour, arrow
  slide on hover, richer availability badges.
- [ ] **V1d** Billing and draft screens: elevated cards, table depth, an elevated total panel in
  the draft editor, status pills.

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
