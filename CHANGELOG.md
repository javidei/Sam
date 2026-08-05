# Historial de versiones de SAM

SAM utiliza versionado semántico `MAJOR.MINOR.PATCH`.

Mientras la web no se considere estable y lista para producción, el número principal se mantiene en `0`. Los cambios funcionales importantes incrementan `MINOR` y las correcciones compatibles incrementan `PATCH`.

## 0.6.1 — 05/08/2026

- Corrige el contraste y la legibilidad del footer en modo noche.
- Renumera la versión anterior `1.0.6` como versión preestable, sin cambiar funcionalidades.

## 0.6.0 — 05/08/2026

- Añade modo noche y modo claro en la tienda y en Administración.
- Guarda la preferencia visual en el navegador.
- Usa exclusivamente el logo almacenado en Supabase en la web y en el panel.
- Evita que el logo local aparezca durante la carga.

## 0.5.0 — 04/08/2026

- Añade publicación y sustitución del catálogo PDF desde Administración.
- Añade acceso al PDF publicado desde la tienda.
- Mejora el botón de guardado de configuración.
- Añade ventanas emergentes y avisos visuales después de guardar o producirse errores.
- Añade versión y fecha de publicación en el footer.
- Retira el importador de Excel para mantener únicamente la publicación manual del PDF.

## 0.4.0 — 01/08/2026

- Añade configuración pública desde Administración.
- Permite gestionar contacto, WhatsApp, correo, Instagram, Bizum y Wallapop.
- Añade el aviso de entrada de Bizum y Wallapop.
- Permite gestionar el logo desde Supabase.

## 0.3.0 — 01/08/2026

- Amplía el catálogo con precios fijos, precios desde y precios a consultar.
- Añade stock, avisos de stock bajo, variantes y SKU.
- Añade fotografías, portada, orden y galería ampliada.
- Amplía el panel de Administración y los permisos mediante Supabase Auth y RLS.

## 0.2.0 — 01/08/2026

- Conecta SAM con Supabase.
- Añade catálogo dinámico, categorías, productos y variantes.
- Añade el CRUD inicial de Administración.

## 0.1.0 — 01/08/2026

- Primera versión de la web pública de SAM.
- Diseño responsive, servicios, catálogo inicial, contacto y publicación en GitHub Pages.

## 1.0.0 — Pendiente

Se reservará para la primera versión estable, probada y usable en producción.
