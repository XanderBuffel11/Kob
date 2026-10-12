// Shopify Storefront API client + preview-mode sample data.
// All user-controlled values travel as GraphQL *variables*, never string-concatenated.

import { CONFIG, FAMILIES } from './config.js';

export const isLive = () => Boolean(CONFIG.storefrontToken);

const ENDPOINT = `https://${CONFIG.shopDomain}/api/${CONFIG.apiVersion}/graphql.json`;
const TIMEOUT_MS = 10000;

async function gql(query, variables) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': CONFIG.storefrontToken,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
      credentials: 'omit',
      referrerPolicy: 'strict-origin-when-cross-origin',
    });
    if (res.status === 429) throw new Error('The store is busy. Try again in a moment.');
    if (!res.ok) throw new Error('The store could not be reached. Try again in a moment.');
    const json = await res.json();
    if (json.errors?.length) throw new Error('The store returned an error. Try again in a moment.');
    return json.data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('The store took too long to respond.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Products ---------- */

const PRODUCT_CARD = `
  fragment Card on Product {
    id handle title vendor tags
    featuredImage { url altText }
    priceRange { minVariantPrice { amount currencyCode } }
    availableForSale
  }`;

const PRODUCT_FULL = `
  fragment Full on Product {
    id handle title vendor tags description
    images(first: 8) { nodes { url altText } }
    options { name values }
    priceRange { minVariantPrice { amount currencyCode } }
    availableForSale
    variants(first: 50) { nodes {
      id title availableForSale
      price { amount currencyCode }
      selectedOptions { name value }
    } }
  }`;

export function familyOf(tags) {
  for (const tag of tags || []) {
    const m = /^family:([a-z]+)$/i.exec(tag);
    if (m && FAMILIES.some((f) => f.id === m[1].toLowerCase())) return m[1].toLowerCase();
  }
  return null;
}

export function notesOf(tags) {
  return (tags || [])
    .map((t) => /^note:(.{1,40})$/i.exec(t)?.[1])
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeCard(p) {
  return {
    id: p.id,
    handle: p.handle,
    title: p.title,
    vendor: p.vendor,
    family: familyOf(p.tags),
    image: p.featuredImage ? { url: p.featuredImage.url, alt: p.featuredImage.altText || p.title } : null,
    price: Number(p.priceRange.minVariantPrice.amount),
    currency: p.priceRange.minVariantPrice.currencyCode,
    available: p.availableForSale,
  };
}

function normalizeFull(p) {
  return {
    ...normalizeCard({ ...p, featuredImage: p.images.nodes[0] || null }),
    notes: notesOf(p.tags),
    description: p.description,
    images: p.images.nodes.map((i) => ({ url: i.url, alt: i.altText || p.title })),
    options: p.options,
    variants: p.variants.nodes.map((v) => ({
      id: v.id,
      title: v.title,
      available: v.availableForSale,
      price: Number(v.price.amount),
      currency: v.price.currencyCode,
      selectedOptions: v.selectedOptions,
    })),
  };
}

export async function listProducts() {
  if (!isLive()) return SAMPLE.map(sampleCard);
  const data = await gql(
    `${PRODUCT_CARD}
     query ($query: String!) {
       products(first: 48, query: $query, sortKey: CREATED_AT, reverse: true) { nodes { ...Card } }
     }`,
    { query: CONFIG.catalogQuery },
  );
  return data.products.nodes.map(normalizeCard);
}

const HANDLE_RE = /^[a-z0-9][a-z0-9-]{0,254}$/;

export async function getProduct(handle) {
  if (typeof handle !== 'string' || !HANDLE_RE.test(handle)) return null;
  if (!isLive()) {
    const s = SAMPLE.find((p) => p.handle === handle);
    return s ? sampleFull(s) : null;
  }
  const data = await gql(
    `${PRODUCT_FULL}
     query ($handle: String!) { product(handle: $handle) { ...Full } }`,
    { handle },
  );
  return data.product ? normalizeFull(data.product) : null;
}

/* ---------- Cart ---------- */

const CART_FIELDS = `
  id checkoutUrl totalQuantity
  cost { subtotalAmount { amount currencyCode } }
  lines(first: 50) { nodes {
    id quantity
    merchandise { ... on ProductVariant {
      id title
      price { amount currencyCode }
      image { url altText }
      product { title handle vendor }
    } }
  } }`;

const ERRORS = 'userErrors { message }';

function normalizeCart(c) {
  if (!c) return null;
  return {
    id: c.id,
    checkoutUrl: c.checkoutUrl,
    totalQuantity: c.totalQuantity,
    subtotal: Number(c.cost.subtotalAmount.amount),
    currency: c.cost.subtotalAmount.currencyCode,
    lines: c.lines.nodes.map((l) => ({
      id: l.id,
      quantity: l.quantity,
      variantId: l.merchandise.id,
      variantTitle: l.merchandise.title,
      price: Number(l.merchandise.price.amount),
      image: l.merchandise.image,
      title: l.merchandise.product.title,
      handle: l.merchandise.product.handle,
      vendor: l.merchandise.product.vendor,
    })),
  };
}

function checkMutation(result, key) {
  const payload = result[key];
  if (payload.userErrors?.length) throw new Error(payload.userErrors[0].message);
  return normalizeCart(payload.cart);
}

export async function fetchCart(id) {
  const data = await gql(`query ($id: ID!) { cart(id: $id) { ${CART_FIELDS} } }`, { id });
  return normalizeCart(data.cart);
}

export async function createCart(variantId, quantity) {
  const data = await gql(
    `mutation ($lines: [CartLineInput!]!) {
       cartCreate(input: { lines: $lines }) { cart { ${CART_FIELDS} } ${ERRORS} }
     }`,
    { lines: [{ merchandiseId: variantId, quantity }] },
  );
  return checkMutation(data, 'cartCreate');
}

export async function addLine(cartId, variantId, quantity) {
  const data = await gql(
    `mutation ($cartId: ID!, $lines: [CartLineInput!]!) {
       cartLinesAdd(cartId: $cartId, lines: $lines) { cart { ${CART_FIELDS} } ${ERRORS} }
     }`,
    { cartId, lines: [{ merchandiseId: variantId, quantity }] },
  );
  return checkMutation(data, 'cartLinesAdd');
}

export async function setLineQuantity(cartId, lineId, quantity) {
  const data = await gql(
    `mutation ($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
       cartLinesUpdate(cartId: $cartId, lines: $lines) { cart { ${CART_FIELDS} } ${ERRORS} }
     }`,
    { cartId, lines: [{ id: lineId, quantity }] },
  );
  return checkMutation(data, 'cartLinesUpdate');
}

export async function removeLine(cartId, lineId) {
  const data = await gql(
    `mutation ($cartId: ID!, $lineIds: [ID!]!) {
       cartLinesRemove(cartId: $cartId, lineIds: $lineIds) { cart { ${CART_FIELDS} } ${ERRORS} }
     }`,
    { cartId, lineIds: [lineId] },
  );
  return checkMutation(data, 'cartLinesRemove');
}

/** Only ever send shoppers to https URLs on a host we trust. */
export function trustedCheckoutUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && CONFIG.allowedCheckoutHosts.includes(url.hostname)) return url.href;
  } catch {
    /* fall through */
  }
  return null;
}

