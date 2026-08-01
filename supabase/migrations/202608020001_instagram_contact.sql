-- Añade el perfil inicial de Instagram sin reemplazar el resto de la configuración.
update public.project_settings settings
set value = settings.value || jsonb_build_object(
  'instagram_url', 'https://www.instagram.com/colorinespalma/'
)
from public.projects project
where settings.project_id = project.id
  and settings.key = 'storefront'
  and project.slug = 'sam'
  and not (settings.value ? 'instagram_url');
