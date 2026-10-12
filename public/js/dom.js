// Safe DOM helpers. The whole site builds markup with these instead of innerHTML,
// so text from Shopify (titles, descriptions, tags) can never become executable HTML.

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Create an element. `attrs` values are set as attributes (never as HTML).
 * Children may be strings (inserted as text), Nodes, or arrays of either.
 */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  applyAttrs(el, attrs);
  appendAll(el, children);
  return el;
}

export function svg(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  applyAttrs(el, attrs);
  appendAll(el, children);
  return el;
}

function applyAttrs(el, attrs) {
  if (!attrs) return;
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (key.toLowerCase().startsWith('on')) {
      throw new Error('Inline event handler attributes are not allowed: ' + key);
    }
    if (key === 'class') el.setAttribute('class', String(value));
    else if (key === 'text') el.textContent = String(value);
    else if (key === 'href' || key === 'src') el.setAttribute(key, safeUrl(String(value)));
    else el.setAttribute(key, value === true ? '' : String(value));
  }
}

function appendAll(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Allow only https:, relative and same-page URLs. Blocks javascript:, data:, etc. */
export function safeUrl(value) {
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  if (value.startsWith('#') || value.startsWith('?')) return value;
  if (/^[a-z0-9._-]+\.html(\?.*)?(#.*)?$/i.test(value)) return value;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return url.href;
  } catch {
    /* fall through */
  }
  return '#';
}

/** Product images must come from Shopify's CDN. */
export function safeImageUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.hostname === 'cdn.shopify.com') return url.href;
  } catch {
    /* fall through */
  }
  return null;
}

export function money(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(n);
  } catch {
    return n.toFixed(2);
  }
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
}

/** localStorage can throw (private mode, blocked storage). Never let it break the page. */
export const store = {
  get(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  remove(key) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
