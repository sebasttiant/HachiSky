# Spike de compatibilidad — TypeScript 7 + Next.js 16.3.6

## Objetivo y alcance

Validar, de forma aislada y completamente dentro de Docker, si la combinación
`next@16.3.6` + `react@19.3.0` + `typescript@7.0.2` + `@biomejs/biome@2.5.14` +
`playwright@1.63.0` funciona de extremo a extremo para: (a) chequeo de tipos,
(b) build de producción, (c) lint, y (d) generación de un PDF multipágina con
texto en español, imagen embebida y tabla larga. No se valida arquitectura,
autenticación, ORM, seguridad de Chromium ni nada fuera de este alcance. Este
documento distingue explícitamente resultados observados de inferencias.

Todo el trabajo se realizó dentro de contenedores Docker. No se realizaron
instalaciones globales en el host, ni `git commit`/`add`/`push`, ni cambios
fuera de `spikes/ts7-compat/`.

## Versiones fijadas vs. ejecutadas

| Paquete | Fijado en package.json | Ejecutado (observado en contenedor) |
|---|---|---|
| next | 16.3.6 | Next.js v16.3.6 |
| react / react-dom | 19.3.0 | (resuelto exacto en pnpm-lock.yaml) |
| typescript | 7.0.2 | Version 7.0.2 |
| @types/react / @types/react-dom | 19.3.0 | 19.3.0 |
| @types/node | 24.19.0 (más reciente 24.x disponible al momento) | 24.19.0 |
| @biomejs/biome | 2.5.14 | Version: 2.5.14 |
| playwright / @playwright/test | 1.63.0 | Version 1.63.0 |
| pnpm (packageManager) | 12.6.0 | 12.6.0 |
| Node (imagen base) | 24.21.0 | v24.21.0 |

Imagen base: `node:24.21.0-trixie-slim@sha256:8ec5d7557396cfe32d21c3f9c13072355ceab22b584578ca4bb28af31120cffe`.
Confirmado por `docker pull` (dos veces, en momentos distintos) devolviendo
exactamente ese digest. Sistema operativo dentro del contenedor: Debian
GNU/Linux 13 (trixie), `/etc/debian_version` = 13.7. Arquitectura de la imagen
construida: `amd64/linux` (única arquitectura validada; ver limitaciones).

## Tabla de evidencia (pasos 1–8)

| # | Comando (resumen) | Código de salida (host) | Extracto | Resultado |
|---|---|---|---|---|
| 1 | `pnpm install --lockfile-only` (uid 1000, sin root en host) | 0 | `Added 1 entry to minimumReleaseAgeExclude ... @types/node@24.19.0` / `Done in 3.3s using pnpm v12.6.0` | APROBADO |
| 2 | `docker build -t hachisky-spike:local .` | 0 | `naming to docker.io/library/hachisky-spike:local done` | APROBADO (con una corrección, ver abajo) |
| 3 | Error de tipo deliberado (`app/deliberate-error.ts`, `number = "texto"`) | typecheck interno=1, `docker run` host=0 (script valida que el fallo ocurrió) | `error TS2322: Type 'string' is not assignable to type 'number'.` | APROBADO |
| 3b | `pnpm typecheck` limpio (sin archivo deliberado) | 0 | `$ tsc --noEmit -p tsconfig.json` (sin salida de error) | APROBADO |
| 4 | `pnpm build` | 0 | `Running TypeScript ...` / `Finished TypeScript in 610ms` | APROBADO |
| 4b | `pnpm build` con archivo deliberado presente | 1 | `error TS2322 ...` / `Failed to type check.` | APROBADO (prueba que el build usa tsc 7) |
| 5 | `pnpm lint` (limpio) | 0 | `Checked 7 files in 10ms. No fixes applied.` | APROBADO |
| 5b | Violación deliberada de lint (`debugger;`, variable sin uso) | 1 | `lint/suspicious/noDebugger` (error) + `lint/correctness/noUnusedVariables` (warning) | APROBADO |
| 6 | Generación y verificación estructural del PDF | 0 | `Pages: 4`, fuentes `emb: yes`, 1 imagen ráster 200×120, texto con "Peña", "Página N de 4" | APROBADO |
| 6b | Verificación visual (4 páginas) | — | Ver sección PDF | APROBADO |
| 7 | Versiones efectivas | 0 | Ver tabla de versiones | APROBADO |
| 8 | Higiene del host (`git status`, `check-ignore`, secretos) | 0 | Ver sección de higiene | APROBADO |

### Corrección aplicada durante el spike (paso 2)

