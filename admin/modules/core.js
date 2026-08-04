(() => {
  if (window.SAM_ADMIN) return;

  const SESSION_KEY = 'sam-admin-session';
  const LAST_BACKUP_KEY = 'sam-admin-last-backup';
  const config = window.SAM_CONFIG || {};
  let projectPromise = null;

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function getApiConfig() {
    return {
      url: String(config.supabaseUrl || '').replace(/\/$/, ''),
      key: String(config.supabasePublishableKey || config.supabaseAnonKey || '')
    };
  }

  async function request(url, options = {}) {
    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type') || '';
    const payload = response.status === 204
      ? null
      : contentType.includes('application/json')
        ? await response.json().catch(() => null)
        : await response.text().catch(() => '');

    if (!response.ok) {
      const message = payload?.message || payload?.msg || payload?.error_description || payload?.error || `Error ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  async function rest(resource, { method = 'GET', query = {}, body, prefer, authenticated = true } = {}) {
    const api = getApiConfig();
    const url = new URL(`${api.url}/rest/v1/${resource}`);
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
    });

    const session = getSession();
    if (authenticated && !session?.access_token) {
      throw new Error('La sesión del administrador ha caducado. Vuelve a iniciar sesión.');
    }

    const headers = { apikey: api.key };
    if (authenticated) headers.Authorization = `Bearer ${session.access_token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (prefer) headers.Prefer = prefer;

    return request(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  }

  async function getProject({ refresh = false } = {}) {
    if (refresh) projectPromise = null;
    if (!projectPromise) {
      projectPromise = rest('projects', {
        query: { select: 'id,name,slug,status', slug: 'eq.sam', limit: '1' }
      }).then((rows) => {
        const project = rows?.[0];
        if (!project) throw new Error('No se encuentra el proyecto SAM.');
        return project;
      }).catch((error) => {
        projectPromise = null;
        throw error;
      });
    }
    return projectPromise;
  }

  function waitFor(selector, { root = document, timeout = 15000 } = {}) {
    const found = root.querySelector(selector);
    if (found) return Promise.resolve(found);

    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        observer.disconnect();
        reject(new Error(`No apareció ${selector} dentro del tiempo esperado.`));
      }, timeout);
      const observer = new MutationObserver(() => {
        const element = root.querySelector(selector);
        if (!element) return;
        window.clearTimeout(timer);
        observer.disconnect();
        resolve(element);
      });
      observer.observe(root === document ? document.documentElement : root, { childList: true, subtree: true, attributes: true });
    });
  }

  async function mountPanel(id, html, { before = '.catalog-panel', className = '' } = {}) {
    const dashboard = await waitFor('#dashboard-view');
    const existing = dashboard.querySelector(`#${CSS.escape(id)}`);
    if (existing) return existing;

    const panel = document.createElement('section');
    panel.id = id;
    panel.className = `panel sam-admin-module-panel ${className}`.trim();
    panel.innerHTML = html;
    const target = dashboard.querySelector(before) || dashboard.lastElementChild;
    if (target) target.before(panel);
    else dashboard.append(panel);
    return panel;
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function download(name, content, type = 'application/json;charset=utf-8') {
    const blob = content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function formatDate(value, { withTime = true } = {}) {
    if (!value) return 'No disponible';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('es-ES', {
      dateStyle: 'medium',
      ...(withTime ? { timeStyle: 'short' } : {})
    }).format(date);
  }

  function emit(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(`sam:${name}`, { detail }));
  }

  function on(name, handler) {
    const wrapped = (event) => handler(event.detail, event);
    window.addEventListener(`sam:${name}`, wrapped);
    return () => window.removeEventListener(`sam:${name}`, wrapped);
  }

  window.SAM_ADMIN = {
    SESSION_KEY,
    LAST_BACKUP_KEY,
    config,
    getSession,
    getApiConfig,
    request,
    rest,
    getProject,
    waitFor,
    mountPanel,
    escapeHtml,
    download,
    formatDate,
    emit,
    on,
    toast: () => {}
  };

  emit('admin-core-ready');
})();
