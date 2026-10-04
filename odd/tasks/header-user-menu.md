# Header user menu

## Objective
Open the account actions (change password, sign out) from the user's avatar, and stop the header from overflowing.

## Problem
The header clips "Cerrar sesión" at some widths. The key link and the sign-out button take permanent space next to the navigation.

## Scope (authorized 2026-10-03)
- The avatar/name becomes a button that opens a user menu with: name and role, "Cambiar contraseña" (key icon + text), "Cerrar sesión" (exit icon + text).
- Remove the standalone key link and sign-out button from the bar.
- Header adapts without clipping or horizontal scroll at 390, 768, 1280 and 1440 px and at 200 % zoom; same visual identity.
- Reuse the existing password-change route and `signOut()` flow. No auth, permission or session changes. No new dependencies.

Out of scope: multiple issuers, logos, banks, billing, general refactors, commits/push/merge/VPS (not authorized).

## Decisions
- Pattern: disclosure menu button (same as `MainNav`): native `<button aria-expanded aria-controls>`, panel with a link and a button, Tab order, Escape closes and returns focus, click outside closes. Not ARIA `role="menu"` (that pattern requires arrow-key roving focus, not needed for two actions).

## Tasks
- [x] T1 User menu + header adaptation + tests (route: delegated writer; trigger: 2+ non-trivial files — `UserArea.tsx`, `UserArea.module.css`, `LogoutButton.tsx`, `AppHeader.tsx`, `tests/auth/login-ui.test.ts`).
- [x] T2 Browser validation at 390/768/1280/1440 px and 200 % zoom; menu open/close, keyboard, password change and logout (route: inline, parent).
- [x] T3 Update only the `hachisky-b2-demo` stack with an identifiable snapshot (fresh code, offline build, disk watcher), keeping its DB, credentials and isolation (route: inline, parent).
- [ ] T4 Work-unit commit and native review — pending explicit owner authorization (commits not authorized yet).

## Checks
- Runner: `~/.local/state/hachisky-b2-demo/test-runner.sh <apps/web> <cmd>` (network-less container, copy of the working tree, demo `node_modules` read-only).
- Baseline before T1: `node --test tests/auth/login-ui.test.ts src/shell/navigation.test.ts` 24/24.
- Applicable: RED then GREEN on the UI tests; `pnpm typecheck`; `biome check src app tests`; full `pnpm test` subset that needs no DB.

## Progress
- 2026-10-03: exploration done, baseline 24/24 observed.
- 2026-10-03: real headless-Chrome measurement of the CURRENT header (before the change, /settings, admin): horizontal scroll at 1000 (scrollWidth 1249), 1280, 1440 (scrollWidth 1685) and 640 CSS px (1280 at 200 %); clipped "Cerrar sesión", "Cambiar contraseña", and at 1000 px also "Configuración" and the avatar. Removing key+logout alone does not fix 992–~1250 px, so `MainNav.module.css` was added to T1's surfaces. Owner added: fully responsive at every width (phones portrait/landscape, tablets, desktops, 2560 px, 200 % zoom).

## Save point (2026-10-03, owner shutting down the PC)
- T1 writer was STOPPED mid-task by the parent (owner shutdown). Working tree (uncommitted, nothing staged): 7 files modified — `AppHeader.module.css`, `AppHeader.tsx`, `LogoutButton.tsx`, `MainNav.module.css`, `UserArea.module.css`, `UserArea.tsx`, `tests/auth/login-ui.test.ts` (+344/−133, `git diff | sha256sum` 465d16067a366ac1). **Unverified**: the writer's last note was a format error in its test and a typecheck rerun pending; no RED/GREEN, typecheck or lint evidence recorded yet.
- Next: review the diff; re-run `test-runner.sh` (tests, typecheck, biome) and fix within T1's surfaces; then T3 demo update and T2 browser sweep.
- T3 plan (not executed): fresh volume for the new source snapshot + `.next`; reuse the existing installed `node_modules` READ-ONLY via a Docker volume subpath mount only if `pnpm-lock.yaml`/`package.json` hashes are identical; snapshot id = `git write-tree` with a temporary index (no commit). Reason: 6.69 GB free; a full reinstall would leave < 6.5 GB before the build.
- Tools kept in `~/.local/state/hachisky-b2-demo/` (700): `test-runner.sh`, `cdp-check.mjs` (23-width sweep + overlap check + menu keyboard/click checks via flatpak Chrome headless, no install), `guarded-run.sh`, `shots/before/`. `cookies.txt` holds an admin demo session (0600).
- Demo stack `hachisky-b2-demo` (6ab8d45 snapshot) has `restart: "no"`: after reboot start it with `docker compose --project-directory ~/.local/state/hachisky-b2-demo -f ~/.local/state/hachisky-b2-demo/compose.yaml --env-file ~/.local/state/hachisky-b2-demo/env up -d db web edge`.
- Not authorized: commits, push, VPS. T4 (commit + native review) waits for the owner.

## Resume 2026-10-04
- T1 finished by the parent from the stopped writer's diff (only change: biome formatting of one regex line in `tests/auth/login-ui.test.ts`). Pre-implementation RED was NOT captured (writer stopped before reporting it); not claimed.
- Checks (runner, no network): `node --test tests/auth/login-ui.test.ts src/shell/navigation.test.ts` 29/29; `tsc --noEmit -p tsconfig.json` exit 0; `biome check src app tests proxy.ts next.config.ts drizzle.config.ts` 0 errors, 4 known `globals.css` warnings. Note: `pnpm typecheck` hangs offline because pnpm 12 runs `install --verify-deps-before-run`; the runner calls `tsc`/`biome` directly.
- T3 demo: snapshot `faf7e359490416743dc676cc9d0d83622f55a625` (= `git write-tree` of 6ab8d45 + T1 diff, `apps/web` subtree; no commit). Fresh volume `hachisky-b2-demo_app-faf7e3594904` (244 files hash-identical to the snapshot, no old `.next`); `node_modules` reused READ-ONLY from `hachisky-b2-demo_app` via volume subpath (identical `package.json`/`pnpm-lock.yaml`/`pnpm-workspace.yaml` hashes). Offline `next build` OK under the disk watcher (7.05 GB free after). DB kept (migrations 6→6), same secrets and networks; old volume and `compose.6ab8d45.yaml` kept for rollback. Selector: `~/.local/state/hachisky-b2-demo/snapshot.env`.
- T2 browser (flatpak Chrome headless over CDP, /settings, admin): 23 widths (320–2560, phone landscape 844×390, 200 % zoom at 1280/1440): no horizontal scroll, no clipped controls, no overlap, header 65 px. Menu at 390, 1280, 640@2x: click opens, Escape closes and refocuses trigger, Enter and Space open, Tab goes trigger → Cambiar contraseña → Cerrar sesión and closes when focus leaves, outside click closes, panel inside viewport; link → /account/password; logout → /login and /settings then redirects to /login. Screenshots: `~/.local/state/hachisky-b2-demo/shots/after*/`.
- Pending: owner manual check (real devices, focus ring look, screen reader, mobile "Menú" nav panel opened together with the user menu); T4 commit + native review (not authorized).
