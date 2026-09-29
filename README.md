# HachiSky

Plataforma interna de trabajo diario de IL Asesorías. Aplicación modular por
unidades: cada unidad entrega una porción vertical del producto, verificada
antes de pasar a la siguiente.

El nombre honra a Hachiko, un perro muy querido.

## Estado actual: Unidad 1 — Infraestructura

La Unidad 1 (U1) entrega la base técnica de la aplicación web: Next.js,
PostgreSQL, migraciones, verificación de salud y el flujo de desarrollo con
Docker. No incluye pantallas de negocio ni autenticación.

Detalle completo, evidencia y limitaciones: [docs/units/u1-infrastructure.md](docs/units/u1-infrastructure.md).

## Flujo de negocio (visión del producto)

```
cliente → jornada → actividades → informe → cuenta de cobro → pago
```

Este flujo describe el objetivo del producto. Ningún paso está implementado
en U1; ver [RESUMEN.md](RESUMEN.md) para el detalle de decisiones de producto
y [docs/units/u1-infrastructure.md](docs/units/u1-infrastructure.md) para lo
realmente construido hasta ahora.

## Módulos planificados

| Módulo | Responsabilidad |
| --- | --- |
| Inicio | Indicadores, pendientes y accesos rápidos |
| Clientes | Empresa/persona, contactos, sedes e historial |
| Trabajo | Jornadas, actividades, agenda y seguimiento |
| Informes | Preparación, revisión, emisión y exportación (HTML/PDF) |
| Facturación | Cuentas de cobro, pagos, abonos y cartera |
| Configuración | Emisor, marca, plantillas, usuarios y permisos |

**Facturación** es el nombre del módulo y gestiona **cuentas de cobro**, no
facturación electrónica: no implementa ni pretende cumplimiento DIAN. Ninguno
de estos módulos está implementado; ver la sección "Planificado" de cada
documento para el detalle.

## Documentación

| Documento | Contenido |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | Arquitectura del sistema, topología de Compose y límites de producción |
| [docs/local-operation.md](docs/local-operation.md) | Cómo levantar, probar y verificar el stack localmente |
| [docs/units/u1-infrastructure.md](docs/units/u1-infrastructure.md) | Alcance, evidencia y limitaciones de U1 |
| [apps/web/README.md](apps/web/README.md) | Referencia técnica de la aplicación web (en inglés) |
| [RESUMEN.md](RESUMEN.md) | Decisiones de producto y continuidad del proyecto |

## Próximos pasos

1. Respaldo de código y documentación de U1 en GitHub: rama `feat/u1-infrastructure` publicada el 2026-09-27 tras escaneos de secretos con Gitleaks v8.28.0 (sin hallazgos) y entregada mediante el PR #2 hacia `main` (aún sin merge). La base de datos, `.env` y otros archivos locales no se respaldan en GitHub.
2. Unidad 2: autenticación y permisos (solo planificación; sin biblioteca ni roles aprobados todavía).
3. Unidad 3: cliente → jornada → actividades persistidas.
4. Unidades posteriores: Informes, Facturación (cuentas de cobro), tablero.
5. La identidad visual (logo, colores, tipografía) es una unidad separada, aún no integrada.
