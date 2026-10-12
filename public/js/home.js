import { h, money } from './dom.js';
import { FAMILIES } from './config.js';
import { listProducts } from './api.js';
import { bottle } from './bottle.js';
import { initPage } from './page.js';
import { safeImageUrl } from './dom.js';

initPage();

const state = { family: null, sort: 'new', q: '', all: [] };

const chipsEl = document.getElementById('family-chips');
const gridEl = document.getElementById('product-grid');
const statusEl = document.getElementById('grid-status');
const sortEl = document.getElementById('sort');
const searchEl = document.getElementById('search');
const searchForm = document.getElementById('search-form');
const clearBtn = document.getElementById('clear-filters');

/* ---------- family chips ---------- */

function renderChips() {
  chipsEl.replaceChildren(
    ...FAMILIES.map((f) => {
      const btn = h('button', {
        type: 'button',
        class: 'chip',
        'data-family': f.id,
        'aria-pressed': String(state.family === f.id),
      },
        h('span', { class: 'chip-name' }, f.name),
        h('span', { class: 'chip-blurb' }, f.blurb),
      );
      btn.addEventListener('click', () => {
        state.family = state.family === f.id ? null : f.id;
        apply();
        if (state.family) document.getElementById('shop').scrollIntoView({ behavior: motionOk() ? 'smooth' : 'auto' });
      });
      return h('li', null, btn);
    }),
  );
}

const motionOk = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- grid ---------- */

function card(p) {
  const imgUrl = p.image && safeImageUrl(p.image.url);
  const media = h('div', { class: 'media', 'data-family': p.family || 'none' },
    imgUrl
      ? h('img', { src: imgUrl, alt: p.image.alt, width: 480, height: 600, loading: 'lazy', decoding: 'async' })
      : bottle(p.handle),
  );
  return h('li', null,
    h('a', { class: 'card', href: 'product.html?handle=' + encodeURIComponent(p.handle) },
      media,
      h('div', { class: 'card-body' },
        h('h3', { class: 'card-title' }, p.title),
        h('p', { class: 'card-vendor' }, p.vendor),
        h('p', { class: 'card-price' }, p.available ? ['From ', money(p.price, p.currency)] : 'Sold out'),
      ),
    ),
  );
}

function visible() {
  const q = state.q.trim().toLowerCase();
  let list = state.all.filter((p) => {
    if (state.family && p.family !== state.family) return false;
    if (q && !(p.title + ' ' + p.vendor).toLowerCase().includes(q)) return false;
    return true;
  });
  if (state.sort === 'low') list = [...list].sort((a, b) => a.price - b.price);
  else if (state.sort === 'high') list = [...list].sort((a, b) => b.price - a.price);
  else if (state.sort === 'name') list = [...list].sort((a, b) => a.title.localeCompare(b.title));
  return list;
}

function apply() {
  document.documentElement.dataset.family = state.family || '';
  chipsEl.querySelectorAll('.chip').forEach((c) =>
    c.setAttribute('aria-pressed', String(c.dataset.family === state.family)));

  const list = visible();
  gridEl.replaceChildren(...list.map(card));

  const filtered = Boolean(state.family || state.q.trim());
  clearBtn.hidden = !filtered;
  const famName = FAMILIES.find((f) => f.id === state.family)?.name;

  if (state.all.length === 0) statusEl.textContent = 'New fragrances are on their way.';
  else if (list.length === 0) statusEl.textContent = 'Nothing matches that yet. Clear the filters to see everything.';
  else statusEl.textContent = `${list.length} ${list.length === 1 ? 'fragrance' : 'fragrances'}${famName ? ' in ' + famName : ''}`;
}

/* ---------- controls ---------- */

sortEl.addEventListener('change', () => {
  state.sort = ['new', 'low', 'high', 'name'].includes(sortEl.value) ? sortEl.value : 'new';
  apply();
});

let timer;
searchEl.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => { state.q = searchEl.value.slice(0, 60); apply(); }, 150);
});
searchForm.addEventListener('submit', (e) => { e.preventDefault(); state.q = searchEl.value.slice(0, 60); apply(); });

clearBtn.addEventListener('click', () => {
  state.family = null;
  state.q = '';
  searchEl.value = '';
  apply();
});

/* ---------- go ---------- */

renderChips();
listProducts()
  .then((list) => { state.all = list; apply(); })
  .catch((err) => {
    statusEl.textContent = err.message;
    statusEl.classList.add('form-error');
  });
