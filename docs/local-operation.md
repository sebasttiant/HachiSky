# Operación local

Guía práctica para levantar, probar y verificar el stack de U1 en un equipo
de desarrollo. Todos los comandos se ejecutan desde la raíz del repositorio.

## Requisitos previos

- Docker y el plugin Compose (`docker compose`).
- Puerto `3100` libre en `127.0.0.1` (configurable; ver más abajo).

## Comando base de Compose

Definir esta variable una vez por sesión de terminal simplifica el resto de
los comandos:

```bash
C="docker compose -p hachisky --project-directory apps/web -f apps/web/compose.yaml"
```

## 1. Crear el secreto local

`apps/web/.env` no existe en el repositorio (está en `.gitignore`) y debe
crearse antes de levantar el stack:

```bash
(umask 077; printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 24)" > apps/web/.env)
```

Nunca versionar este archivo ni imprimir su contenido. `apps/web/.env.example`
documenta la forma esperada sin valores reales.

## 2. Levantar el stack

```bash
$C up -d --wait
```

Esto levanta `db`, ejecuta `migrate` una sola vez y arranca `web` en
`http://127.0.0.1:3100` (o el puerto configurado con `HACHISKY_WEB_PORT`).

Verificar salud manualmente:

```bash
curl http://127.0.0.1:3100/api/health
```

Respuesta esperada: `{"status":"ok","database":"ok","migrations":1}` (el
número de migraciones crece con el tiempo).

## 3. Detener sin perder datos

```bash
$C stop            # detiene los contenedores, conserva todo
$C down             # elimina los contenedores, conserva el volumen pgdata
```

**Nunca ejecutar `down -v`, `docker volume rm` ni una limpieza de volúmenes
contra este proyecto.** Eso borra permanentemente los datos de `pgdata` y no
existe todavía backup/restore.

## 4. Ejecutar las pruebas

Las pruebas corren solo en el perfil `test`, contra una base desechable
(`db-test`, en `tmpfs`, sin acceso a las credenciales reales):

```bash
$C --profile test run --rm test sh -c 'pnpm typecheck && pnpm lint && pnpm test && pnpm build'
```

Limpiar la base de pruebas al terminar:

```bash
$C --profile test stop db-test
$C --profile test rm -f db-test
```

## 5. Verificar persistencia

`apps/web/scripts/verify-persistence.sh` automatiza un ciclo `down` + `up` y
compara, antes y después, el identificador del sistema de PostgreSQL, el
timestamp `app_instance.installed_at` y el conteo de migraciones aplicadas.
Resuelve la dirección publicada del servicio `web` con
`docker compose port web 3000` en lugar de asumir un puerto fijo, por lo que
funciona igual con el puerto por defecto o con uno personalizado:

```bash
apps/web/scripts/verify-persistence.sh
```

## Puerto configurable

Definir `HACHISKY_WEB_PORT` (en `apps/web/.env` o en el entorno de la shell)
cambia el puerto publicado en `127.0.0.1`. Por defecto: `3100`. El puerto
`3000` se evita deliberadamente porque otro proyecto local ya lo usa.

## Nota operativa

Hecho observado (2026-09-27): durante U1 desaparecieron del entorno local
de desarrollo varias imágenes Docker sin contenedores en uso; los volúmenes
no se vieron afectados. La causa no está establecida: una limpieza
automática de imágenes es una hipótesis sin evidencia confirmada. Si un
comando falla porque falta una imagen, hay que reconstruirla antes de
continuar, por ejemplo:

```bash
$C --profile test build
```

## Referencias

- Arquitectura y topología completa: [architecture.md](architecture.md).
- Alcance y evidencia de U1: [units/u1-infrastructure.md](units/u1-infrastructure.md).
- Referencia técnica de la aplicación (en inglés): [../apps/web/README.md](../apps/web/README.md).
