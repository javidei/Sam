-- SAM 1.1.0 · auditoría automática para Administración.
-- Ejecutar una sola vez en el SQL Editor de Supabase.

create or replace function public.audit_sam_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_row jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  new_row jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  target_project uuid;
  target_entity text;
begin
  target_project := nullif(coalesce(new_row ->> 'project_id', old_row ->> 'project_id'), '')::uuid;

  if target_project is null and tg_table_name = 'product_images' then
    select p.project_id into target_project
    from public.catalog_products p
    where p.id = nullif(coalesce(new_row ->> 'product_id', old_row ->> 'product_id'), '')::uuid;
  end if;

  target_entity := coalesce(
    new_row ->> 'id', old_row ->> 'id',
    new_row ->> 'key', old_row ->> 'key',
    concat_ws(':', coalesce(new_row ->> 'product_id', old_row ->> 'product_id'), coalesce(new_row ->> 'file_id', old_row ->> 'file_id'))
  );

  insert into public.audit_logs (
    project_id, actor_id, action, entity_table, entity_id, old_data, new_data
  ) values (
    target_project, auth.uid(), lower(tg_op), tg_table_name, target_entity, old_row, new_row
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.audit_sam_change() from public;
grant execute on function public.audit_sam_change() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'catalog_products',
    'product_variants',
    'catalog_categories',
    'project_settings',
    'files',
    'product_images'
  ] loop
    execute format('drop trigger if exists sam_audit_change on public.%I', table_name);
    execute format(
      'create trigger sam_audit_change after insert or update or delete on public.%I for each row execute function public.audit_sam_change()',
      table_name
    );
  end loop;
end;
$$;

comment on function public.audit_sam_change() is 'Registra cambios administrativos de SAM en audit_logs.';
