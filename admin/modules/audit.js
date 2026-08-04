(() => {
  const core = window.SAM_ADMIN;
  if (!core) return;

  const tableNames = {
    catalog_products: 'Producto',
    product_variants: 'Variante',
    catalog_categories: 'Categoría',
    project_settings: 'Configuración',
    files: 'Archivo',
    product_images: 'Imagen de producto'
  };
  const actionNames = { INSERT: 'Creado', UPDATE: 'Actualizado', DELETE: 'Eliminado', insert: 'Creado', update: 'Actualizado', delete: 'Eliminado' };

  function changedFields(entry) {
    const oldData = entry.old_data || {};
    const newData = entry.new_data || {};
    const ignored = new Set(['updated_at', 'created_at', 'published_at']);
    return [...new Set([...Object.keys(oldData), ...Object.keys(newData)])]
      .filter((key) => !ignored.has(key) && JSON.stringify(oldData[key]) !== JSON.stringify(newData[key]))
      .slice(0, 5);
  }

  function render(entries, container) {
    if (!entries.length) {
      container.innerHTML = '<p class="sam-empty-state">Todavía no hay cambios registrados. La auditoría comenzará cuando se aplique la migración y se editen datos.</p>';
      return;
    }
    container.innerHTML = entries.map((entry) => {
      const fields = changedFields(entry);
      const entity = tableNames[entry.entity_table] || entry.entity_table;
      const action = actionNames[entry.action] || entry.action;
      return `
        <article class="audit-entry">
          <span class="audit-dot" aria-hidden="true"></span>
          <div>
            <strong>${core.escapeHtml(action)} · ${core.escapeHtml(entity)}</strong>
            <p>${fields.length ? `Campos: ${fields.map(core.escapeHtml).join(', ')}` : 'Cambio registrado'}</p>
            <small>${core.escapeHtml(core.formatDate(entry.created_at))}${entry.actor_id ? ` · Usuario ${core.escapeHtml(entry.actor_id.slice(0, 8))}` : ''}</small>
          </div>
        </article>
      `;
    }).join('');
  }

  async function loadAudit(panel) {
    const list = panel.querySelector('[data-audit-list]');
    const button = panel.querySelector('[data-audit-refresh]');
    button.disabled = true;
    list.setAttribute('aria-busy', 'true');
    try {
      const project = await core.getProject();
      const entries = await core.rest('audit_logs', {
        query: {
          select: 'id,action,entity_table,entity_id,old_data,new_data,actor_id,created_at',
          project_id: `eq.${project.id}`,
          order: 'created_at.desc',
          limit: '20'
        }
      });
      render(entries || [], list);
      core.emit('audit-loaded', { latest: entries?.[0]?.created_at || null, count: entries?.length || 0 });
    } catch (error) {
      list.innerHTML = `
        <div class="sam-module-warning">
          <strong>La auditoría todavía no está disponible.</strong>
          <p>Aplica la migración <code>202608050001_admin_quality.sql</code> en Supabase. Detalle: ${core.escapeHtml(error.message)}</p>
        </div>
      `;
    } finally {
      list.removeAttribute('aria-busy');
      button.disabled = false;
    }
  }

  async function initialize() {
    const panel = await core.mountPanel('audit-panel', `
      <div class="sam-module-heading">
        <div><p class="eyebrow">Trazabilidad</p><h2>Actividad reciente</h2><p class="muted">Consulta los últimos cambios realizados sobre productos, precios, categorías y configuración.</p></div>
        <button class="secondary-button" type="button" data-audit-refresh>Actualizar</button>
      </div>
      <div class="audit-list" data-audit-list><p class="sam-empty-state">Cargando actividad…</p></div>
    `, { className: 'audit-panel' });
    panel.querySelector('[data-audit-refresh]').addEventListener('click', () => loadAudit(panel));
    loadAudit(panel);
  }

  initialize().catch((error) => console.warn('No se pudo iniciar la auditoría.', error));
})();
