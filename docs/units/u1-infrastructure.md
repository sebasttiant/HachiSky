# Unidad 1 — Infraestructura

Entrega la base técnica de la aplicación web de HachiSky: proyecto Next.js,
PostgreSQL con migraciones, verificación de salud y flujo de desarrollo y
prueba con Docker. No entrega pantallas de negocio ni autenticación.

## Implementado (U1)

### Stack

| Componente | Versión |
| --- | --- |
| Next.js | 16.3.6 |
| React / React DOM | 19.3.0 |
| TypeScript | 7.0.2 |
| Node.js | 24.21.0 (imagen `node:24.21.0-trixie-slim`, fijada por digest) |
| pnpm | 12.6.0 (vía Corepack) |
| Biome | 2.5.14 |
| drizzle-orm | 0.45.3 |
| drizzle-kit | 0.31.11 |
| pg | 8.23.0 |
| zod | 4.6.5 |
| PostgreSQL | 18.6 (imagen `postgres:18.6-trixie`, fijada por digest) |

Base del sistema operativo: Debian 13 (trixie). Solo `amd64` está validado.

### Infraestructura Docker

- Proyecto Compose `hachisky` (`apps/web/compose.yaml`).
- Servicio `db`: PostgreSQL con volumen nombrado `pgdata`, sin puerto
  publicado, en la red `app-net`.
- Servicio `migrate`: contenedor de un solo uso que ejecuta
  `src/db/migrate.ts` y termina al finalizar.
- Servicio `web`: publica `127.0.0.1:${HACHISKY_WEB_PORT:-3100}:3000`, con
  healthcheck contra `/api/health`. El puerto `3000` se evita por estar en
  uso por otro proyecto local.
- Perfil `test`: `db-test` (PostgreSQL desechable en `tmpfs`, credenciales
  propias, `cluster_name=hachisky-test`) y `test`, ambos únicamente en la red
  interna `test-net`, sin acceso a las credenciales reales.

### Guarda de pruebas

`src/db/test-guard.ts` exige `APP_ENV=test` y compara la identidad completa
del destino contra `hachisky_test` / usuario `hachisky_test` / cluster
`hachisky-test` / host `db-test`. Un simple sufijo `_test` en el nombre de la
base no es suficiente: se comparan los cuatro campos para evitar que una
configuración incorrecta apunte una prueba a una base real.

### Migraciones

- `drizzle/0000_baseline.sql` crea `app_instance` (fila única, `id = 1`, con
  `installed_at`) y la inserta de forma idempotente.
- El migrador (`src/db/migrate.ts`) registra únicamente
  `migrations before=N after=M`. Los errores se registran como
  `Migration failed (code=<SQLSTATE>)`, o `code=unknown` si no hay un código
  de 5 caracteres alfanuméricos disponible; nunca se registra el mensaje de
  error crudo.

### Verificación de salud

`GET /api/health`:

- `200 {"status":"ok","database":"ok","migrations":N}` cuando todo está bien.
- `503` con `database: "unavailable"` si la base no responde.
- `503` con `migrations: "unavailable"` si falla la consulta de conteo.
- `503` con `migrations: "pending"` si el conteo es cero.

Ninguna respuesta expone texto de error. Limitación: un conteo mayor o igual
a 1 no prueba que **todas** las migraciones esperadas estén aplicadas (no se
compara contra el journal local).

### Gestión de dependencias

- `apps/web/pnpm-workspace.yaml` aprueba explícitamente scripts de instalación
  solo para `esbuild` (`allowBuilds: { esbuild: true }`), decisión del
  propietario del 2026-09-27. Cubre las versiones transitivas de `esbuild`
  que trae `drizzle-kit` (0.25.12, 0.28.2 vía `tsx`, y 0.18.20 vía
  `@esbuild-kit/core-utils`, marcado obsoleto por su propio mantenedor). Sin
  exclusiones de antigüedad de versión configuradas.
- Instalación reproducible con `--frozen-lockfile`.

## Evidencia de verificación

### Spike previo (2026-09-27)

