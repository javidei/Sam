(() => {
  const currentUrl = document.currentScript?.src || window.location.href;
  const moduleNames = [
    'core.js',
    'status.js',
    'backup.js',
    'audit.js',
    'security.js',
    'diagnostics.js',
    'accessibility.js'
  ];

  function loadScript(name) {
    return new Promise((resolve, reject) => {
      const src = new URL(`modules/${name}?v=sam-admin-modules-1`, currentUrl).toString();
      const existing = [...document.scripts].find((script) => script.src === src);
      if (existing) {
        if (existing.dataset.loaded === 'true') resolve();
        else {
          existing.addEventListener('load', resolve, { once: true });
          existing.addEventListener('error', reject, { once: true });
        }
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.addEventListener('load', () => {
        script.dataset.loaded = 'true';
        resolve();
      }, { once: true });
      script.addEventListener('error', () => reject(new Error(`No se pudo cargar ${name}`)), { once: true });
      document.head.append(script);
    });
  }

  async function initializeModules() {
    for (const name of moduleNames) {
      await loadScript(name);
    }
    window.dispatchEvent(new CustomEvent('sam:admin-modules-ready'));
  }

  initializeModules().catch((error) => {
    console.error('No se han podido cargar las mejoras del panel de SAM.', error);
  });
})();
