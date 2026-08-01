const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.nav');

if (menuButton && navigation) {
  menuButton.addEventListener('click', () => {
    const open = navigation.classList.toggle('is-open');
    menuButton.setAttribute('aria-expanded', String(open));
  });

  navigation.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      navigation.classList.remove('is-open');
      menuButton.setAttribute('aria-expanded', 'false');
    });
  });
}

const searchInput = document.querySelector('#catalog-search');
const filterButtons = [...document.querySelectorAll('.filter')];
const catalogGrid = document.querySelector('#catalog-grid');
const resultText = document.querySelector('#catalog-result');
const emptyState = document.querySelector('#catalog-empty');
const typeSelect = document.querySelector('#brief-type');
let catalogCards = [...document.querySelectorAll('.catalog-card')];
let activeFilter = 'all';

function normalize(value) {
  return String(value || '')
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function updateCatalog() {
  if (!catalogCards.length) return;

  const query = normalize(searchInput?.value.trim());
  let visible = 0;

  catalogCards.forEach((card) => {
    const categories = card.dataset.category?.split(' ') || [];
    const name = normalize(card.dataset.name);
    const matchesFilter = activeFilter === 'all' || categories.includes(activeFilter);
    const matchesSearch = !query || name.includes(query);
    const shouldShow = matchesFilter && matchesSearch;

    card.hidden = !shouldShow;
    if (shouldShow) visible += 1;
  });

  if (resultText) {
    resultText.textContent = visible === 1 ? '1 opción disponible' : `${visible} opciones disponibles`;
  }
  if (emptyState) emptyState.hidden = visible !== 0;
}

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    activeFilter = button.dataset.filter || 'all';
    filterButtons.forEach((item) => item.classList.toggle('is-active', item === button));
    updateCatalog();
  });
});

document.querySelectorAll('[data-set-filter]').forEach((link) => {
  link.addEventListener('click', () => {
    const requestedFilter = link.dataset.setFilter;
    const matchingButton = filterButtons.find((button) => button.dataset.filter === requestedFilter);
    matchingButton?.click();
  });
});

searchInput?.addEventListener('input', updateCatalog);

function bindServiceLinks(scope = document) {
  scope.querySelectorAll('[data-service]:not([data-bound])').forEach((link) => {
    link.dataset.bound = 'true';
    link.addEventListener('click', () => {
      const categoryMap = {
        impresion: 'Impresión',
        personalizados: 'Producto personalizado',
        articulos: 'Artículo',
        digital: 'Servicio digital'
      };
      const card = link.closest('.catalog-card');
      const firstCategory = card?.dataset.category?.split(' ')[0];
      if (typeSelect && firstCategory && categoryMap[firstCategory]) {
        typeSelect.value = categoryMap[firstCategory];
      }

      const detail = document.querySelector('#brief-detail');
      if (detail && !detail.value) detail.value = `Me interesa: ${link.dataset.service}. `;
    });
  });
}

function getCategory(product) {
  const category = Array.isArray(product.category) ? product.category[0] : product.category;
  return category || { slug: product.kind === 'digital' ? 'digital' : 'articulos', name: 'Catálogo' };
}

function getCategories(product) {
  const mainCategory = getCategory(product).slug;
  const extraCategories = Array.isArray(product.metadata?.categories) ? product.metadata.categories : [];
  return [...new Set([mainCategory, ...extraCategories])].filter(Boolean);
}

function formatPrice(product) {
  const variants = (product.variants || [])
    .filter((variant) => variant.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);
  const variantWithPrice = variants.find((variant) => Number.isInteger(variant.price_cents));
  const cents = variantWithPrice?.price_cents ?? product.base_price_cents;
  const currency = variantWithPrice?.currency || product.currency || 'EUR';

  if (!Number.isInteger(cents)) return product.requires_quote ? 'Presupuesto' : 'Consultar';

  const amount = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency
  }).format(cents / 100);

  return product.requires_quote || variants.length > 1 ? `Desde ${amount}` : amount;
}

function getAvailability(product) {
  const trackedVariants = (product.variants || []).filter((variant) => variant.is_active && variant.track_inventory);
  if (!trackedVariants.length) return product.kind === 'digital' ? 'Entrega digital' : 'Por encargo';

  const stock = trackedVariants.reduce((total, variant) => total + Math.max(0, variant.stock_quantity), 0);
  return stock > 0 ? 'Disponible' : 'Agotado';
}

