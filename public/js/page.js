// Shared bootstrap for every page: cart drawer, cart buttons, preview banner, footer year.

import { h } from './dom.js';
import { CONFIG } from './config.js';
import { isLive } from './api.js';
import { mountCart, openCart, registerCount } from './cart.js';

export function initPage() {
  document.querySelectorAll('[data-cart-count]').forEach(registerCount);
  document.querySelectorAll('[data-open-cart]').forEach((btn) => btn.addEventListener('click', openCart));
  mountCart();

  const year = document.querySelector('[data-year]');
  if (year) year.textContent = String(new Date().getFullYear());

  const brand = document.querySelectorAll('[data-site-name]');
  brand.forEach((el) => { el.textContent = CONFIG.siteName; });

  if (!isLive()) {
    document.body.prepend(
      h('div', { class: 'preview-banner', role: 'note' },
        'Preview mode: you are seeing sample products. Add your Storefront token in js/config.js to show your real store.'),
    );
  }
}
