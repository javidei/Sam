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
const catalogCards = [...document.querySelectorAll('.catalog-card')];
const resultText = document.querySelector('#catalog-result');
const emptyState = document.querySelector('#catalog-empty');
let activeFilter = 'all';

function normalize(value) {
  return value
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function updateCatalog() {
  if (!catalogCards.length) return;

  const query = normalize(searchInput?.value.trim() || '');
  let visible = 0;

  catalogCards.forEach((card) => {
    const categories = card.dataset.category?.split(' ') || [];
    const name = normalize(card.dataset.name || '');
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
updateCatalog();

const typeSelect = document.querySelector('#brief-type');

document.querySelectorAll('[data-service]').forEach((link) => {
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
