// Configuración pública de SAM.
// La URL y la clave publicable de Supabase se pueden exponer en el navegador.
// No añadas aquí la clave service_role ni ninguna contraseña.
const samConfig = Object.freeze({
  supabaseUrl: 'https://avboupigkstzprrgvlhr.supabase.co',
  supabasePublishableKey: 'sb_publishable_eyFLhKFk9HXAab4q1cxG4A_-_la1-OI',
  webVersion: '1.0.5',
  webReleaseDate: '05/08/2026'
});

window.SAM_CONFIG = samConfig;

(() => {
  const THEME_KEY = 'sam-theme';
  const isAdminPage = /\/admin(?:\/(?:index\.html)?)?$/.test(window.location.pathname);
  const savedTheme = localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = savedTheme;

  // Administración recibe únicamente la configuración y el tema. El resto de mejoras
  // se carga después de admin.js para que no pueda bloquear la pantalla de acceso.
  if (isAdminPage) return;

  const nativeSetTimeout = window.setTimeout.bind(window);
  const settingsScriptUrl = document.currentScript?.src || window.location.href;
  const brandingGuard = document.createElement('style');
  brandingGuard.id = 'sam-database-branding-guard';
  brandingGuard.textContent = '[data-brand-logo]{visibility:hidden!important}';
  document.head.append(brandingGuard);

  function loadSamAsset(tagName, attributes) {
    const element = document.createElement(tagName);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    document.head.append(element);
    return element;
  }

  loadSamAsset('link', {
    rel: 'stylesheet',
    href: new URL('theme.css?v=sam-theme-1', settingsScriptUrl).toString()
  });

  function applyTheme(theme) {
    const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = normalizedTheme;
    localStorage.setItem(THEME_KEY, normalizedTheme);

    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = normalizedTheme === 'dark' ? '#17151a' : '#f6c83d';

    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      const isDark = normalizedTheme === 'dark';
      button.setAttribute('aria-pressed', String(isDark));
      button.title = isDark ? 'Cambiar a modo claro' : 'Cambiar a modo noche';
      const icon = button.querySelector('.sam-theme-toggle-icon');
      const label = button.querySelector('.sam-theme-toggle-label');
      if (icon) icon.textContent = isDark ? '☀' : '☾';
      if (label) label.textContent = isDark ? 'Modo claro' : 'Modo noche';
    });
  }

  function initializeThemeToggle() {
    const header = document.querySelector('.header-inner');
    if (!header || header.querySelector('[data-theme-toggle]')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sam-theme-toggle sam-theme-toggle--public';
    button.dataset.themeToggle = '';
    button.innerHTML = `
      <span class="sam-theme-toggle-icon" aria-hidden="true"></span>
      <span class="sam-theme-toggle-label"></span>
    `;
    button.addEventListener('click', () => {
      applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });
    header.append(button);
    applyTheme(document.documentElement.dataset.theme);
  }

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
    const favicon = document.querySelector('[data-brand-favicon]');

    // Se elimina inmediatamente cualquier referencia al SVG local. Hasta que el logo
    // guardado en Supabase esté precargado no se muestra ninguna imagen de marca.
    logos.forEach((image) => image.removeAttribute('src'));
    if (favicon) {
      favicon.href = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E';
    }

    if (!logos.length) return;

    try {
      const storefront = await commerceNoticeSetting;
      const logo = storefront?.brand_logo;
      const logoUrl = publicBrandLogoUrl(logo);
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
          image.removeAttribute('src');
          image.style.visibility = 'hidden';
        };
        image.src = logoUrl;
        image.dataset.logoSource = 'database';
        image.closest('.footer-brand')?.classList.add('has-custom-logo');
      });

      await Promise.allSettled(logos.map((image) => (
        typeof image.decode === 'function' ? image.decode() : Promise.resolve()
      )));

      brandingGuard.remove();
      logos.forEach((image) => { image.style.visibility = ''; });

      if (favicon) {
        favicon.href = logoUrl;
        favicon.type = logo?.mime_type || 'image/webp';
      }
    } catch (error) {
      console.warn('No se ha podido aplicar el logo guardado en Supabase.', error);
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

  function showSamWebVersion() {
    const footerBottom = document.querySelector('.footer-bottom');
    if (!footerBottom || footerBottom.querySelector('[data-sam-version]')) return;

    const version = document.createElement('p');
    version.dataset.samVersion = '';
    version.textContent = `Versión ${samConfig.webVersion} · ${samConfig.webReleaseDate}`;
    version.title = 'Versión y fecha de publicación de la web';
    footerBottom.append(version);
  }

  initializeThemeToggle();
  prepareStorefrontBranding();
  showSamWebVersion();

  loadSamAsset('link', {
    rel: 'stylesheet',
    href: new URL('catalog-pdf.css?v=sam-catalog-pdf-5', settingsScriptUrl).toString()
  });
  loadSamAsset('script', {
    src: new URL('catalog-pdf.js?v=sam-catalog-pdf-5', settingsScriptUrl).toString()
  });
})();