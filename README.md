# Kob: fragrance storefront

A fast, static storefront that reads products from Shopify and sends shoppers to Shopify's own checkout.
There is no server, database, admin area or password system here to attack: Shopify runs all of that.

```
npm start        # preview at http://127.0.0.1:3000 (same security headers as production)
npm run audit    # security checks; run before every deploy
```

No `npm install` is needed. The site has **zero runtime dependencies**.

## Connect Shopify (about 5 minutes)

1. Shopify admin → **Settings → Apps and sales channels → Develop apps** → create an app (or install the **Headless** sales channel).
2. Under **Configure Storefront API scopes** tick:
   `unauthenticated_read_product_listings`, `unauthenticated_read_product_inventory`,
   `unauthenticated_read_product_tags`, `unauthenticated_write_checkouts`, `unauthenticated_read_checkouts`.
3. Install the app and copy the **Storefront API access token** (32 characters).
4. Paste it into `public/js/config.js` as `storefrontToken`, then run `npm run audit`.
5. Make sure your fragrance products are **published to that app's sales channel**, or the API will not return them.

> The Storefront token is public and read-only by design. **Never** paste an Admin API token (`shpat_…`) into this repo.
> The audit fails the build if it finds one.

## Adding products in Shopify

| Field | Value | Effect |
| --- | --- | --- |
| Product type | `Fragrance` | Shows the product on the site. Your existing apparel is ignored. |
| Tag | `family:citrus`, `family:floral`, `family:fresh`, `family:woody`, `family:amber` | Picks the colour plate and the scent-family filter |
| Tags | `note:Bergamot`, `note:Vetiver` … | Shown as scent notes |
| Variants | Option named `Size` (50 ml, 100 ml) | Shown as size buttons |

Product descriptions are shown as plain text, on purpose: that is what keeps supplier-imported HTML from running on your site.

## Deploy

Deploy the `public/` folder to Netlify, Cloudflare Pages (both read `public/_headers`) or Vercel (reads `vercel.json`).
Use HTTPS only. Both hosts provide it free. If you add a custom domain for checkout, add it to `allowedCheckoutHosts` in `config.js`
and to the CSP `connect-src` in `_headers` **and** `vercel.json` (the audit checks they match).

## What's protected, and what isn't this site's job

| Request | How it's handled |
| --- | --- |
| Hide API keys | No secrets exist in the code. Only the public Storefront token is present. `.env*` is git-ignored and audited for. |
| Auth, admin routes, user access, DB, password hashing | None are built here, so none can be hacked here. Accounts, checkout, payments and the admin live on Shopify. Turn on **2-step login for every staff account** in Shopify and give staff least-privilege permissions. |
| XSS | All markup is built with `createElement`/`textContent` (no `innerHTML`). Strict CSP (no inline script or style, no `unsafe-*`). URLs from Shopify are checked (https images only from `cdn.shopify.com`; checkout links only to allowed hosts). |
| Forms | Search and quantity inputs are length-limited, clamped and never rendered as HTML. Query-string `handle` is validated and sent as a GraphQL *variable*. There is no form that submits to a server. |
| Rate limiting | Cart writes are throttled in the browser, and Shopify rate-limits its API and checkout. Real abuse protection for a static site belongs at the host/CDN (Cloudflare or Netlify/Vercel firewall rules). |
| CORS | The site exposes no API. Shopify's Storefront API is built for browser calls. |
| Headers | CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP, CORP. See `public/_headers`. |
| Debug mode, exposed files | No debug flags or source maps. The preview server refuses dotfiles, `_headers` and path traversal. |
| Dependencies | None at runtime. Fonts are self-hosted (SIL OFL, licences included) so no third-party scripts or CDNs load. |

Newsletter sign-up is not included: a safe one needs a service (Shopify Email, Klaviyo…). Add its domain to the CSP when you pick one.

## Before you go live

- Legal pages: the footer links to Shopify's generated policies (shipping, returns, privacy, terms). Edit them in **Settings → Policies** and check they match your supplier's real delivery times.
- Brand name: change `siteName` in `config.js`, the `<title>` tags and the wordmark text.
- Fragrance claims: only sell products you're allowed to sell. Authenticity and trademark rules apply to drop-shipped designer fragrances.

## Shopify theme (repo root) and GitHub connection

The **root of this branch is a complete Shopify theme: Tinker with the Kob design applied**
(`assets/ blocks/ config/ layout/ locales/ sections/ snippets/ templates/`). Shopify's GitHub
integration reads those folders from the root and ignores everything else (`public/`, `scripts/`, this README).

To connect: Online Store → Themes → Add theme → **Connect from GitHub**, choose this repository and this branch.
Shopify creates an unpublished theme from it; publish it only after previewing.

- Fragrances: product type `Fragrance`, tags `family:woody`, `note:Cedar`. The home page reads the
  `fragrances` collection and the five family collections (`citrus`, `floral`, `fresh`, `woody`, `amber`).
- Changed from stock Tinker: `config/settings_data.json` (palette, buttons, radii), `templates/index.json`
  (home page), `sections/header-group.json`, `sections/footer-group.json`. Everything else is Tinker as shipped.
- `kob-theme/` is my earlier from-scratch theme, kept for reference. It is not at the root, so Shopify ignores it.
- Shopify controls HTTP headers on theme stores, so `public/_headers` and the CSP only apply to the static version.
- Theme edits made in the Shopify editor and pushed back through GitHub will appear as commits here.
