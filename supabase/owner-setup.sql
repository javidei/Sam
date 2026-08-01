-- Ejecuta este archivo DESPUÉS de crear tu usuario en Authentication > Users.
-- Sustituye TU_CORREO_AQUI por el correo con el que iniciarás sesión.
-- Es repetible: no duplica perfiles ni miembros.
do $$
declare
  owner_email text := 'TU_CORREO_AQUI';
  owner_id uuid;
  sam_project_id uuid;
begin
  select id into owner_id from auth.users where lower(email)=lower(owner_email) limit 1;
  if owner_id is null then raise exception 'No existe un usuario de Supabase Auth con el correo %',owner_email;end if;
  select id into sam_project_id from public.projects where slug='sam';
  if sam_project_id is null then raise exception 'No existe el proyecto SAM';end if;
  insert into public.profiles(id,display_name) values(owner_id,coalesce((select raw_user_meta_data->>'full_name' from auth.users where id=owner_id),'Propietario SAM')) on conflict(id) do nothing;
  insert into public.project_members(project_id,user_id,role) values(sam_project_id,owner_id,'owner') on conflict(project_id,user_id) do update set role=excluded.role;
end $$;
