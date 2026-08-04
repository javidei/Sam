(() => {
  const SESSION_KEY = 'sam-admin-session';
  const BUCKET = 'sam-public';
  const PDF_PATH = 'sam/catalog/catalogo-personalizables.pdf';
  const SHEETJS_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
  const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const columns = [
    'Importar','Categoría','Nombre','Slug','Descripción','Tipo','Entrega','Estado',
    'Modo precio','Precio EUR','Precios/variantes','Stock','Control stock','Destacado',
    'Consulta personalizada','Página PDF','Recorte X','Recorte Y','Recorte ancho',
    'Recorte alto','Imagen nombre','Notas revisión'
  ];

  let project = null;
  let settingRow = null;
  let categoryMap = new Map();
  let selectedExcel = null;
  let selectedPdf = null;
  let busy = false;

  function normalizeKey(value) {
    return String(value || '')
      .toLocaleLowerCase('es')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function slugify(value) {
    return normalizeKey(value).replace(/\s+/g, '-').replace(/^-|-$/g, '') || 'producto';
  }

  function yes(value) {
    return ['si','sí','yes','true','1','x'].includes(String(value || '').trim().toLocaleLowerCase('es'));
  }

  function numberValue(value, fallback = 0) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = Number(String(value || '').replace(',', '.').replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function session() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }

  function config() {
    const value = window.SAM_CONFIG || {};
    return {
      url: String(value.supabaseUrl || '').replace(/\/$/, ''),
      key: String(value.supabasePublishableKey || value.supabaseAnonKey || '')
    };
  }

  function headers(extra = {}) {
    const current = session();
    const currentConfig = config();
    if (!current?.access_token) throw new Error('La sesión del administrador ha caducado. Vuelve a iniciar sesión.');
    return {
      apikey: currentConfig.key,
      Authorization: `Bearer ${current.access_token}`,
      ...extra
    };
  }

  async function rest(resource, { method = 'GET', query = {}, body, prefer } = {}) {
    const currentConfig = config();
    const url = new URL(`${currentConfig.url}/rest/v1/${resource}`);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    const requestHeaders = headers(body === undefined ? {} : { 'Content-Type': 'application/json' });
    if (prefer) requestHeaders.Prefer = prefer;
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message || payload?.msg || `Error ${response.status}`);
    return payload;
  }

  async function uploadStorage(path, blob, contentType) {
    const currentConfig = config();
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const response = await fetch(`${currentConfig.url}/storage/v1/object/${BUCKET}/${encodedPath}`, {
      method: 'POST',
      headers: headers({ 'Content-Type': contentType, 'x-upsert': 'true' }),
      body: blob
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || `No se pudo subir el archivo (${response.status})`);
    return payload;
  }

  function publicStorageUrl(file) {
    if (!file?.bucket || !file?.path) return '';
    const currentConfig = config();
    const path = file.path.split('/').map(encodeURIComponent).join('/');
    return `${currentConfig.url}/storage/v1/object/public/${encodeURIComponent(file.bucket)}/${path}`;
  }

  function loadScript(src, test) {
    if (test()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find((script) => script.src === src);
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', () => reject(new Error(`No se pudo cargar ${src}`)), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
      document.head.append(script);
    });
  }

  async function ensureLibraries({ pdf = false } = {}) {
    await loadScript(SHEETJS_URL, () => Boolean(window.XLSX));
    if (pdf) {
      await loadScript(PDFJS_URL, () => Boolean(window.pdfjsLib));
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    }
  }

  function setStatus(message = '', error = false) {
    const status = document.querySelector('#catalog-import-status');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-error', error);
  }

  function setProgress(done, total) {
    const bar = document.querySelector('#catalog-import-progress-bar');
    if (!bar) return;
    const percentage = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
    bar.style.width = `${percentage}%`;
    bar.parentElement.setAttribute('aria-valuenow', String(percentage));
  }

  function showSummary(title, body) {
    const dialog = document.querySelector('#catalog-import-dialog');
    if (!dialog) return;
    dialog.querySelector('h2').textContent = title;
    dialog.querySelector('[data-summary-copy]').textContent = body;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  function rowValue(row, label) {
    const wanted = normalizeKey(label);
    const key = Object.keys(row).find((candidate) => normalizeKey(candidate) === wanted);
    return key ? row[key] : '';
  }

  function mappedRow(row, index) {
    const category = String(rowValue(row, 'Categoría')).trim();
    const name = String(rowValue(row, 'Nombre')).trim();
    const slug = String(rowValue(row, 'Slug')).trim() || `${slugify(category)}-${slugify(name)}-${index + 1}`;
    return {
      import: yes(rowValue(row, 'Importar')),
      category,
      name,
      slug,
      description: String(rowValue(row, 'Descripción')).trim(),
      kind: String(rowValue(row, 'Tipo') || 'physical').trim() || 'physical',
      fulfillment: String(rowValue(row, 'Entrega') || 'home_delivery').trim() || 'home_delivery',
      status: String(rowValue(row, 'Estado') || 'draft').trim() || 'draft',
      priceMode: String(rowValue(row, 'Modo precio') || 'quote').trim() || 'quote',
      price: numberValue(rowValue(row, 'Precio EUR'), NaN),
      variantsRaw: String(rowValue(row, 'Precios/variantes')).trim(),
      stock: Math.max(0, Math.round(numberValue(rowValue(row, 'Stock'), 0))),
      trackStock: yes(rowValue(row, 'Control stock')),
      featured: yes(rowValue(row, 'Destacado')),
      customQuote: yes(rowValue(row, 'Consulta personalizada')),
      page: Math.round(numberValue(rowValue(row, 'Página PDF'), 0)),
      cropX: numberValue(rowValue(row, 'Recorte X'), NaN),
      cropY: numberValue(rowValue(row, 'Recorte Y'), NaN),
      cropWidth: numberValue(rowValue(row, 'Recorte ancho'), NaN),
      cropHeight: numberValue(rowValue(row, 'Recorte alto'), NaN),
      imageName: String(rowValue(row, 'Imagen nombre') || `${slug}.webp`).trim(),
      notes: String(rowValue(row, 'Notas revisión')).trim(),
      sourceIndex: index + 2
    };
  }

  async function readWorkbook(file) {
    await ensureLibraries();
    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames.find((name) => normalizeKey(name) === 'productos') || workbook.SheetNames[0];
    if (!sheetName) throw new Error('El Excel no contiene ninguna hoja.');
    const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '', raw: false });
    return rows.map(mappedRow).filter((row) => row.import);
  }

  async function loadProjectContext() {
    const projects = await rest('projects', {
      query: { select: 'id,name,slug', slug: 'eq.sam', status: 'eq.active', limit: '1' }
    });
    project = projects?.[0];
    if (!project) throw new Error('No se encuentra el proyecto activo de SAM.');

    const [categories, settings] = await Promise.all([
      rest('catalog_categories', {
        query: { select: 'id,slug,name,sort_order,is_active', project_id: `eq.${project.id}`, order: 'sort_order.asc' }
      }),
      rest('project_settings', {
        query: { select: 'key,value,is_public', project_id: `eq.${project.id}`, key: 'eq.storefront', limit: '1' }
      })
    ]);
    categoryMap = new Map((categories || []).map((category) => [normalizeKey(category.name), category]));
    settingRow = settings?.[0] || null;
    updatePdfCurrent();
  }

  async function ensureCategory(name) {
    const key = normalizeKey(name);
    if (categoryMap.has(key)) return categoryMap.get(key);
    const created = await rest('catalog_categories', {
      method: 'POST',
      body: {
        project_id: project.id,
        slug: slugify(name),
        name,
        sort_order: categoryMap.size * 10,
        is_active: true
      },
      prefer: 'return=representation'
    });
    const category = created[0];
    categoryMap.set(key, category);
    return category;
  }

  async function saveProduct(row, sortOrder) {
    if (!row.category || !row.name) throw new Error(`Fila ${row.sourceIndex}: faltan Categoría o Nombre.`);
    const category = await ensureCategory(row.category);
    const existingRows = await rest('catalog_products', {
      query: { select: 'id,slug', project_id: `eq.${project.id}`, slug: `eq.${row.slug}`, limit: '1' }
    });
    const metadata = {
      price_mode: ['fixed','from','quote'].includes(row.priceMode) ? row.priceMode : 'quote',
      source: 'catalogo_pdf',
      source_page: row.page || null,
      raw_variant_prices: row.variantsRaw || null,
      import_notes: row.notes || null
    };
    const payload = {
      project_id: project.id,
      category_id: category.id,
      slug: row.slug,
      name: row.name,
      short_description: row.description.slice(0, 280) || null,
      description: row.description || null,
      kind: ['physical','service','digital'].includes(row.kind) ? row.kind : 'physical',
      fulfillment: row.fulfillment || 'home_delivery',
      status: ['published','draft','hidden','archived'].includes(row.status) ? row.status : 'draft',
      featured: row.featured,
      requires_quote: row.customQuote || row.priceMode !== 'fixed',
      currency: 'EUR',
      metadata,
      sort_order: sortOrder,
      published_at: row.status === 'published' ? new Date().toISOString() : null
    };
    let product;
    if (existingRows.length) {
      const saved = await rest('catalog_products', {
        method: 'PATCH',
        query: { id: `eq.${existingRows[0].id}` },
        body: payload,
        prefer: 'return=representation'
      });
      product = saved[0];
    } else {
      const saved = await rest('catalog_products', {
        method: 'POST', body: payload, prefer: 'return=representation'
      });
      product = saved[0];
    }

    const priceCents = Number.isFinite(row.price) ? Math.round(row.price * 100) : null;
    const variants = await rest('product_variants', {
      query: { select: 'id', product_id: `eq.${product.id}`, order: 'sort_order.asc', limit: '1' }
    });
    const variantPayload = {
      project_id: project.id,
      product_id: product.id,
      name: 'Estándar',
      sku: `SAM-PDF-${String(row.page || 0).padStart(2, '0')}-${String(sortOrder).padStart(3, '0')}`,
      price_cents: priceCents,
      currency: 'EUR',
      track_inventory: row.trackStock,
      stock_quantity: row.stock,
      low_stock_threshold: 2,
      is_active: true,
      sort_order: 0
    };
    if (variants.length) {
      await rest('product_variants', {
        method: 'PATCH', query: { id: `eq.${variants[0].id}` }, body: variantPayload, prefer: 'return=minimal'
      });
    } else {
      await rest('product_variants', {
        method: 'POST', body: variantPayload, prefer: 'return=minimal'
      });
    }
    return product;
  }

  async function renderPdfPage(pdfDocument, pageNumber) {
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    return { page, viewport, canvas };
  }

  async function cropImage(rendered, row) {
    if (![row.cropX,row.cropY,row.cropWidth,row.cropHeight].every(Number.isFinite)) return null;
    const pageWidth = rendered.page.view[2] - rendered.page.view[0];
    const pageHeight = rendered.page.view[3] - rendered.page.view[1];
    const scaleX = rendered.viewport.width / pageWidth;
    const scaleY = rendered.viewport.height / pageHeight;
    const sx = Math.max(0, Math.round(row.cropX * scaleX));
    const sy = Math.max(0, Math.round(row.cropY * scaleY));
    const sw = Math.min(rendered.canvas.width - sx, Math.max(1, Math.round(row.cropWidth * scaleX)));
    const sh = Math.min(rendered.canvas.height - sy, Math.max(1, Math.round(row.cropHeight * scaleY)));
    const targetMax = 1200;
    const scale = Math.min(1, targetMax / Math.max(sw, sh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw * scale));
    canvas.height = Math.max(1, Math.round(sh * scale));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(rendered.canvas, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('No se pudo preparar una imagen.')), 'image/webp', 0.88);
    });
  }

  async function attachImage(product, row, blob) {
    if (!blob) return;
    const safeName = (row.imageName || `${row.slug}.webp`).replace(/[^a-zA-Z0-9._-]+/g, '-');
    const path = `sam/products/${product.id}/catalog-${safeName}`;
    await uploadStorage(path, blob, 'image/webp');

    const existingFiles = await rest('files', {
      query: { select: 'id,bucket,path', project_id: `eq.${project.id}`, path: `eq.${path}`, limit: '1' }
    });
    let file;
    const filePayload = {
      project_id: project.id,
      bucket: BUCKET,
      path,
      original_name: safeName,
      mime_type: 'image/webp',
      size_bytes: blob.size,
      visibility: 'public',
      alt_text: row.name,
      uploaded_by: session().user.id
    };
    if (existingFiles.length) {
      const updated = await rest('files', {
        method: 'PATCH', query: { id: `eq.${existingFiles[0].id}` }, body: filePayload, prefer: 'return=representation'
      });
      file = updated[0];
    } else {
      const inserted = await rest('files', { method: 'POST', body: filePayload, prefer: 'return=representation' });
      file = inserted[0];
    }
    const links = await rest('product_images', {
      query: { select: 'file_id', product_id: `eq.${product.id}`, file_id: `eq.${file.id}`, limit: '1' }
    });
    if (!links.length) {
      const currentImages = await rest('product_images', {
        query: { select: 'file_id', product_id: `eq.${product.id}`, limit: '1' }
      });
      await rest('product_images', {
        method: 'POST',
        body: { product_id: product.id, file_id: file.id, sort_order: currentImages.length, is_primary: currentImages.length === 0 },
        prefer: 'return=minimal'
      });
    }
  }

  async function importCatalog() {
    if (busy) return;
    if (!selectedExcel) {
      setStatus('Selecciona primero el Excel del catálogo.', true);
      return;
    }
    busy = true;
    const importButton = document.querySelector('#catalog-import-button');
    importButton.disabled = true;
    setProgress(0, 1);
    try {
      setStatus('Leyendo y validando el Excel…');
      const rows = await readWorkbook(selectedExcel);
      if (!rows.length) throw new Error('No hay filas marcadas con “Sí” en la columna Importar.');
      const rowsWithImages = rows.filter((row) => row.page > 0 && Number.isFinite(row.cropX));
      if (rowsWithImages.length && !selectedPdf) {
        throw new Error('Este Excel contiene recortes de imágenes. Selecciona también el PDF original para adaptar y subir las fotos.');
      }
      await loadProjectContext();
      let pdfDocument = null;
      if (selectedPdf) {
        await ensureLibraries({ pdf: true });
        pdfDocument = await window.pdfjsLib.getDocument({ data: await selectedPdf.arrayBuffer() }).promise;
      }

      const groups = new Map();
      rows.forEach((row) => {
        const page = row.page || 0;
        if (!groups.has(page)) groups.set(page, []);
        groups.get(page).push(row);
      });
      let done = 0;
      let imported = 0;
      let images = 0;
      const errors = [];
      for (const [pageNumber, pageRows] of groups) {
        let rendered = null;
        if (pdfDocument && pageNumber > 0) {
          setStatus(`Preparando las imágenes de la página ${pageNumber}…`);
          rendered = await renderPdfPage(pdfDocument, pageNumber);
        }
        for (const row of pageRows) {
          try {
            setStatus(`Importando ${done + 1} de ${rows.length}: ${row.name}`);
            const product = await saveProduct(row, done * 10);
            imported += 1;
            if (rendered && Number.isFinite(row.cropX)) {
              const blob = await cropImage(rendered, row);
              await attachImage(product, row, blob);
              if (blob) images += 1;
            }
          } catch (error) {
            errors.push(`Fila ${row.sourceIndex} (${row.name}): ${error.message}`);
          }
          done += 1;
          setProgress(done, rows.length);
        }
        rendered = null;
      }
      setStatus(errors.length ? `Importación terminada con ${errors.length} avisos.` : 'Importación terminada correctamente.', errors.length > 0);
      showSummary(
        errors.length ? 'Importación completada con avisos' : 'Catálogo importado',
        `${imported} productos procesados y ${images} imágenes adaptadas. ${errors.length ? `Revisa ${errors.length} filas: ${errors.slice(0, 4).join(' · ')}` : 'Los productos están disponibles en el panel para revisarlos y publicarlos.'}`
      );
      document.querySelector('#catalog-import-summary').hidden = false;
      document.querySelector('#catalog-import-summary').innerHTML = `<strong>${imported} productos · ${images} imágenes</strong>${errors.length ? `${errors.length} filas necesitan revisión.` : 'Sin errores detectados.'}`;
    } catch (error) {
      setStatus(error.message, true);
      showSummary('No se pudo completar la importación', error.message);
    } finally {
      busy = false;
      importButton.disabled = false;
    }
  }

  async function uploadPdf() {
    if (busy) return;
    const input = document.querySelector('#catalog-pdf-file');
    const file = input.files?.[0];
    if (!file) {
      setStatus('Selecciona el PDF que quieres publicar.', true);
      return;
    }
    if (file.type !== 'application/pdf' && !file.name.toLocaleLowerCase('es').endsWith('.pdf')) {
      setStatus('El archivo seleccionado no es un PDF.', true);
      return;
    }
    busy = true;
    const button = document.querySelector('#catalog-pdf-upload-button');
    button.disabled = true;
    try {
      setStatus('Subiendo el catálogo PDF…');
      await loadProjectContext();
      await uploadStorage(PDF_PATH, file, 'application/pdf');
      const catalogPdf = {
        bucket: BUCKET,
        path: PDF_PATH,
        original_name: file.name,
        mime_type: 'application/pdf',
        size_bytes: file.size,
        uploaded_at: new Date().toISOString()
      };
      const value = { ...(settingRow?.value || {}), catalog_pdf: catalogPdf };
      if (settingRow) {
        await rest('project_settings', {
          method: 'PATCH', query: { project_id: `eq.${project.id}`, key: 'eq.storefront' }, body: { value, is_public: true }, prefer: 'return=minimal'
        });
      } else {
        await rest('project_settings', {
          method: 'POST', body: { project_id: project.id, key: 'storefront', value, is_public: true }, prefer: 'return=minimal'
        });
      }
      settingRow = { key: 'storefront', value, is_public: true };
      updatePdfCurrent();
      setStatus('Catálogo PDF subido y publicado correctamente.');
      showSummary('PDF publicado', 'El botón “Ver catálogo PDF” aparecerá en la tienda pública al recargarla.');
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  function updatePdfCurrent() {
    const container = document.querySelector('#catalog-pdf-current');
    if (!container) return;
    const pdf = settingRow?.value?.catalog_pdf;
    if (!pdf?.path) {
      container.innerHTML = '<span>No hay ningún PDF publicado todavía.</span>';
      return;
    }
    const url = publicStorageUrl(pdf);
    container.innerHTML = `<span>${pdf.original_name || 'Catálogo publicado'}</span><a href="${url}" target="_blank" rel="noopener">Abrir PDF actual ↗</a>`;
  }

  async function downloadTemplate() {
    try {
      await ensureLibraries();
      const workbook = window.XLSX.utils.book_new();
      const example = [
        columns,
        ['Sí','Tazas','Taza blanca','tazas-taza-blanca','Cerámica de 350 ml','physical','home_delivery','draft','fixed',9.5,'',0,'No','No','Sí','','','','','','taza-blanca.webp','Ejemplo: elimina esta fila antes de importar']
      ];
      const sheet = window.XLSX.utils.aoa_to_sheet(example);
      sheet['!cols'] = columns.map((name) => ({ wch: Math.min(32, Math.max(12, name.length + 2)) }));
      window.XLSX.utils.book_append_sheet(workbook, sheet, 'Productos');
      const help = window.XLSX.utils.aoa_to_sheet([
        ['Plantilla de importación SAM'],
        ['Importar','Escribe Sí para procesar la fila. Cualquier otro valor se omitirá.'],
        ['Estado','Usa draft para revisar antes de publicar o published para mostrar directamente.'],
        ['Imágenes','Para recortar imágenes automáticamente, rellena Página PDF y las cuatro coordenadas y selecciona también el PDF al importar.'],
        ['Precios','Precio EUR es el precio base. Precios/variantes conserva el texto completo del catálogo.']
      ]);
      window.XLSX.utils.book_append_sheet(workbook, help, 'Instrucciones');
      window.XLSX.writeFile(workbook, 'Plantilla_importacion_SAM.xlsx');
    } catch (error) {
      setStatus(error.message, true);
    }
  }

  function fileName(input, fallback) {
    return input.files?.[0]?.name || fallback;
  }

  function createPanel() {
    if (document.querySelector('#catalog-import-panel')) return;
    const dashboard = document.querySelector('#dashboard-view');
    const catalogPanel = dashboard?.querySelector('.catalog-panel');
    if (!dashboard || !catalogPanel) return;

    const panel = document.createElement('section');
    panel.id = 'catalog-import-panel';
    panel.className = 'panel catalog-import-panel';
    panel.innerHTML = `
      <div class="catalog-import-heading">
        <div>
          <p class="eyebrow">Carga inicial del catálogo</p>
          <h2>Importación masiva y catálogo PDF</h2>
          <p class="muted">Carga cientos de productos desde Excel. Al seleccionar también el PDF original, SAM recorta, adapta y sube automáticamente la imagen correspondiente a cada artículo.</p>
        </div>
        <button id="catalog-template-button" class="secondary-button" type="button">Descargar plantilla Excel</button>
      </div>
      <div class="catalog-import-grid">
        <article class="catalog-import-card">
          <h3>Importar productos desde Excel</h3>
          <p>Selecciona el Excel preparado y el PDF del que se extraerán las imágenes. Solo se procesan las filas marcadas con “Sí”.</p>
          <label class="catalog-file-label" for="catalog-excel-file"><input id="catalog-excel-file" type="file" accept=".xlsx,.xls"><strong>Seleccionar Excel</strong><span data-excel-name>Ningún archivo seleccionado</span></label>
          <label class="catalog-file-label" for="catalog-source-pdf" style="margin-top:10px"><input id="catalog-source-pdf" type="file" accept="application/pdf,.pdf"><strong>Seleccionar PDF para imágenes</strong><span data-source-pdf-name>Ningún archivo seleccionado</span></label>
          <div class="catalog-import-actions"><button id="catalog-import-button" class="primary-button" type="button">Importar catálogo completo</button></div>
          <div class="catalog-import-progress"><div class="catalog-progress-track" role="progressbar" aria-label="Progreso de importación" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div id="catalog-import-progress-bar" class="catalog-progress-bar"></div></div></div>
          <div id="catalog-import-summary" class="catalog-import-summary" hidden></div>
        </article>
        <article class="catalog-import-card">
          <h3>Publicar el catálogo en PDF</h3>
          <p>Sube o sustituye el PDF que podrán abrir los clientes desde el nuevo botón de la tienda.</p>
          <label class="catalog-file-label" for="catalog-pdf-file"><input id="catalog-pdf-file" type="file" accept="application/pdf,.pdf"><strong>Seleccionar catálogo PDF</strong><span data-pdf-name>Ningún archivo seleccionado</span></label>
          <div class="catalog-import-actions"><button id="catalog-pdf-upload-button" class="primary-button" type="button">Subir y publicar PDF</button></div>
          <div id="catalog-pdf-current" class="catalog-pdf-current"><span>Comprobando PDF publicado…</span></div>
        </article>
      </div>
      <p class="catalog-import-note">La extracción automática respeta las categorías y los recortes definidos en el Excel. Revisa especialmente las filas marcadas como “Revisar”, porque el PDF original contiene algunos precios escritos de forma ambigua.</p>
      <p id="catalog-import-status" class="catalog-import-status" role="status" aria-live="polite"></p>
    `;
    catalogPanel.before(panel);

    const dialog = document.createElement('dialog');
    dialog.id = 'catalog-import-dialog';
    dialog.className = 'catalog-import-dialog';
    dialog.innerHTML = `<div class="catalog-import-dialog-card"><p class="eyebrow">Catálogo SAM</p><h2>Proceso terminado</h2><p data-summary-copy></p><div class="catalog-import-dialog-actions"><button class="primary-button" type="button" data-close-import-dialog>Aceptar</button></div></div>`;
    document.body.append(dialog);

    document.querySelector('#catalog-excel-file').addEventListener('change', (event) => {
      selectedExcel = event.target.files?.[0] || null;
      document.querySelector('[data-excel-name]').textContent = fileName(event.target, 'Ningún archivo seleccionado');
    });
    document.querySelector('#catalog-source-pdf').addEventListener('change', (event) => {
      selectedPdf = event.target.files?.[0] || null;
      document.querySelector('[data-source-pdf-name]').textContent = fileName(event.target, 'Ningún archivo seleccionado');
    });
    document.querySelector('#catalog-pdf-file').addEventListener('change', (event) => {
      document.querySelector('[data-pdf-name]').textContent = fileName(event.target, 'Ningún archivo seleccionado');
    });
    document.querySelector('#catalog-import-button').addEventListener('click', importCatalog);
    document.querySelector('#catalog-pdf-upload-button').addEventListener('click', uploadPdf);
    document.querySelector('#catalog-template-button').addEventListener('click', downloadTemplate);
    dialog.querySelector('[data-close-import-dialog]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });

    loadProjectContext().catch((error) => setStatus(error.message, true));
  }

  function initialize() {
    createPanel();
    const dashboard = document.querySelector('#dashboard-view');
    if (!dashboard) return;
    const observer = new MutationObserver(createPanel);
    observer.observe(dashboard, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
