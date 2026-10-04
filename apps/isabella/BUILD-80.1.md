# Build 80.1 — Isabella Presence Windows Installer

Fecha: 4 de octubre de 2026.

## Objetivo

Cerrar la última milla de Build 80 para Gari en Windows: producir un instalador real de Isabella Presence que pueda instalarse sin Rust, terminal ni herramientas de desarrollo.

## Decisión

La aplicación pasa de una shell compilable a un bundle instalable de Windows mediante NSIS.

Versión de la app: `0.1.1`.

El instalador se construye en GitHub Actions sobre `windows-latest` con:

- Rust 1.90;
- Tauri CLI 2.12.0;
- bundle target `nsis`;
- artifact `Isabella-Presence-Windows-0.1.1`.

## Lo que no cambia

Build 80.1 no modifica:

- MINDS;
- Supabase;
- RLS;
- Attention Economy;
- Capability Runtime;
- memoria;
- permisos;
- Relationship Contract;
- Human Surface.

Es exclusivamente distribución de la shell de Build 80.

## Firma de código

La v0.1.1 no incorpora un certificado comercial de firma de código. Windows puede mostrar SmartScreen al ejecutar el instalador por primera vez. No se introducen certificados autofirmados ni bypasses para ocultar ese comportamiento.

Una futura distribución firmada puede añadirse sin cambiar la arquitectura de Presence.

## Criterio de aceptación

Build 80.1 se considera cerrado cuando GitHub Actions genera correctamente un `.exe` NSIS desde `main`, lo publica como artifact descargable y el build general de MINDS permanece verde.
