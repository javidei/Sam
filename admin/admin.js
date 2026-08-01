const config = window.SAM_CONFIG || {};
const supabaseUrl = String(config.supabaseUrl || '').replace(/\/$/, '');
const publishableKey = String(config.supabasePublishableKey || config.supabaseAnonKey || '');
const sessionKey = 'sam-admin-session';
const $ = (selector) => document.querySelector(selector);

const loginView = $('#login-view');
const dashboardView = $('#dashboard-view');
const loginForm = $('#login-form');
const loginStatus = $('#login-status');
const dashboardStatus = $('#dashboard-status');
const sessionUser = $('#session-user');
const logoutButton = $('#logout-button');
const productList = $('#product-list');
const loadingState = $('#loading-state');
const emptyState = $('#empty-state');
const productDialog = $('#product-dialog');
const productForm = $('#product-form');
const productFormStatus = $('#product-form-status');
const searchInput = $('#product-search');
const statusFilter = $('#status-filter');
const kindFilter = $('#kind-filter');
const storefrontForm = $('#storefront-form');
const storefrontStatus = $('#storefront-status');
const productImagesInput = $('#product-images');
const imageList = $('#image-list');
const imageCount = $('#image-count');
const imageEmpty = $('#image-empty');

let session = null;
let project = null;
let membership = null;
let categories = [];
let products = [];
let currentProduct = null;
let storefrontSetting = null;
let imageDrafts = [];
let removedImages = [];
let usesLegacyFulfillment = false;

const imageLimit = 8;
const imageSizeLimit = 25 * 1024 * 1024;
const storageImageSizeLimit = 10 * 1024 * 1024;
const acceptedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

function setStatus(element, message = '', isError = false) {
  element.textContent = message;
  element.classList.toggle('is-error', isError);
}

function slugify(value) {
  return String(value || '')
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function moneyToCents(value) {
  return String(value).trim() === '' ? null : Math.round(Number(value) * 100);
}

function formatMoney(cents, currency = 'EUR') {
  if (!Number.isInteger(cents)) return 'Sin precio';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency }).format(cents / 100);
}

function normalizeWallapopUrl(value) {
  const rawUrl = String(value || '').trim();
  if (!rawUrl) return '';

  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLocaleLowerCase('es');
    if (url.protocol !== 'https:' || !(hostname === 'wallapop.com' || hostname.endsWith('.wallapop.com'))) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function encodeStoragePath(path) {
  return String(path).split('/').map(encodeURIComponent).join('/');
}

function publicStorageUrl(file) {
  if (!file?.bucket || !file?.path) return '';
  return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(file.bucket)}/${encodeStoragePath(file.path)}`;
}

function imageExtension(type) {
  return ({
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/avif': 'avif'
  })[type] || 'jpg';
}

async function optimizeImage(file) {
  if (typeof createImageBitmap !== 'function') {
    return { blob: file, extension: imageExtension(file.type) };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const maxSide = 2000;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const optimized = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86));
    if (optimized && (scale < 1 || optimized.size < file.size)) {
      return { blob: optimized, extension: 'webp' };
    }
  } catch (error) {
    console.warn('No se ha podido optimizar una imagen; se subirá el original.', error);
  }

  return { blob: file, extension: imageExtension(file.type) };
}

function storeSession(value) {
  session = value;
  if (value) localStorage.setItem(sessionKey, JSON.stringify(value));
  else localStorage.removeItem(sessionKey);
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(sessionKey) || 'null');
  } catch {
    return null;
  }
}

async function authRequest(path, body) {
  const response = await fetch(`${supabaseUrl}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.msg || payload.message || 'No se pudo iniciar sesión');
  }
  return payload;
}

async function ensureSession() {
  session = readSession();
  if (!session?.access_token) return null;
  if (session.expires_at > Math.floor(Date.now() / 1000) + 60) return session;
  if (!session.refresh_token) return null;

  try {
    const refreshed = await authRequest('token?grant_type=refresh_token', { refresh_token: session.refresh_token });
    refreshed.expires_at = Math.floor(Date.now() / 1000) + refreshed.expires_in;
    storeSession(refreshed);
    return refreshed;
  } catch {
    storeSession(null);
    return null;
  }
}

