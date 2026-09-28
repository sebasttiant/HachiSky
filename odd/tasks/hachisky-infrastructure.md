# HachiSky — U1: infraestructura persistente

## Estado

U1 implementada, publicada en `origin/feat/u1-infrastructure` (c1f7e98) tras escaneo de secretos, y recuperada el 2026-09-28 después de un incidente externo de limpieza de Docker. Base LOCAL operativa, apta para diseñar U2; no es aprobación de producción. La política de reinicio de `web` está aplicada en el árbol de trabajo y pendiente de commit autorizado. Este documento no concede autorizaciones adicionales ni habilita U2/U3 o despliegue público.

## Objetivo

Aplicación mínima real con Next.js y TypeScript 7, PostgreSQL persistente, migraciones y pruebas aisladas, ejecutada con Docker. Sin autenticación ni funcionalidades de clientes todavía.

## Ruta y coordinación

- Ejecución delegada: un único trabajador Claude; regla de escritura multifichero.
- Pi mantiene este documento; Claude entrega evidencia y no modifica seguimiento sin coordinación.
- Desde 2026-09-28, mientras Pi no esté disponible: el propietario autoriza cada paso; Claude es el único ejecutor y solo edita este documento con autorización expresa; Cursor revisa en modo lectura (diff, registros, códigos de salida) y no escribe.
- Preservar spike, RESUMEN.md, .atl/ y cambios existentes.
- Rama de entrega reportada por Claude: feat/u1-infrastructure. No cambiar o descartar trabajo automáticamente.
- TDD: Claude reportó Strict TDD activo en su configuración global; confirmar origen antes de implementar. Runner propuesto: node:test mediante `pnpm test` dentro del servicio test de Docker. Comando exacto del script pendiente de la definición de package.json.
- Commits/push de U1: realizados el 2026-09-27 tras Gitleaks v8.28.0 (archivos dos veces, contenido preparado por commit y historial `21e6268..HEAD` de 6 commits), todos con "no leaks found" y reportes JSON vacíos. Evidencia local no publicada: `.verification/publish-scan/20260927T145805/`. Limitación: los códigos de salida numéricos no se guardaron en archivo.
- Presupuesto orientativo de revisión: unas 400 líneas por unidad, no límite de calidad. U1 puede superarlo por infraestructura y pruebas; reportar tamaño real y proponer separación antes de entrega/publicación, sin omitir pruebas. Estrategia ask-on-risk, sin PR autorizado.

## Tareas

- [x] A: verificar spike existente. Claude reporta imagen, versiones, typecheck, lint y build con salida 0; prueba negativa TS2322 con salida 1 esperada. Registros: `.verification/ts7-compat/20260927T132946/`. Caché de instalación y PDF no reejecutado son límites explícitos.
- [x] U1.1: configuración mínima, Docker y Compose implementados. Autorización expresa posterior para scripts de esbuild en pnpm-workspace.yaml; sin excepción de antigüedad nueva.
- [x] U1.2: PostgreSQL, migraciones y aislamiento implementados; errores de consulta y cero migraciones devuelven 503.
- [x] U1.3: registros históricos revisados respaldan checks y persistencia; servicio y base comprobados saludables en vivo. No se reejecutó toda la suite ni se vinculó íntegramente el árbol actual a los registros.
- [x] U1.4: tres hallazgos corregidos y revisados independientemente. Fuente y logs coinciden; comprobación viva GET salud exitosa en 3100. No se reejecutaron los caminos de fallo en esta revisión.
- [x] U1.5: recuperación tras limpieza externa de Docker (2026-09-28). Respaldo previo `pg_dump -Fc` fuera de Git (`~/Backups/hachisky/20260928T135715Z/`, SHA-256 `e8af65ce…14be4`, `pg_restore --list` legible; restauración no ensayada). Solo se reconstruyó `hachisky-web:local`; `migrate` salió con 0 sin aplicar cambios; `web` saludable; `db` con mismo ID y StartedAt; contenido de `app_instance` y migraciones idéntico. Evidencia: `.verification/u1-recovery/20260928T135715Z/`.
- [ ] U1.6: política `restart: unless-stopped` en `web`. Aplicada y verificada en el árbol de trabajo (16 pasos con salida 0; salud 200; `db` sin cambios). Evidencia: `.verification/u1-web-restart/20260928T144145Z/`. Pendiente: revisión de Cursor y commit autorizado en `feat/u1-infrastructure`.

## Superficie del ejecutor

La lista exacta de archivos es la propuesta U1 de Claude transmitida por el propietario. Resumen de límites:
- `apps/web/`: configuración, Dockerfile, compose.yaml, README, migraciones Drizzle, conexión/configuración, app mínima, pruebas y script de persistencia enumerados para U1.
- `apps/web/.env`: secreto local generado, ignorado por Git y excluido del contexto Docker; no mostrar su contenido.
- `.gitignore`: exclusión de `/.verification/` ya existente.
- `.verification/u1/`: registros locales ignorados, sin secretos.

El endpoint `/api/health` exige declarar expresamente `apps/web/app/api/health/route.ts`, omitido en la última tabla pegada. Cualquier otra ampliación debe comunicarse antes de escribir.

## Condiciones antes de ejecutar

