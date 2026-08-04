-- SAM · permite publicar el catálogo completo en PDF desde Administración.
-- La configuración inicial del bucket sam-public solo aceptaba imágenes, por lo que
-- Supabase rechazaba los PDF con "mime type application/pdf is not supported".

update storage.buckets
set
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/svg+xml',
    'application/pdf'
  ]::text[]
where id = 'sam-public';

-- Evita que la migración parezca correcta si el bucket todavía no existe.
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'sam-public') then
    raise exception 'No existe el bucket sam-public';
  end if;
end;
$$;
