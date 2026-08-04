(() => {
  function config() {
    const value = window.SAM_CONFIG || {};
    return {
      url: String(value.supabaseUrl || '').replace(/\/$/, ''),
      key: String(value.supabasePublishableKey || value.supabaseAnonKey || '')
    };
  }

  async function apiGet(resource, query) {
    const current = config();
    if (!current.url || !current.key) return [];
    const url = new URL(`${current.url}/rest/v1/${resource}`);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url, {
      headers: { apikey: current.key, Authorization: `Bearer ${current.key}` }
    });
    if (!response.ok) throw new Error(`No se pudo leer el catálogo PDF (${response.status})`);
    return response.json();
  }

  function publicStorageUrl(file) {
    if (!file?.bucket || !file?.path) return '';
    const current = config();
    const path = String(file.path).split('/').map(encodeURIComponent).join('/');
    return `${current.url}/storage/v1/object/public/${encodeURIComponent(file.bucket)}/${path}`;
  }

  function createButton(url) {
    if (!url || document.querySelector('[data-catalog-pdf-button]')) return;
    const heroActions = document.querySelector('.hero-actions');
    if (heroActions) {
      const button = document.createElement('a');
      button.className = 'button button--outline catalog-pdf-button';
      button.href = url;
      button.target = '_blank';
      button.rel = 'noopener';
      button.dataset.catalogPdfButton = 'true';
      button.textContent = 'Ver catálogo completo';
      heroActions.append(button);
    }

    const nav = document.querySelector('#main-nav');
    if (nav && !nav.querySelector('[data-catalog-pdf-nav]')) {
      const link = document.createElement('a');
      link.className = 'catalog-pdf-nav';
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.dataset.catalogPdfNav = 'true';
      link.textContent = 'Catálogo PDF ↗';
      nav.append(link);
    }
  }

  async function initialize() {
    if (/\/admin(?:\/|$)/.test(window.location.pathname)) return;
    try {
      const projects = await apiGet('projects', {
        select: 'id', slug: 'eq.sam', status: 'eq.active', limit: '1'
      });
      const project = projects[0];
      if (!project) return;
      const settings = await apiGet('project_settings', {
        select: 'value', project_id: `eq.${project.id}`, key: 'eq.storefront', limit: '1'
      });
      const pdf = settings[0]?.value?.catalog_pdf;
      const url = pdf?.url || publicStorageUrl(pdf);
      createButton(url);
    } catch (error) {
      console.warn('No se ha podido mostrar el acceso al catálogo PDF.', error);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
