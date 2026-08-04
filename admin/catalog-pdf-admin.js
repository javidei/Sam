(() => {
  const SESSION_KEY = 'sam-admin-session';
  const BUCKET = 'sam-public';
  const PDF_PATH = 'sam/catalog/catalogo-personalizables.pdf';
  const PDF_SIZE_LIMIT = 50 * 1024 * 1024;

  let project = null;
  let settingRow = null;
  let busy = false;
  let contextLoading = false;
  let contextLoaded = false;

  function session() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function config() {
    const value = window.SAM_CONFIG || {};
    return {
      url: String(value.supabaseUrl || '').replace(/\/$/, ''),
      key: String(value.supabasePublishableKey || value.supabaseAnonKey || '')
    };
  }

  function dashboardReady() {
    const dashboard = document.querySelector('#dashboard-view');
    return Boolean(dashboard && !dashboard.hidden && session()?.access_token);
  }

  function headers(extra = {}) {
    const currentSession = session();
    const currentConfig = config();
    if (!currentSession?.access_token) {
      throw new Error('La sesión del administrador ha caducado. Vuelve a iniciar sesión.');
    }
    return {
      apikey: currentConfig.key,
      Authorization: `Bearer ${currentSession.access_token}`,
      ...extra
    };
  }

  async function rest(resource, { method = 'GET', query = {}, body, prefer } = {}) {
    const currentConfig = config();
    const url = new URL(`${currentConfig.url}/rest/v1/${resource}`);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));

    const requestHeaders = headers(body === undefined ? {} : { 'Content-Type': 'application/json' });
    if (prefer) requestHeaders.Prefer = prefer;

    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.message || payload?.msg || `Error ${response.status}`);
    }
    return payload;
  }

  async function uploadStorage(path, file) {
    const currentConfig = config();
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const response = await fetch(`${currentConfig.url}/storage/v1/object/${BUCKET}/${encodedPath}`, {
      method: 'POST',
      headers: headers({
        'Content-Type': 'application/pdf',
        'x-upsert': 'true'
      }),
      body: file
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || payload.error || `No se pudo subir el PDF (${response.status})`);
    }
  }

  function publicStorageUrl(file) {
    if (!file?.bucket || !file?.path) return '';
    const currentConfig = config();
    const path = file.path.split('/').map(encodeURIComponent).join('/');
    return `${currentConfig.url}/storage/v1/object/public/${encodeURIComponent(file.bucket)}/${path}`;
  }

  function setStatus(message = '', isError = false) {
    const status = document.querySelector('#catalog-pdf-admin-status');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  }

  function showSummary(title, body) {
    const dialog = document.querySelector('#catalog-pdf-admin-dialog');
    if (!dialog) return;
    dialog.querySelector('h2').textContent = title;
    dialog.querySelector('[data-summary-copy]').textContent = body;
    try {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    } catch (error) {
      console.warn('No se pudo abrir el aviso del PDF.', error);
    }
  }

  async function loadProjectContext() {
    if (contextLoading || !dashboardReady()) return;
    contextLoading = true;
    try {
      const projects = await rest('projects', {
        query: {
          select: 'id,name,slug',
          slug: 'eq.sam',
          status: 'eq.active',
          limit: '1'
        }
      });
      project = projects?.[0];
      if (!project) throw new Error('No se encuentra el proyecto activo de SAM.');

      const settings = await rest('project_settings', {
        query: {
          select: 'key,value,is_public',
          project_id: `eq.${project.id}`,
          key: 'eq.storefront',
          limit: '1'
        }
      });
      settingRow = settings?.[0] || null;
      contextLoaded = true;
      updatePdfCurrent();
      setStatus('');
    } finally {
      contextLoading = false;
    }
  }

  async function refreshProjectContext() {
    try {
      await loadProjectContext();
    } catch (error) {
      setStatus(error.message, true);
      const current = document.querySelector('#catalog-pdf-admin-current');
      if (current) current.innerHTML = '<span>No se pudo comprobar el PDF publicado.</span>';
    }
  }

  async function uploadPdf() {
    if (busy) return;

    const input = document.querySelector('#catalog-pdf-admin-file');
    const file = input?.files?.[0];
    if (!file) {
      setStatus('Selecciona el PDF que quieres publicar.', true);
      return;
    }
    if (file.type !== 'application/pdf' && !file.name.toLocaleLowerCase('es').endsWith('.pdf')) {
      setStatus('El archivo seleccionado no es un PDF.', true);
      return;
    }
    if (file.size > PDF_SIZE_LIMIT) {
      setStatus('El PDF no puede superar 50 MB.', true);
      return;
    }

    busy = true;
    const button = document.querySelector('#catalog-pdf-admin-upload-button');
    button.disabled = true;

    try {
      setStatus('Subiendo el catálogo PDF…');
      contextLoaded = false;
      await loadProjectContext();
      if (!project) throw new Error('No se ha podido cargar el contexto de SAM.');
      await uploadStorage(PDF_PATH, file);

      const catalogPdf = {
        bucket: BUCKET,
        path: PDF_PATH,
        original_name: file.name,
        mime_type: 'application/pdf',
        size_bytes: file.size,
        uploaded_at: new Date().toISOString()
      };
      const value = { ...(settingRow?.value || {}), catalog_pdf: catalogPdf };

      if (settingRow) {
        await rest('project_settings', {
          method: 'PATCH',
          query: {
            project_id: `eq.${project.id}`,
            key: 'eq.storefront'
          },
          body: { value, is_public: true },
          prefer: 'return=minimal'
        });
      } else {
        await rest('project_settings', {
          method: 'POST',
          body: {
            project_id: project.id,
            key: 'storefront',
            value,
            is_public: true
          },
          prefer: 'return=minimal'
        });
      }

      settingRow = { key: 'storefront', value, is_public: true };
      contextLoaded = true;
      updatePdfCurrent();
      input.value = '';
      document.querySelector('[data-catalog-pdf-admin-name]').textContent = 'Ningún archivo seleccionado';
      setStatus('Catálogo PDF subido y publicado correctamente.');
      showSummary('PDF publicado', 'El catálogo público se ha actualizado correctamente.');
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  function updatePdfCurrent() {
    const container = document.querySelector('#catalog-pdf-admin-current');
    if (!container) return;

    const pdf = settingRow?.value?.catalog_pdf;
    if (!pdf?.path) {
      container.innerHTML = '<span>No hay ningún PDF publicado todavía.</span>';
      return;
    }

    const url = publicStorageUrl(pdf);
    container.innerHTML = `
      <div>
        <strong>${pdf.original_name || 'Catálogo publicado'}</strong>
        <small>PDF actualmente visible en la tienda</small>
      </div>
      <a href="${url}" target="_blank" rel="noopener">Abrir PDF actual ↗</a>
    `;
  }

  function createPanel() {
    if (!dashboardReady()) return;

    const existingPanel = document.querySelector('#catalog-pdf-admin-panel');
    if (existingPanel) {
      if (!contextLoaded && !contextLoading) refreshProjectContext();
      return;
    }

    const dashboard = document.querySelector('#dashboard-view');
    const catalogPanel = dashboard?.querySelector('.catalog-panel');
    if (!dashboard || !catalogPanel) return;

    const panel = document.createElement('section');
    panel.id = 'catalog-pdf-admin-panel';
    panel.className = 'panel catalog-pdf-admin-panel';
    panel.innerHTML = `
      <div class="catalog-pdf-admin-heading">
        <div>
          <p class="eyebrow">Catálogo descargable</p>
          <h2>Publicar el catálogo en PDF</h2>
          <p class="muted">Sube o sustituye el documento que podrán abrir los clientes desde la tienda.</p>
        </div>
      </div>
      <div class="catalog-pdf-admin-card">
        <label class="catalog-pdf-admin-file" for="catalog-pdf-admin-file">
          <input id="catalog-pdf-admin-file" type="file" accept="application/pdf,.pdf">
          <strong>Seleccionar catálogo PDF</strong>
          <span data-catalog-pdf-admin-name>Ningún archivo seleccionado</span>
        </label>
        <button id="catalog-pdf-admin-upload-button" class="primary-button" type="button">Subir y publicar PDF</button>
        <div id="catalog-pdf-admin-current" class="catalog-pdf-admin-current">
          <span>Comprobando PDF publicado…</span>
        </div>
      </div>
      <p id="catalog-pdf-admin-status" class="catalog-pdf-admin-status" role="status" aria-live="polite"></p>
    `;
    catalogPanel.before(panel);

    const dialog = document.createElement('dialog');
    dialog.id = 'catalog-pdf-admin-dialog';
    dialog.className = 'catalog-pdf-admin-dialog';
    dialog.innerHTML = `
      <div class="catalog-pdf-admin-dialog-card">
        <p class="eyebrow">Catálogo SAM</p>
        <h2>PDF publicado</h2>
        <p data-summary-copy></p>
        <div class="catalog-pdf-admin-dialog-actions">
          <button class="primary-button" type="button" data-close-pdf-dialog>Aceptar</button>
        </div>
      </div>
    `;
    document.body.append(dialog);

    const fileInput = document.querySelector('#catalog-pdf-admin-file');
    fileInput.addEventListener('change', () => {
      document.querySelector('[data-catalog-pdf-admin-name]').textContent =
        fileInput.files?.[0]?.name || 'Ningún archivo seleccionado';
      setStatus('');
    });
    document.querySelector('#catalog-pdf-admin-upload-button').addEventListener('click', uploadPdf);
    dialog.querySelector('[data-close-pdf-dialog]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });

    refreshProjectContext();
  }

  function initialize() {
    const dashboard = document.querySelector('#dashboard-view');
    if (!dashboard) return;

    createPanel();
    const observer = new MutationObserver(() => {
      if (!dashboard.hidden) createPanel();
    });
    observer.observe(dashboard, {
      attributes: true,
      attributeFilter: ['hidden']
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
