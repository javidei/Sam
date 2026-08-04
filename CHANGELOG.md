# Historial de versiones de SAM

Este archivo sigue un versionado semántico sencillo: `MAYOR.MENOR.PARCHE`.

## 1.1.0 - 2026-08-05

### Añadido
- Información de versión, fecha de publicación y commit de referencia.
- Copias de seguridad descargables en JSON y CSV desde Administración.
- Panel de actividad reciente basado en `audit_logs`.
- Panel técnico con estado de Supabase, sesión, PDF, copias y rendimiento.
- Avisos globales más claros, detección de desconexión y acciones de reintento.
- Protección contra salida con cambios sin guardar.
- Archivado seguro de productos en lugar de borrado directo.
- Mejoras de accesibilidad, foco visible, teclado y reducción de movimiento.
- Carga diferida de imágenes no críticas.
- Arquitectura modular para las nuevas funciones del panel.

### Cambiado
- El footer público y el de Administración comparten la misma versión.
- Los productos eliminados pasan a estado `archived` y conservan datos e imágenes.

### Requiere
- Ejecutar `supabase/migrations/202608050001_admin_quality.sql` para activar el historial automático.

## 1.0.1 - 2026-08-04
- Eliminada la importación masiva desde Excel.
- Conservada únicamente la publicación manual del catálogo PDF.

## 1.0.0 - 2026-08-04
- Primera versión identificada públicamente en el footer.