Validación de compatibilidad TypeScript 7.0.2 + Next.js 16.3.6 en Docker:
typecheck, lint y build en 0; un error deliberado (`TS2322`) provocó salida
con código 1 y el mensaje `error TS2322` esperado en el archivo intencional.
Las capas de instalación provinieron de la caché de Docker (la política de
antigüedad de versión de pnpm no se ejerció en esa corrida); la generación de
PDF no se repitió en esa validación.

### Corrida de U1

- Typecheck, lint, test y build: 0 fallos.
- Migrador: `before=0 after=1` en la primera ejecución, `before=1 after=1` en
  una repetición.
- `/api/health`: 200 con `migrations: 1`.
- El contenedor de pruebas no puede resolver el host `db` (aislamiento de red
  confirmado).
- `.env` ausente en las imágenes construidas; la contraseña no aparece en los
  registros.
- Identidad de persistencia idéntica antes y después de un ciclo
  `down`/`up`.

### Correcciones de U1 (tras revisión independiente)

Una revisión independiente (Pi) identificó tres problemas: el endpoint de
salud ocultaba fallas en la consulta de migraciones, el migrador registraba
mensajes de error crudos, y el script de verificación de persistencia
ignoraba un puerto definido únicamente en `.env`. Correcciones aplicadas con
TDD:

- RED genuino observado: `ERR_MODULE_NOT_FOUND` para `health.ts` y ausencia
  del export `describeMigrationError`; 12 pruebas en verde y 2 en rojo.
- GREEN: 22/22 pruebas en verde tras la corrección.
- Chequeos completos (typecheck, lint, test, build): 0 fallos.
- Persistencia verificada en el puerto por defecto (3100), con una variable
  de shell (3101) y con el puerto definido únicamente en un archivo de
  entorno temporal (3102, sin tocar el `.env` real), restaurando cada vez el
  estado saludable en 3100.

**Nota sobre TDD estricto**: no se demostró RED antes de la implementación
inicial del código de U1 (fue implementación directa); sí se demostró
correctamente el ciclo RED-GREEN para las tres correcciones posteriores.

### Lint

4 advertencias intencionales de `!important` en la regla de movimiento
reducido de `globals.css`.

## Planificado (fuera de alcance de U1)

- **Autenticación y permisos** (Unidad 2). No hay control de acceso todavía.
- **Facturación**: nombre del módulo que administrará **cuentas de cobro**
  (no facturación electrónica, sin pretensión de cumplimiento DIAN).
  Ninguna pantalla ni lógica de este módulo existe en U1.
- Módulos Inicio, Clientes, Trabajo e Informes: sin implementar.
- Respaldo y restauración de base de datos.
- Worker de PDF, almacenamiento privado y proxy HTTPS.
- Identidad visual (logo, colores, tipografía): unidad separada, no
  integrada.

## Próximos pasos

1. Respaldo en GitHub de U1: commits y push realizados el 2026-09-27 en
   `feat/u1-infrastructure` tras escaneos con Gitleaks v8.28.0 (archivos, dos
   veces; contenido preparado por commit; historial `21e6268..HEAD` de 6
   commits), todos «no leaks found» con informes JSON vacíos. Evidencia local no
   publicada en `.verification/publish-scan/20260927T145805/`; limitación: los
   códigos de salida numéricos no se guardaron en archivo. PR #2 hacia `main`
   abierto, merge pendiente de decisión.
   GitHub respalda código y documentación, no la base de datos, `.env` ni
   otros archivos locales excluidos; su respaldo es una tarea separada.
2. Unidad 2: planificación de autenticación y permisos (Better Auth 1.7.6
   propuesto, no aprobado; roles y reglas por definir en esa unidad).
3. Unidad 3: cliente → jornada → actividades persistidas.
4. Unidades posteriores: Informes, Facturación (cuentas de cobro), tablero.

## Referencias

- Arquitectura y topología: [../architecture.md](../architecture.md).
- Operación local paso a paso: [../local-operation.md](../local-operation.md).
- Referencia técnica de la aplicación (en inglés): [../../apps/web/README.md](../../apps/web/README.md).
- Decisiones de producto y continuidad: [../../RESUMEN.md](../../RESUMEN.md).