El primer intento de `docker build` falló con
`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`: pnpm 12.6.0 tiene una política nativa
y documentada de "minimum release age" que, al ejecutar
`pnpm install --lockfile-only` en el paso 1, había excluido automáticamente a
`@types/node@24.19.0` (publicado menos de 24 h antes) agregando una entrada en
`pnpm-workspace.yaml` (`minimumReleaseAgeExclude`). El `Dockerfile` original
solo copiaba `package.json` y `pnpm-lock.yaml`, sin `pnpm-workspace.yaml`, por
lo que dentro del contenedor la política volvía a aplicarse sin la exclusión y
`pnpm install --frozen-lockfile` rechazaba el paquete. Corrección: se agregó
`pnpm-workspace.yaml` al `COPY` del Dockerfile (antes de `pnpm install`). No se
modificó ninguna política de pnpm ni se usó `--force`; `pnpm-workspace.yaml` es
un archivo de configuración estándar y documentado de pnpm, generado por la
propia herramienta, no una alteración manual para evadir un control.

### Hallazgo de compatibilidad TS7: `types` explícito requerido

Con el `tsconfig.json` inicial (sin `compilerOptions.types`), `tsc` 7.0.2
no incluyó automáticamente los tipos ambientales de `@types/node`
(`Buffer`, `process`, imports `node:*`), produciendo 20 errores `TS2591`
aun con `@types/node` correctamente instalado en `node_modules/@types/node`.
Se verificó el paquete presente (`ls node_modules/@types/node` con contenido
válido) y se confirmó que agregar `"types": ["node"]` a `compilerOptions`
elimina los 20 errores sin tocar ningún otro ajuste. Este comportamiento se
reporta como observado con TypeScript 7.0.2 en esta configuración; no se
comparó contra TypeScript 6.x en este spike (prohibido por alcance), por lo
que no se afirma que sea una regresión respecto a versiones anteriores, solo
que la inclusión automática de `@types/*` no ocurrió aquí y el ajuste
explícito lo resolvió.

## `experimental.useTypeScriptCli`

No se agregó a `next.config.ts` (queda como `NextConfig` vacío), por
instrucción explícita del alcance. Según la documentación oficial
(https://nextjs.org/docs/app/api-reference/config/next-config-js/useTypeScriptCli,
versión de la página con `lastUpdated 2026-08-03`, consultada para
`next@16.3.6`), esta bandera está habilitada por defecto en Next 16.3.6 y "no
requiere configuración adicional"; sigue siendo experimental y la propia
documentación indica que no se recomienda para producción.

Inferencia (no medición directa del código interno de Next): la fase
`Running TypeScript` del build resolvió y falló en lockstep con los
diagnósticos de `tsc` 7.0.2 (mismo código `TS2322`, mismo mensaje), lo cual es
consistente con que Next esté usando el compilador TypeScript 7 instalado en
el proyecto por defecto, pero no se instrumentó el proceso de Next para
confirmar la ruta de código exacta.

### tsconfig.json: ¿lo reescribió Next?

Sí. Se comparó `tsconfig.json` antes y después de `pnpm build` dentro del
mismo contenedor:

- Cambio **obligatorio** aplicado por Next: `"jsx": "preserve"` →
  `"jsx": "react-jsx"` ("next.js uses the React automatic runtime").
- Cambio **sugerido** aplicado: se agregó `.next/dev/types/**/*.ts` a
  `include`.
- Next también reformateó arrays de una línea a formato multilínea (efecto
  colateral de su serializador JSON, sin impacto funcional).

Es decir, escribir de antemano la configuración "recomendada" no evitó que
Next modificara el archivo; el cambio de `jsx` es forzado por Next
independientemente del valor inicial.

## Controles de lint no cubiertos por Biome 2.5.14 (verificado)

Se usó `pnpm exec biome explain <regla>` dentro del contenedor para verificar,
regla por regla, qué existe en Biome 2.5.14:

**Existen (verificado), pero en dominio `nursery`/`types`, severidad `info`,
NO activadas por el preset `recommended` usado en `biome.json`:**

| Regla Biome | Categoría | Nota |
|---|---|---|
| `noFloatingPromises` | `lint/nursery/noFloatingPromises` | Disponible desde 2.0.0; dominio `types` |
| `noMisusedPromises` | `lint/nursery/noMisusedPromises` | Disponible desde 2.1.0; dominio `types` |
| `useAwaitThenable` | `lint/nursery/useAwaitThenable` | Disponible desde 2.3.9; dominio `types` |

**No existen en Biome 2.5.14 (verificado, `biome explain` responde
"Unrecognized option"):**

- `noUnsafeAssignment`
- `noUnsafeCall`
- `noUnsafeMemberAccess`
- `noUnsafeReturn`
- `noUnsafeArgument`
- `switchExhaustivenessCheck`
- `strictBooleanExpressions`
- `restrictTemplateExpressions`

