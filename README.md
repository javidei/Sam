# SAM

Web pública y base de administración para SAM: impresión, productos personalizados, artículos seleccionados y servicios digitales.

## Estado actual

- Portada comercial responsive con catálogo, filtros y búsqueda.
- Zona `/admin` separada y preparada para el futuro CRUD.
- Migración Supabase versionada con proyectos, usuarios, permisos, categorías, productos, variantes, archivos, inventario, auditoría y RLS.
- Storage público/privado organizado bajo `sam/`.
- Datos de ejemplo en la interfaz hasta conectar un proyecto Supabase.

## Preparación de Supabase

1. Crear un proyecto de Supabase para la plataforma de Javier.
2. Ejecutar `supabase/migrations/202608010001_sam_core.sql`.
3. Ejecutar `supabase/seed.sql`.
4. Copiar `.env.example` a `.env.local` y completar URL y claves.
5. Crear el primer usuario mediante Supabase Auth y asociarlo como `owner` de SAM en `project_members`.

La clave `SUPABASE_SERVICE_ROLE_KEY` nunca debe exponerse al navegador ni guardarse en GitHub.

## Evolución a tienda online

La base ya separa productos y variantes, usa importes en céntimos y conserva moneda. La fase de venta añadirá clientes, direcciones, carritos, pedidos, líneas de pedido, pagos, envíos, descuentos, impuestos y reserva de stock. Los pagos se crearán desde servidor y se confirmarán mediante webhooks.