function publicStorageUrl(file, supabaseUrl) {
  if (!file?.bucket || !file?.path) return '';
  const encodedPath = file.path.split('/').map(encodeURIComponent).join('/');
  return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(file.bucket)}/${encodedPath}`;
}

function getPrimaryImage(product) {
  const images = [...(product.images || [])].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return a.sort_order - b.sort_order;
  });
  return images[0]?.file || null;
}

function appendFallbackArt(art, style) {
  const artStyle = ['paper', 'cards', 'mug', 'shirt', 'stickers', 'invite', 'social', 'cv'].includes(style)
    ? style
    : 'cards';
  art.classList.add(`catalog-art--${artStyle}`);

  const child = (tag, text = '') => {
    const element = document.createElement(tag);
    element.textContent = text;
    art.append(element);
    return element;
  };

  if (artStyle === 'paper' || artStyle === 'cv') {
    child('i'); child('i'); child('i');
  } else if (artStyle === 'cards') {
    child('i', 'SAM'); child('i', 'hola.');
  } else if (artStyle === 'mug') {
    child('i', 'SAM');
  } else if (artStyle === 'shirt') {
    child('i'); child('b', 'SAM');
  } else if (artStyle === 'stickers') {
    child('i', '✦'); child('i', 'SAM'); child('i', '♥');
  } else if (artStyle === 'invite') {
    child('i', 'Tu día'); child('b', '12 · 06');
  } else if (artStyle === 'social') {
    child('i'); child('i'); child('b', '@sam');
  }
}

function createCatalogCard(product, supabaseUrl) {
  const category = getCategory(product);
  const categories = getCategories(product);
  const card = document.createElement('article');
  card.className = 'catalog-card reveal is-visible';
  card.dataset.category = categories.join(' ');
  card.dataset.name = [
    product.name,
    product.short_description,
    product.description,
    category.name,
    ...(product.metadata?.search_terms || [])
  ].filter(Boolean).join(' ');

  const art = document.createElement('div');
  art.className = 'catalog-art';
  art.setAttribute('aria-hidden', 'true');
  const primaryImage = getPrimaryImage(product);
  const imageUrl = publicStorageUrl(primaryImage, supabaseUrl);
  if (imageUrl) {
    art.classList.add('catalog-art--image');
    const image = document.createElement('img');
    image.src = imageUrl;
    image.alt = primaryImage.alt_text || '';
    image.loading = 'lazy';
    art.append(image);
  } else {
    appendFallbackArt(art, product.metadata?.art_style);
  }

  const copy = document.createElement('div');
  copy.className = 'catalog-copy';
  const meta = document.createElement('div');
  const categoryLabel = document.createElement('span');
  categoryLabel.textContent = category.name;
  const availability = document.createElement('b');
  availability.textContent = getAvailability(product);
  meta.append(categoryLabel, availability);

  const title = document.createElement('h3');
  title.textContent = product.name;
  const description = document.createElement('p');
  description.textContent = product.short_description || product.description || 'Consulta las opciones disponibles.';
  const action = document.createElement('a');
  action.href = '#contacto';
  action.dataset.service = product.name;
  action.textContent = `${formatPrice(product)} →`;

  copy.append(meta, title, description, action);
  card.append(art, copy);
  return card;
}

async function apiGet(resource, params, config) {
  const url = new URL(`${config.supabaseUrl}/rest/v1/${resource}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, {
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`
    }
  });

  if (!response.ok) throw new Error(`Supabase respondió con ${response.status}`);
  return response.json();
}

async function loadCatalogFromDatabase() {
  const rawConfig = window.SAM_CONFIG || {};
  const config = {
    supabaseUrl: String(rawConfig.supabaseUrl || '').replace(/\/$/, ''),
    supabaseAnonKey: String(rawConfig.supabaseAnonKey || '')
  };
  if (!config.supabaseUrl || !config.supabaseAnonKey || !catalogGrid) return;

  catalogGrid.setAttribute('aria-busy', 'true');
  try {
    const projects = await apiGet('projects', {
      select: 'id',
      slug: 'eq.sam',
      status: 'eq.active',
      limit: '1'
    }, config);
    const project = projects[0];
    if (!project) throw new Error('No existe el proyecto activo SAM');

    const products = await apiGet('catalog_products', {
      select: 'id,slug,name,short_description,description,kind,fulfillment,requires_quote,base_price_cents,currency,metadata,category:catalog_categories(slug,name),variants:product_variants(id,name,price_cents,currency,track_inventory,stock_quantity,is_active,sort_order),images:product_images(sort_order,is_primary,file:files(bucket,path,alt_text))',
      project_id: `eq.${project.id}`,
      status: 'eq.published',
      order: 'featured.desc,sort_order.asc,name.asc'
    }, config);

    if (!products.length) return;
    catalogGrid.replaceChildren(...products.map((product) => createCatalogCard(product, config.supabaseUrl)));
    catalogCards = [...catalogGrid.querySelectorAll('.catalog-card')];
    bindServiceLinks(catalogGrid);
    updateCatalog();
  } catch (error) {
    console.warn('SAM mantiene el catálogo local porque no pudo leer Supabase.', error);
  } finally {
    catalogGrid.removeAttribute('aria-busy');
  }
}

bindServiceLinks();
updateCatalog();
loadCatalogFromDatabase();

const briefForm = document.querySelector('#brief-form');
const formStatus = document.querySelector('#form-status');

briefForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const type = typeSelect?.value.trim() || 'Encargo';
  const detail = document.querySelector('#brief-detail')?.value.trim() || '';
  const brief = `Solicitud para SAM\nTipo: ${type}\nDetalle: ${detail}`;

  try {
    await navigator.clipboard.writeText(brief);
    if (formStatus) formStatus.textContent = 'Solicitud preparada y copiada. Falta configurar el WhatsApp o correo definitivo para poder enviarla.';
  } catch {
    if (formStatus) formStatus.textContent = 'Solicitud preparada. Falta configurar el WhatsApp o correo definitivo para poder enviarla.';
  }
});

const revealItems = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });

  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}

const year = document.querySelector('#year');
if (year) year.textContent = new Date().getFullYear();