Estas ocho reglas son equivalentes de `typescript-eslint` basadas en
información de tipos que Biome 2.5.14 no implementa. Ninguna de las tres
reglas "existentes" de la primera tabla está activa con la configuración
actual (`preset: recommended`), por lo que en la práctica este proyecto no
tiene ninguna verificación type-aware de promesas activa vía lint.

`eslint-config-next` no se usa en este proyecto (no aparece como dependencia
en `package.json`; el único linter configurado es Biome), verificado por
inspección directa del archivo.

## Verificación PDF

### Estructural (todo con `poppler-utils` dentro del contenedor)

- `pdfinfo`: `Pages: 4` (≥ 3 requerido). APROBADO.
- `pdffonts`: 3 subconjuntos de fuente, los tres con `emb=yes` (embebidas).
  APROBADO.
- `pdfimages -list`: 1 imagen, 200×120, ráster (no vectorial/SVG) — se generó
  un PNG programático propio (encoder PNG manual con `zlib.deflateSync` y
  CRC32 implementado a mano, sin dependencias externas) en vez de SVG, tal
  como pide el alcance para que este chequeo sea significativo. APROBADO.
- `pdftotext -layout`: texto extraíble; se confirmó la palabra "Peña" (con
  "ñ") repetida y otras palabras acentuadas ("validación", "Área",
  "Contraloría", "según"). Pie de página "Página N de 4" confirmado en las
  páginas 1, 2 y 4 mediante `pdftotext -f N -l N`. APROBADO.
- Solicitudes de red bloqueadas por `page.route('**/*', abort)`: 0. Se reporta
  honestamente que el valor esperado es 0 porque `page.setContent()` con
  `data:` URIs no dispara peticiones de red; la ruta de aborto nunca se activó
  porque no hubo nada que bloquear, no porque el bloqueo haya fallado.

### Visual

Se convirtieron las 4 páginas del PDF a PNG con `pdftoppm -r 60` (4 imágenes:
`page-1.png` a `page-4.png`). Esto es **conversión**, no inspección.

**Páginas efectivamente inspeccionadas con la herramienta Read (abiertas y
descritas una por una): las 4 (`page-1.png`, `page-2.png`, `page-3.png`,
`page-4.png`).** No queda ninguna página pendiente de inspección visual.

- Página 1: título "Informe de ejemplo — Cliente Ficticio S.A.S." legible,
  párrafo con acentos y "¿ / ¡" correctos, imagen azul con borde visible
  (200×120), encabezado de tabla con fondo azul claro, primeras 25 filas,
  márgenes A4 correctos, pie "Página 1 de 4".
- Página 2: continúa la tabla (filas 26–61), encabezado de tabla repetido
  correctamente (`thead { display: table-header-group }` funcionando), sin
  cortes de fila a la mitad, pie "Página 2 de 4".
- Página 3: continúa la tabla (filas 62–97), mismo patrón de encabezado
  repetido y filas completas, pie "Página 3 de 4".
- Página 4: última página, termina exactamente en la fila 120, resto de la
  página en blanco (comportamiento esperado de una tabla que termina), pie
  "Página 4 de 4".

Resultado visual: APROBADO para las 4 páginas.

## Efectividad del test de tipo deliberado

- Se escribió el archivo deliberado únicamente dentro de un contenedor
  efímero (`docker run --rm ...`), nunca en el host.
- Verificado en host: `ls spikes/ts7-compat/app/` no muestra
  `deliberate-error.ts`; `rg -n "deliberate" spikes/ts7-compat/` no encuentra
  coincidencias.
- Mismo procedimiento y misma verificación para el archivo de violación de
  lint (`app/lint-violation.ts`): nunca existió en el host.

## Higiene del host

`git -C <repo-root> status --short --untracked-files=all`
(salida final, después de todas las pruebas):

```
 M spikes/ts7-compat/app/layout.tsx
 M spikes/ts7-compat/app/page.tsx
 M spikes/ts7-compat/biome.json
 M spikes/ts7-compat/scripts/render-pdf.ts
```

Todos los cambios están confinados a `spikes/ts7-compat/`. Nota importante:
el repositorio ya tenía un commit previo `chore(spike): scaffold ts7
compatibility spike (work in progress)` en la rama `spike/ts7-compat` **antes**
de iniciar esta sesión (visible con `git log --oneline`); por eso los archivos
aparecen como modificados (`M`) y no como nuevos (`??`). Esta sesión no
realizó ningún `git commit`, `add`, `push` ni cambio de rama — solo
modificaciones en el árbol de trabajo, como exige el alcance. `README.md` no
fue tocado (`git diff README.md` sin salida).

