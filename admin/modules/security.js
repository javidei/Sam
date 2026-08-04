(() => {
  const core = window.SAM_ADMIN;
  if (!core) return;

  const dirtyForms = new Set();
  let expiryTimer = 0;
  let archiveDialog = null;

  function isEditableForm(form) {
    return form?.matches?.('#storefront-form,#product-form');
  }

  function markDirty(form) {
    if (!isEditableForm(form)) return;
    dirtyForms.add(form.id);
    document.body.classList.add('has-unsaved-admin-changes');
  }

  function clearDirty(form) {
    if (form?.id) dirtyForms.delete(form.id);
    if (!dirtyForms.size) document.body.classList.remove('has-unsaved-admin-changes');
  }

  function initializeDirtyProtection() {
    document.addEventListener('input', (event) => markDirty(event.target.closest('form')), true);
    document.addEventListener('change', (event) => markDirty(event.target.closest('form')), true);
    document.addEventListener('submit', (event) => {
      const form = event.target;
      if (!isEditableForm(form)) return;
      const status = form.querySelector('.form-status');
      if (!status) return;
      const observer = new MutationObserver(() => {
        const message = status.textContent.trim();
        if (!message || status.classList.contains('is-error')) return;
        if (/guardad|actualizad|publicad/i.test(message)) {
          clearDirty(form);
          observer.disconnect();
        }
      });
      observer.observe(status, { childList: true, subtree: true, characterData: true, attributes: true });
      window.setTimeout(() => observer.disconnect(), 20000);
    }, true);

    window.addEventListener('beforeunload', (event) => {
      if (!dirtyForms.size) return;
      event.preventDefault();
      event.returnValue = '';
    });
  }

  function sessionRemaining() {
    const session = core.getSession();
    if (!session?.expires_at) return null;
    return session.expires_at * 1000 - Date.now();
  }

  function updateSessionChip(chip) {
    const remaining = sessionRemaining();
    if (remaining === null) {
      chip.textContent = 'Sesión no disponible';
      chip.className = 'session-health is-error';
      return;
    }
    if (remaining <= 0) {
      chip.textContent = 'Sesión caducada';
      chip.className = 'session-health is-error';
      document.body.classList.add('session-expired');
      core.toast('La sesión ha caducado. Inicia sesión de nuevo para continuar.', { type: 'error', persistent: true });
      return;
    }
    const minutes = Math.max(1, Math.ceil(remaining / 60000));
    chip.textContent = `Sesión: ${minutes} min`;
    chip.className = `session-health ${minutes <= 10 ? 'is-warning' : 'is-ok'}`;
  }

  async function initializeSessionStatus() {
    const topbar = await core.waitFor('.topbar-actions');
    let chip = topbar.querySelector('.session-health');
    if (!chip) {
      chip = document.createElement('span');
      chip.className = 'session-health';
      chip.title = 'Tiempo aproximado hasta la renovación o caducidad de la sesión';
      topbar.prepend(chip);
    }
    updateSessionChip(chip);
    window.clearInterval(expiryTimer);
    expiryTimer = window.setInterval(() => updateSessionChip(chip), 30000);
  }

  function ensureArchiveDialog() {
    if (archiveDialog) return archiveDialog;
    archiveDialog = document.createElement('dialog');
    archiveDialog.className = 'archive-confirmation-dialog';
    archiveDialog.setAttribute('aria-labelledby', 'archive-dialog-title');
    archiveDialog.innerHTML = `
      <div class="archive-confirmation-card">
        <span class="archive-confirmation-icon" aria-hidden="true">↧</span>
        <p class="eyebrow">Papelera segura</p>
        <h2 id="archive-dialog-title">¿Archivar este producto?</h2>
        <p>Dejará de mostrarse en la tienda, pero permanecerá recuperable desde el filtro “Archivados”. No se borrarán sus imágenes ni su historial.</p>
        <div class="archive-confirmation-actions">
          <button class="secondary-button" type="button" data-cancel-archive>Cancelar</button>
          <button class="danger-button" type="button" data-confirm-archive>Archivar producto</button>
        </div>
      </div>
    `;
    document.body.append(archiveDialog);
    archiveDialog.querySelector('[data-cancel-archive]').addEventListener('click', () => archiveDialog.close());
    archiveDialog.addEventListener('click', (event) => {
      if (event.target === archiveDialog) archiveDialog.close();
    });
    return archiveDialog;
  }

  async function archiveProduct(productId) {
    const rows = await core.rest('catalog_products', {
      query: { select: 'id,name,metadata', id: `eq.${productId}`, limit: '1' }
    });
    const product = rows?.[0];
    if (!product) throw new Error('No se encuentra el producto seleccionado.');
    const session = core.getSession();
    await core.rest('catalog_products', {
      method: 'PATCH',
      query: { id: `eq.${productId}` },
      body: {
        status: 'archived',
        published_at: null,
        metadata: {
          ...(product.metadata || {}),
          archived_at: new Date().toISOString(),
          archived_by: session?.user?.id || null
        }
      },
      prefer: 'return=minimal'
    });
    return product;
  }

  function initializeArchiveProtection() {
    const dialog = ensureArchiveDialog();
    document.addEventListener('click', (event) => {
      const button = event.target.closest('#delete-product-button');
      if (!button || button.hidden) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      button.textContent = 'Archivar producto';
      const productId = document.querySelector('#product-id')?.value;
      if (!productId) {
        core.toast('No se pudo identificar el producto.', { type: 'error' });
        return;
      }
      dialog.dataset.productId = productId;
      dialog.showModal();
    }, true);

    dialog.querySelector('[data-confirm-archive]').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      const productId = dialog.dataset.productId;
      button.disabled = true;
      button.textContent = 'Archivando…';
      try {
        const product = await archiveProduct(productId);
        clearDirty(document.querySelector('#product-form'));
        dialog.close();
        core.toast(`“${product.name}” se ha movido a Archivados.`, { type: 'success' });
        window.setTimeout(() => window.location.reload(), 700);
      } catch (error) {
        core.toast(`No se pudo archivar: ${error.message}`, { type: 'error' });
      } finally {
        button.disabled = false;
        button.textContent = 'Archivar producto';
      }
    });

    const observer = new MutationObserver(() => {
      const deleteButton = document.querySelector('#delete-product-button');
      if (deleteButton) {
        deleteButton.textContent = 'Archivar producto';
        deleteButton.title = 'Mover el producto a Archivados sin borrar datos';
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  }

  initializeDirtyProtection();
  initializeSessionStatus().catch(() => {});
  initializeArchiveProtection();
})();
