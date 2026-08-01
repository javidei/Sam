-- SAM · núcleo de catálogo, administración e inventario
-- Diseñado para Supabase/PostgreSQL. No incluye pedidos ni pagos: esa será la fase 2.

create extension if not exists pgcrypto;

create type public.project_role as enum ('owner', 'admin', 'editor', 'viewer');
create type public.project_status as enum ('draft', 'active', 'archived');
create type public.product_status as enum ('draft', 'published', 'hidden', 'archived');
create type public.product_kind as enum ('physical', 'service', 'digital');
create type public.fulfillment_mode as enum ('pickup', 'digital_delivery', 'both');
create type public.inventory_movement_type as enum ('initial', 'purchase', 'sale', 'adjustment', 'return', 'damage');
create type public.file_visibility as enum ('public', 'private');

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null,
  status public.project_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.project_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.project_settings (
  project_id uuid not null references public.projects(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (project_id, key)
);

create table public.catalog_categories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  parent_id uuid references public.catalog_categories(id) on delete set null,
  slug text not null,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, slug)
);

create table public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  category_id uuid references public.catalog_categories(id) on delete set null,
  slug text not null,
  name text not null,
  short_description text,
  description text,
  kind public.product_kind not null default 'physical',
  fulfillment public.fulfillment_mode not null default 'pickup',
  status public.product_status not null default 'draft',
  featured boolean not null default false,
  requires_quote boolean not null default true,
  base_price_cents integer check (base_price_cents is null or base_price_cents >= 0),
  currency char(3) not null default 'EUR',
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  published_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, slug)
);

-- Una variante por defecto permite empezar sin opciones y crecer después a tamaños,
-- colores, formatos o acabados sin migrar el stock fuera del producto.
create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  sku text,
  name text not null default 'Estándar',
  option_values jsonb not null default '{}'::jsonb,
  price_cents integer check (price_cents is null or price_cents >= 0),
  currency char(3) not null default 'EUR',
  track_inventory boolean not null default false,
  stock_quantity integer not null default 0,
  low_stock_threshold integer not null default 0,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, sku),
  unique (id, project_id)
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  bucket text not null,
  path text not null,
  original_name text,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  visibility public.file_visibility not null default 'public',
  alt_text text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (bucket, path)
);

