# Arquitectura de SAM

## Aplicación pública
- `index.html`: estructura semántica.
- `app.js`: catálogo y comportamiento principal existente.
- `sam-settings.js`: configuración pública, versión y carga de módulos.
- `catalog-pdf.js`: acceso público al catálogo PDF.
- `site-quality.js`: accesibilidad y rendimiento no funcional.

## Administración
El núcleo histórico permanece en `admin/admin.js`. Las nuevas funciones se han separado para reducir conflictos:

- `admin/admin-modules.js`: cargador ordenado.
- `admin/modules/core.js`: sesión, API REST, proyecto y utilidades compartidas.
- `admin/modules/status.js`: notificaciones, errores y estado de red.
- `admin/modules/backup.js`: exportaciones y copias de seguridad.
- `admin/modules/audit.js`: historial de cambios.
- `admin/modules/security.js`: cambios sin guardar, sesión y archivado seguro.
- `admin/modules/diagnostics.js`: versión y salud técnica.
- `admin/modules/accessibility.js`: teclado, foco, etiquetas y carga diferida.

Cada módulo debe mantener una única responsabilidad y comunicarse mediante eventos `sam:*` o mediante `window.SAM_ADMIN`.

## Versionado
La versión visible se define en `sam-settings.js`. Cada publicación debe:
1. Actualizar `webVersion`, `releaseDate` y `releaseCommit`.
2. Añadir la entrada correspondiente a `CHANGELOG.md`.
3. Comprobar la tienda y Administración en móvil y escritorio.

## Base de datos
Las migraciones de Supabase se guardan en `supabase/migrations`. No se considera aplicada una migración por el hecho de estar en GitHub: debe ejecutarse también en el SQL Editor o mediante Supabase CLI.
