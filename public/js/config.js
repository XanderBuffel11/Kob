// Site configuration. Nothing in this file is secret.
//
// The Storefront API token below is a *public, read-only* token. Shopify designs it
// to be embedded in storefront code. It can read products and create carts, and
// nothing else. NEVER put an Admin API token (starts with "shpat_") here or anywhere
// in this repo. `npm run audit` fails if it finds one.

export const CONFIG = Object.freeze({
  siteName: 'Kob',

  // Your store's permanent Shopify domain, no protocol.
  shopDomain: 'fashnooknz.myshopify.com',

  // Paste the Storefront API access token here (see README, "Connect Shopify").
  // While this is empty the site runs in preview mode with sample products.
  storefrontToken: '',

  // Storefront API version. Shopify retires versions after about 12 months.
  apiVersion: '2026-07',

  // Only products matching this Shopify search query appear on the site, so the
  // apparel already in your store never shows up here. Give each fragrance the
  // product type "Fragrance" (or change this query).
  catalogQuery: 'product_type:Fragrance AND status:active',

  // Hostnames a checkout redirect may point at. Anything else is refused.
  // Add your custom checkout domain here once you connect one.
  allowedCheckoutHosts: ['fashnooknz.myshopify.com'],

  currencyFallback: 'USD',
});

// The scent families. A product joins a family with the tag "family:citrus" etc.
export const FAMILIES = Object.freeze([
  { id: 'citrus', name: 'Citrus', blurb: 'Bright, sharp, awake', color: '#E9D25A', ink: '#3A3208' },
  { id: 'floral', name: 'Floral', blurb: 'Soft, rosy, warm-skinned', color: '#EDB3C3', ink: '#4A1D2B' },
  { id: 'fresh', name: 'Fresh', blurb: 'Clean, airy, like rain', color: '#A9D4D4', ink: '#123B3B' },
  { id: 'woody', name: 'Woody', blurb: 'Dry, calm, grounded', color: '#C49A74', ink: '#3A2412' },
  { id: 'amber', name: 'Amber', blurb: 'Deep, sweet, lingering', color: '#D98B4A', ink: '#44210A' },
]);
