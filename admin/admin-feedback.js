(() => {
  function initializeAdminFooter() {
    if (document.querySelector('.admin-footer')) return;

    const version = String(window.SAM_CONFIG?.webVersion || '1.0.0');
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
          <span>Desarrollo: Javier Díaz</span>
          <a href="../">Ver tienda <span aria-hidden="true">→</span></a>
        </div>
      </div>
    `;
    document.body.append(footer);
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

    const statusObserver = new MutationObserver(() => {
      if (!savePending) return;
      const message = status.textContent.trim();
      if (!message) return;

      if (status.classList.contains('is-error')) {
        savePending = false;
        hasUnsavedChanges = true;
        updateButtonState('dirty');
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAdminPage, { once: true });
  } else {
    initializeAdminPage();
  }
})();
