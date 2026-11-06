# Node 26 and dependency upgrade
Upgrade the HachiSky web application to the latest stable, compatible, and secure runtime and direct dependency set without mutating production data or Docker volumes.
Keep runtime/toolchain, framework, data/auth, and remaining dependency changes reviewable and independently verifiable.

## Specs
1. **S1** — "Node 26 y dependencias"
2. **S2** — "quiero subir todo a lo ultimo estable seguro y demas tambien typescript todo"

## Tasks
- **T1** — S1-S2 — Establish registry-verified stable targets, migration risks, and the feature branch. Route: parent exploration/planning. Commit: tracking/toolchain work unit.
- **T2** — S1-S2 — Upgrade every direct dependency pin and regenerate one coherent lockfile, including Node, pnpm, TypeScript, Node types, Biome, Next.js, React, Drizzle, pg, Better Auth, Zod, and matching types; preserve Docker reproducibility and supply-chain policy. Route: parent implementation after writer unavailability. Commit: `chore(deps): upgrade runtime and dependency pins`.
- **T3** — S1-S2 — Prove Next.js and React compatibility and repair version-sensitive UI test integration. Route: bounded writer, then parent verification. Commit: `fix(web): adapt to upgraded Next.js and React stack` when compatibility edits are required.
- **T4** — S1-S2 — Upgrade Drizzle ORM/Kit and pg/types; prove schema and migration stability without generating an unrequested database migration. Route: bounded writer plus independent verifier because this touches persisted-data contracts. Commit: `chore(data): upgrade database dependency stack`.
- **T5** — S1-S2 — Upgrade Better Auth/auth; prove schema stability and preserve authentication, cookie, session, rate-limit, ban, and password-reset security behavior. Route: bounded writer plus independent verifier because this touches authentication. Commit: `chore(auth): upgrade Better Auth stack`.
- **T6** — S2 — Upgrade Zod, Sharp, and every remaining direct dependency; preserve validation and image-processing behavior. Route: bounded writer, then parent verification. Commit: `chore(deps): upgrade remaining application dependencies`.
- **T7** — S1-S2 — Run audit, typecheck, lint, 864+ tests, production build, native module checks, and Docker/Compose verification without touching production data or named volumes; update version documentation. Route: parent checks plus independent verifier. Commit: `docs(infrastructure): record upgraded runtime stack`.
- **T8** — S1-S2 — Review the complete branch, reconcile findings, create reviewable commits, and prepare delivery without deploying production. Route: parent/native review according to risk. Commit: final feature closure.

## Log
- **L1** — "quiero subir todo a lo ultimo estable seguro y demas tambien typescript todo"
- **L2** — Selected scope: "Node 26 y dependencias"
- **L3** — Registry targets verified on 2026-11-06: Node 26.13.0, pnpm 12.18.0, Next.js 16.4.5, React/React DOM 19.3.1, TypeScript 7.0.2, Better Auth/auth 1.7.18, Drizzle ORM 0.45.4, Drizzle Kit 0.31.11, pg 8.23.1, Sharp 0.35.5, Zod 4.6.7, Biome 2.6.6, and matching latest stable type packages. Pre-upgrade audit: 17 advisories (3 critical, 5 high), including patched-version requirements for Next.js, Better Auth, Zod, source-map-js, and esbuild.
- **L4** — "ARREGLA TODAS LA VULNERABILDIADES Y TODO Y ACTUALIZA NEXT.JS Y TODO"
- **L5** — After updating all direct pins and adding version-scoped pnpm overrides for `source-map-js@1.2.1` and `esbuild@0.18.20`, `pnpm audit --json` reports 0 info, 0 low, 0 moderate, 0 high, and 0 critical vulnerabilities.