create table public.product_images (
  product_id uuid not null references public.catalog_products(id) on delete cascade,
  file_id uuid not null references public.files(id) on delete cascade,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  primary key (product_id, file_id)
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  variant_id uuid not null,
  movement_type public.inventory_movement_type not null,
  quantity_delta integer not null check (quantity_delta <> 0),
  stock_after integer not null,
  note text,
  reference text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (variant_id, project_id) references public.product_variants(id, project_id) on delete cascade
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  project_id uuid references public.projects(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_table text not null,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index project_members_user_idx on public.project_members(user_id);
create index categories_project_order_idx on public.catalog_categories(project_id, sort_order);
create index products_project_status_idx on public.catalog_products(project_id, status, sort_order);
create index products_category_idx on public.catalog_products(category_id);
create index variants_product_order_idx on public.product_variants(product_id, sort_order);
create index files_project_visibility_idx on public.files(project_id, visibility);
create index movements_variant_created_idx on public.inventory_movements(variant_id, created_at desc);
create index audit_project_created_idx on public.audit_logs(project_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_set_updated_at before update on public.projects for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger settings_set_updated_at before update on public.project_settings for each row execute function public.set_updated_at();
create trigger categories_set_updated_at before update on public.catalog_categories for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.catalog_products for each row execute function public.set_updated_at();
create trigger variants_set_updated_at before update on public.product_variants for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.has_project_role(target_project uuid, allowed_roles public.project_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.project_members pm
    where pm.project_id = target_project
      and pm.user_id = auth.uid()
      and pm.role = any(allowed_roles)
  );
$$;

create or replace function public.adjust_variant_stock(
  target_variant uuid,
  amount integer,
  reason public.inventory_movement_type,
  movement_note text default null,
  movement_reference text default null
)
returns public.product_variants
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_variant public.product_variants;
begin
  if amount = 0 then raise exception 'La cantidad no puede ser cero'; end if;

  select * into current_variant
  from public.product_variants
  where id = target_variant
  for update;

  if not found then raise exception 'Variante no encontrada'; end if;
  if not public.has_project_role(current_variant.project_id, array['owner','admin','editor']::public.project_role[]) then
    raise exception 'No autorizado';
  end if;

  update public.product_variants
  set stock_quantity = stock_quantity + amount
  where id = target_variant
  returning * into current_variant;

  insert into public.inventory_movements (
    project_id, variant_id, movement_type, quantity_delta, stock_after, note, reference, created_by
  ) values (
    current_variant.project_id, current_variant.id, reason, amount, current_variant.stock_quantity,
    movement_note, movement_reference, auth.uid()
  );

  return current_variant;
end;
$$;

alter table public.projects enable row level security;
alter table public.profiles enable row level security;
alter table public.project_members enable row level security;
alter table public.project_settings enable row level security;
alter table public.catalog_categories enable row level security;
alter table public.catalog_products enable row level security;
alter table public.product_variants enable row level security;
alter table public.files enable row level security;
alter table public.product_images enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.audit_logs enable row level security;

-- El proyecto se creó sin exposición automática de tablas. Estos permisos hacen
-- explícita la superficie de la Data API; RLS sigue decidiendo qué filas se ven.
revoke all on table
  public.projects,
  public.profiles,
  public.project_members,
  public.project_settings,
  public.catalog_categories,
  public.catalog_products,
  public.product_variants,
  public.files,
  public.product_images,
  public.inventory_movements,
  public.audit_logs
from anon, authenticated;

grant select on table
  public.projects,
  public.project_settings,
  public.catalog_categories,
  public.catalog_products,
  public.product_variants,
  public.files,
  public.product_images
to anon;

grant select, update on table public.projects, public.profiles to authenticated;
grant select, insert, update, delete on table
  public.project_members,
  public.project_settings,
  public.catalog_categories,
  public.catalog_products,
  public.product_variants,
  public.files,
  public.product_images
to authenticated;
grant select on table public.inventory_movements, public.audit_logs to authenticated;

revoke all on function public.has_project_role(uuid, public.project_role[]) from public;
grant execute on function public.has_project_role(uuid, public.project_role[]) to anon, authenticated;

create policy "active projects are public" on public.projects for select using (status = 'active' or public.has_project_role(id, array['owner','admin','editor','viewer']::public.project_role[]));
create policy "owners manage projects" on public.projects for update using (public.has_project_role(id, array['owner']::public.project_role[])) with check (public.has_project_role(id, array['owner']::public.project_role[]));
create policy "profiles read own" on public.profiles for select using (id = auth.uid());
create policy "profiles update own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "members read same project" on public.project_members for select using (user_id = auth.uid() or public.has_project_role(project_id, array['owner','admin']::public.project_role[]));
create policy "owners manage members" on public.project_members for all using (public.has_project_role(project_id, array['owner']::public.project_role[])) with check (public.has_project_role(project_id, array['owner']::public.project_role[]));
create policy "public settings read" on public.project_settings for select using (is_public or public.has_project_role(project_id, array['owner','admin','editor','viewer']::public.project_role[]));
create policy "admins manage settings" on public.project_settings for all using (public.has_project_role(project_id, array['owner','admin']::public.project_role[])) with check (public.has_project_role(project_id, array['owner','admin']::public.project_role[]));
create policy "active categories read" on public.catalog_categories for select using (is_active or public.has_project_role(project_id, array['owner','admin','editor','viewer']::public.project_role[]));
create policy "editors manage categories" on public.catalog_categories for all using (public.has_project_role(project_id, array['owner','admin','editor']::public.project_role[])) with check (public.has_project_role(project_id, array['owner','admin','editor']::public.project_role[]));
create policy "published products read" on public.catalog_products for select using (status = 'published' or public.has_project_role(project_id, array['owner','admin','editor','viewer']::public.project_role[]));
create policy "editors manage products" on public.catalog_products for all using (public.has_project_role(project_id, array['owner','admin','editor']::public.project_role[])) with check (public.has_project_role(project_id, array['owner','admin','editor']::public.project_role[]));
create policy "published variants read" on public.product_variants for select using (is_active and exists (select 1 from public.catalog_products p where p.id = product_id and p.status = 'published') or public.has_project_role(project_id, array['owner','admin','editor','viewer']::public.project_role[]));
create policy "editors manage variants" on public.product_variants for all using (public.has_project_role(project_id, array['owner','admin','editor']::public.project_role[])) with check (public.has_project_role(project_id, array['owner','admin','editor']::public.project_role[]));
create policy "public files read" on public.files for select using (visibility = 'public' or public.has_project_role(project_id, array['owner','admin','editor','viewer']::public.project_role[]));
create policy "editors manage files" on public.files for all using (public.has_project_role(project_id, array['owner','admin','editor']::public.project_role[])) with check (public.has_project_role(project_id, array['owner','admin','editor']::public.project_role[]));
create policy "product images read" on public.product_images for select using (exists (select 1 from public.catalog_products p where p.id = product_id and (p.status = 'published' or public.has_project_role(p.project_id, array['owner','admin','editor','viewer']::public.project_role[]))));
create policy "editors manage product images" on public.product_images for all using (exists (select 1 from public.catalog_products p where p.id = product_id and public.has_project_role(p.project_id, array['owner','admin','editor']::public.project_role[]))) with check (exists (select 1 from public.catalog_products p where p.id = product_id and public.has_project_role(p.project_id, array['owner','admin','editor']::public.project_role[])));
create policy "members read inventory" on public.inventory_movements for select using (public.has_project_role(project_id, array['owner','admin','editor','viewer']::public.project_role[]));
create policy "members read audit" on public.audit_logs for select using (public.has_project_role(project_id, array['owner','admin']::public.project_role[]));

revoke all on function public.adjust_variant_stock(uuid, integer, public.inventory_movement_type, text, text) from public;
grant execute on function public.adjust_variant_stock(uuid, integer, public.inventory_movement_type, text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('sam-public', 'sam-public', true, 10485760, array['image/jpeg','image/png','image/webp','image/avif','image/svg+xml']),
  ('sam-private', 'sam-private', false, 52428800, null)
on conflict (id) do nothing;

create policy "sam public assets read" on storage.objects for select using (bucket_id = 'sam-public');
create policy "sam members upload public assets" on storage.objects for insert to authenticated with check (
  bucket_id = 'sam-public' and split_part(name, '/', 1) = 'sam' and exists (
    select 1 from public.projects p where p.slug = 'sam' and public.has_project_role(p.id, array['owner','admin','editor']::public.project_role[])
  )
);
create policy "sam members manage public assets" on storage.objects for update to authenticated using (
  bucket_id = 'sam-public' and split_part(name, '/', 1) = 'sam' and exists (
    select 1 from public.projects p where p.slug = 'sam' and public.has_project_role(p.id, array['owner','admin','editor']::public.project_role[])
  )
) with check (bucket_id = 'sam-public' and split_part(name, '/', 1) = 'sam');
create policy "sam admins delete public assets" on storage.objects for delete to authenticated using (
  bucket_id = 'sam-public' and split_part(name, '/', 1) = 'sam' and exists (
    select 1 from public.projects p where p.slug = 'sam' and public.has_project_role(p.id, array['owner','admin']::public.project_role[])
  )
);
