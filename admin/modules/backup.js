(() => {
  const core = window.SAM_ADMIN;
  if (!core) return;

  function csvCell(value) {
    const text = value === null || value === undefined ? '' : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  }

  async function fetchInBatches(resource, field, ids, select = '*') {
    if (!ids.length) return [];
    const batches = [];
    for (let index = 0; index < ids.length; index += 80) batches.push(ids.slice(index, index + 80));
    const results = await Promise.all(batches.map((batch) => core.rest(resource, {
      query: { select, [field]: `in.(${batch.join(',')})` }
    })));
    return results.flat();
  }

  async function collectBackup() {
    const project = await core.getProject();
    const [settings, categories, products, variants, files] = await Promise.all([
      core.rest('project_settings', { query: { select: '*', project_id: `eq.${project.id}` } }),
      core.rest('catalog_categories', { query: { select: '*', project_id: `eq.${project.id}`, order: 'sort_order.asc' } }),
      core.rest('catalog_products', { query: { select: '*', project_id: `eq.${project.id}`, order: 'sort_order.asc' } }),
      core.rest('product_variants', { query: { select: '*', project_id: `eq.${project.id}`, order: 'sort_order.asc' } }),
      core.rest('files', { query: { select: '*', project_id: `eq.${project.id}`, order: 'created_at.asc' } })
    ]);
    const productImages = await fetchInBatches('product_images', 'product_id', products.map((item) => item.id));

    return {
      schema: 'sam-backup-v1',
      exported_at: new Date().toISOString(),
      release: {
        version: core.config.webVersion || 'sin-version',
        date: core.config.releaseDate || null,
        commit: core.config.releaseCommit || null
      },
      project,
      settings,
      categories,
      products,
      variants,
      files,
      product_images: productImages
    };
  }

  function markBackup(type) {
    const value = { type, created_at: new Date().toISOString() };
    localStorage.setItem(core.LAST_BACKUP_KEY, JSON.stringify(value));
    core.emit('backup-created', value);
  }

  async function exportJson(button) {
    button.disabled = true;
    try {
      core.toast('Preparando copia completa…', { type: 'progress' });
      const backup = await collectBackup();
      const date = new Date().toISOString().slice(0, 10);
      core.download(`sam-backup-${date}.json`, JSON.stringify(backup, null, 2));
      markBackup('JSON completo');
      core.toast('Copia de seguridad descargada.', { type: 'success' });
    } catch (error) {
      core.toast(`No se pudo crear la copia: ${error.message}`, { type: 'error' });
    } finally {
      button.disabled = false;
    }
  }

  async function exportCsv(button) {
    button.disabled = true;
    try {
      const backup = await collectBackup();
      const categories = new Map(backup.categories.map((item) => [item.id, item.name]));
      const variants = new Map();
      backup.variants.forEach((variant) => {
        if (!variants.has(variant.product_id)) variants.set(variant.product_id, variant);
      });
      const headers = ['id','nombre','slug','categoria','tipo','estado','destacado','precio_eur','sku','stock','control_stock','actualizado'];
      const rows = backup.products.map((product) => {
        const variant = variants.get(product.id) || {};
        return [
          product.id,
          product.name,
          product.slug,
          categories.get(product.category_id) || '',
          product.kind,
          product.status,
          product.featured ? 'Sí' : 'No',
          Number.isInteger(variant.price_cents) ? (variant.price_cents / 100).toFixed(2) : '',
          variant.sku || '',
          variant.stock_quantity ?? '',
          variant.track_inventory ? 'Sí' : 'No',
          product.updated_at || ''
        ].map(csvCell).join(',');
      });
      const date = new Date().toISOString().slice(0, 10);
      core.download(`sam-catalogo-${date}.csv`, `\uFEFF${headers.map(csvCell).join(',')}\n${rows.join('\n')}`, 'text/csv;charset=utf-8');
      markBackup('CSV de catálogo');
      core.toast('Catálogo CSV descargado.', { type: 'success' });
    } catch (error) {
      core.toast(`No se pudo exportar el catálogo: ${error.message}`, { type: 'error' });
    } finally {
      button.disabled = false;
    }
  }

  async function exportSettings(button) {
    button.disabled = true;
    try {
      const project = await core.getProject();
      const settings = await core.rest('project_settings', { query: { select: '*', project_id: `eq.${project.id}` } });
      const date = new Date().toISOString().slice(0, 10);
      core.download(`sam-configuracion-${date}.json`, JSON.stringify({ project, settings, exported_at: new Date().toISOString() }, null, 2));
      markBackup('Configuración JSON');
      core.toast('Configuración descargada.', { type: 'success' });
    } catch (error) {
      core.toast(`No se pudo exportar la configuración: ${error.message}`, { type: 'error' });
    } finally {
      button.disabled = false;
    }
  }

  async function initialize() {
    const panel = await core.mountPanel('backup-panel', `
      <div class="sam-module-heading">
        <div><p class="eyebrow">Protección de datos</p><h2>Copias de seguridad</h2><p class="muted">Descarga una copia antes de cambios importantes. La restauración se realiza de forma controlada para evitar duplicados o conflictos.</p></div>
        <span class="sam-module-badge">Exportación segura</span>
      </div>
      <div class="backup-actions">
        <button class="primary-button" type="button" data-backup-json>Descargar copia completa</button>
        <button class="secondary-button" type="button" data-backup-csv>Exportar catálogo CSV</button>
        <button class="secondary-button" type="button" data-backup-settings>Exportar configuración</button>
      </div>
      <p class="sam-module-help">La copia JSON incluye productos, variantes, categorías, imágenes registradas y configuración. Los archivos físicos permanecen en Supabase Storage.</p>
    `, { className: 'backup-panel' });

    panel.querySelector('[data-backup-json]').addEventListener('click', (event) => exportJson(event.currentTarget));
    panel.querySelector('[data-backup-csv]').addEventListener('click', (event) => exportCsv(event.currentTarget));
    panel.querySelector('[data-backup-settings]').addEventListener('click', (event) => exportSettings(event.currentTarget));
  }

  initialize().catch((error) => console.warn('No se pudo iniciar el módulo de copias.', error));
})();
