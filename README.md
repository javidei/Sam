# SAM

Web pública y núcleo de datos de SAM: impresión, productos personalizados, artículos y servicios digitales.

## Publicación

El proyecto es una web estática sin dependencias de ChatGPT Sites. Se publica con GitHub Pages desde la rama `main` y la raíz del repositorio:

`https://javidei.github.io/Sam/`

Todas las rutas son relativas para funcionar correctamente bajo `/Sam/`.

## Estructura

- `index.html`: web pública, catálogo inicial y formulario para preparar encargos.
- `styles.css`: diseño responsive.
- `app.js`: menú móvil, búsqueda, filtros y preparación de solicitudes.
- `sam-settings.js`: conexión pública con Supabase; funciona vacía hasta configurar el proyecto.
- `admin/`: inicio de sesión y CRUD de catálogo, precios y stock.
- `assets/`: identidad gráfica local.
- `supabase/`: tablas, RLS, Storage y catálogo inicial.

## Base de datos

1. Crea un proyecto vacío en Supabase.
2. Ejecuta `supabase/migrations/202608010001_sam_core.sql` en el SQL Editor.
3. Ejecuta `supabase/seed.sql`.
4. Copia la URL del proyecto y la clave publicable en `sam-settings.js`.
5. Crea el primer usuario en Authentication.
6. Ejecuta `supabase/owner-setup.sql`, sustituyendo `TU_CORREO_AQUI` por el correo del usuario.
7. Inicia sesión en `/admin/`.

La tienda consulta Supabase mediante su API REST, permisos mínimos y RLS. Si la conexión aún no está
configurada o falla, conserva el catálogo local de reserva.

La clave `service_role` es privada: no debe añadirse a `sam-settings.js`, al navegador ni
al repositorio.

## Administración

El panel permite crear, editar, publicar, ocultar y eliminar productos, además de
gestionar su variante principal, precio y stock. La sesión se renueva de forma
automática y todas las operaciones quedan protegidas mediante RLS.

Los datos definitivos de contacto no se han inventado: deben añadirse cuando se confirmen el teléfono de WhatsApp y el correo de SAM.
