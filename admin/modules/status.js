(() => {
  const core = window.SAM_ADMIN;
  if (!core || document.querySelector('.sam-toast-region')) return;

  const region = document.createElement('section');
  region.className = 'sam-toast-region';
  region.setAttribute('aria-label', 'Notificaciones del panel');
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-atomic', 'false');
  document.body.append(region);

  const seenMessages = new WeakMap();
  let offlineToast = null;

  function classify(message, isError) {
    if (isError) return 'error';
    if (/guardad|publicad|actualizad|subid|exportad|archivad/i.test(message)) return 'success';
    if (/cargando|guardando|subiendo|comprobando|procesando/i.test(message)) return 'progress';
    return 'info';
  }

  function toast(message, { type = 'info', persistent = false, actionLabel = '', onAction = null } = {}) {
    if (!message) return null;
    const element = document.createElement('article');
    element.className = `sam-toast sam-toast--${type}`;
    element.setAttribute('role', type === 'error' ? 'alert' : 'status');
    element.innerHTML = `
      <span class="sam-toast-icon" aria-hidden="true">${type === 'success' ? '✓' : type === 'error' ? '!' : type === 'progress' ? '…' : 'i'}</span>
      <p>${core.escapeHtml(message)}</p>
      ${actionLabel ? `<button type="button" data-toast-action>${core.escapeHtml(actionLabel)}</button>` : ''}
      <button class="sam-toast-close" type="button" aria-label="Cerrar notificación">×</button>
    `;
    region.append(element);

    const close = () => {
      element.classList.add('is-leaving');
      window.setTimeout(() => element.remove(), 180);
    };
    element.querySelector('.sam-toast-close').addEventListener('click', close);
    element.querySelector('[data-toast-action]')?.addEventListener('click', () => {
      onAction?.();
      close();
    });
    if (!persistent) window.setTimeout(close, type === 'error' ? 8500 : 5000);
    return element;
  }

  core.toast = toast;

  function processStatus(element) {
    const message = element.textContent.trim();
    if (!message || seenMessages.get(element) === message) return;
    seenMessages.set(element, message);
    const isError = element.classList.contains('is-error') || /error|no se pudo|caducad|rechazad|fall/i.test(message);
    const type = classify(message, isError);
    toast(message, {
      type,
      actionLabel: isError && /conex|red|fetch|offline/i.test(message) ? 'Reintentar' : '',
      onAction: () => window.location.reload()
    });
  }

  function scanStatuses(root = document) {
    root.querySelectorAll?.('.form-status,[role="status"],.catalog-pdf-admin-status').forEach(processStatus);
  }

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const target = record.target.nodeType === Node.TEXT_NODE ? record.target.parentElement : record.target;
      const status = target?.closest?.('.form-status,[role="status"],.catalog-pdf-admin-status');
      if (status) processStatus(status);
      record.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) scanStatuses(node);
      });
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
  scanStatuses();

  function showOffline() {
    if (offlineToast?.isConnected) return;
    offlineToast = toast('Sin conexión. Los cambios no podrán guardarse hasta recuperar internet.', {
      type: 'error',
      persistent: true,
      actionLabel: 'Comprobar',
      onAction: () => window.location.reload()
    });
    document.body.classList.add('is-offline');
  }

  function showOnline() {
    document.body.classList.remove('is-offline');
    if (offlineToast?.isConnected) offlineToast.remove();
    offlineToast = null;
    toast('Conexión recuperada.', { type: 'success' });
  }

  window.addEventListener('offline', showOffline);
  window.addEventListener('online', showOnline);
  if (!navigator.onLine) showOffline();

  window.addEventListener('unhandledrejection', (event) => {
    const message = event.reason?.message || 'Se produjo un error inesperado en el panel.';
    toast(message, { type: 'error' });
  });
})();
