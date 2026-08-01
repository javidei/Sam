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

let session = null;
let project = null;
let membership = null;
let categories = [];
let products = [];
let currentProduct = null;
let storefrontSetting = null;

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
        select: 'id,category_id,slug,name,short_description,kind,fulfillment,status,featured,requires_quote,metadata,sort_order,published_at,category:catalog_categories(name),variants:product_variants(id,name,sku,price_cents,currency,track_inventory,stock_quantity,low_stock_threshold,is_active,sort_order)',
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
      textElement('small', '', [variant?.sku || product.slug, formatProductPrice(product), stock.text].join(' · '))
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

  if (!contactWhatsapp && !contactEmail) {
    setStatus(storefrontStatus, 'Añade un WhatsApp o un correo para recibir las consultas.', true);
    return;
  }
  if (contactWhatsapp && (contactWhatsapp.length < 8 || contactWhatsapp.length > 15)) {
    setStatus(storefrontStatus, 'Revisa el WhatsApp: debe incluir el prefijo de país y tener entre 8 y 15 cifras.', true);
    return;
  }

  const value = {
    ...(storefrontSetting?.value || {}),
    contact_name: contactName,
    contact_whatsapp: contactWhatsapp,
    contact_email: contactEmail
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
    setStatus(storefrontStatus, 'Contacto guardado. La tienda pública lo utilizará al enviar una consulta.');
  } catch (error) {
    setStatus(storefrontStatus, error.message, true);
  }
}

function resetProductForm() {
  productForm.reset();
  $('#product-id').value = '';
  $('#variant-id').value = '';
  $('#variant-name').value = 'Estándar';
  $('#product-kind').value = 'physical';
  $('#product-fulfillment').value = 'pickup';
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
    if ($('#product-kind').value === 'digital') $('#product-fulfillment').value = 'digital_delivery';
    else if (isPhysical) $('#product-fulfillment').value = 'pickup';
    else $('#product-fulfillment').value = 'both';
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
    $('#product-fulfillment').value = product.fulfillment;
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
  }

  syncProductKind();
  syncPriceFields();
  productDialog.showModal();
}

async function saveProduct(event) {
  event.preventDefault();
  setStatus(productFormStatus, 'Guardando…');
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
    fulfillment: $('#product-fulfillment').value,
    status,
    featured: $('#product-featured').checked,
    requires_quote: priceMode !== 'fixed' || $('#allow-custom-quote').checked,
    currency: 'EUR',
    metadata,
    published_at: status === 'published' ? (currentProduct?.published_at || new Date().toISOString()) : null
  };

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

    await loadCatalog();
    productDialog.close();
    setStatus(dashboardStatus, `“${payload.name}” se ha guardado correctamente.`);
  } catch (error) {
    setStatus(productFormStatus, error.message, true);
  }
}

async function deleteProduct() {
  if (!currentProduct || !confirm(`¿Eliminar “${currentProduct.name}”? Esta acción no se puede deshacer.`)) return;
  setStatus(productFormStatus, 'Eliminando…');
  try {
    await rest('catalog_products', {
      method: 'DELETE',
      query: { id: `eq.${currentProduct.id}` },
      prefer: 'return=minimal'
    });
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
