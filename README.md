# SAM

Web pública de SAM: impresión, productos personalizados, artículos y servicios digitales.

## Publicación

El proyecto es una web estática sin dependencias de ChatGPT Sites. Se publica con GitHub Pages desde la rama `main` y la raíz del repositorio:

`https://javidei.github.io/Sam/`

Todas las rutas son relativas para funcionar correctamente bajo `/Sam/`.

## Estructura

- `index.html`: web pública, catálogo inicial y formulario para preparar encargos.
- `styles.css`: diseño responsive.
- `app.js`: menú móvil, búsqueda, filtros y preparación de solicitudes.
- `admin/`: ruta separada para la futura administración.
- `assets/`: identidad gráfica local.

## Próxima fase

El panel de `admin/` es informativo hasta conectar Supabase. La conexión deberá incorporar autenticación, políticas RLS, productos, variantes, precios, stock e imágenes antes de permitir cambios reales.

Los datos definitivos de contacto no se han inventado: deben añadirse cuando se confirmen el teléfono de WhatsApp y el correo de SAM.
