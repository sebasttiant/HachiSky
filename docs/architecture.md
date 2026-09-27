# Arquitectura

Monolito modular sobre Next.js, con PostgreSQL como única base de datos.
Docker es el mecanismo de desarrollo, prueba y despliegue.

## Topología actual (U1)

```
                        ┌───────────────────────────┐
                        │   Host (127.0.0.1:3100)   │
                        └─────────────┬─────────────┘
                                      │
                              network: app-net
                                      │
                ┌─────────────────────┼─────────────────────┐
                │                     │                      │
        ┌───────▼───────┐    ┌────────▼────────┐   ┌────────▼────────┐
        │   db          │    │   migrate        │   │   web           │
        │   PostgreSQL  │◄───┤   (one-shot,     │   │   Next.js       │
        │   18.6        │    │   corre y sale)  │   │   (runtime)     │
        │   vol: pgdata │    └─────────────────┘    │   healthcheck   │
        └───────────────┘                            │   /api/health  │
                ▲                                     └────────┬───────┘
                └─────────────────────────────────────────────┘
                          web también depende de db

        network: test-net (aislada, sin acceso a credenciales reales)
        ┌───────────────┐         ┌───────────────┐
        │   db-test     │◄────────┤   test         │
        │   tmpfs, sin  │         │   perfil "test"│
        │   volumen     │         └───────────────┘
        └───────────────┘
```

Servicios definidos en `apps/web/compose.yaml` (proyecto Compose `hachisky`):

| Servicio | Rol | Red | Notas |
| --- | --- | --- | --- |
| `db` | PostgreSQL 18.6 | `app-net` | Volumen nombrado `pgdata`; sin puerto publicado |
| `migrate` | Aplica migraciones una vez | `app-net` | Ejecuta `src/db/migrate.ts`, termina al finalizar |
| `web` | Aplicación Next.js | `app-net` | Publica `127.0.0.1:${HACHISKY_WEB_PORT:-3100}:3000`; healthcheck contra `/api/health` |
| `db-test` (perfil `test`) | PostgreSQL desechable | `test-net` (interna) | `tmpfs`, credenciales propias, sin persistencia |
| `test` (perfil `test`) | Ejecuta typecheck/lint/test/build | `test-net` (interna) | Sin acceso a la base real ni a sus credenciales |

## Aislamiento de redes

- `app-net`: red de la aplicación real (`db`, `migrate`, `web`).
- `test-net`: red interna y separada para el perfil de pruebas; el contenedor
  `test` no puede resolver `db` ni acceder a las credenciales de producción
  local.
- El puerto `3000` se evita deliberadamente para publicación en el host
  porque otro proyecto local ya lo usa; el puerto expuesto por defecto es
  `3100`, configurable con `HACHISKY_WEB_PORT`.

## Flujo de configuración

- Único archivo de secretos local: `apps/web/.env` (ignorado por git, excluido
  del contexto de build de Docker y de las imágenes). Contiene
  `POSTGRES_PASSWORD` y, opcionalmente, `HACHISKY_WEB_PORT`.
- `apps/web/.env.example` documenta la forma del archivo sin valores reales.
- Variables de conexión a PostgreSQL son discretas (`PGHOST`, `PGPORT`,
  `PGDATABASE`, `PGUSER`, `PGPASSWORD`), no una URL de conexión.

## Flujo de migraciones

1. El servicio `migrate` espera a que `db` esté saludable (`service_healthy`).
2. Ejecuta `src/db/migrate.ts`, que aplica las migraciones pendientes en
   `apps/web/drizzle/` con Drizzle ORM.
3. Registra únicamente `migrations before=N after=M` en éxito. En error,
   registra `Migration failed (code=<SQLSTATE>)` (o `code=unknown` si no hay
   un código de 5 caracteres alfanuméricos disponible), nunca el mensaje de
   error crudo, porque este puede incluir nombres de tablas, columnas o
   valores literales.
4. El servicio `web` depende de que `migrate` termine con éxito
   (`service_completed_successfully`) antes de iniciar.
5. La migración base (`0000_baseline.sql`) crea `app_instance` (fila única,
   `id = 1`, con `installed_at`) y la inserta de forma idempotente
   (`ON CONFLICT DO NOTHING`).

## Verificación de salud

`GET /api/health` combina el estado de la conexión y el de las migraciones:

| Situación | HTTP | Cuerpo relevante |
| --- | --- | --- |
| Base de datos y migraciones correctas | 200 | `{"status":"ok","database":"ok","migrations":N}` |
| Base de datos no disponible | 503 | `{"status":"error","database":"unavailable"}` |
| Falla la consulta de conteo de migraciones | 503 | `{"status":"error","database":"ok","migrations":"unavailable"}` |
| Cero migraciones aplicadas | 503 | `{"status":"error","database":"ok","migrations":"pending"}` |

Ninguna respuesta incluye texto de error. Limitación conocida: `migrations`
mayor o igual a 1 solo prueba que el migrador corrió y aplicó al menos una
migración; no compara ese conteo contra el journal local de Drizzle, así que
no garantiza que **todas** las migraciones esperadas estén aplicadas.

## Componentes planificados (no implementados)

- Worker separado para generación de PDF (Chromium), aislado del proceso web.
- Almacenamiento privado para documentos e informes emitidos.
- Proxy HTTPS delante de la aplicación para despliegue.
- Autenticación y autorización (Unidad 2).

## Limitaciones de producción

- Sin autenticación ni control de acceso todavía (planificado para U2).
- Sin respaldo ni restauración de la base de datos; no usar con datos reales
  hasta que exista esa capacidad.
- La imagen de runtime (~1.24 GB) incluye `devDependencies` y el árbol fuente
  completo; no está optimizada para producción.
- Solo la arquitectura `amd64` está validada para las imágenes base fijadas.
- `/api/health` no compara el conteo de migraciones contra el journal
  esperado (ver tabla anterior).
- `drizzle-kit` arrastra paquetes `@esbuild-kit/*` marcados como obsoletos por
  su propio mantenedor (dependencia transitiva, no código propio).
- `experimental.useTypeScriptCli` de Next.js está activo por defecto y es
  experimental; su aprobación para producción sigue pendiente.
- Biome no cubre varias reglas de `typescript-eslint` con información de
  tipos (`no-unsafe-*`, `switch-exhaustiveness-check`,
  `strict-boolean-expressions`, `restrict-template-expressions`); las reglas
  de `promise` solo existen en `nursery` y están inactivas.
- La generación de PDF con Chromium no forma parte de la aplicación todavía;
  el aislamiento (sandbox) no está validado en este contexto.
- Sin HTTPS, sin proxy, sin despliegue. La base de datos no está expuesta
  fuera de `app-net`.
