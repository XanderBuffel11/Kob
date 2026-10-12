import { h, money, clamp, safeImageUrl } from './dom.js';
import { FAMILIES } from './config.js';
import { getProduct, isLive } from './api.js';
import { bottle } from './bottle.js';
import { addToCart } from './cart.js';
import { initPage } from './page.js';

initPage();

const root = document.getElementById('product');
const handle = new URLSearchParams(location.search).get('handle');

function notFound(message) {
  root.replaceChildren(
    h('div', { class: 'empty-state' },
      h('h1', null, 'We couldn’t find that fragrance'),
      h('p', { class: 'muted' }, message || 'It may have sold out or been removed.'),
      h('a', { class: 'btn btn-primary', href: 'index.html#shop' }, 'Browse fragrances'),
    ),
  );
  document.title = 'Not found · Kob';
}

function gallery(p) {
  const main = h('div', { class: 'media media-large', 'data-family': p.family || 'none' });
  const thumbs = h('ul', { class: 'thumbs' });
  const urls = p.images.map((i) => ({ url: safeImageUrl(i.url), alt: i.alt })).filter((i) => i.url);

  function show(i) {
    main.replaceChildren(
      i == null
        ? bottle(p.handle)
        : h('img', { src: urls[i].url, alt: urls[i].alt, width: 720, height: 900, decoding: 'async' }),
    );
    thumbs.querySelectorAll('button').forEach((b, idx) => b.setAttribute('aria-pressed', String(idx === i)));
  }

  urls.forEach((img, i) => {
    const b = h('button', { type: 'button', 'aria-label': `Show image ${i + 1} of ${urls.length}`, 'aria-pressed': 'false' },
      h('img', { src: img.url, alt: '', width: 72, height: 90, loading: 'lazy' }));
    b.addEventListener('click', () => show(i));
    thumbs.append(h('li', null, b));
  });

  show(urls.length ? 0 : null);
  return h('div', { class: 'gallery' }, main, urls.length > 1 ? thumbs : null);
}

function render(p) {
  document.title = `${p.title} · Kob`;
  document.documentElement.dataset.family = p.family || '';

  const meaningful = p.options.filter((o) => !(o.name === 'Title' && o.values.length === 1));
  const selected = {};
  meaningful.forEach((o) => { selected[o.name] = (p.variants.find((v) => v.available) || p.variants[0])
    .selectedOptions.find((s) => s.name === o.name)?.value; });

  const priceEl = h('p', { class: 'price' });
  const stockEl = h('p', { class: 'muted small', role: 'status' });
  const msgEl = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const addBtn = h('button', { type: 'submit', class: 'btn btn-primary btn-block' }, 'Add to cart');
  const qtyInput = h('input', { id: 'qty', type: 'number', inputmode: 'numeric', min: 1, max: 10, step: 1, value: 1, 'aria-label': 'Quantity' });

  const current = () => p.variants.find((v) =>
    meaningful.every((o) => v.selectedOptions.some((s) => s.name === o.name && s.value === selected[o.name]))) || (meaningful.length ? null : p.variants[0]);

  function sync() {
    const v = current();
    const live = isLive();
    priceEl.textContent = v ? money(v.price, v.currency) : 'Unavailable';
    stockEl.textContent = !v || !v.available ? 'This option is sold out.' : '';
    addBtn.disabled = !v || !v.available || !live;
    addBtn.textContent = !live ? 'Preview only' : !v || !v.available ? 'Sold out' : 'Add to cart';
  }

  const optionGroups = meaningful.map((o) => {
    const group = h('fieldset', { class: 'option' }, h('legend', null, o.name));
    const row = h('div', { class: 'option-values' });
    o.values.forEach((val) => {
      const b = h('button', { type: 'button', class: 'pill', 'aria-pressed': String(selected[o.name] === val) }, val);
      b.addEventListener('click', () => {
        selected[o.name] = val;
        row.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        sync();
      });
      row.append(b);
    });
    group.append(row);
    return group;
  });

  qtyInput.addEventListener('change', () => { qtyInput.value = String(clamp(Math.trunc(Number(qtyInput.value)), 1, 10)); });

  const form = h('form', { class: 'buy', novalidate: true },
    ...optionGroups,
    h('div', { class: 'field' }, h('label', { for: 'qty' }, 'Quantity'), qtyInput),
    stockEl, addBtn, msgEl,
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = current();
    if (!v || !v.available) return;
    msgEl.hidden = true;
    addBtn.disabled = true;
    const ok = await addToCart(v.id, Number(qtyInput.value));
    if (!ok) { msgEl.textContent = 'We couldn’t add that. Please try again.'; msgEl.hidden = false; }
    sync();
  });

  const fam = FAMILIES.find((f) => f.id === p.family);
  root.replaceChildren(
    h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' },
      h('a', { href: 'index.html' }, 'Home'), ' / ', h('a', { href: 'index.html#shop' }, 'Fragrances')),
    h('div', { class: 'product-layout' },
      gallery(p),
      h('div', { class: 'product-info' },
        fam ? h('p', { class: 'family-tag', 'data-family': fam.id }, fam.name) : null,
        h('h1', null, p.title),
        h('p', { class: 'muted' }, p.vendor),
        priceEl,
        form,
        p.notes.length
          ? h('section', { class: 'notes', 'aria-labelledby': 'notes-h' },
              h('h2', { id: 'notes-h' }, 'Notes'),
              h('ul', { class: 'note-list' }, p.notes.map((n) => h('li', null, n))))
          : null,
        p.description
          ? h('section', { class: 'prose', 'aria-labelledby': 'desc-h' },
              h('h2', { id: 'desc-h' }, 'About this fragrance'),
              p.description.split(/\n{2,}/).map((para) => h('p', null, para)))
          : null,
      ),
    ),
  );
  sync();
}

if (!handle) notFound();
else {
  getProduct(handle)
    .then((p) => (p ? render(p) : notFound()))
    .catch((err) => notFound(err.message));
}