async function rest(resource, { method = 'GET', query = {}, body, prefer } = {}) {
  const url = new URL(`${supabaseUrl}/rest/v1/${resource}`);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
  const headers = { apikey: publishableKey, Authorization: `Bearer ${session.access_token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || payload?.msg || `Error ${response.status}`);
  return payload;
}

async function storageRequest(path, { method = 'POST', body, contentType } = {}) {
  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/sam-public/${encodeStoragePath(path)}`,
    {
      method,
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${session.access_token}`,
        ...(contentType ? { 'Content-Type': contentType } : {}),
        ...(method === 'POST' ? { 'x-upsert': 'false' } : {})
      },
      body
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error || `No se pudo gestionar la foto (${response.status})`);
  }
  return payload;
}

async function uploadProductImage(draft, product, sortOrder) {
  const prepared = await optimizeImage(draft.sourceFile);
  if (prepared.blob.size > storageImageSizeLimit) {
    throw new Error(`“${draft.sourceFile.name}” sigue ocupando más de 10 MB después de optimizarla.`);
  }
  const uniquePart = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const storagePath = `sam/products/${product.id}/${uniquePart}.${prepared.extension}`;

  await storageRequest(storagePath, {
    body: prepared.blob,
    contentType: prepared.blob.type || draft.sourceFile.type
  });

  let fileRow = null;
  try {
    const createdFiles = await rest('files', {
      method: 'POST',
      body: {
        project_id: project.id,
        bucket: 'sam-public',
        path: storagePath,
        original_name: draft.sourceFile.name,
        mime_type: prepared.blob.type || draft.sourceFile.type,
        size_bytes: prepared.blob.size,
        visibility: 'public',
        alt_text: `${product.name} · foto ${sortOrder + 1}`,
        uploaded_by: session.user.id
      },
      prefer: 'return=representation'
    });
    fileRow = createdFiles[0];
    await rest('product_images', {
      method: 'POST',
      body: {
        product_id: product.id,
        file_id: fileRow.id,
        sort_order: sortOrder,
        is_primary: Boolean(draft.isPrimary)
      },
      prefer: 'return=minimal'
    });
  } catch (error) {
    if (fileRow) {
      await rest('files', {
        method: 'DELETE',
        query: { id: `eq.${fileRow.id}` },
        prefer: 'return=minimal'
      }).catch(() => {});
    }
    await storageRequest(storagePath, { method: 'DELETE' }).catch(() => {});
    throw error;
  }

  return {
    key: `file-${fileRow.id}`,
    type: 'existing',
    fileId: fileRow.id,
    file: fileRow,
    isPrimary: Boolean(draft.isPrimary),
    previewUrl: publicStorageUrl(fileRow)
  };
}

async function deleteStoredImage(image) {
  await rest('files', {
    method: 'DELETE',
    query: { id: `eq.${image.fileId}` },
    prefer: 'return=minimal'
  });
  await storageRequest(image.file.path, { method: 'DELETE' }).catch((error) => {
    console.warn('La referencia de la foto se eliminó, pero Storage no pudo limpiarla.', error);
  });
}

async function loadAccess() {
  const projectRows = await rest('projects', {
    query: { select: 'id,name,slug', slug: 'eq.sam', limit: '1' }
  });
  project = projectRows[0];
  if (!project) throw new Error('No se encuentra el proyecto SAM');

  const rows = await rest('project_members', {
    query: {
      select: 'role,user_id',
      project_id: `eq.${project.id}`,
      user_id: `eq.${session.user.id}`,
      limit: '1'
    }
  });
  membership = rows[0];
  if (!membership || !['owner', 'admin', 'editor'].includes(membership.role)) {
    throw new Error('Tu cuenta existe, pero aún no tiene permisos de edición en SAM');
  }
}

async function loadCatalog() {
  loadingState.hidden = false;
  const [categoryRows, productRows, settingRows] = await Promise.all([
    rest('catalog_categories', {
      query: {
        select: 'id,slug,name,sort_order,is_active',
        project_id: `eq.${project.id}`,
        order: 'sort_order.asc'
      }
    }),
    rest('catalog_products', {
      query: {
        select: 'id,category_id,slug,name,short_description,kind,fulfillment,status,featured,requires_quote,metadata,sort_order,published_at,category:catalog_categories(name),variants:product_variants(id,name,sku,price_cents,currency,track_inventory,stock_quantity,low_stock_threshold,is_active,sort_order),images:product_images(file_id,sort_order,is_primary,file:files(id,bucket,path,original_name,mime_type,size_bytes,alt_text))',
        project_id: `eq.${project.id}`,
        order: 'sort_order.asc,name.asc'
      }
    }),
    rest('project_settings', {
      query: {
        select: 'key,value,is_public',
        project_id: `eq.${project.id}`,
        key: 'eq.storefront',
        limit: '1'
      }
    })
  ]);

  categories = categoryRows;
  products = productRows;
  usesLegacyFulfillment = products.some((product) => ['pickup', 'digital_delivery', 'both'].includes(product.fulfillment));
  storefrontSetting = settingRows[0] || null;
  loadingState.hidden = true;
  fillCategoryOptions();
  fillStorefrontForm();
  renderProducts();
  updateStats();
}

function productVariant(product) {
  return [...(product.variants || [])].sort((a, b) => a.sort_order - b.sort_order)[0] || null;
}

function normalizeFulfillment(value, kind) {
  if (value === 'email_delivery' || value === 'digital_delivery') return 'email_delivery';
  if (value === 'home_delivery' || value === 'pickup') return 'home_delivery';
  return kind === 'digital' ? 'email_delivery' : 'home_delivery';
}

function databaseFulfillment(value) {
  if (!usesLegacyFulfillment) return value;
  return value === 'email_delivery' ? 'digital_delivery' : 'pickup';
}

function getPriceMode(product) {
  const configuredMode = product.metadata?.price_mode;
  if (['fixed', 'from', 'quote'].includes(configuredMode)) return configuredMode;
  const variant = productVariant(product);
  if (!Number.isInteger(variant?.price_cents)) return 'quote';
  return product.requires_quote ? 'from' : 'fixed';
}

function formatProductPrice(product) {
  const variant = productVariant(product);
  const mode = getPriceMode(product);
  if (mode === 'quote' || !Number.isInteger(variant?.price_cents)) return 'A consultar';
  const amount = formatMoney(variant.price_cents, variant.currency || 'EUR');
  return mode === 'from' ? `Desde ${amount}` : amount;
}

function getStockInfo(product) {
  const variant = productVariant(product);
  if (product.kind !== 'physical') return { text: 'No aplica', state: 'none' };
  if (!variant?.track_inventory) return { text: 'Sin control', state: 'none' };
  if (variant.stock_quantity <= 0) return { text: '0 uds.', state: 'out' };
  if (variant.low_stock_threshold > 0 && variant.stock_quantity <= variant.low_stock_threshold) {
    return { text: `${variant.stock_quantity} uds.`, state: 'low' };
  }
  return { text: `${variant.stock_quantity} uds.`, state: 'available' };
}

function updateStats() {
  $('#stat-total').textContent = products.length;
  $('#stat-physical').textContent = products.filter((product) => product.kind === 'physical').length;
  $('#stat-published').textContent = products.filter((product) => product.status === 'published').length;
  $('#stat-low-stock').textContent = products.filter((product) => {
    const variant = productVariant(product);
    return product.kind === 'physical'
      && variant?.track_inventory
      && variant.stock_quantity <= variant.low_stock_threshold;
  }).length;
}

function statusLabel(status) {
  return ({ published: 'Publicado', draft: 'Borrador', hidden: 'Oculto', archived: 'Archivado' })[status] || status;
}

function kindLabel(kind) {
  return ({ physical: 'Artículo', service: 'Servicio', digital: 'Digital' })[kind] || kind;
}

function textElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function renderProducts() {
  const query = slugify(searchInput.value);
  const selectedStatus = statusFilter.value;
  const selectedKind = kindFilter.value;
  const filtered = products.filter((product) => {
    const variant = productVariant(product);
    const haystack = slugify(`${product.name} ${product.slug} ${variant?.sku || ''}`);
    return (!query || haystack.includes(query))
      && (selectedStatus === 'all' || product.status === selectedStatus)
      && (selectedKind === 'all' || product.kind === selectedKind);
  });

  productList.replaceChildren();
  filtered.forEach((product) => {
    const variant = productVariant(product);
    const stock = getStockInfo(product);
    const row = document.createElement('article');
    row.className = 'product-row';

    const name = document.createElement('div');
    name.className = 'product-name';
    name.append(
      textElement('strong', '', product.name),
      textElement('small', '', [
        variant?.sku || product.slug,
        formatProductPrice(product),
        stock.text,
        `${product.images?.length || 0} foto${product.images?.length === 1 ? '' : 's'}`
      ].join(' · '))
    );
    const edit = textElement('button', 'row-button', 'Editar');
    edit.type = 'button';
    edit.addEventListener('click', () => openProduct(product));

    row.append(
      name,
      textElement('span', `kind-pill kind-pill--${product.kind}`, kindLabel(product.kind)),
      textElement('span', 'price-copy', formatProductPrice(product)),
      textElement('span', `stock-copy stock-copy--${stock.state}`, stock.text),
      textElement('span', `status-pill status-pill--${product.status}`, statusLabel(product.status)),
      edit
    );
    productList.append(row);
  });
  emptyState.hidden = filtered.length !== 0;
}

function fillCategoryOptions() {
  const select = $('#product-category');
  select.replaceChildren(...categories.filter((category) => category.is_active).map((category) => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    return option;
  }));
}

function fillStorefrontForm() {
  const value = storefrontSetting?.value || {};
  $('#contact-name').value = value.contact_name || '';
  $('#contact-whatsapp').value = value.contact_whatsapp || '';
  $('#contact-email').value = value.contact_email || '';
  $('#bizum-phone').value = value.bizum_phone || '';
  $('#wallapop-url').value = value.wallapop_url || '';
  $('#commerce-notice-enabled').checked = value.commerce_notice_enabled !== false;

  const canManageSettings = ['owner', 'admin'].includes(membership.role);
  [...storefrontForm.elements].forEach((element) => { element.disabled = !canManageSettings; });
  if (!canManageSettings) {
    setStatus(storefrontStatus, 'Tu rol permite editar productos, pero solo el propietario o un administrador puede cambiar el contacto.');
  }
}

async function saveStorefront(event) {
  event.preventDefault();
  const contactName = $('#contact-name').value.trim();
  const contactWhatsapp = $('#contact-whatsapp').value.replace(/\D/g, '');
  const contactEmail = $('#contact-email').value.trim();
  const bizumPhone = $('#bizum-phone').value.replace(/\D/g, '');
  const wallapopUrl = normalizeWallapopUrl($('#wallapop-url').value);
  const commerceNoticeEnabled = $('#commerce-notice-enabled').checked;

  if (!contactWhatsapp && !contactEmail) {
    setStatus(storefrontStatus, 'Añade un WhatsApp o un correo para recibir las consultas.', true);
    return;
  }
  if (contactWhatsapp && (contactWhatsapp.length < 8 || contactWhatsapp.length > 15)) {
    setStatus(storefrontStatus, 'Revisa el WhatsApp: debe incluir el prefijo de país y tener entre 8 y 15 cifras.', true);
    return;
  }
  if (bizumPhone && (bizumPhone.length < 8 || bizumPhone.length > 15)) {
    setStatus(storefrontStatus, 'Revisa el número de Bizum: debe tener entre 8 y 15 cifras.', true);
    return;
  }
  if (wallapopUrl === null) {
    setStatus(storefrontStatus, 'El enlace debe ser una dirección HTTPS válida de Wallapop.', true);
    return;
  }

  const value = {
    ...(storefrontSetting?.value || {}),
    contact_name: contactName,
    contact_whatsapp: contactWhatsapp,
    contact_email: contactEmail,
    bizum_phone: bizumPhone,
    wallapop_url: wallapopUrl,
    commerce_notice_enabled: commerceNoticeEnabled
  };
  setStatus(storefrontStatus, 'Guardando contacto…');
  try {
    if (storefrontSetting) {
      await rest('project_settings', {
        method: 'PATCH',
        query: { project_id: `eq.${project.id}`, key: 'eq.storefront' },
        body: { value, is_public: true },
        prefer: 'return=minimal'
      });
    } else {
      await rest('project_settings', {
        method: 'POST',
        body: { project_id: project.id, key: 'storefront', value, is_public: true },
        prefer: 'return=minimal'
      });
    }
    storefrontSetting = { key: 'storefront', value, is_public: true };
    $('#contact-whatsapp').value = contactWhatsapp;
    $('#bizum-phone').value = bizumPhone;
    $('#wallapop-url').value = wallapopUrl;
    setStatus(storefrontStatus, 'Contacto, Bizum y Wallapop guardados. La tienda pública se actualizará al volver a cargar.');
  } catch (error) {
    setStatus(storefrontStatus, error.message, true);
  }
}

function clearImageDrafts() {
  imageDrafts.forEach((image) => {
    if (image.type === 'pending' && image.previewUrl) URL.revokeObjectURL(image.previewUrl);
  });
  imageDrafts = [];
  removedImages = [];
}

function normalizeImageDrafts() {
  if (!imageDrafts.length) return;
  if (!imageDrafts.some((image) => image.isPrimary)) imageDrafts[0].isPrimary = true;
  let primaryFound = false;
  imageDrafts.forEach((image) => {
    image.isPrimary = image.isPrimary && !primaryFound;
    if (image.isPrimary) primaryFound = true;
  });
}

function setPrimaryImage(key) {
  const index = imageDrafts.findIndex((image) => image.key === key);
  if (index > 0) {
    const [selected] = imageDrafts.splice(index, 1);
    imageDrafts.unshift(selected);
  }
  imageDrafts.forEach((image) => { image.isPrimary = image.key === key; });
  renderImageDrafts();
}

function moveImage(key, direction) {
  const index = imageDrafts.findIndex((image) => image.key === key);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= imageDrafts.length) return;
  const [image] = imageDrafts.splice(index, 1);
  imageDrafts.splice(target, 0, image);
  renderImageDrafts();
}

function removeImageDraft(key) {
  const index = imageDrafts.findIndex((image) => image.key === key);
  if (index < 0) return;
  const [image] = imageDrafts.splice(index, 1);
  if (image.type === 'existing') removedImages.push(image);
  else if (image.previewUrl) URL.revokeObjectURL(image.previewUrl);
  normalizeImageDrafts();
  renderImageDrafts();
}

function imageAction(label, className, handler, disabled = false, ariaLabel = label) {
  const button = textElement('button', className, label);
  button.type = 'button';
  button.disabled = disabled;
  button.setAttribute('aria-label', ariaLabel);
  button.addEventListener('click', handler);
  return button;
}

function renderImageDrafts() {
  normalizeImageDrafts();
  imageList.replaceChildren();
  imageCount.textContent = `${imageDrafts.length} / ${imageLimit} fotos`;
  imageEmpty.hidden = imageDrafts.length !== 0;
  productImagesInput.disabled = imageDrafts.length >= imageLimit;
  productImagesInput.closest('.image-picker').classList.toggle('is-disabled', productImagesInput.disabled);

  imageDrafts.forEach((image, index) => {
    const item = document.createElement('article');
    item.className = 'image-item';

    const preview = document.createElement('img');
    preview.src = image.previewUrl;
    preview.alt = `Previsualización ${index + 1}`;

    const details = document.createElement('div');
    details.className = 'image-item-details';
    details.append(
      textElement('strong', '', image.type === 'pending' ? image.sourceFile.name : (image.file.original_name || `Foto ${index + 1}`)),
      textElement('small', image.type === 'pending' ? 'image-pending' : '', image.type === 'pending' ? 'Nueva · se subirá al guardar' : `Foto ${index + 1}`)
    );
    if (image.isPrimary) details.append(textElement('span', 'primary-badge', 'Portada'));

    const actions = document.createElement('div');
    actions.className = 'image-item-actions';
    actions.append(
      imageAction('Portada', 'image-action', () => setPrimaryImage(image.key), image.isPrimary, `Usar ${index + 1} como portada`),
      imageAction('←', 'image-action image-action--icon', () => moveImage(image.key, -1), index === 0, `Mover foto ${index + 1} a la izquierda`),
      imageAction('→', 'image-action image-action--icon', () => moveImage(image.key, 1), index === imageDrafts.length - 1, `Mover foto ${index + 1} a la derecha`),
      imageAction('Eliminar', 'image-action image-action--delete', () => removeImageDraft(image.key), false, `Eliminar foto ${index + 1}`)
    );

    item.append(preview, details, actions);
    imageList.append(item);
  });
}

function loadProductImageDrafts(product) {
  imageDrafts = [...(product?.images || [])]
    .filter((image) => image.file)
    .sort((a, b) => {
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
      return a.sort_order - b.sort_order;
    })
    .map((image) => ({
      key: `file-${image.file_id}`,
      type: 'existing',
      fileId: image.file_id,
      file: image.file,
      isPrimary: image.is_primary,
      previewUrl: publicStorageUrl(image.file)
    }));
  removedImages = [];
  renderImageDrafts();
}

function selectProductImages(event) {
  const selected = [...event.target.files];
  event.target.value = '';
  if (!selected.length) return;

  const availableSlots = imageLimit - imageDrafts.length;
  const valid = selected.filter((file) => acceptedImageTypes.has(file.type) && file.size <= imageSizeLimit);
  const accepted = valid.slice(0, availableSlots);
  const rejectedCount = selected.length - accepted.length;

  accepted.forEach((file) => {
    imageDrafts.push({
      key: `pending-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type: 'pending',
      sourceFile: file,
      isPrimary: imageDrafts.length === 0,
      previewUrl: URL.createObjectURL(file)
    });
  });
  normalizeImageDrafts();
  renderImageDrafts();

  if (rejectedCount) {
    setStatus(productFormStatus, `Se han añadido ${accepted.length} fotos. ${rejectedCount} no entraron por formato, tamaño o por superar el límite de ${imageLimit}.`, true);
  } else {
    setStatus(productFormStatus, `${accepted.length} foto${accepted.length === 1 ? '' : 's'} preparada${accepted.length === 1 ? '' : 's'}. Se subirán al guardar.`);
  }
}

