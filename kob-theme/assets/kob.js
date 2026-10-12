// Kob theme script. No dependencies. All dynamic content is inserted with textContent /
// createElement, never innerHTML, so product data can't inject markup.
(() => {
  'use strict';

  const MAX_QTY = 10;
  const MIN_GAP_MS = 400;

  /* ---------- helpers ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k.toLowerCase().startsWith('on')) throw new Error('No inline handlers');
      el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
  const live = (msg) => { const r = $('#live-region'); if (r) r.textContent = msg; };
  const motionOk = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;

  const money = (cents, currency) => {
    try { return new Intl.NumberFormat(document.documentElement.lang || undefined, { style: 'currency', currency }).format(cents / 100); }
    catch { return (cents / 100).toFixed(2); }
  };
  const localPath = (u) => (typeof u === 'string' && u.startsWith('/') && !u.startsWith('//') ? u : '#');
  const cdnImage = (u) => {
    try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === 'cdn.shopify.com' ? x.href : null; }
    catch { return null; }
  };

  /* ---------- cart (Shopify AJAX Cart API) ---------- */
  const drawer = $('#cart-drawer');
  let cart = null;
  let busy = false;
  let lastWrite = 0;

  async function api(path, body) {
    const res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data.description === 'string' ? data.description : 'Something went wrong. Try again.');
    return data;
  }

  function setCount() {
    $$('[data-cart-count]').forEach((el) => { el.textContent = String(cart ? cart.item_count : 0); });
  }

  function lineEl(item, index) {
    const img = item.image && cdnImage(item.image);
    const href = localPath(item.url);
    return h('li', { class: 'cart-line' },
      h('a', { class: 'cart-thumb', href, tabindex: '-1', 'aria-hidden': 'true' },
        img ? h('img', { src: img, alt: '', width: 72, height: 72, loading: 'lazy' }) : null),
      h('div', { class: 'cart-line-info' },
        h('a', { class: 'cart-line-title', href }, item.product_title),
        item.variant_title ? h('span', { class: 'muted' }, item.variant_title) : null,
        h('span', { class: 'cart-line-price' }, money(item.final_line_price, cart.currency))),
      h('div', { class: 'qty', role: 'group', 'aria-label': 'Quantity for ' + item.product_title },
        h('button', { type: 'button', 'aria-label': 'Decrease quantity', 'data-act': 'dec', 'data-line': index + 1 }, '−'),
        h('output', null, String(item.quantity)),
        h('button', { type: 'button', 'aria-label': 'Increase quantity', 'data-act': 'inc', 'data-line': index + 1, disabled: item.quantity >= MAX_QTY }, '+')),
      h('button', { type: 'button', class: 'link-button', 'data-act': 'remove', 'data-line': index + 1, 'aria-label': 'Remove ' + item.product_title }, 'Remove'));
  }

  function renderDrawer(errorMessage) {
    setCount();
    if (!drawer) return;
    const close = h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close cart', 'data-close-cart': true }, '×');
    const body = h('div', { class: 'cart-body' });
    const foot = h('div', { class: 'cart-footer' });

    if (errorMessage) foot.append(h('p', { class: 'form-error', role: 'alert' }, errorMessage));

    if (!cart || cart.items.length === 0) {
      body.append(h('div', { class: 'cart-empty' },
        h('p', { class: 'cart-empty-title' }, 'Your cart is empty'),
        h('p', { class: 'muted' }, 'Pick a scent family and add something you want to smell on your skin.'),
        h('a', { class: 'btn btn-quiet', href: '/#shop' }, 'Browse fragrances')));
    } else {
      body.append(h('ul', { class: 'cart-lines' }, cart.items.map(lineEl)));
      foot.append(
        h('div', { class: 'cart-total' }, h('span', null, 'Subtotal'), h('strong', null, money(cart.total_price, cart.currency))),
        h('p', { class: 'muted small' }, 'Shipping and taxes are calculated at checkout.'),
        h('a', { class: 'btn btn-primary btn-block', href: '/checkout' }, 'Go to secure checkout'));
    }
    drawer.replaceChildren(h('div', { class: 'cart-head' }, h('h2', { id: 'cart-title' }, 'Your cart'), close), body, foot);
  }

  async function guarded(fn) {
    if (busy || Date.now() - lastWrite < MIN_GAP_MS) return false;
    busy = true;
    drawer?.setAttribute('aria-busy', 'true');
    let err = '';
    try { await fn(); } catch (e) { err = e.message || 'Something went wrong. Try again.'; }
    lastWrite = Date.now();
    busy = false;
    drawer?.removeAttribute('aria-busy');
    renderDrawer(err);
    return !err;
  }

  function openCart() { if (drawer && !drawer.open) drawer.showModal(); }

  async function addToCart(variantId, quantity) {
    const ok = await guarded(async () => {
      await api('/cart/add.js', { items: [{ id: Number(variantId), quantity: clamp(Math.trunc(quantity), 1, MAX_QTY) }] });
      cart = await api('/cart.js');
    });
    if (ok) { live('Added to your cart.'); openCart(); }
    return ok;
  }

  if (drawer) {
    drawer.addEventListener('click', (e) => {
      if (e.target === drawer || e.target.closest('[data-close-cart]')) return drawer.close();
      const btn = e.target.closest('button[data-act]');
      if (!btn || !cart) return;
      const line = Number(btn.dataset.line);
      const item = cart.items[line - 1];
      if (!item) return;
      const qty = btn.dataset.act === 'remove' ? 0 : clamp(item.quantity + (btn.dataset.act === 'inc' ? 1 : -1), 0, MAX_QTY);
      guarded(async () => { cart = await api('/cart/change.js', { line, quantity: qty }); });
    });
    $$('[data-open-cart]').forEach((b) => b.addEventListener('click', () => { openCart(); }));
    api('/cart.js').then((c) => { cart = c; renderDrawer(); }).catch(() => renderDrawer());
  }

  /* ---------- home: family chips, search, sort ---------- */
  const grid = $('#product-grid');
  if (grid) {
    const chips = $$('.chip');
    const status = $('#grid-status');
    const clearBtn = $('#clear-filters');
    const sortEl = $('#sort');
    const searchEl = $('#search');
    const items = $$('li', grid);
    const state = { family: null, sort: 'new', q: '' };

    const apply = () => {
      document.documentElement.dataset.family = state.family || '';
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.family === state.family)));
      const q = state.q.trim().toLowerCase();
      const match = items.filter((li) => (!state.family || li.dataset.family === state.family) && (!q || li.dataset.title.includes(q)));
      const cmp = {
        new: (a, b) => Number(a.dataset.order) - Number(b.dataset.order),
        low: (a, b) => Number(a.dataset.price) - Number(b.dataset.price),
        high: (a, b) => Number(b.dataset.price) - Number(a.dataset.price),
        name: (a, b) => a.dataset.title.localeCompare(b.dataset.title),
      }[state.sort];
      match.sort(cmp);
      items.forEach((li) => { li.hidden = !match.includes(li); });
      match.forEach((li) => grid.append(li));
      const filtered = Boolean(state.family || q);
      clearBtn.hidden = !filtered;
      const fam = chips.find((c) => c.dataset.family === state.family)?.querySelector('.chip-name').textContent;
      if (items.length === 0) status.textContent = '';
      else if (match.length === 0) status.textContent = 'Nothing matches that yet. Clear the filters to see everything.';
      else status.textContent = `${match.length} ${match.length === 1 ? 'fragrance' : 'fragrances'}${fam ? ' in ' + fam : ''}`;
    };

    chips.forEach((c) => c.addEventListener('click', () => {
      state.family = state.family === c.dataset.family ? null : c.dataset.family;
      apply();
      if (state.family) $('#shop')?.scrollIntoView({ behavior: motionOk() ? 'smooth' : 'auto' });
    }));
    sortEl.addEventListener('change', () => { state.sort = ['new', 'low', 'high', 'name'].includes(sortEl.value) ? sortEl.value : 'new'; apply(); });
    let t;
    searchEl.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = searchEl.value.slice(0, 60); apply(); }, 150); });
    $('#search-form').addEventListener('submit', (e) => { e.preventDefault(); state.q = searchEl.value.slice(0, 60); apply(); });
    clearBtn.addEventListener('click', () => { state.family = null; state.q = ''; searchEl.value = ''; apply(); });
    apply();
  }

  /* ---------- product page ---------- */
  const product = $('#product');
  const form = $('#buy-form');
  if (product && form) {
    document.documentElement.dataset.family = product.dataset.family || '';
    let variants = [];
    try { variants = JSON.parse($('#variants-json').textContent); } catch { /* keep empty */ }

    const idInput = $('#variant-id');
    const priceEl = $('#price');
    const stockEl = $('#stock');
    const addBtn = $('#add-btn');
    const errEl = $('#buy-error');
    const qty = $('#qty');
    const groups = $$('.option');
    const selected = groups.map((g) => $('.pill[aria-pressed="true"]', g)?.dataset.value);

    const current = () => variants.find((v) => selected.every((val, i) => v.options[i] === val)) || (groups.length ? null : variants[0]);

    const sync = () => {
      const v = current();
      if (v) idInput.value = String(v.id);
      priceEl.textContent = v ? money(v.price, window.Shopify?.currency?.active || 'USD') : 'Unavailable';
      stockEl.textContent = !v || !v.available ? 'This option is sold out.' : '';
      addBtn.disabled = !v || !v.available;
      addBtn.textContent = !v || !v.available ? 'Sold out' : 'Add to cart';
    };

    groups.forEach((g, i) => $$('.pill', g).forEach((p) => p.addEventListener('click', () => {
      selected[i] = p.dataset.value;
      $$('.pill', g).forEach((x) => x.setAttribute('aria-pressed', String(x === p)));
      sync();
    })));

    qty.addEventListener('change', () => { qty.value = String(clamp(Math.trunc(Number(qty.value)), 1, MAX_QTY)); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = current();
      if (!v || !v.available) return;
      errEl.hidden = true;
      addBtn.disabled = true;
      const ok = await addToCart(v.id, Number(qty.value));
      if (!ok) { errEl.textContent = 'We couldn’t add that. Please try again.'; errEl.hidden = false; }
      sync();
    });

    $$('.thumbs button').forEach((b) => b.addEventListener('click', () => {
      const src = cdnImage(b.dataset.large);
      const main = $('#gallery-main');
      if (!src || !main) return;
      main.replaceChildren(h('img', { src, alt: b.dataset.alt || '', width: 720, height: 900 }));
      $$('.thumbs button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
    sync();
  }
})();
