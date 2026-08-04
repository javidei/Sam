(() => {
  function initializeQualityEnhancements() {
    document.querySelectorAll('img').forEach((image) => {
      image.decoding = 'async';
      if (!image.closest('.site-header,.hero,.commerce-dialog,.footer-brand') && !image.hasAttribute('loading')) {
        image.loading = 'lazy';
      }
    });

    document.querySelectorAll('a[target="_blank"]').forEach((link) => {
      const rel = new Set((link.rel || '').split(/\s+/).filter(Boolean));
      rel.add('noopener');
      rel.add('noreferrer');
      link.rel = [...rel].join(' ');
    });

    const navLinks = [...document.querySelectorAll('.nav a[href^="#"]')];
    function updateCurrentSection() {
      const current = window.location.hash || '#inicio';
      navLinks.forEach((link) => {
        if (link.getAttribute('href') === current) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      });
    }
    window.addEventListener('hashchange', updateCurrentSection);
    updateCurrentSection();

    const version = document.querySelector('[data-sam-version]');
    if (version && window.SAM_CONFIG) {
      version.title = `Publicada el ${window.SAM_CONFIG.releaseDate || 'sin fecha'} · commit ${window.SAM_CONFIG.releaseCommit || 'sin identificar'}`;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeQualityEnhancements, { once: true });
  else initializeQualityEnhancements();
})();