1. Comandos completos: el mensaje pegado contiene líneas cortadas; no ejecutar copias incompletas.
2. `run` debe conservar el código original y devolverlo; detener el orquestador ante fallo, salvo la prueba negativa expresamente validada.
3. Confirmar que el proyecto Compose y puerto local no pertenecen a una instalación existente antes de usar down o recrear recursos.
4. DB real sin puerto publicado; test y db-test solo en red de pruebas, sin credenciales ni conexión a la base persistente.
5. Guardia de tests valida destino esperado y modo de prueba explícito; sufijo `_test` solo no basta como protección.
6. Nunca down -v sobre datos persistentes. Limpieza limitada a contenedores temporales propios.
7. No incluir .env en Git, imagen, logs ni contexto de build. Escapar correctamente credenciales en URLs.
8. No downgrade ni excepción automática de pnpm; informar y parar ante bloqueo.

## Aceptación y evidencia

- Typecheck, lint, tests y build en Docker aprobados con versiones ejecutadas registradas.
- Migraciones aplicadas por migrador y segunda ejecución sin cambios inesperados.
- Instancia y migraciones persisten tras down sin -v y up.
- Health responde sin filtrar secretos o errores SQL internos.
- No modificación del spike; Git enumera exclusivamente cambios nuevos autorizados y preexistentes preservados.
- Logs ignorados y secretos excluidos verificados.
- Backup: existe un respaldo lógico manual (U1.5). Restauración ensayada y política de respaldos siguen pendientes antes de datos reales.
- Evidencia y commits de U1.1–U1.4: publicados (c1f7e98). U1.6 pendiente de commit.

## Siguiente etapa

1. Revisión de Cursor y commit autorizado de U1.6 (y de este seguimiento).
2. Relanzar el spike de Better Auth (`spikes/better-auth/`, rama local `spike/better-auth`, sin commits). La corrida oficial `.verification/better-auth-spike/20260928T133217Z/` se detuvo en el paso 08 con salida 125 porque la limpieza externa borró su imagen; la compatibilidad sigue pendiente. Los resultados de las corridas de desarrollo no son evidencia.
3. Con `RESULTS.md` del spike, decidir la autenticación y proponer U2.1. Implementación de U2 pendiente de aprobación. Luego U3 cliente → jornada → actividades persistidas.

## Incidente 2026-09-28: limpieza externa de Docker

- Causa de `web` detenido: `dockerd` se apagó el 2026-09-27 a las 15:02:40 -05; al arrancar, `db` volvió por `restart: unless-stopped`, mientras que `web` no tenía política de reinicio y `migrate` es de una sola ejecución. Causa probable, no demostrada: el ID de `web` no pudo asociarse a las líneas del apagado.
- Limpieza posterior: `container prune` y `network prune` a las 13:32:56Z, 13:33:09Z y 14:42:34Z; las dos primeras también borraron imágenes (incluidas algunas ajenas a HachiSky). Se eliminaron `hachisky-web-1`, `hachisky-migrate-1`, `hachisky_test-net`, `hachisky-web:local` y `hachisky-web-test:local`.
- Origen: no identificado. Sin registros de Arcane ni de Portainer en esas ventanas, sin `prune` en historiales de shell ni en los comandos de los trabajadores. No modificar herramientas por sospecha.
- Sin evidencia de pérdida en `hachisky_pgdata`; esto no equivale a afirmar que no se perdieron datos.
- Pendientes: `hachisky-web-test:local` no reconstruida; la detención de `web` tardó 10 s (posible falta de manejo de SIGTERM), a evaluar como corrección aparte.

## Revisión independiente

Verificador gentle-ai-verify, tarea muk6renp-1-qzq7: solo lectura, sin builds/tests/migraciones/reinicios. Consultó Git, Compose ps y GET /api/health. DB/web saludables, migrador exit 0, publicación solo 127.0.0.1:3100. Registros `.verification/u1/20260927T135707/` respaldan 12 pruebas aprobadas, lint con cuatro warnings, migración repetible y persistencia. Intento fallido de chequeo de secretos conservado y repetición aprobada; causa externa de desaparición de imágenes no establecida por esta revisión.

Hallazgos originales (resueltos en la revisión posterior de U1.4; ubicaciones históricas):
- `apps/web/app/api/health/route.ts:7–25`: error al consultar migraciones se convierte en cero y respuesta 200.
- `apps/web/src/db/migrate.ts:38–45`: error.message sin sanitización garantizada; no se observó fuga real.
- `apps/web/scripts/verify-persistence.sh:36–38`: puerto desde shell puede diferir de Compose cuando se configura solo en .env.

Revisión posterior de U1.4: fuente confirma 503 ante fallo/cero migraciones, SQLSTATE validado en el logger real y puerto consultado a Compose. Logs `.verification/u1-fix/20260927T141358/` respaldan 22 pruebas, checks y puertos 3100/3101; `port-envfile-case.log` respalda 3102 y restauración 3100. GET vivo de salud aprobado. No se reejecutó toda la suite en la revisión independiente.

TDD estricto de U1 original no demostrado. Claude reporta RED de módulo/export faltante y GREEN en correcciones; RED no localizado independientemente, ni prueba por sí solo cobertura conductual. Runtime con dependencias de desarrollo, backups/restauración y hardening pendientes antes de producción.
