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
const briefDetail = document.querySelector('#brief-detail');
const briefForm = document.querySelector('#brief-form');
const formStatus = document.querySelector('#form-status');
const contactSubmit = document.querySelector('#contact-submit');
const contactNoteCopy = document.querySelector('#contact-note-copy');
let catalogCards = [...document.querySelectorAll('.catalog-card')];
let activeFilter = 'all';
let storefrontSettings = {};

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

      if (briefDetail && !briefDetail.value) {
        const price = link.dataset.price ? ` (${link.dataset.price})` : '';
        briefDetail.value = `Me interesa: ${link.dataset.service}${price}. `;
      }
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

function getActiveVariants(product) {
  return (product.variants || [])
    .filter((variant) => variant.is_active)
    .sort((a, b) => a.sort_order - b.sort_order);
}

function getPriceInfo(product) {
  const variants = getActiveVariants(product);
  const variantWithPrice = variants.find((variant) => Number.isInteger(variant.price_cents));
  const cents = variantWithPrice?.price_cents ?? product.base_price_cents;
  const currency = variantWithPrice?.currency || product.currency || 'EUR';
  const configuredMode = product.metadata?.price_mode;
  const priceMode = ['fixed', 'from', 'quote'].includes(configuredMode)
    ? configuredMode
    : (!Number.isInteger(cents) ? 'quote' : (product.requires_quote || variants.length > 1 ? 'from' : 'fixed'));

  if (priceMode === 'quote' || !Number.isInteger(cents)) {
    return { mode: 'quote', label: 'Precio', text: 'A consultar' };
  }

  const amount = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency
  }).format(cents / 100);

  if (priceMode === 'from') return { mode: 'from', label: 'Precio desde', text: amount };
  return {
    mode: 'fixed',
    label: product.kind === 'service' || product.kind === 'digital' ? 'Precio estándar' : 'Precio',
    text: amount
  };
}

function getAvailability(product) {
  if (product.kind === 'digital') return { text: 'Entrega digital', state: 'digital', quantity: null };
  if (product.kind === 'service') {
    return { text: product.requires_quote ? 'Servicio personalizable' : 'Servicio disponible', state: 'order', quantity: null };
  }

  const trackedVariants = getActiveVariants(product).filter((variant) => variant.track_inventory);
  if (!trackedVariants.length) return { text: 'Disponible por encargo', state: 'order', quantity: null };

  const quantity = trackedVariants.reduce((total, variant) => total + Math.max(0, variant.stock_quantity), 0);
  const lowStockThreshold = trackedVariants.reduce((highest, variant) => Math.max(highest, variant.low_stock_threshold || 0), 0);
  if (quantity === 0) return { text: 'Agotado', state: 'out', quantity };
  if (lowStockThreshold > 0 && quantity <= lowStockThreshold) {
    return { text: `Últimas ${quantity} ud${quantity === 1 ? '.' : 's.'}`, state: 'low', quantity };
  }
  return { text: `${quantity} ud${quantity === 1 ? '.' : 's.'} disponibles`, state: 'available', quantity };
}