async function syncProductImages(product) {
  for (const image of removedImages) await deleteStoredImage(image);
  removedImages = [];

  for (let index = 0; index < imageDrafts.length; index += 1) {
    const image = imageDrafts[index];
    setStatus(productFormStatus, `Guardando fotos… ${index + 1} de ${imageDrafts.length}`);
    if (image.type === 'pending') {
      const uploaded = await uploadProductImage(image, product, index);
      URL.revokeObjectURL(image.previewUrl);
      imageDrafts[index] = uploaded;
    } else {
      await rest('product_images', {
        method: 'PATCH',
        query: { product_id: `eq.${product.id}`, file_id: `eq.${image.fileId}` },
        body: { sort_order: index, is_primary: Boolean(image.isPrimary) },
        prefer: 'return=minimal'
      });
    }
  }
}

function resetProductForm() {
  clearImageDrafts();
  productForm.reset();
  $('#product-id').value = '';
  $('#variant-id').value = '';
  $('#variant-name').value = 'Estándar';
  $('#product-kind').value = 'physical';
  $('#product-fulfillment').value = 'home_delivery';
  $('#product-status').value = 'published';
  $('#price-mode').value = 'fixed';
  $('#track-inventory').checked = true;
  $('#stock-quantity').value = '0';
  $('#stock-low-threshold').value = '2';
  currentProduct = null;
  $('#delete-product-button').hidden = true;
  setStatus(productFormStatus);
  syncProductKind();
  syncPriceFields();
  renderImageDrafts();
}

