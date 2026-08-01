# SAM

Web pública y núcleo de datos de SAM: impresión, productos personalizados, artículos y servicios digitales.

## Publicación

El proyecto es una web estática sin dependencias de ChatGPT Sites. Se publica con GitHub Pages desde la rama `main` y la raíz del repositorio:

`https://javidei.github.io/Sam/`

Todas las rutas son relativas para funcionar correctamente bajo `/Sam/`.

## Estructura

- `index.html`: web pública, catálogo inicial y formulario para preparar encargos.
- `styles.css`: diseño responsive.
- `app.js`: menú móvil, búsqueda, filtros, precios, stock y consultas al propietario.
- `sam-settings.js`: conexión pública con Supabase; funciona vacía hasta configurar el proyecto.
- `admin/`: inicio de sesión y CRUD de catálogo, precios y stock.
- `assets/`: identidad gráfica local.
- `supabase/`: tablas, RLS, Storage y catálogo inicial.

## Base de datos

1. Crea un proyecto vacío en Supabase.
2. Ejecuta `supabase/migrations/202608010001_sam_core.sql` en el SQL Editor.
3. Ejecuta las demás migraciones, en orden, si las hubiera.
4. Ejecuta `supabase/seed.sql`.
5. Copia la URL del proyecto y la clave publicable en `sam-settings.js`.
6. Crea el primer usuario en Authentication.
7. Ejecuta `supabase/owner-setup.sql`, sustituyendo `TU_CORREO_AQUI` por el correo del usuario.
8. Inicia sesión en `/admin/`.

La tienda consulta Supabase mediante su API REST, permisos mínimos y RLS. Si la conexión aún no está
configurada o falla, conserva el catálogo local de reserva.

La clave `service_role` es privada: no debe añadirse a `sam-settings.js`, al navegador ni
al repositorio.

## Administración

El panel permite crear, editar, publicar, ocultar y eliminar artículos y servicios. Para
cada entrada se puede elegir precio fijo, precio «desde» o precio a consultar. Los
artículos físicos pueden controlar las unidades disponibles y el umbral de stock bajo;
los servicios pueden mostrar una tarifa estándar y mantener la consulta personalizada.

SAM no dispone de tienda física ni punto de recogida. `fulfillment_mode` solo admite
`home_delivery` para envíos a domicilio y `email_delivery` para productos digitales
enviados por correo electrónico. La migración `202608010002_delivery_only.sql` convierte
los valores antiguos sin eliminar productos, precios, stock ni fotografías.

Cada producto admite hasta ocho fotos desde el mismo formulario. El panel optimiza las
imágenes, las sube al bucket público `sam-public`, permite elegir la portada, cambiar el
orden y eliminarlas. El catálogo presenta la galería con navegación, gesto táctil y visor
ampliado. Los metadatos se guardan en `files` y `product_images`; los binarios no se
guardan en GitHub.

Desde el mismo panel se configura el nombre de contacto, WhatsApp y correo del
propietario. También se guardan en `project_settings.storefront` el número de Bizum, el
enlace público de Wallapop y la preferencia que activa el aviso de entrada. La tienda
pública utiliza esos datos para preparar consultas y mostrar los canales de compra sin
tener que editar el código. La sesión se renueva de forma automática y todas las
operaciones quedan protegidas mediante RLS.

El aviso de Bizum y Wallapop se adapta a escritorio y móvil y se muestra una vez por
sesión del navegador. La información permanece visible en la sección «Pago y venta» de
la tienda. El número de Bizum puede copiarse con un botón y el perfil de Wallapop se abre
en una pestaña nueva.

Los datos definitivos de pago y del perfil externo no se inventan: deben añadirse desde
Administración cuando se confirmen el número de Bizum y la URL pública de Wallapop.

Los logotipos vectoriales de Bizum y Wallapop proceden de Wikimedia Commons y se usan
únicamente para identificar sus respectivos servicios.
