// Configuración pública de SAM.
// La URL y la clave publicable de Supabase se pueden exponer en el navegador.
// No añadas aquí la clave service_role ni ninguna contraseña.
const samConfig = Object.freeze({
  supabaseUrl: 'https://avboupigkstzprrgvlhr.supabase.co',
  supabasePublishableKey: 'sb_publishable_eyFLhKFk9HXAab4q1cxG4A_-_la1-OI'
});

window.SAM_CONFIG = samConfig;

// app.js pinta primero el catálogo local y, mientras Supabase responde, parte de una
// configuración provisional. Esta consulta temprana evita tanto el aviso incorrecto
// como el parpadeo del logo anterior antes de aplicar la identidad guardada.
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
    console.warn('No se pudo comprobar la configuración pública de SAM.', error);
    return null;
  }
})();

function publicBrandLogoUrl(logo) {
  if (!logo?.bucket || !logo?.path) return '';
  const encodedPath = String(logo.path).split('/').map(encodeURIComponent).join('/');
  return `${samConfig.supabaseUrl}/storage/v1/object/public/${encodeURIComponent(logo.bucket)}/${encodedPath}`;
}

async function prepareStorefrontBranding() {
  if (/\/admin(?:\/|$)/.test(window.location.pathname)) return;

  const logos = [...document.querySelectorAll('[data-brand-logo]')];
  if (!logos.length) return;

  // Conservamos el espacio del logo para que la cabecera no salte, pero ocultamos el
  // SVG antiguo hasta conocer y precargar el logo configurado en Supabase.
  logos.forEach((image) => {
    image.style.visibility = 'hidden';
  });

  const revealLogos = () => {
    window.requestAnimationFrame(() => {
      logos.forEach((image) => {
        image.style.visibility = '';
      });
    });
  };

  try {
    const storefront = await commerceNoticeSetting;
    const logo = storefront?.brand_logo;
    const logoUrl = publicBrandLogoUrl(logo);
    if (!logoUrl) {
      revealLogos();
      return;
    }

    const preloader = new Image();
    const logoLoaded = await new Promise((resolve) => {
      preloader.onload = () => resolve(true);
      preloader.onerror = () => resolve(false);
      preloader.src = logoUrl;
      if (preloader.complete) resolve(preloader.naturalWidth > 0);
    });

    if (!logoLoaded) {
      revealLogos();
      return;
    }

    logos.forEach((image) => {
      image.src = logoUrl;
      image.closest('.footer-brand')?.classList.add('has-custom-logo');
    });

    const favicon = document.querySelector('[data-brand-favicon]');
    if (favicon) {
      favicon.href = logoUrl;
      favicon.type = logo.mime_type || 'image/webp';
    }

    await Promise.allSettled(logos.map((image) => (
      typeof image.decode === 'function' ? image.decode() : Promise.resolve()
    )));
    revealLogos();
  } catch (error) {
    console.warn('No se ha podido precargar el logo personalizado de SAM.', error);
    revealLogos();
  }
}

prepareStorefrontBranding();

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

// Mejoras específicas del panel de administración. Se cargan desde aquí para mantener
// el HTML del panel limpio y aplicar siempre la última versión de la confirmación visual.
if (/\/admin(?:\/(?:index\.html)?)?$/.test(window.location.pathname)) {
  const settingsScriptUrl = document.currentScript?.src || window.location.href;
  const feedbackStyles = document.createElement('link');
  feedbackStyles.rel = 'stylesheet';
  feedbackStyles.href = new URL('admin/admin-feedback.css?v=sam-admin-feedback-1', settingsScriptUrl).toString();
  document.head.append(feedbackStyles);

  const feedbackScript = document.createElement('script');
  feedbackScript.src = new URL('admin/admin-feedback.js?v=sam-admin-feedback-1', settingsScriptUrl).toString();
  feedbackScript.async = false;
  document.head.append(feedbackScript);
}