`git check-ignore -v` verificado para cada patrón relevante:

- `out/`, `out/sample.pdf`, `out/page-1.png`: ignorados por `.gitignore:3:out/`.
- `next-env.d.ts`: ignorado por `.gitignore:5`.
- `*.tsbuildinfo` (probado con `foo.tsbuildinfo`): ignorado por `.gitignore:4`.
- `.env`, `.env.local`: ignorados por `.gitignore:6:.env*`.
- `node_modules/` y `.next/`: los patrones (`node_modules/`, `.next/`) son
  reglas de "solo directorio". `git check-ignore` no puede confirmar la regla
  sobre una ruta que no existe en disco como directorio; se verificó
  explícitamente creando ambos directorios vacíos de forma temporal y
  confirmando el match (`.gitignore:1:node_modules/` y `.gitignore:2:.next/`
  respectivamente), y también confirmando el match con contenido dentro
  (`node_modules/foo`, `.next/cache`). Ambos directorios de prueba se
  eliminaron inmediatamente después de la verificación.

Nota operativa: dos veces durante el spike, un `docker run` con
`-v /app/node_modules` (volumen anónimo) para aislar `node_modules` del host
creó un directorio vacío como punto de montaje en
`spikes/ts7-compat/node_modules` (y una vez también `spikes/ts7-compat/.next`)
propiedad de `root`, sin contenido. Esto es un efecto conocido de Docker al
crear el punto de montaje de un volumen anónimo dentro de un bind mount, no
una fuga de `node_modules` real con paquetes instalados. Ambos directorios
vacíos se eliminaron con `rmdir` inmediatamente después de detectarlos.

Escaneo de secretos (`rg -i 'password|secret|token|api[_-]?key'` sobre
`spikes/ts7-compat/`, excluyendo `node_modules`, `out` y `.git`): sin
coincidencias.

## Limitaciones

- Solo se validó arquitectura `amd64/linux`. No se probó `arm64`.
- No se realizó ningún endurecimiento (hardening) de seguridad de Chromium ni
  del contenedor; Playwright se ejecuta con las opciones por defecto.
- No se validó arquitectura de aplicación, autenticación ni capa de datos
  (ORM); el spike es exclusivamente de compatibilidad de toolchain
  (TypeScript 7 + Next 16 + Biome + Playwright).
- `docker images` no retuvo una entrada separada para la imagen base tras el
  build (comportamiento del backend BuildKit de Docker 29.8.1 con
  almacenamiento direccionado por contenido); esto no afecta la validez de
  los resultados — el digest de la imagen base se reconfirmó de forma
  independiente con dos `docker pull` exitosos devolviendo exactamente el
  digest fijado.
- El chequeo de "0 solicitudes bloqueadas" en el script de PDF no ejercita
  realmente el aislamiento de red (ver nota en la sección PDF); no se probó
  qué pasaría si el HTML intentara cargar un recurso remoto real.
- No se comparó el comportamiento observado de TypeScript 7 contra
  TypeScript 6.x (prohibido por el alcance del spike), por lo que las
  diferencias reportadas (p. ej. `types` explícito) se documentan como
  comportamiento observado, no como regresiones confirmadas.

## Recomendación

**Continuar con el prototipo**, con las siguientes condiciones:

1. Mantener `"types": ["node"]` explícito en `tsconfig.json` mientras se use
   TypeScript 7.0.2 en este proyecto, dado el comportamiento observado.
2. Tener presente que `next build` reescribirá `tsconfig.json` (mínimo el
   valor de `jsx`) en el primer build real; no depender de que el archivo
   fuente permanezca bit a bit igual al commit.
3. No depender de Biome para verificaciones type-aware de promesas
   (`noFloatingPromises`, `noMisusedPromises`, `no-unsafe-*`, etc.): están
   ausentes o inactivas por defecto en Biome 2.5.14. Si ese nivel de
   verificación es un requisito del proyecto real, evaluar una herramienta
   complementaria type-aware, fuera del alcance de este spike.
4. `experimental.useTypeScriptCli` permanece experimental según la propia
   documentación de Next; no se recomienda fijarlo explícitamente en
   producción sin una decisión consciente del equipo, más allá de este spike.

No se encontró ningún bloqueador que impida usar TypeScript 7.0.2 con
Next.js 16.3.6 en un flujo Docker-first: type-check, build, lint y generación
de PDF funcionaron de extremo a extremo, con las dos correcciones legítimas
documentadas arriba (copiar `pnpm-workspace.yaml` en el Dockerfile; agregar
`types: ["node"]` al tsconfig).
