(() => {
  let toastTimer = 0;

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
      }
    });
    statusObserver.observe(status, { childList: true, subtree: true, characterData: true, attributes: true });
  }

  function initializeAdminPage() {
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
