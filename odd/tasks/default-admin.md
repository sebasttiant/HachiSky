# Default administrator on fresh installs

## Objective
Every new HachiSky installation starts with the administrator `admin@ilasesorias.com`, created automatically at startup with a generated password the owner can read from a local file.

## Scope (authorized 2026-10-04, owner chose "product feature")
- A one-shot startup step (compose service after `migrate`, before `web`) reuses `runBootstrap` with the fixed email `admin@ilasesorias.com`, name "Administrador", job title "Administrador".
- Password: random per installation (crypto, ≥ 24 chars), never printed or logged, never in argv or env; written to a host-mounted file `apps/web/secrets/initial-admin-password` (dir 0700, file 0600, git-ignored). The account must change it on first login (`must_change_password = true`).
- Idempotent: if the installation is already bootstrapped or has any admin, do nothing (exit 0, no file write, no password change). Never resets, repairs or deletes anything.
- Keep the existing stdin CLI (`bootstrap-admin` ops profile) working.
- Docs in README.

Out of scope: changing roles/permissions, a "super admin" role (roles stay admin/staff), recreating the demo DB, commits/push/VPS (not authorized).

## Decisions
- Random per-install password instead of one shared literal password (a shared default would open every installation).
- Existing installations (including the demo, already bootstrapped with another admin) are left unchanged; the owner can create `admin@ilasesorias.com` from Configuración → Usuarios there.

## Tasks
- [x] D1 Startup bootstrap with generated password + file + forced change + compose service + tests + README (route: delegated writer, auth-sensitive, 2+ files).
  - Files: `src/auth/default-admin.ts`, `src/auth/default-admin-cli.ts`, `tests/auth/default-admin.test.ts`, `compose.yaml` (`init-admin`, `web` depends on it), `tests/infra/compose.test.ts`, `.gitignore`, `.dockerignore`, `README.md`.
  - Implementation notes: temp file is per run (`initial-admin-password.<random>.tmp`) so concurrent runs cannot overwrite each other's password; only the run that created the admin renames it. Temp removed when no account can use it (pre-write refusals, already initialized by a concurrent run); kept (0600) when an account may already use it (exit 4). Existing final file on an uninitialized DB → exit 3, untouched. CLI exit codes: 0 created/already initialized, 1 config/dir/pre-write error, 3 password file exists, 4 inconsistent.
  - Evidence (writer, 2026-10-04): RED = `ERR_MODULE_NOT_FOUND src/auth/default-admin.ts` + 4/7 compose tests failing; GREEN = default-admin + bootstrap-admin + compose 43/43; all `tests/auth/*.test.ts` 102/102; tsc exit 0; biome exit 0 (4 known globals.css warnings); `docker compose config` lists `init-admin`.
- [x] D2 Parent verification: tests, tsc, biome; end-to-end against a disposable fresh database (file written 0600, sign-in works, forced change, second run no-op).
  - Evidence (parent, 2026-10-04): default-admin + bootstrap-admin + compose 43/43; tsc exit 0; `apps/web/secrets/` git-ignored. E2E on a new database in the disposable db-test cluster (dropped afterwards): migrations 0→7; run 1 "default-admin: created; password in secrets/initial-admin-password" exit 0, dir 700, file 600; run 2 "already initialized" exit 0, file unchanged; Better Auth sign-in with the file password OK, wrong password rejected; user admin@ilasesorias.com role admin, must_change_password true. Not run: a full `docker compose up` of the repo stack (bind mount + SELinux `:Z` on a real host dir); the demo stack is unchanged (already bootstrapped).
- [x] D2b Real compose start (owner-authorized isolated project `hachisky-defadmin-e2e`, 127.0.0.1:3105, 2026-10-04). Repo `compose.yaml` + override that only swaps the code source (snapshot `a6a1c11d3f240e5ed1e9177cfe4d652d5df242b2` in a volume, deps read-only, identical lockfiles), isolates the network and publishes via Caddy; init-admin keeps image USER node (uid/gid 1000), command, `./secrets:/run/hachisky-secrets:Z` bind and depends_on. Host secrets dir created `mkdir -m 700` (no chmod 777, not run as root).
  - Start order: db healthy → migrate exit 0 → init-admin exit 0 "created" → web + edge healthy. Host: dir 700, file 600, both uid=1000 gid=1000.
  - SELinux: host Enforcing but the Docker daemon runs WITHOUT SELinux support (SecurityOptions seccomp + cgroupns only; empty process/mount labels), so `:Z` is a no-op here and the file keeps `gconf_home_t`. The SELinux relabel path is NOT verified on this machine.
  - Browser (headless Chrome): initial password login → /account/password; /settings and /clients forced back to /account/password; change OK → /; old password rejected ("Correo o contraseña incorrectos…"); new accepted, /settings reachable. DB: password hash changed, must_change true → false.
  - Idempotency: second `up --force-recreate --no-deps init-admin` → exit 0 "already initialized"; admin count, user/password hash, file hash and mtime, must_change and admin_bootstrap record unchanged; same after `restart web`; sign-in with new password 200.
  - Resources left STOPPED (not removed): containers, volumes `hachisky-defadmin-e2e_app`/`_pgdata`, dir `~/.local/state/hachisky-defadmin-e2e/` (holds test-only passwords, 0600). Limit: mounted code, not a production image build.
- [ ] D3 Commit + native review — pending owner authorization.