function syncProductKind() {
  const isPhysical = $('#product-kind').value === 'physical';
  const trackInventory = $('#track-inventory');
  document.querySelectorAll('[data-inventory-field]').forEach((field) => { field.hidden = !isPhysical; });
  if (!isPhysical) trackInventory.checked = false;
  trackInventory.disabled = !isPhysical;
  $('#stock-quantity').disabled = !isPhysical || !trackInventory.checked;
  $('#stock-low-threshold').disabled = !isPhysical || !trackInventory.checked;

  if (!$('#product-id').value) {
    $('#product-fulfillment').value = $('#product-kind').value === 'digital'
      ? 'email_delivery'
      : 'home_delivery';
  }
}

function syncPriceFields() {
  const mode = $('#price-mode').value;
  const priceInput = $('#variant-price');
  const customQuote = $('#allow-custom-quote');
  priceInput.disabled = mode === 'quote';
  priceInput.required = mode !== 'quote';
  if (mode === 'quote') priceInput.value = '';
  if (mode !== 'fixed') customQuote.checked = true;
  customQuote.disabled = mode !== 'fixed';
}

function openProduct(product = null) {
  resetProductForm();
  currentProduct = product;
  $('#dialog-title').textContent = product ? 'Editar producto' : 'Nuevo producto';

  if (product) {
    const variant = productVariant(product);
    $('#product-id').value = product.id;
    $('#variant-id').value = variant?.id || '';
    $('#product-name').value = product.name;
    $('#product-slug').value = product.slug;
    $('#product-category').value = product.category_id || '';
    $('#product-description').value = product.short_description || '';
    $('#product-kind').value = product.kind;
    $('#product-fulfillment').value = normalizeFulfillment(product.fulfillment, product.kind);
    $('#product-status').value = product.status;
    $('#product-featured').checked = product.featured;
    $('#price-mode').value = getPriceMode(product);
    $('#allow-custom-quote').checked = product.requires_quote;
    $('#variant-name').value = variant?.name || 'Estándar';
    $('#variant-sku').value = variant?.sku || '';
    $('#variant-price').value = Number.isInteger(variant?.price_cents) ? (variant.price_cents / 100).toFixed(2) : '';
    $('#track-inventory').checked = Boolean(variant?.track_inventory);
    $('#stock-quantity').value = variant?.stock_quantity ?? 0;
    $('#stock-low-threshold').value = variant?.low_stock_threshold ?? 2;
    $('#delete-product-button').hidden = false;
    loadProductImageDrafts(product);
  }

  syncProductKind();
  syncPriceFields();
  productDialog.showModal();
}

