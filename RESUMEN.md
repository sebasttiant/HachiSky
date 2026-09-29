# HachiSky — Resumen y continuidad

> Estado: Unidad 1 (infraestructura) implementada y verificada en `apps/web/` — Next.js, PostgreSQL, migraciones y verificación de salud, con Docker de extremo a extremo. Código y documentación de U1 respaldados en GitHub en la rama `feat/u1-infrastructure` (publicada el 2026-09-27 tras escaneos con Gitleaks v8.28.0 sin hallazgos; PR #2 hacia `main` abierto, sin merge); la base de datos y los archivos locales excluidos no forman parte de ese respaldo. Este archivo organiza decisiones y próximos pasos, no certifica pruebas ni autoriza por sí solo implementación, commits o despliegues. Detalle completo de evidencia: [docs/units/u1-infrastructure.md](docs/units/u1-infrastructure.md).

## Lectura rápida para Claude Code

1. Leer este documento y las instrucciones aplicables al repositorio.
2. Confirmar estado Git y trabajadores activos; preservar todos los cambios existentes.
3. Leer completo [RESULTS.md](spikes/ts7-compat/RESULTS.md) y contrastar sus afirmaciones con la evidencia disponible.
4. Presentar una unidad acotada de verificación y prototipo, con archivos y comandos exactos.
5. Esperar autorización explícita para ejecutar esa unidad. No repetir la investigación general ni bajar TypeScript.

## 1. Producto y alcance

**HachiSky** es la plataforma interna de trabajo diario de IL Asesorías. Su nombre honra a Hachiko. Debe ser profesional, atractiva, intuitiva, responsive y ampliable por módulos.

- Repositorio oficial: https://github.com/sebasttiant/HachiSky
- Identificador técnico: `hachisky`.
- Pi coordina decisiones y seguimiento; Claude Code ejecuta unidades autorizadas.
- Interfaz y documentos del negocio en español; identificadores técnicos en inglés.
- Primera etapa: una organización emisora con múltiples clientes; sin suscripciones comerciales ni multitenancy comercial.
- La futura web pública de IL en Astro es un proyecto separado. HachiSky mantiene Next.js.

### Flujo compartido

**Cliente → jornada → actividades → informe → cuenta de cobro → pago.**

Registrar información una sola vez. No toda actividad es cobrable: distinguir trabajo incluido en contrato, adicional y no cobrable. Informe y cuenta de cobro son documentos diferentes y vinculables.

## 2. Módulos y requisitos

| Módulo visible | Responsabilidad |
| --- | --- |
| Inicio | Indicadores, pendientes y accesos rápidos |
| Clientes | Empresa/persona, contactos, sedes e historial |
| Trabajo | Jornadas, actividades, agenda y seguimiento |
| Informes | Preparación, revisión, emisión y exportación |
| Facturación | Cuentas de cobro, pagos, abonos, vencimientos y saldos |
| Configuración | Emisor, marca, plantillas, usuarios y permisos |

### Jornadas

- Cliente, sede y contacto opcionales, responsable y fecha.
- Modalidad **solo fecha**: no exigir ni inventar horas.
- Modalidad **rango horario**: inicio y fin explícitos, con validación.
- Informes por período agrupan jornadas conservando su información temporal.
- Actividades seleccionables desde catálogo y editables; también creación manual.
- Descripción real, resultado, estado, observaciones y evidencias.
- Seleccionar una actividad no equivale a completarla.
- Estados de guardado honestos y recuperación ante fallos.

### Informes

Tipos previstos: jornada/actividades, técnico e informe ejecutivo por período.

- Identidad del emisor IL, cliente, fecha/período, resumen, actividades, resultados, evidencias y próximos pasos.
- HTML descargable autocontenido y PDF desde el mismo contenido y versión de plantilla.
- Fuentes e imágenes sin dependencias externas necesarias para leer el documento exportado.
- PDF con márgenes, numeración y cortes de página cuidados.
- Borrador editable; al emitir, preservar contenido y datos históricos. Correcciones mediante revisiones explícitas.
- HachiSky como firma secundaria y configurable, no como sustituto de la identidad del emisor.
- Un archivo descargado no puede revocarse; enlaces privados son una funcionalidad distinta.

### Facturación: decisión expresa del propietario

**El menú y el módulo se llaman Facturación. Por debajo administran cuentas de cobro.**

- Acción: **Nueva cuenta de cobro**.
- Documento: título **Cuenta de cobro**, no factura electrónica.
- Emisor y cliente; serie/consecutivo; emisión, vencimiento y período del servicio.
- Conceptos manuales, de catálogo o de actividades seleccionadas.
- Cantidad, unidad, precio, total, notas y condiciones.
- Dinero con aritmética decimal exacta y reglas explícitas de redondeo.
- Numeración segura al emitir e idempotencia frente a doble clic/reintentos.
- Estados documentales separados de la situación de pago.
- Pagos parciales, saldo y anulación trazable; no borrar documentos emitidos.
- Duplicar genera un borrador nuevo, sin reutilizar el consecutivo.
- No implementar ni insinuar cumplimiento de facturación electrónica/DIAN. No copiar declaraciones tributarias históricas sin validación.

### Indicadores

Actividades pendientes/vencidas, informes pendientes, total emitido, cobrado, saldo y próximos vencimientos. Cada indicador debe tener fórmula, fecha de referencia y acceso a su detalle. No confundir cumplimiento a una fecha con avance del plan anual.

## 3. Stack: decisiones y evidencia

**TypeScript 7 es obligatorio. No sustituir por TypeScript 6 sin decisión explícita del propietario.**

- Next.js, React, pnpm y PostgreSQL: versiones estables actuales y compatibles, verificadas antes de su adopción.
- Node: línea 24 LTS; preferencia expresada por 24.21.0 al preparar el spike.
- Docker para desarrollo, pruebas y despliegue. Preferencia Debian 13 slim.
- No beta, RC, canary, etiquetas flotantes `latest`, `--force` ni desactivación de chequeos para ocultar incompatibilidades.
- Fijar versiones y lockfile. No actualizar el spike durante su revisión: preservar reproducibilidad.

### Versiones del spike según RESULTS.md

| Componente | Versión reportada |
| --- | --- |
| Node | 24.21.0 |
| Next.js | 16.3.6 |
| React / React DOM | 19.3.0 |
| TypeScript | 7.0.2 |
| pnpm | 12.6.0 |
| Biome | 2.5.14 |
| Playwright | 1.63.0 |
| Base | Debian 13, trixie-slim, amd64 |

Estas versiones no son una afirmación perpetua de “últimas”. PostgreSQL no forma parte del spike y no quedó validado por él.

### Arquitectura propuesta, no implementada ni aprobada íntegramente

Monolito modular, Next.js para aplicación, PostgreSQL para datos, trabajador separado para PDF, almacenamiento privado y proxy HTTPS. Evitar microservicios, Redis o Kubernetes sin necesidad medida. ORM, autenticación y cola requieren definición en su unidad correspondiente; no tratarlos como ya implementados.

## 4. Identidad y experiencia visual

El CSS publicado de IL usa azul oscuro `#044366` y acentos `#0098FF` / `#46BAF9`. No confundir con los valores cercanos de la referencia local webnueva.

Paleta propuesta para prototipo, pendiente de aprobación visual:

| Uso | Color |
| --- | --- |
| Navegación oscura | `#022E47` |
| Títulos y botón primario | `#044366` |
| Enlaces sobre claro | `#006BB8` |
| Acento cielo | `#0098FF` |
| Acento sobre oscuro | `#46BAF9` |
| Superficie informativa | `#EAF4FC` |
| Texto principal / secundario | `#102733` / `#4B626E` |
| Superficies | `#FFFFFF` / `#F3F6F8` |

- Sin crema/ámbar como identidad principal por ahora; son variantes no aprobadas.
- Contraste evaluado por combinación, tamaño y función, no por color aislado.
- Aplicación compacta y operativa; documentos con composición editorial.
- Navegación móvil adaptada, foco visible, teclado, estados con texto y movimiento reducido.
- Informe y cuenta de cobro comparten familia visual; la cuenta prioriza número, fechas, conceptos y total, sin portada innecesaria.

## 5. Estado y límites de la evidencia

### Observado por Pi al preparar este resumen

- Rama local `spike/ts7-compat`, con seguimiento de `origin/spike/ts7-compat`.
- Modificados: `app/layout.tsx`, `app/page.tsx`, `biome.json` y `scripts/render-pdf.ts`, todos bajo `spikes/ts7-compat/`.
- Sin seguimiento: `spikes/ts7-compat/RESULTS.md` y `.atl/`.
- No se determinó quién publicó la rama ni quién generó `.atl/`.
- Pi no reejecutó pruebas; no modificó el spike para preparar este resumen.

### Reportado por Claude, no reejecutado independientemente por Pi

- Typecheck, build, lint y generación PDF aprobados en Docker.
- Error deliberado TS2322 detectado por typecheck y build.
- PDF de cuatro páginas, fuentes embebidas, imagen, español y numeración.
- Claude informó inspección de cuatro capturas a 60 dpi; limitación para detalle tipográfico fino.
- La revisión posterior informó que no hay logs completos conservados de las ejecuciones.

Un commit conserva código; **no sustituye evidencia de ejecución**.

### Pendientes técnicos

- `useTypeScriptCli` de Next reportado experimental y activo por defecto: configuración vacía no elimina ese riesgo. Aprobación para producción sigue pendiente.
- `types: ["node"]` observado necesario: comprobar cobertura de tipos conforme se agreguen herramientas.
- Excepción acotada `minimumReleaseAgeExclude` para `@types/node@24.19.0` en `spikes/ts7-compat/pnpm-workspace.yaml`: sigue presente en el spike; revisar necesidad y justificación en tarea separada. Que pnpm la genere no equivale a aprobación de seguridad.
- U1 (`apps/web/pnpm-workspace.yaml`) no configura exclusiones de antigüedad. Solo aprueba scripts de instalación para `esbuild` (`allowBuilds: { esbuild: true }`), decisión del propietario del 2026-09-27, cubriendo las versiones transitivas que trae `drizzle-kit`.
- Biome no equivale a todas las reglas de typescript-eslint; documentar controles faltantes.
- Runtime no root no prueba sandbox Chromium. Aislamiento, límites, privacidad, autenticación y respaldos no están validados por el spike.
- No tocar, borrar ni publicar `.atl/` por suposición.

## 6. Próxima unidad propuesta

> **Nota de actualización**: lo efectivamente implementado como Unidad 1 fue
> infraestructura real (Next.js, PostgreSQL, migraciones, Docker, verificación
> de salud) en `apps/web/`, no el prototipo puramente visual sin PostgreSQL
> descrito originalmente en la sección B. La propuesta original se conserva
> abajo como registro de la decisión inicial. Evidencia real y limitaciones:
> [docs/units/u1-infrastructure.md](docs/units/u1-infrastructure.md). Próximos
> pasos vigentes: ver la sección 8.

**Verificación técnica acotada → prototipo visual → revisión del propietario.**

No repetir investigación general ni ejecutar en paralelo otro escritor sobre los mismos archivos.

### A. Verificación

Proponer y obtener autorización para reejecutar typecheck, lint y build del spike dentro de Docker. Conservar logs y códigos de salida en una ubicación ignorada. Si falla, reportar; no corregir el spike automáticamente ampliando el alcance.

### B. Prototipo visual

Ubicación propuesta: `apps/web/`, separada del spike.

Pantallas:
1. Inicio con indicadores de demostración.
2. Nueva jornada con horario opcional y selección de actividades.
3. Informe y vista de impresión.
4. Facturación: vista de cuenta de cobro y de impresión.

Límites:
- Datos ficticios, sin PostgreSQL, autenticación ni emisión/pagos reales.
- Estado “demostración” visible. Guardado simulado identificado, nunca presentado como persistencia real.
- Interfaz en español; rutas técnicas en inglés propuestas.
- Enumerar primero archivos de configuración raíz necesarios. No asumir permiso sobre toda la raíz.
- Verificar 360, 768 y 1280 px, teclado, foco y movimiento reducido.
- Entregar capturas, comandos, resultados, limitaciones y cómo abrir el prototipo localmente.

### Decisiones diferidas

Zona horaria y jornadas que cruzan medianoche; moneda y redondeo; serie histórica/nueva; autenticación, almacenamiento y política de retención. Resolver cada una antes de implementar la funcionalidad que depende de ella, no frenar el prototipo por decisiones de etapas posteriores.

**Actualizado al implementar U1**: el ORM ya no está diferido — se adoptó Drizzle ORM (`drizzle-orm` 0.45.3 + `drizzle-kit` 0.31.11) sobre PostgreSQL 18.6, con migraciones versionadas en `apps/web/drizzle/`. Autenticación, almacenamiento y política de retención siguen diferidos.

## 7. Seguridad y coordinación

- Repositorio público: solo ejemplos ficticios y `.env.example` sin secretos.
- No agregar documentos reales, uploads, PDFs privados, firmas ni datos de pago reales.
- No commits, push, merge, despliegues ni operaciones destructivas sin autorización explícita.
- Revisar estado antes de escribir y preservar cambios ajenos.
- Pi mantiene el seguimiento ODD de la siguiente implementación; reconciliarlo antes del primer cambio de código. No crear registros duplicados o fuera de la superficie autorizada.
- Este resumen no autoriza la implementación del prototipo. La autorización actual fue organizar la documentación de continuidad.

## 8. Estado real de la Unidad 1 y próximos pasos

Esta sección reemplaza, con evidencia real, la propuesta de la sección 6:
Unidad 1 se ejecutó como infraestructura funcional en `apps/web/`, no como
prototipo puramente visual.

### Resumen de evidencia

- Typecheck, lint, test y build en 0 fallos; migrador con
  `before=0 after=1` y luego `before=1 after=1`; `/api/health` en 200 con
  `migrations: 1`; el contenedor de pruebas no puede resolver el host `db`
  (aislamiento de red confirmado); `.env` ausente en las imágenes; identidad
  de persistencia idéntica en un ciclo `down`/`up`.
- Una revisión independiente de Pi encontró tres problemas (salud que ocultaba
  fallas de migración, mensajes de error crudos en el migrador, script de
  persistencia que ignoraba un puerto definido solo en `.env`); las tres
  correcciones se hicieron con TDD (RED genuino, luego GREEN 22/22) y chequeos
  completos en 0 fallos.
- TDD estricto no se demostró en la implementación inicial de U1 (sin RED
  previo); sí se demostró correctamente en las tres correcciones.
- Detalle completo, tablas de versiones y limitaciones:
  [docs/units/u1-infrastructure.md](docs/units/u1-infrastructure.md).

### Próximos pasos vigentes

1. Respaldo en GitHub de U1: commits y push realizados el 2026-09-27 en
   `feat/u1-infrastructure` tras escaneos con Gitleaks v8.28.0 sin hallazgos
   (detalle en `docs/units/u1-infrastructure.md`); PR #2 hacia `main` abierto,
   merge pendiente de decisión.
   Respaldo de la base de datos y de archivos locales: pendiente, por separado.
2. Unidad 2: autenticación y permisos — solo planificación por ahora (Better
   Auth 1.7.6 propuesto, no aprobado; roles y reglas por definir en esa
   unidad).
3. Unidad 3: cliente → jornada → actividades persistidas.
4. Unidades posteriores: Informes, Facturación (cuentas de cobro), tablero.
5. Identidad visual: unidad separada, todavía no integrada.

## Referencias

- [Reporte del spike](spikes/ts7-compat/RESULTS.md).
- [Evidencia y alcance de Unidad 1](docs/units/u1-infrastructure.md).
- [Arquitectura del sistema](docs/architecture.md).
- [Operación local](docs/local-operation.md).
- [Repositorio oficial](https://github.com/sebasttiant/HachiSky).
- [Web actual de IL, referencia visual](https://www.ilasesorias.com/).
- Referencias de Reports y droguería ya investigadas: reutilizar patrones selectivamente, no copiar dominios, autenticación o migraciones sin revisión.
