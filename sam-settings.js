// Configuración pública de SAM.
// La URL y la clave publicable de Supabase se pueden exponer en el navegador.
// No añadas aquí la clave service_role ni ninguna contraseña.
const samConfig = Object.freeze({
  supabaseUrl: 'https://avboupigkstzprrgvlhr.supabase.co',
  supabasePublishableKey: 'sb_publishable_eyFLhKFk9HXAab4q1cxG4A_-_la1-OI'
});

window.SAM_CONFIG = samConfig;

// app.js pinta primero el catálogo local y, mientras Supabase responde, parte de una
// configuración provisional. Evitamos que ese primer pintado abra el aviso si el
// propietario lo ha desactivado en project_settings.storefront.
const nativeSetTimeout = window.setTimeout.bind(window);
const commerceNoticeSetting = (async () => {
  try {
    const headers = {
      apikey: samConfig.supabasePublishableKey,
      Authorization: `Bearer ${samConfig.supabasePublishableKey}`
    };
    const projectsUrl = new URL(`${samConfig.supabaseUrl}/rest/v1/projects`);
    projectsUrl.search = new URLSearchParams({
      select: 'id',
      slug: 'eq.sam',
      status: 'eq.active',
      limit: '1'
    });
    const projectResponse = await fetch(projectsUrl, { headers });
    if (!projectResponse.ok) throw new Error(`No se pudo leer SAM (${projectResponse.status})`);
    const [project] = await projectResponse.json();
    if (!project?.id) return null;

    const settingsUrl = new URL(`${samConfig.supabaseUrl}/rest/v1/project_settings`);
    settingsUrl.search = new URLSearchParams({
      select: 'value',
      project_id: `eq.${project.id}`,
      key: 'eq.storefront',
      limit: '1'
    });
    const settingsResponse = await fetch(settingsUrl, { headers });
    if (!settingsResponse.ok) throw new Error(`No se pudo leer la configuración (${settingsResponse.status})`);
    const [setting] = await settingsResponse.json();
    return setting?.value || null;
  } catch (error) {
    console.warn('No se pudo comprobar la preferencia del aviso de Bizum y Wallapop.', error);
    return null;
  }
})();

window.setTimeout = function setTimeoutWithCommercePreference(callback, delay, ...args) {
  const isCommerceNotice = typeof callback === 'function'
    && callback.name === 'showCommerceDialog'
    && Number(delay) === 350;

  if (!isCommerceNotice) return nativeSetTimeout(callback, delay, ...args);

  return nativeSetTimeout(async () => {
    const storefront = await commerceNoticeSetting;
    if (storefront?.commerce_notice_enabled === false) return;
    callback(...args);
  }, delay);
};
