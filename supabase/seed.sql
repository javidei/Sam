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

