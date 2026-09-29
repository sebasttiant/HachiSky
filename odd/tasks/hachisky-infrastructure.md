# HachiSky — U1: infraestructura persistente

## Estado

U1 implementada y correcciones revisadas independientemente en modo lectura: base LOCAL operativa, apta para diseñar U2. Los tres hallazgos están resueltos en fuente con registros de comprobación; no es aprobación de producción ni certificación de todos los bytes actuales. Documentación preparada por Claude. Entrega Git: commits y push de U1 realizados el 2026-09-27 tras escaneos con Gitleaks v8.28.0 (archivos, dos veces; contenido preparado de cada commit; historial `21e6268..HEAD` de 6 commits), todos con «no leaks found» e informes JSON vacíos; evidencia local no publicada en `.verification/publish-scan/20260927T145805/`; limitación: los códigos de salida numéricos no se guardaron en archivo. U1 está publicada en `origin/feat/u1-infrastructure` y se entrega mediante el PR #2 hacia `main` (aún sin merge). Este documento no concede autorizaciones adicionales ni habilita U2/U3 o despliegue público.

## Objetivo

Aplicación mínima real con Next.js y TypeScript 7, PostgreSQL persistente, migraciones y pruebas aisladas, ejecutada con Docker. Sin autenticación ni funcionalidades de clientes todavía.

## Ruta y coordinación

- Ejecución delegada: un único trabajador Claude; regla de escritura multifichero.
- Pi mantiene este documento; Claude entrega evidencia y no modifica seguimiento sin coordinación.
- Preservar spike, RESUMEN.md, .atl/ y cambios existentes.
- Rama de entrega reportada por Claude: feat/u1-infrastructure. No cambiar o descartar trabajo automáticamente.
- TDD: Claude reportó Strict TDD activo en su configuración global; confirmar origen antes de implementar. Runner propuesto: node:test mediante `pnpm test` dentro del servicio test de Docker. Comando exacto del script pendiente de la definición de package.json.
- Commits/push: Commits y push de U1 realizados el 2026-09-27 tras escaneos con Gitleaks v8.28.0 (archivos, dos veces; contenido preparado de cada commit; historial `21e6268..HEAD` de 6 commits), todos con «no leaks found» e informes JSON vacíos; evidencia local no publicada en `.verification/publish-scan/20260927T145805/`; limitación: los códigos de salida numéricos no se guardaron en archivo. U1 está publicada en `origin/feat/u1-infrastructure` y se entrega mediante el PR #2 hacia `main` (aún sin merge).
- Presupuesto orientativo de revisión: unas 400 líneas por unidad, no límite de calidad. U1 puede superarlo por infraestructura y pruebas; reportar tamaño real y proponer separación antes de entrega/publicación, sin omitir pruebas. Estrategia ask-on-risk, sin PR autorizado.

## Tareas

- [x] A: verificar spike existente. Claude reporta imagen, versiones, typecheck, lint y build con salida 0; prueba negativa TS2322 con salida 1 esperada. Registros: `.verification/ts7-compat/20260927T132946/`. Caché de instalación y PDF no reejecutado son límites explícitos.
- [x] U1.1: configuración mínima, Docker y Compose implementados. Autorización expresa posterior para scripts de esbuild en pnpm-workspace.yaml; sin excepción de antigüedad nueva.
- [x] U1.2: PostgreSQL, migraciones y aislamiento implementados; errores de consulta y cero migraciones devuelven 503.
- [x] U1.3: registros históricos revisados respaldan checks y persistencia; servicio y base comprobados saludables en vivo. No se reejecutó toda la suite ni se vinculó íntegramente el árbol actual a los registros.
- [x] U1.4: tres hallazgos corregidos y revisados independientemente. Fuente y logs coinciden; comprobación viva GET salud exitosa en 3100. No se reejecutaron los caminos de fallo en esta revisión.

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
- Restore/backup no cubiertos: quedan pendientes antes de datos reales.
- Evidencia y commits: completados; commits y push registrados en la línea «Commits/push» de este documento. No marcar una unidad finalizada solo por escribir archivos.

## Siguiente etapa

U1.4 resuelta. Entrega Git de U1 completada (ver «Commits/push»); pendiente la decisión de merge del PR #2 a `main`. Si cambia un archivo después del escaneo, repetir el escaneo de secretos antes de publicar. Diseño de U2 puede avanzar; implementación sigue pendiente de aprobación. Luego U2 autenticación y U3 cliente → jornada → actividades persistidas.

## Revisión independiente

Verificador gentle-ai-verify, tarea muk6renp-1-qzq7: solo lectura, sin builds/tests/migraciones/reinicios. Consultó Git, Compose ps y GET /api/health. DB/web saludables, migrador exit 0, publicación solo 127.0.0.1:3100. Registros `.verification/u1/20260927T135707/` respaldan 12 pruebas aprobadas, lint con cuatro warnings, migración repetible y persistencia. Intento fallido de chequeo de secretos conservado y repetición aprobada; causa externa de desaparición de imágenes no establecida por esta revisión.

Hallazgos originales (resueltos en la revisión posterior de U1.4; ubicaciones históricas):
- `apps/web/app/api/health/route.ts:7–25`: error al consultar migraciones se convierte en cero y respuesta 200.
- `apps/web/src/db/migrate.ts:38–45`: error.message sin sanitización garantizada; no se observó fuga real.
- `apps/web/scripts/verify-persistence.sh:36–38`: puerto desde shell puede diferir de Compose cuando se configura solo en .env.

Revisión posterior de U1.4: fuente confirma 503 ante fallo/cero migraciones, SQLSTATE validado en el logger real y puerto consultado a Compose. Logs `.verification/u1-fix/20260927T141358/` respaldan 22 pruebas, checks y puertos 3100/3101; `port-envfile-case.log` respalda 3102 y restauración 3100. GET vivo de salud aprobado. No se reejecutó toda la suite en la revisión independiente.

TDD estricto de U1 original no demostrado. Claude reporta RED de módulo/export faltante y GREEN en correcciones; RED no localizado independientemente, ni prueba por sí solo cobertura conductual. Runtime con dependencias de desarrollo, backups/restauración y hardening pendientes antes de producción.
