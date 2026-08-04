(() => {
  const core = window.SAM_ADMIN;
  if (!core) return;

  function readLastBackup() {
    try {
      return JSON.parse(localStorage.getItem(core.LAST_BACKUP_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function sessionExpiry() {
    const session = core.getSession();
    return session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : null;
  }

  function setItem(panel, key, value, state = '') {
    const item = panel.querySelector(`[data-diagnostic="${key}"]`);
    if (!item) return;
    item.querySelector('strong').textContent = value;
    item.classList.toggle('is-ok', state === 'ok');
    item.classList.toggle('is-warning', state === 'warning');
    item.classList.toggle('is-error', state === 'error');
  }

  async function refresh(panel) {
    const button = panel.querySelector('[data-diagnostics-refresh]');
    button.disabled = true;
    setItem(panel, 'connection', 'Comprobando…');
    try {
      const project = await core.getProject({ refresh: true });
      const settings = await core.rest('project_settings', {
        query: { select: 'value,updated_at', project_id: `eq.${project.id}`, key: 'eq.storefront', limit: '1' }
      });
      const storefront = settings?.[0]?.value || {};
      setItem(panel, 'connection', 'Supabase conectado', 'ok');
      setItem(panel, 'pdf', storefront.catalog_pdf?.path ? 'Catálogo publicado' : 'Sin PDF publicado', storefront.catalog_pdf?.path ? 'ok' : 'warning');
      setItem(panel, 'settings', settings?.[0]?.updated_at ? core.formatDate(settings[0].updated_at) : 'Sin cambios registrados');
    } catch (error) {
      setItem(panel, 'connection', `Error: ${error.message}`, 'error');
      setItem(panel, 'pdf', 'No comprobado', 'warning');
    } finally {
      button.disabled = false;
    }

    const backup = readLastBackup();
    setItem(panel, 'backup', backup?.created_at ? `${core.formatDate(backup.created_at)} · ${backup.type}` : 'Todavía no realizada', backup ? 'ok' : 'warning');
    setItem(panel, 'session', sessionExpiry() ? core.formatDate(sessionExpiry()) : 'No disponible', sessionExpiry() ? 'ok' : 'warning');
    const navigation = performance.getEntriesByType?.('navigation')?.[0];
    setItem(panel, 'performance', navigation ? `${Math.round(navigation.duration)} ms` : 'No disponible', navigation?.duration < 2500 ? 'ok' : 'warning');
  }

  function enhanceFooter() {
    const footer = document.querySelector('.admin-footer-meta');
    if (!footer || footer.querySelector('[data-release-meta]')) return;
    const meta = document.createElement('span');
    meta.dataset.releaseMeta = '';
    meta.textContent = `${core.config.releaseDate || 'sin fecha'} · ${core.config.releaseCommit || 'sin commit'}`;
    meta.title = 'Fecha y commit de la versión publicada';
    footer.insertBefore(meta, footer.querySelector('a'));
  }

  async function initialize() {
    const panel = await core.mountPanel('diagnostics-panel', `
      <div class="sam-module-heading">
        <div><p class="eyebrow">Estado técnico</p><h2>Salud de la aplicación</h2><p class="muted">Información rápida para comprobar qué versión está publicada y si los servicios principales responden.</p></div>
        <button class="secondary-button" type="button" data-diagnostics-refresh>Comprobar ahora</button>
      </div>
      <div class="diagnostics-grid">
        <article data-diagnostic="version"><span>Versión</span><strong>${core.escapeHtml(core.config.webVersion || 'Sin versión')}</strong><small>${core.escapeHtml(core.config.releaseDate || 'Sin fecha')} · ${core.escapeHtml(core.config.releaseCommit || 'Sin commit')}</small></article>
        <article data-diagnostic="connection"><span>Base de datos</span><strong>Comprobando…</strong><small>${core.escapeHtml(core.getApiConfig().url.replace(/^https?:\/\//, ''))}</small></article>
        <article data-diagnostic="pdf"><span>Catálogo PDF</span><strong>Comprobando…</strong><small>Publicación para clientes</small></article>
        <article data-diagnostic="session"><span>Sesión</span><strong>No disponible</strong><small>Caducidad aproximada</small></article>
        <article data-diagnostic="backup"><span>Última copia</span><strong>Todavía no realizada</strong><small>Registro local de exportaciones</small></article>
        <article data-diagnostic="settings"><span>Configuración</span><strong>Comprobando…</strong><small>Última actualización pública</small></article>
        <article data-diagnostic="performance"><span>Carga del panel</span><strong>Calculando…</strong><small>Tiempo de navegación actual</small></article>
      </div>
    `, { before: '.storefront-panel', className: 'diagnostics-panel' });
    panel.querySelector('[data-diagnostics-refresh]').addEventListener('click', () => refresh(panel));
    core.on('backup-created', () => refresh(panel));
    enhanceFooter();
    refresh(panel);
  }

  initialize().catch((error) => console.warn('No se pudo iniciar el diagnóstico.', error));
})();