/* ---------- Preview-mode sample data (shown until a token is configured) ---------- */

const SAMPLE = [
  { handle: 'sample-bergamot-hour', title: 'Bergamot Hour', family: 'citrus', price: 64, notes: ['Bergamot', 'Neroli', 'White musk'] },
  { handle: 'sample-peony-ash', title: 'Peony and Ash', family: 'floral', price: 78, notes: ['Peony', 'Pink pepper', 'Smoked cedar'] },
  { handle: 'sample-salt-glass', title: 'Salt Glass', family: 'fresh', price: 58, notes: ['Sea salt', 'Green fig', 'Driftwood'] },
  { handle: 'sample-cedar-room', title: 'Cedar Room', family: 'woody', price: 86, notes: ['Cedar', 'Vetiver', 'Leather'] },
  { handle: 'sample-slow-amber', title: 'Slow Amber', family: 'amber', price: 92, notes: ['Amber', 'Vanilla bean', 'Tonka'] },
  { handle: 'sample-yuzu-rain', title: 'Yuzu Rain', family: 'citrus', price: 61, notes: ['Yuzu', 'Green tea', 'Petitgrain'] },
  { handle: 'sample-night-jasmine', title: 'Night Jasmine', family: 'floral', price: 84, notes: ['Jasmine', 'Tuberose', 'Sandalwood'] },
  { handle: 'sample-resin-smoke', title: 'Resin and Smoke', family: 'amber', price: 98, notes: ['Frankincense', 'Labdanum', 'Oud'] },
];

const SAMPLE_BLURB =
  'Sample product shown while the store is in preview mode. Replace it by adding a fragrance in Shopify with the product type "Fragrance".';

function sampleCard(s) {
  return {
    id: 'sample/' + s.handle,
    handle: s.handle,
    title: s.title,
    vendor: 'Sample house',
    family: s.family,
    image: null,
    price: s.price,
    currency: CONFIG.currencyFallback,
    available: true,
    sample: true,
  };
}

function sampleFull(s) {
  const sizes = [
    { title: '50 ml', price: s.price },
    { title: '100 ml', price: Math.round(s.price * 1.55) },
  ];
  return {
    ...sampleCard(s),
    notes: s.notes,
    description: SAMPLE_BLURB,
    images: [],
    options: [{ name: 'Size', values: sizes.map((z) => z.title) }],
    variants: sizes.map((z) => ({
      id: 'sample/' + s.handle + '/' + z.title,
      title: z.title,
      available: true,
      price: z.price,
      currency: CONFIG.currencyFallback,
      selectedOptions: [{ name: 'Size', value: z.title }],
    })),
  };
}
