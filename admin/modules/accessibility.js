(() => {
  const core = window.SAM_ADMIN;
  if (!core) return;

  function addSkipLink() {
    if (document.querySelector('.admin-skip-link')) return;
    const main = document.querySelector('main');
    if (!main) return;
    main.id = main.id || 'admin-main';
    const link = document.createElement('a');
    link.className = 'admin-skip-link';
    link.href = `#${main.id}`;
    link.textContent = 'Saltar al contenido del panel';
    document.body.prepend(link);
  }

  function improveImages(root = document) {
    root.querySelectorAll?.('img').forEach((image) => {
      image.decoding = 'async';
      if (!image.closest('.topbar') && !image.hasAttribute('loading')) image.loading = 'lazy';
    });
  }

  function improveLinks(root = document) {
    root.querySelectorAll?.('a[target="_blank"]').forEach((link) => {
      const rel = new Set((link.rel || '').split(/\s+/).filter(Boolean));
      rel.add('noopener');
      rel.add('noreferrer');
      link.rel = [...rel].join(' ');
    });
  }

  function improveButtons(root = document) {
    root.querySelectorAll?.('button').forEach((button) => {
      if (button.getAttribute('aria-label') || button.textContent.trim()) return;
      button.setAttribute('aria-label', button.title || 'Acción del panel');
    });
  }

  function apply(root = document) {
    improveImages(root);
    improveLinks(root);
    improveButtons(root);
  }

  addSkipLink();
  apply();

  const observer = new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) apply(node);
    }));
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const openDialog = [...document.querySelectorAll('dialog[open]')].at(-1);
    if (openDialog && typeof openDialog.close === 'function') openDialog.close();
  });

  document.addEventListener('invalid', (event) => {
    const field = event.target;
    window.setTimeout(() => field.focus({ preventScroll: false }), 0);
  }, true);
})();
