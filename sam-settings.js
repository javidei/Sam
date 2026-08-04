// Configuración pública de SAM.
// La URL y la clave publicable de Supabase se pueden exponer en el navegador.
// No añadas aquí la clave service_role ni ninguna contraseña.
const samConfig = Object.freeze({
  supabaseUrl: 'https://avboupigkstzprrgvlhr.supabase.co',
  supabasePublishableKey: 'sb_publishable_eyFLhKFk9HXAab4q1cxG4A_-_la1-OI',
  webVersion: '1.0.3'
});

window.SAM_CONFIG = samConfig;

(() => {
  const isAdminPage = /\/admin(?:\/(?:index\.html)?)?$/.test(window.location.pathname);

  // La pantalla de acceso debe depender únicamente de admin.js.
  // Ninguna mejora opcional, consulta pública o personalización del escaparate se
  // ejecuta antes de iniciar sesión, de modo que un fallo externo no pueda bloquearla.
  if (isAdminPage) return;

  const nativeSetTimeout = window.setTimeout.bind(window);
  const settingsScriptUrl = document.currentScript?.src || window.location.href;

  async function fetchWithTimeout(url, options = {}, timeout = 4500) {
    const controller = new AbortController();
    const timer = nativeSetTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      window.clearTimeout(timer);
    }
  }

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
      const projectResponse = await fetchWithTimeout(projectsUrl, { headers });
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
      const settingsResponse = await fetchWithTimeout(settingsUrl, { headers });
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
    const logos = [...document.querySelectorAll('[data-brand-logo]')];
    if (!logos.length) return;

    try {
      const storefront = await commerceNoticeSetting;
      const logoUrl = publicBrandLogoUrl(storefront?.brand_logo);
      if (!logoUrl) return;

      const preloader = new Image();
      const logoLoaded = await new Promise((resolve) => {
        let finished = false;
        const finish = (value) => {
          if (finished) return;
          finished = true;
          resolve(value);
        };
        preloader.onload = () => finish(true);
        preloader.onerror = () => finish(false);
        preloader.src = logoUrl;
        nativeSetTimeout(() => finish(false), 4500);
        if (preloader.complete) finish(preloader.naturalWidth > 0);
      });

      if (!logoLoaded) return;

      logos.forEach((image) => {
        image.onerror = () => {
          image.onerror = null;
          image.src = 'assets/logo.svg';
        };
        image.src = logoUrl;
        image.closest('.footer-brand')?.classList.add('has-custom-logo');
      });

      const favicon = document.querySelector('[data-brand-favicon]');
      if (favicon) favicon.href = logoUrl;
    } catch (error) {
      console.warn('No se ha podido aplicar el logo personalizado de SAM.', error);
    }
  }

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

  function loadSamAsset(tagName, attributes) {
    const element = document.createElement(tagName);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    document.head.append(element);
    return element;
  }

  function showSamWebVersion() {
    const footerBottom = document.querySelector('.footer-bottom');
    if (!footerBottom || footerBottom.querySelector('[data-sam-version]')) return;

    const version = document.createElement('p');
    version.dataset.samVersion = '';
    version.textContent = `Versión ${samConfig.webVersion}`;
    version.title = 'Versión actual de la web';
    footerBottom.append(version);
  }

  prepareStorefrontBranding();
  showSamWebVersion();

  loadSamAsset('link', {
    rel: 'stylesheet',
    href: new URL('catalog-pdf.css?v=sam-catalog-pdf-3', settingsScriptUrl).toString()
  });
  loadSamAsset('script', {
    src: new URL('catalog-pdf.js?v=sam-catalog-pdf-3', settingsScriptUrl).toString()
  });
})();
