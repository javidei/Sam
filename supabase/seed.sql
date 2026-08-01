-- Datos iniciales seguros. No contiene usuarios, claves ni secretos.
with new_project as (
  insert into public.projects (slug, name, status)
  values ('sam', 'SAM', 'active')
  on conflict (slug) do update set name = excluded.name
  returning id
)
insert into public.project_settings (project_id, key, value, is_public)
select id, 'storefront', '{"currency":"EUR","location":"Palma del Río, Córdoba","commerce_enabled":false}'::jsonb, true
from new_project
on conflict (project_id, key) do nothing;

with sam as (select id from public.projects where slug = 'sam')
insert into public.catalog_categories (project_id, slug, name, description, sort_order)
select sam.id, source.slug, source.name, source.description, source.sort_order
from sam
cross join (values
  ('impresion', 'Impresión', 'Documentos, copias y acabados.', 10),
  ('personalizados', 'Personalizados', 'Regalos y artículos creados bajo pedido.', 20),
  ('articulos', 'Artículos', 'Selección de papelería y pequeños detalles.', 30),
  ('digital', 'Servicios digitales', 'Diseños y archivos con entrega digital.', 40)
) as source(slug, name, description, sort_order)
on conflict (project_id, slug) do nothing;

-- Catálogo inicial. Se puede volver a ejecutar: actualiza el contenido sin duplicarlo.
with
sam as (select id from public.projects where slug = 'sam'),
source as (
  select *
  from (values
    ('documentos-y-copias', 'impresion', 'Documentos y copias', 'Impresión en blanco y negro o color, documentos y pequeños trabajos encuadernados.', 'service'::public.product_kind, 'pickup'::public.fulfillment_mode, true, true, 10, '{"art_style":"paper","categories":["impresion"],"search_terms":["copias","documentos","blanco y negro","color","encuadernación"]}'::jsonb),
    ('tarjetas-flyers-carteleria', 'impresion', 'Tarjetas, flyers y cartelería', 'Piezas impresas para presentar un proyecto, anunciar un servicio o preparar un evento.', 'service'::public.product_kind, 'pickup'::public.fulfillment_mode, true, true, 20, '{"art_style":"cards","categories":["impresion","articulos"],"search_terms":["tarjetas","flyers","folletos","carteles","publicidad"]}'::jsonb),
    ('tazas-y-detalles', 'personalizados', 'Tazas y detalles', 'Personalización con nombres, frases, ilustraciones o fotografías para cada ocasión.', 'physical'::public.product_kind, 'pickup'::public.fulfillment_mode, true, true, 30, '{"art_style":"mug","categories":["personalizados","articulos"],"search_terms":["tazas","regalos","nombre","foto","frase"]}'::jsonb),
    ('camisetas-y-bolsas', 'personalizados', 'Camisetas y bolsas', 'Textil personalizado para regalos, grupos, celebraciones y pequeños proyectos.', 'physical'::public.product_kind, 'pickup'::public.fulfillment_mode, true, true, 40, '{"art_style":"shirt","categories":["personalizados","articulos"],"search_terms":["textil","camisetas","bolsas","tote","vinilo"]}'::jsonb),
    ('pegatinas-y-etiquetas', 'personalizados', 'Pegatinas y etiquetas', 'Adhesivos para regalos, organización, marca, packaging y eventos.', 'physical'::public.product_kind, 'pickup'::public.fulfillment_mode, true, true, 50, '{"art_style":"stickers","categories":["personalizados","impresion"],"search_terms":["pegatinas","etiquetas","adhesivos","packaging"]}'::jsonb),
    ('invitaciones-digitales', 'digital', 'Invitaciones digitales', 'Diseños listos para enviar por móvil, adaptados al estilo y la información del evento.', 'digital'::public.product_kind, 'digital_delivery'::public.fulfillment_mode, true, true, 60, '{"art_style":"invite","categories":["digital","personalizados"],"search_terms":["invitaciones","boda","comunión","cumpleaños","evento","whatsapp"]}'::jsonb),
    ('contenido-para-redes', 'digital', 'Contenido para redes', 'Plantillas, publicaciones y piezas visuales coherentes para comunicar mejor.', 'digital'::public.product_kind, 'digital_delivery'::public.fulfillment_mode, true, true, 70, '{"art_style":"social","categories":["digital"],"search_terms":["redes sociales","instagram","publicaciones","stories","plantillas"]}'::jsonb),
    ('curriculums-y-documentos', 'digital', 'Currículums y documentos', 'Documentos claros y bien presentados para trabajar, estudiar o mostrar un proyecto.', 'digital'::public.product_kind, 'digital_delivery'::public.fulfillment_mode, true, true, 80, '{"art_style":"cv","categories":["digital"],"search_terms":["currículum","curriculum vitae","presentación","dossier","pdf"]}'::jsonb)
  ) as products(slug, category_slug, name, short_description, kind, fulfillment, featured, requires_quote, sort_order, metadata)
)
insert into public.catalog_products (
  project_id, category_id, slug, name, short_description, kind, fulfillment,
  status, featured, requires_quote, currency, metadata, sort_order, published_at
)
select
  sam.id, category.id, source.slug, source.name, source.short_description,
  source.kind, source.fulfillment, 'published', source.featured,
  source.requires_quote, 'EUR', source.metadata, source.sort_order, now()
from sam
join source on true
join public.catalog_categories category
  on category.project_id = sam.id and category.slug = source.category_slug
on conflict (project_id, slug) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  short_description = excluded.short_description,
  kind = excluded.kind,
  fulfillment = excluded.fulfillment,
  status = excluded.status,
  featured = excluded.featured,
  requires_quote = excluded.requires_quote,
  currency = excluded.currency,
  metadata = excluded.metadata,
  sort_order = excluded.sort_order,
  published_at = coalesce(public.catalog_products.published_at, excluded.published_at);

-- Cada producto nace con una variante estándar. Más adelante se podrán añadir
-- tamaños, materiales o acabados con precio y stock independientes.
with
sam as (select id from public.projects where slug = 'sam'),
source as (
  select *
  from (values
    ('documentos-y-copias', 'SAM-IMP-COPIAS'),
    ('tarjetas-flyers-carteleria', 'SAM-IMP-PUBLICIDAD'),
    ('tazas-y-detalles', 'SAM-PER-TAZAS'),
    ('camisetas-y-bolsas', 'SAM-PER-TEXTIL'),
    ('pegatinas-y-etiquetas', 'SAM-PER-ADHESIVOS'),
    ('invitaciones-digitales', 'SAM-DIG-INVITACIONES'),
    ('contenido-para-redes', 'SAM-DIG-REDES'),
    ('curriculums-y-documentos', 'SAM-DIG-DOCUMENTOS')
  ) as variants(product_slug, sku)
)
insert into public.product_variants (
  project_id, product_id, sku, name, currency, track_inventory,
  stock_quantity, is_active, sort_order
)
select sam.id, product.id, source.sku, 'Estándar', 'EUR', false, 0, true, 0
from sam
join source on true
join public.catalog_products product
  on product.project_id = sam.id and product.slug = source.product_slug
on conflict (project_id, sku) do update set
  product_id = excluded.product_id,
  name = excluded.name,
  currency = excluded.currency,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order;