async function saveProduct(event) {
  event.preventDefault();
  setStatus(productFormStatus, 'Guardando…');
  const submitButton = productForm.querySelector('.primary-button[type="submit"]');
  submitButton.disabled = true;
  const productId = $('#product-id').value;
  const variantId = $('#variant-id').value;
  const status = $('#product-status').value;
  const kind = $('#product-kind').value;
  const priceMode = $('#price-mode').value;
  const priceCents = priceMode === 'quote' ? null : moneyToCents($('#variant-price').value);
  const trackInventory = kind === 'physical' && $('#track-inventory').checked;
  const desiredStock = Math.max(0, Number.parseInt($('#stock-quantity').value, 10) || 0);
  const lowStockThreshold = Math.max(0, Number.parseInt($('#stock-low-threshold').value, 10) || 0);

  if (priceMode !== 'quote' && !Number.isInteger(priceCents)) {
    setStatus(productFormStatus, 'Indica un precio válido o selecciona “A consultar”.', true);
    submitButton.disabled = false;
    return;
  }

  const metadata = { ...(currentProduct?.metadata || {}), price_mode: priceMode };
  const payload = {
    project_id: project.id,
    category_id: $('#product-category').value,
    slug: $('#product-slug').value,
    name: $('#product-name').value.trim(),
    short_description: $('#product-description').value.trim() || null,
    kind,
    fulfillment: databaseFulfillment($('#product-fulfillment').value),
    status,
    featured: $('#product-featured').checked,
    requires_quote: priceMode !== 'fixed' || $('#allow-custom-quote').checked,
    currency: 'EUR',
    metadata,
    published_at: status === 'published' ? (currentProduct?.published_at || new Date().toISOString()) : null
  };

  let savedProductId = null;
  try {
    const saved = productId
      ? await rest('catalog_products', {
        method: 'PATCH',
        query: { id: `eq.${productId}` },
        body: payload,
        prefer: 'return=representation'
      })
      : await rest('catalog_products', {
        method: 'POST',
        body: payload,
        prefer: 'return=representation'
      });
    const savedProduct = saved[0];
    savedProductId = savedProduct.id;
    const variantPayload = {
      project_id: project.id,
      product_id: savedProduct.id,
      name: $('#variant-name').value.trim(),
      sku: $('#variant-sku').value.trim() || null,
      price_cents: priceCents,
      currency: 'EUR',
      track_inventory: trackInventory,
      low_stock_threshold: lowStockThreshold,
      is_active: true
    };

    if (variantId) {
      await rest('product_variants', {
        method: 'PATCH',
        query: { id: `eq.${variantId}` },
        body: variantPayload,
        prefer: 'return=minimal'
      });
      const oldStock = productVariant(currentProduct)?.stock_quantity || 0;
      const delta = desiredStock - oldStock;
      if (trackInventory && delta !== 0) {
        await rest('rpc/adjust_variant_stock', {
          method: 'POST',
          body: {
            target_variant: variantId,
            amount: delta,
            reason: 'adjustment',
            movement_note: 'Ajuste desde el panel SAM'
          }
        });
      }
    } else {
      const createdVariants = await rest('product_variants', {
        method: 'POST',
        body: { ...variantPayload, stock_quantity: 0 },
        prefer: 'return=representation'
      });
      const createdVariant = createdVariants[0];
      if (trackInventory && desiredStock > 0) {
        await rest('rpc/adjust_variant_stock', {
          method: 'POST',
          body: {
            target_variant: createdVariant.id,
            amount: desiredStock,
            reason: 'initial',
            movement_note: 'Stock inicial desde el panel SAM'
          }
        });
      }
    }

    await syncProductImages(savedProduct);
    await loadCatalog();
    productDialog.close();
    const photoCopy = imageDrafts.length === 1 ? ' con 1 foto' : (imageDrafts.length ? ` con ${imageDrafts.length} fotos` : '');
    setStatus(dashboardStatus, `“${payload.name}” se ha guardado correctamente${photoCopy}.`);
  } catch (error) {
    if (savedProductId) {
      try {
        await loadCatalog();
        const refreshed = products.find((product) => product.id === savedProductId);
        if (refreshed) {
          productDialog.close();
          openProduct(refreshed);
        }
      } catch (reloadError) {
        console.warn('No se pudo recargar el producto tras el error.', reloadError);
      }
      setStatus(productFormStatus, `El producto está guardado, pero no se pudieron completar todas las fotos: ${error.message}`, true);
    } else {
      setStatus(productFormStatus, error.message, true);
    }
  } finally {
    submitButton.disabled = false;
  }
}