function getActionLabel(product, price, availability) {
  if (availability.state === 'out') return 'Consultar reposición';
  if (price.mode === 'quote') return 'Pedir presupuesto';
  if (price.mode === 'from') return 'Consultar opciones';
  if (product.requires_quote) return 'Consultar otro servicio';
  return 'Me interesa';
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

function createPriceBlock(price) {
  const priceBlock = document.createElement('strong');
  priceBlock.className = 'catalog-price';
  const priceLabel = document.createElement('small');
  priceLabel.textContent = price.label;
  priceBlock.append(priceLabel, document.createTextNode(price.text));
  return priceBlock;
}

function createCatalogCard(product, supabaseUrl) {
  const category = getCategory(product);
  const categories = getCategories(product);
  const price = getPriceInfo(product);
  const availabilityInfo = getAvailability(product);
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
  availability.className = `catalog-stock catalog-stock--${availabilityInfo.state}`;
  availability.textContent = availabilityInfo.text;
  meta.append(categoryLabel, availability);

  const title = document.createElement('h3');
  title.textContent = product.name;
  const description = document.createElement('p');
  description.textContent = product.short_description || product.description || 'Consulta las opciones disponibles.';

  const purchase = document.createElement('div');
  purchase.className = 'catalog-purchase';
  const action = document.createElement('a');
  action.href = '#contacto';
  action.dataset.service = product.name;
  action.dataset.price = `${price.label}: ${price.text}`;
  action.textContent = `${getActionLabel(product, price, availabilityInfo)} →`;
  purchase.append(createPriceBlock(price), action);

  copy.append(meta, title, description, purchase);
  card.append(art, copy);
  return card;
}

function enhanceFallbackCatalog() {
  catalogCards.forEach((card) => {
    const copy = card.querySelector('.catalog-copy');
    const metaStatus = copy?.querySelector(':scope > div:first-child b');
    const action = copy?.querySelector(':scope > a[data-service]');
    if (!copy || !action || copy.querySelector('.catalog-purchase')) return;

    if (metaStatus) {
      metaStatus.className = 'catalog-stock catalog-stock--order';
      metaStatus.textContent = card.dataset.category?.includes('digital') ? 'Entrega digital' : 'Disponible por encargo';
    }
    const purchase = document.createElement('div');
    purchase.className = 'catalog-purchase';
    action.dataset.price = 'Precio: A consultar';
    action.textContent = 'Pedir presupuesto →';
    purchase.append(createPriceBlock({ label: 'Precio', text: 'A consultar' }), action);
    copy.append(purchase);
  });
}

async function apiGet(resource, params, config) {
  const url = new URL(`${config.supabaseUrl}/rest/v1/${resource}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, {
    headers: {
      apikey: config.supabasePublishableKey
    }
  });

  if (!response.ok) throw new Error(`Supabase respondió con ${response.status}`);
  return response.json();
}

function updateContactUI() {
  const whatsapp = String(storefrontSettings.contact_whatsapp || '').replace(/\D/g, '');
  const email = String(storefrontSettings.contact_email || '').trim();
  const ownerName = String(storefrontSettings.contact_name || 'el propietario').trim();

  if (whatsapp) {
    contactSubmit.textContent = 'Escribir por WhatsApp';
    contactNoteCopy.textContent = `La consulta se enviará por WhatsApp a ${ownerName}. Podrás revisar el mensaje antes de enviarlo.`;
  } else if (email) {
    contactSubmit.textContent = 'Enviar consulta por correo';
    contactNoteCopy.textContent = `La consulta se preparará por correo para ${ownerName}.`;
  } else {
    contactSubmit.textContent = 'Preparar solicitud';
  }
}

async function loadCatalogFromDatabase() {
  const rawConfig = window.SAM_CONFIG || {};
  const config = {
    supabaseUrl: String(rawConfig.supabaseUrl || '').replace(/\/$/, ''),
    supabasePublishableKey: String(
      rawConfig.supabasePublishableKey || rawConfig.supabaseAnonKey || ''
    )
  };
  if (!config.supabaseUrl || !config.supabasePublishableKey || !catalogGrid) return;

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

    const [products, settingRows] = await Promise.all([
      apiGet('catalog_products', {
        select: 'id,slug,name,short_description,description,kind,fulfillment,requires_quote,base_price_cents,currency,metadata,category:catalog_categories(slug,name),variants:product_variants(id,name,price_cents,currency,track_inventory,stock_quantity,low_stock_threshold,is_active,sort_order),images:product_images(sort_order,is_primary,file:files(bucket,path,alt_text))',
        project_id: `eq.${project.id}`,
        status: 'eq.published',
        order: 'featured.desc,sort_order.asc,name.asc'
      }, config),
      apiGet('project_settings', {
        select: 'value',
        project_id: `eq.${project.id}`,
        key: 'eq.storefront',
        limit: '1'
      }, config)
    ]);

    storefrontSettings = settingRows[0]?.value || {};
    updateContactUI();
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

enhanceFallbackCatalog();
bindServiceLinks();
updateCatalog();
loadCatalogFromDatabase();

briefForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const type = typeSelect?.value.trim() || 'Encargo';
  const detail = briefDetail?.value.trim() || '';
  const brief = `Hola, quiero consultar un encargo para SAM.\n\nTipo: ${type}\nDetalle: ${detail}`;
  const whatsapp = String(storefrontSettings.contact_whatsapp || '').replace(/\D/g, '');
  const email = String(storefrontSettings.contact_email || '').trim();

  if (whatsapp) {
    window.open(`https://wa.me/${whatsapp}?text=${encodeURIComponent(brief)}`, '_blank', 'noopener');
    formStatus.textContent = 'Se ha preparado el mensaje de WhatsApp. Revísalo antes de enviarlo.';
    return;
  }
  if (email) {
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Consulta SAM · ${type}`)}&body=${encodeURIComponent(brief)}`;
    formStatus.textContent = 'Se ha preparado el correo con los datos del encargo.';
    return;
  }

  try {
    await navigator.clipboard.writeText(brief);
    formStatus.textContent = 'Solicitud copiada. Falta configurar WhatsApp o correo desde la administración para poder enviarla directamente.';
  } catch {
    formStatus.textContent = 'Solicitud preparada. Falta configurar WhatsApp o correo desde la administración.';
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
