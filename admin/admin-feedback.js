(() => {
  const THEME_KEY = 'sam-theme';
  let toastTimer = 0;
  let brandingRequest = 0;
  const brandingObservers = [];

  function applyTheme(theme) {
    const normalizedTheme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = normalizedTheme;
    localStorage.setItem(THEME_KEY, normalizedTheme);

    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = normalizedTheme === 'dark' ? '#17151a' : '#262329';

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
    const actions = document.querySelector('.topbar-actions');
    if (!actions || actions.querySelector('[data-theme-toggle]')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sam-theme-toggle sam-theme-toggle--admin';
    button.dataset.themeToggle = '';
    button.innerHTML = `
      <span class="sam-theme-toggle-icon" aria-hidden="true"></span>
      <span class="sam-theme-toggle-label"></span>
    `;
    button.addEventListener('click', () => {
      applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });

    const backLink = actions.querySelector('.back');
    actions.insertBefore(button, backLink || null);
    applyTheme(document.documentElement.dataset.theme || localStorage.getItem(THEME_KEY));
  }

  function isLocalLogoReference(value) {
    return /(?:^|\/)assets\/logo\.svg(?:[?#]|$)/i.test(String(value || ''));
  }

  function protectDatabaseLogo(image) {
    if (!image || image.dataset.databaseLogoProtected === 'true') return;
    image.dataset.databaseLogoProtected = 'true';
    const observer = new MutationObserver(() => {
      const src = image.getAttribute('src');
      if (!isLocalLogoReference(src)) return;
      image.removeAttribute('data-bbdd-logo-ready');
      image.removeAttribute('src');
      image.style.visibility = 'hidden';
    });
    observer.observe(image, { attributes: true, attributeFilter: ['src'] });
    brandingObservers.push(observer);
  }

  function databaseBrandTargets() {
    const topbarLogo = document.querySelector('.topbar img[alt="SAM"]');
    const previewLogo = document.querySelector('#brand-logo-preview');
    if (topbarLogo) topbarLogo.dataset.brandLogo = '';
    [topbarLogo, previewLogo].filter(Boolean).forEach(protectDatabaseLogo);
    return [topbarLogo, previewLogo].filter(Boolean);
  }

  function publicBrandLogoUrl(logo) {
    const config = window.SAM_CONFIG || {};
    const baseUrl = String(config.supabaseUrl || '').replace(/\/$/, '');
    if (!baseUrl || !logo?.bucket || !logo?.path) return '';
    const encodedPath = String(logo.path).split('/').map(encodeURIComponent).join('/');
    return `${baseUrl}/storage/v1/object/public/${encodeURIComponent(logo.bucket)}/${encodedPath}`;
  }

  async function fetchWithTimeout(url, options = {}, timeout = 4500) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function loadDatabaseBranding() {
    const requestId = ++brandingRequest;
    const targets = databaseBrandTargets();
    targets.forEach((image) => {
      image.removeAttribute('data-bbdd-logo-ready');
      image.removeAttribute('src');
      image.style.visibility = 'hidden';
    });

    const config = window.SAM_CONFIG || {};
    const baseUrl = String(config.supabaseUrl || '').replace(/\/$/, '');
    const key = String(config.supabasePublishableKey || config.supabaseAnonKey || '');
    if (!baseUrl || !key) return;

    try {
      const headers = { apikey: key, Authorization: `Bearer ${key}` };
      const projectsUrl = new URL(`${baseUrl}/rest/v1/projects`);
      projectsUrl.search = new URLSearchParams({
        select: 'id',
        slug: 'eq.sam',
        status: 'eq.active',
        limit: '1'
      });
      const projectResponse = await fetchWithTimeout(projectsUrl, { headers });
      if (!projectResponse.ok) throw new Error(`No se pudo leer SAM (${projectResponse.status})`);
      const [project] = await projectResponse.json();
      if (!project?.id || requestId !== brandingRequest) return;

      const settingsUrl = new URL(`${baseUrl}/rest/v1/project_settings`);
      settingsUrl.search = new URLSearchParams({
        select: 'value',
        project_id: `eq.${project.id}`,
        key: 'eq.storefront',
        limit: '1'
      });
      const settingsResponse = await fetchWithTimeout(settingsUrl, { headers });
      if (!settingsResponse.ok) throw new Error(`No se pudo leer la configuración (${settingsResponse.status})`);
      const [setting] = await settingsResponse.json();
      const logo = setting?.value?.brand_logo;
      const logoUrl = publicBrandLogoUrl(logo);
      if (!logoUrl || requestId !== brandingRequest) return;

      const preloader = new Image();
      const loaded = await new Promise((resolve) => {
        let finished = false;
        const finish = (value) => {
          if (finished) return;
          finished = true;
          resolve(value);
        };
        preloader.onload = () => finish(true);
        preloader.onerror = () => finish(false);
        preloader.src = logoUrl;
        window.setTimeout(() => finish(false), 4500);
        if (preloader.complete) finish(preloader.naturalWidth > 0);
      });
      if (!loaded || requestId !== brandingRequest) return;

      targets.forEach((image) => {
        image.onerror = () => {
          image.removeAttribute('data-bbdd-logo-ready');
          image.removeAttribute('src');
          image.style.visibility = 'hidden';
        };
        image.src = logoUrl;
        image.dataset.bbddLogoReady = 'true';
        image.dataset.logoSource = 'database';
        image.style.visibility = '';
      });

      const favicon = document.querySelector('link[rel="icon"]');
      if (favicon) {
        favicon.href = logoUrl;
        favicon.type = logo?.mime_type || 'image/webp';
      }
    } catch (error) {
      console.warn('No se ha podido cargar el logo de Supabase en Administración.', error);
    }
  }

  function initializeDatabaseBranding() {
    const preview = document.querySelector('#brand-logo-preview');
    const input = document.querySelector('#brand-logo-input');
    const reset = document.querySelector('#brand-logo-reset');

    databaseBrandTargets().forEach((image) => {
      image.removeAttribute('data-bbdd-logo-ready');
      image.removeAttribute('src');
      image.style.visibility = 'hidden';
    });

    input?.addEventListener('change', () => {
      if (input.files?.[0] && preview) {
        preview.dataset.bbddLogoReady = 'draft';
        preview.style.visibility = '';
      }
    });

    reset?.addEventListener('click', () => {
      window.setTimeout(() => {
        if (!preview) return;
        preview.removeAttribute('data-bbdd-logo-ready');
        preview.removeAttribute('src');
        preview.style.visibility = 'hidden';
      }, 0);
    });

    loadDatabaseBranding();
    window.SAM_RELOAD_DATABASE_BRANDING = loadDatabaseBranding;
  }

  function initializeAdminFooter() {
    if (document.querySelector('.admin-footer')) return;

    const version = String(window.SAM_CONFIG?.webVersion || '1.0.0');
    const releaseDate = String(window.SAM_CONFIG?.webReleaseDate || 'Sin fecha');
    const footer = document.createElement('footer');
    footer.className = 'admin-footer';
    footer.setAttribute('aria-label', 'Información del panel de administración');
    footer.innerHTML = `
      <div class="admin-footer-inner">
        <div class="admin-footer-brand">
          <strong>SAM</strong>
          <span>Panel de administración</span>
        </div>
        <div class="admin-footer-meta">
          <span class="admin-footer-version">Versión ${version}</span>
          <span class="admin-footer-date">Publicada el ${releaseDate}</span>
          <span>Desarrollo: Javier Díaz</span>
          <a href="../">Ver tienda <span aria-hidden="true">→</span></a>
        </div>
      </div>
    `;
    document.body.append(footer);
  }

  function ensureToast() {
    let toast = document.querySelector('#admin-action-toast');
    if (toast) return toast;

    toast = document.createElement('div');
    toast.id = 'admin-action-toast';
    toast.className = 'admin-action-toast';
    toast.hidden = true;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = `
      <span class="admin-action-toast-icon" aria-hidden="true">✓</span>
      <span class="admin-action-toast-copy">
        <strong>Operación completada</strong>
        <small></small>
      </span>
      <button type="button" aria-label="Cerrar aviso">×</button>
    `;
    toast.querySelector('button').addEventListener('click', () => {
      toast.hidden = true;
      toast.classList.remove('is-visible', 'is-error');
    });
    document.body.append(toast);
    return toast;
  }

  function showToast(message, isError = false, title = '') {
    if (!message) return;
    const toast = ensureToast();
    window.clearTimeout(toastTimer);
    toast.classList.toggle('is-error', isError);
    toast.querySelector('.admin-action-toast-icon').textContent = isError ? '!' : '✓';
    toast.querySelector('strong').textContent = title || (isError ? 'No se pudo completar' : 'Cambios guardados');
    toast.querySelector('small').textContent = message;
    toast.hidden = false;
    window.requestAnimationFrame(() => toast.classList.add('is-visible'));
    toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
      window.setTimeout(() => { toast.hidden = true; }, 180);
    }, isError ? 6500 : 4200);
  }

  function initializeStatusPopups() {
    const dashboardStatus = document.querySelector('#dashboard-status');
    const productStatus = document.querySelector('#product-form-status');
    if (!dashboardStatus || dashboardStatus.dataset.popupReady === 'true') return;
    dashboardStatus.dataset.popupReady = 'true';

    let lastDashboardMessage = '';
    const dashboardObserver = new MutationObserver(() => {
      const message = dashboardStatus.textContent.trim();
      if (!message || message === lastDashboardMessage) return;
      lastDashboardMessage = message;
      const isError = dashboardStatus.classList.contains('is-error');
      if (isError || /guardad|eliminad|actualizad|publicad|archivad/i.test(message)) {
        showToast(message, isError);
      }
    });
    dashboardObserver.observe(dashboardStatus, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class']
    });

    if (productStatus) {
      let lastProductError = '';
      const productObserver = new MutationObserver(() => {
        const message = productStatus.textContent.trim();
        const isError = productStatus.classList.contains('is-error');
        if (!isError || !message || message === lastProductError) return;
        lastProductError = message;
        showToast(message, true, 'Revisa el producto');
      });
      productObserver.observe(productStatus, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class']
      });
    }
  }

  function initializeAdminFeedback() {
    const form = document.querySelector('#storefront-form');
    const status = document.querySelector('#storefront-status');
    const submitButton = form?.querySelector('button[type="submit"]');
    if (!form || !status || !submitButton || submitButton.dataset.feedbackReady === 'true') return;

    submitButton.dataset.feedbackReady = 'true';
    submitButton.id = submitButton.id || 'save-storefront-button';
    submitButton.classList.remove('secondary-button');
    submitButton.classList.add('primary-button', 'storefront-save-button');
    submitButton.innerHTML = `
      <span class="storefront-save-icon" aria-hidden="true">✓</span>
      <span class="storefront-save-copy">
        <strong data-save-title>Guardar configuración</strong>
        <small data-save-subtitle>Publicar los cambios</small>
      </span>
    `;

    const saveTitle = submitButton.querySelector('[data-save-title]');
    const saveSubtitle = submitButton.querySelector('[data-save-subtitle]');
    let savePending = false;
    let hasUnsavedChanges = false;
    let confirmationResetTimer = 0;

    const floatingButton = document.createElement('button');
    floatingButton.type = 'button';
    floatingButton.className = 'storefront-save-floating';
    floatingButton.hidden = true;
    floatingButton.innerHTML = '<span aria-hidden="true">✓</span><strong>Guardar cambios</strong>';
    floatingButton.setAttribute('aria-label', 'Guardar los cambios de configuración pendientes');
    document.body.append(floatingButton);

    const dialog = document.createElement('dialog');
    dialog.id = 'settings-saved-dialog';
    dialog.className = 'save-confirmation-dialog';
    dialog.setAttribute('aria-labelledby', 'settings-saved-title');
    dialog.innerHTML = `
      <div class="save-confirmation-card">
        <div class="save-confirmation-icon" aria-hidden="true">✓</div>
        <p class="eyebrow">Configuración pública</p>
        <h2 id="settings-saved-title">Configuración guardada</h2>
        <p>Los cambios se han guardado correctamente. La tienda pública los mostrará al volver a cargarla.</p>
        <div class="save-confirmation-actions">
          <button class="secondary-button" type="button" data-close-save-dialog>Seguir editando</button>
          <a class="primary-button save-confirmation-link" href="../" target="_blank" rel="noopener">Ver tienda <span aria-hidden="true">↗</span></a>
        </div>
      </div>
    `;
    document.body.append(dialog);

    function closeDialog() {
      if (!dialog.open) return;
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }

    function openDialog() {
      if (dialog.open) return;
      try {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
        dialog.querySelector('[data-close-save-dialog]')?.focus();
      } catch (error) {
        console.warn('No se ha podido mostrar la confirmación de guardado.', error);
      }
    }

    function updateButtonState(state) {
      window.clearTimeout(confirmationResetTimer);
      submitButton.classList.toggle('has-unsaved-changes', state === 'dirty');
      submitButton.classList.toggle('is-saving', state === 'saving');
      floatingButton.classList.toggle('is-saving', state === 'saving');

      if (state === 'saving') {
        saveTitle.textContent = 'Guardando…';
        saveSubtitle.textContent = 'Espera un momento';
        floatingButton.querySelector('strong').textContent = 'Guardando…';
        floatingButton.disabled = true;
        return;
      }

      floatingButton.disabled = false;
      if (state === 'saved') {
        saveTitle.textContent = 'Configuración guardada';
        saveSubtitle.textContent = 'Todo está actualizado';
        floatingButton.hidden = true;
        confirmationResetTimer = window.setTimeout(() => updateButtonState('clean'), 2600);
        return;
      }

      if (state === 'dirty') {
        saveTitle.textContent = 'Guardar cambios';
        saveSubtitle.textContent = 'Hay cambios pendientes';
        floatingButton.querySelector('strong').textContent = 'Guardar cambios';
        floatingButton.hidden = false;
        return;
      }

      saveTitle.textContent = 'Guardar configuración';
      saveSubtitle.textContent = 'Publicar los cambios';
      floatingButton.querySelector('strong').textContent = 'Guardar cambios';
      floatingButton.hidden = !hasUnsavedChanges;
    }

    function markAsChanged() {
      if (savePending) return;
      hasUnsavedChanges = true;
      updateButtonState('dirty');
    }

    form.addEventListener('input', markAsChanged);
    form.addEventListener('change', markAsChanged);
    document.querySelector('#brand-logo-reset')?.addEventListener('click', markAsChanged);

    form.addEventListener('submit', () => {
      savePending = true;
      updateButtonState('saving');
    });

    floatingButton.addEventListener('click', () => {
      if (submitButton.disabled) return;
      form.requestSubmit(submitButton);
    });

    dialog.querySelector('[data-close-save-dialog]')?.addEventListener('click', closeDialog);
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeDialog();
    });

    window.addEventListener('beforeunload', (event) => {
      if (!hasUnsavedChanges || savePending) return;
      event.preventDefault();
      event.returnValue = '';
    });

    const statusObserver = new MutationObserver(() => {
      if (!savePending) return;
      const message = status.textContent.trim();
      if (!message) return;

      if (status.classList.contains('is-error')) {
        savePending = false;
        hasUnsavedChanges = true;
        updateButtonState('dirty');
        showToast(message, true, 'No se guardó la configuración');
        return;
      }

      if (/\bguardad[oa]s?\b/i.test(message) && !/\bguardando\b/i.test(message)) {
        savePending = false;
        hasUnsavedChanges = false;
        updateButtonState('saved');
        openDialog();
        window.setTimeout(loadDatabaseBranding, 180);
      }
    });
    statusObserver.observe(status, { childList: true, subtree: true, characterData: true, attributes: true });
  }

  function initializeAdminPage() {
    initializeThemeToggle();
    initializeDatabaseBranding();
    initializeAdminFooter();
    initializeAdminFeedback();
    initializeStatusPopups();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAdminPage, { once: true });
  } else {
    initializeAdminPage();
  }
})();