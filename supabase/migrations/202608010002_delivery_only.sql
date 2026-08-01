-- SAM · sustituye la recogida física por entrega a distancia.
-- Conserva productos, precios, stock, imágenes y relaciones existentes.

do $migration$
declare
  uses_legacy_fulfillment boolean;
begin
  select exists (
    select 1
    from pg_type type
    join pg_namespace namespace on namespace.oid = type.typnamespace
    join pg_enum enum_value on enum_value.enumtypid = type.oid
    where namespace.nspname = 'public'
      and type.typname = 'fulfillment_mode'
      and enum_value.enumlabel = 'pickup'
  ) into uses_legacy_fulfillment;

  if uses_legacy_fulfillment then
    alter table public.catalog_products alter column fulfillment drop default;
    alter type public.fulfillment_mode rename to fulfillment_mode_legacy;
    create type public.fulfillment_mode as enum ('home_delivery', 'email_delivery');

    execute $sql$
      alter table public.catalog_products
      alter column fulfillment type public.fulfillment_mode
      using (
        case
          when kind = 'digital'::public.product_kind
            or fulfillment::text = 'digital_delivery'
          then 'email_delivery'
          else 'home_delivery'
        end
      )::public.fulfillment_mode
    $sql$;

    alter table public.catalog_products
      alter column fulfillment set default 'home_delivery'::public.fulfillment_mode;
    drop type public.fulfillment_mode_legacy;
  end if;
end
$migration$;

comment on type public.fulfillment_mode is
  'Modalidad de entrega de SAM: envío a domicilio o entrega digital por correo electrónico.';

with sam as (
  select id from public.projects where slug = 'sam'
)
insert into public.project_settings (project_id, key, value, is_public)
select
  id,
  'storefront',
  '{"pickup_available":false,"physical_delivery":"home_delivery","digital_delivery":"email"}'::jsonb,
  true
from sam
on conflict (project_id, key) do update set
  value = public.project_settings.value || excluded.value,
  is_public = true;