async function deleteProduct() {
  if (!currentProduct || !confirm(`¿Eliminar “${currentProduct.name}”? Esta acción no se puede deshacer.`)) return;
  setStatus(productFormStatus, 'Eliminando…');
  const storedImages = [...(currentProduct.images || [])]
    .filter((image) => image.file)
    .map((image) => ({ fileId: image.file_id, file: image.file }));
  try {
    await rest('catalog_products', {
      method: 'DELETE',
      query: { id: `eq.${currentProduct.id}` },
      prefer: 'return=minimal'
    });
    await Promise.allSettled(storedImages.map((image) => deleteStoredImage(image)));
    await loadCatalog();
    productDialog.close();
    setStatus(dashboardStatus, 'Producto eliminado correctamente.');
  } catch (error) {
    setStatus(productFormStatus, error.message, true);
  }
}

async function showDashboard() {
  await loadAccess();
  loginView.hidden = true;
  dashboardView.hidden = false;
  logoutButton.hidden = false;
  sessionUser.hidden = false;
  sessionUser.textContent = session.user.email;
  $('#role-label').textContent = `Sesión autorizada · Rol ${membership.role}`;
  await loadCatalog();
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(loginStatus, 'Comprobando acceso…');
  try {
    const result = await authRequest('token?grant_type=password', {
      email: $('#login-email').value.trim(),
      password: $('#login-password').value
    });
    result.expires_at = Math.floor(Date.now() / 1000) + result.expires_in;
    storeSession(result);
    await showDashboard();
    loginForm.reset();
    setStatus(loginStatus);
  } catch (error) {
    storeSession(null);
    setStatus(loginStatus, error.message, true);
  }
});

