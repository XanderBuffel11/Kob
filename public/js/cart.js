// Cart state + drawer. The cart lives on Shopify; we only remember its opaque id.

import { h, money, clamp, store, safeImageUrl } from './dom.js';
import {
  isLive, fetchCart, createCart, addLine, setLineQuantity, removeLine, trustedCheckoutUrl,
} from './api.js';

const KEY = 'kob.cartId';
const MAX_QTY = 10;
const MIN_GAP_MS = 400; // client-side throttle on cart writes

let cart = null;
let dialog;
let body;
let footer;
let liveRegion;
let lastWrite = 0;
let busy = false;
const countEls = new Set();

/* ---------- state ---------- */

async function guarded(fn) {
  if (busy || Date.now() - lastWrite < MIN_GAP_MS) return false;
  busy = true;
  dialog?.setAttribute('aria-busy', 'true');
  try {
    await fn();
    return true;
  } catch (err) {
    announce(err.message || 'Something went wrong. Try again.');
    return false;
  } finally {
    lastWrite = Date.now();
    busy = false;
    dialog?.removeAttribute('aria-busy');
    render();
  }
}

export async function loadCart() {
  const id = store.get(KEY);
  if (!id || !isLive()) return render();
  try {
    cart = await fetchCart(id);
    if (!cart) store.remove(KEY);
  } catch {
    cart = null;
  }
  render();
}

export async function addToCart(variantId, quantity) {
  const qty = clamp(Math.trunc(quantity), 1, MAX_QTY);
  const ok = await guarded(async () => {
    cart = cart ? await addLine(cart.id, variantId, qty) : await createCart(variantId, qty);
    store.set(KEY, cart.id);
  });
  if (ok) {
    announce('Added to your cart.');
    openCart();
  }
  return ok;
}

/* ---------- ui ---------- */

export function registerCount(el) {
  countEls.add(el);
  el.textContent = String(cart?.totalQuantity ?? 0);
}

function announce(message) {
  if (liveRegion) liveRegion.textContent = message;
}

export function openCart() {
  if (dialog && !dialog.open) dialog.showModal();
}

function line(l) {
  const imgUrl = l.image && safeImageUrl(l.image.url);
  return h(
    'li',
    { class: 'cart-line' },
    h('a', { class: 'cart-thumb', href: 'product.html?handle=' + encodeURIComponent(l.handle), 'aria-hidden': 'true', tabindex: '-1' },
      imgUrl ? h('img', { src: imgUrl, alt: '', width: 72, height: 72, loading: 'lazy' }) : null),
    h('div', { class: 'cart-line-info' },
      h('a', { class: 'cart-line-title', href: 'product.html?handle=' + encodeURIComponent(l.handle) }, l.title),
      l.variantTitle !== 'Default Title' ? h('span', { class: 'muted' }, l.variantTitle) : null,
      h('span', { class: 'cart-line-price' }, money(l.price * l.quantity, cart.currency)),
    ),
    h('div', { class: 'qty', role: 'group', 'aria-label': 'Quantity for ' + l.title },
      h('button', { type: 'button', 'aria-label': 'Decrease quantity', 'data-act': 'dec', 'data-line': l.id }, '−'),
      h('output', { 'aria-live': 'polite' }, String(l.quantity)),
      h('button', { type: 'button', 'aria-label': 'Increase quantity', 'data-act': 'inc', 'data-line': l.id, disabled: l.quantity >= MAX_QTY }, '+'),
    ),
    h('button', { type: 'button', class: 'link-button', 'data-act': 'remove', 'data-line': l.id, 'aria-label': 'Remove ' + l.title }, 'Remove'),
  );
}

function render() {
  for (const el of countEls) el.textContent = String(cart?.totalQuantity ?? 0);
  if (!body) return;
  body.replaceChildren();
  footer.replaceChildren();

  if (!cart || cart.lines.length === 0) {
    body.append(
      h('div', { class: 'cart-empty' },
        h('p', { class: 'cart-empty-title' }, 'Your cart is empty'),
        h('p', { class: 'muted' }, isLive()
          ? 'Pick a scent family and add something you want to smell on your skin.'
          : 'Preview mode: carts and checkout switch on once Shopify is connected.'),
        h('a', { class: 'btn btn-quiet', href: 'index.html#shop' }, 'Browse fragrances'),
      ),
    );
    return;
  }

  body.append(h('ul', { class: 'cart-lines' }, cart.lines.map(line)));

  const checkout = trustedCheckoutUrl(cart.checkoutUrl);
  footer.append(
    h('div', { class: 'cart-total' },
      h('span', null, 'Subtotal'),
      h('strong', null, money(cart.subtotal, cart.currency)),
    ),
    h('p', { class: 'muted small' }, 'Shipping and taxes are calculated at checkout.'),
    checkout
      ? h('a', { class: 'btn btn-primary btn-block', href: checkout }, 'Go to secure checkout')
      : h('p', { class: 'form-error', role: 'alert' }, 'Checkout is unavailable right now. Please try again shortly.'),
  );
}

export function mountCart() {
  liveRegion = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  body = h('div', { class: 'cart-body' });
  footer = h('div', { class: 'cart-footer' });
  const close = h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close cart' }, '×');

  dialog = h('dialog', { class: 'cart-drawer', 'aria-labelledby': 'cart-title' },
    h('div', { class: 'cart-head' }, h('h2', { id: 'cart-title' }, 'Your cart'), close),
    body,
    footer,
  );

  close.addEventListener('click', () => dialog.close());
  // Click on the backdrop (the dialog element itself) closes the drawer.
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  dialog.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn || !cart) return;
    const l = cart.lines.find((x) => x.id === btn.dataset.line);
    if (!l) return;
    const act = btn.dataset.act;
    guarded(async () => {
      if (act === 'remove') cart = await removeLine(cart.id, l.id);
      else cart = await setLineQuantity(cart.id, l.id, clamp(l.quantity + (act === 'inc' ? 1 : -1), 0, MAX_QTY));
      if (cart.lines.length === 0) store.remove(KEY);
    });
  });

  document.body.append(dialog, liveRegion);
  render();
  loadCart();
}
