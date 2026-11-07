# Node 26 and dependency upgrade
Upgrade the HachiSky web application to the latest stable, compatible, and secure runtime and direct dependency set without mutating production data or Docker volumes.
Keep runtime/toolchain, framework, data/auth, and remaining dependency changes reviewable and independently verifiable.

## Specs
1. **S1** — "Node 26 y dependencias"
2. **S2** — "quiero subir todo a lo ultimo estable seguro y demas tambien typescript todo"

## Tasks
- **T1** — S1-S2 — Establish registry-verified stable targets, migration risks, and the feature branch. Route: parent exploration/planning. Commit: `e42a634`.
- **T2** — S1-S2 — Upgrade every direct dependency pin and regenerate one coherent lockfile, including Node, pnpm, TypeScript, Node types, Biome, Next.js, React, Drizzle, pg, Better Auth, Zod, and matching types; preserve Docker reproducibility and supply-chain policy. Route: parent implementation after writer unavailability. Commit: `e42a634` (`chore(deps): upgrade runtime and dependency pins`).
- **T3** — S1-S2 — Prove Next.js and React compatibility and repair version-sensitive UI test integration. Route: parent verification; no compatibility edits required. Commit: `e42a634`.
- **T4** — S1-S2 — Upgrade Drizzle ORM/Kit and pg/types; prove schema and migration stability without generating an unrequested database migration. Route: parent checks plus independent verifier. Commit: `e42a634`; verification passed on the corrected Node 26 image.
- **T5** — S1-S2 — Upgrade Better Auth/auth; prove schema stability and preserve authentication, cookie, session, rate-limit, ban, and password-reset security behavior. Route: parent checks plus independent verifier. Commit: `e42a634`; verification passed on the corrected Node 26 image.
- **T6** — S2 — Upgrade Zod, Sharp, and every remaining direct dependency; preserve validation and image-processing behavior. Route: parent verification. Commit: `e42a634`; verification passed on the corrected Node 26 image.
- **T7** — S1-S2 — Run audit, typecheck, lint, 864+ tests, production build, native module checks, and Docker/Compose verification without touching production data or named volumes; update version documentation. Route: independent verifier. Commit: pending documentation commit; verification passed.
- **T8** — S1-S2 — Review the complete branch, reconcile findings, create reviewable commits, and prepare delivery without deploying production. Route: parent/native review according to risk. Commit: final feature closure.

## Log
- **L1** — "quiero subir todo a lo ultimo estable seguro y demas tambien typescript todo"
- **L2** — Selected scope: "Node 26 y dependencias"
- **L3** — Registry targets verified on 2026-11-06: Node 26.13.0, pnpm 12.18.0, Next.js 16.4.5, React/React DOM 19.3.1, TypeScript 7.0.2, Better Auth/auth 1.7.18, Drizzle ORM 0.45.4, Drizzle Kit 0.31.11, pg 8.23.1, Sharp 0.35.5, Zod 4.6.7, Biome 2.6.6, and matching latest stable type packages. Pre-upgrade audit: 17 advisories (3 critical, 5 high), including patched-version requirements for Next.js, Better Auth, Zod, source-map-js, and esbuild.
- **L4** — "ARREGLA TODAS LA VULNERABILDIADES Y TODO Y ACTUALIZA NEXT.JS Y TODO"
- **L5** — After updating all direct pins and adding version-scoped pnpm overrides for `source-map-js@1.2.1` and `esbuild@0.18.20`, `pnpm audit --json` reports 0 info, 0 low, 0 moderate, 0 high, and 0 critical vulnerabilities.
- **L6** — Next.js 16.4.5 and React 19.3.1 compatibility passed 112/112 UI tests across 39 suites and a complete production build without source compatibility edits.
- **L7** — Drizzle/pg verification passed 29/29 isolated database, schema, and migration tests on Node 26 against fresh `db-test` tmpfs. Independent verification confirmed unchanged schema/migration trees and `drizzle-kit check` returned "Everything's fine" with the patched esbuild override.
- **L8** — Better Auth 1.7.18 passed 50/50 isolated authentication, session, cookie, rate-limit, bootstrap, schema, password, ban, and admin-user tests. Independent verification confirmed the generated schema remains compatible and the upgrade closes the critical/high advisories affecting 1.7.6.
- **L9** — Correction: the Docker build and test commands behind L7 and L8 used paths relative to the main checkout instead of the `auth-hardening` worktree. Their Docker test counts are invalid for this candidate and must be replaced. The independent static checks used the correct worktree and remain valid. No production database or named volume was touched.
- **L10** — Replacement evidence used absolute context `/home/sebastian/Documentos/DEV/ILASESORIAS/HachiSky-worktrees/auth-hardening/apps/web` and Compose project `hachisky-node26-upgrade`. The rebuilt image asserted Node 26.13.0 and every requested dependency pin, then passed T4 58/58 tests across 11 files, T5 198/198 across 15 files, and T6 174/174 across 13 files. Only disposable `db-test` tmpfs was recreated and removed.
- **L11** — Full corrected Node 26 release gate passed: production and test images rebuilt from the absolute worktree; `pnpm audit`, typecheck, lint, and complete tests exited 0; 865/865 tests passed across 217 suites; Next.js production build generated 24/24 static pages; Sharp 0.35.5/libvips 8.18.7 loaded and produced PNG bytes. The extra test over the 864 baseline is the new runtime-version contract. No production database, credentials, named volume, or tracked source was mutated.