logoutButton.addEventListener('click', async () => {
  try {
    await fetch(`${supabaseUrl}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: publishableKey, Authorization: `Bearer ${session.access_token}` }
    });
  } finally {
    storeSession(null);
    location.reload();
  }
});

$('#new-product-button').addEventListener('click', () => openProduct());
$('#close-dialog-button').addEventListener('click', () => productDialog.close());
$('#cancel-product-button').addEventListener('click', () => productDialog.close());
$('#delete-product-button').addEventListener('click', deleteProduct);
productForm.addEventListener('submit', saveProduct);
storefrontForm.addEventListener('submit', saveStorefront);
searchInput.addEventListener('input', renderProducts);
statusFilter.addEventListener('change', renderProducts);
kindFilter.addEventListener('change', renderProducts);
$('#product-name').addEventListener('input', () => {
  if (!$('#product-id').value) $('#product-slug').value = slugify($('#product-name').value);
});
$('#product-kind').addEventListener('change', syncProductKind);
$('#track-inventory').addEventListener('change', syncProductKind);
$('#price-mode').addEventListener('change', syncPriceFields);
productImagesInput.addEventListener('change', selectProductImages);

(async function init() {
  if (!supabaseUrl || !publishableKey) {
    setStatus(loginStatus, 'Falta configurar la conexión pública de Supabase.', true);
    return;
  }
  const active = await ensureSession();
  if (!active) return;
  try {
    await showDashboard();
  } catch (error) {
    setStatus(loginStatus, error.message, true);
    storeSession(null);
  }
}());
