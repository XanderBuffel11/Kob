// Security audit. Zero dependencies. Run with: npm run audit
// Exits non-zero if anything fails, so it can gate deploys / CI.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const warnings = [];
const fail = (m) => failures.push(m);
const warn = (m) => warnings.push(m);
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (['.git', 'node_modules'].includes(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}
const rel = (f) => path.relative(ROOT, f);
const files = walk(ROOT);
const text = files.filter((f) => /\.(html|css|js|mjs|json|md|txt|svg|toml|yml|yaml)$|_headers$|\.gitignore$/.test(f));

/* 1. Secrets in the working tree and in all of git history */
const SECRETS = [
  [/shp(at|ss|ca|pa)_[a-f0-9]{32}/i, 'Shopify Admin/app token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
  [/\b(sk|rk)_live_[A-Za-z0-9]{16,}/, 'Stripe live key'],
  [/gh[pousr]_[A-Za-z0-9]{36,}/, 'GitHub token'],
  [/xox[abp]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/(secret|passw(or)?d|api[_-]?key|access[_-]?token)\s*[:=]\s*['"][A-Za-z0-9/+_-]{16,}['"]/i, 'hard-coded credential'],
];
for (const f of text) {
  const body = readFileSync(f, 'utf8');
  for (const [re, label] of SECRETS) if (re.test(body)) fail(`Secret (${label}) in ${rel(f)}`);
}
try {
  const history = execFileSync('git', ['log', '--all', '-p', '--no-color'], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  for (const [re, label] of SECRETS) if (re.test(history)) fail(`Secret (${label}) found in git history`);
} catch {
  warn('Could not read git history (no commits yet?). Re-run after committing.');
}

/* 2. Dangerous files */
for (const f of files) {
  const name = path.basename(f);
  if (/^\.env(\..*)?$/.test(name) && name !== '.env.example') fail(`Environment file present: ${rel(f)}`);
  if (/\.(pem|key|p12|pfx|sql|sqlite|db|bak|orig|log|map)$/i.test(name)) fail(`Sensitive/backup file: ${rel(f)}`);
  if (name === '.DS_Store') fail(`Junk file: ${rel(f)}`);
}
if (!existsSync(path.join(ROOT, '.gitignore')) || !/^\.env/m.test(read('.gitignore'))) fail('.gitignore must ignore .env files');

/* 3. HTML: no inline scripts, handlers, inline styles, javascript: URLs */
for (const f of files.filter((x) => x.endsWith('.html'))) {
  const html = readFileSync(f, 'utf8');
  const r = rel(f);
  for (const m of html.matchAll(/<script\b([^>]*)>/gi)) if (!/\bsrc=/.test(m[1])) fail(`Inline <script> in ${r}`);
  for (const m of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)) if (/^(https?:)?\/\//.test(m[1])) fail(`External script in ${r}: ${m[1]}`);
  if (/\son[a-z]+\s*=/i.test(html)) fail(`Inline event handler in ${r}`);
  if (/\sstyle\s*=/i.test(html)) fail(`Inline style attribute in ${r}`);
  if (/<style\b/i.test(html)) fail(`<style> block in ${r}`);
  if (/javascript:/i.test(html)) fail(`javascript: URL in ${r}`);
  if (/http:\/\//i.test(html)) fail(`Insecure http:// URL in ${r}`);
  for (const m of html.matchAll(/<a\b[^>]*href="https?:\/\/[^"]*"[^>]*>/gi)) {
    if (!/rel="[^"]*noopener/.test(m[0])) fail(`External link without rel=noopener in ${r}`);
  }
}

/* 4. JS: no HTML-injection sinks */
const SINKS = [/\.innerHTML\b/, /\.outerHTML\b/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new Function\s*\(/, /setTimeout\s*\(\s*['"`]/, /dangerouslySetInnerHTML/];
for (const f of files.filter((x) => x.endsWith('.js') && x.includes(`${path.sep}public${path.sep}`))) {
  const code = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const re of SINKS) if (re.test(code)) fail(`Unsafe sink ${re} in ${rel(f)}`);
  if (/['"`]http:\/\//.test(code)) fail(`Insecure http:// URL in ${rel(f)}`);
}

/* 5. Security headers */
const headers = {};
{
  let current = null;
  for (const line of read('public/_headers').split('\n')) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) current = line.trim();
    else if (current === '/*') {
      const i = line.indexOf(':');
      headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
}
for (const h of ['Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy', 'Cross-Origin-Opener-Policy', 'Cross-Origin-Resource-Policy']) {
  if (!headers[h]) fail(`Missing header: ${h}`);
}
const csp = headers['Content-Security-Policy'] || '';
if (/unsafe-inline|unsafe-eval/.test(csp)) fail("CSP must not contain 'unsafe-inline' or 'unsafe-eval'");
if (/(^|\s)\*(\s|;|$)/.test(csp)) fail('CSP must not contain a bare * wildcard');
for (const d of ["object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'"]) if (!csp.includes(d)) fail(`CSP missing ${d}`);
if (existsSync(path.join(ROOT, 'vercel.json'))) {
  const v = JSON.parse(read('vercel.json'));
  const vh = Object.fromEntries(v.headers[0].headers.map((x) => [x.key, x.value]));
  for (const [k, val] of Object.entries(headers)) {
    if (!k.startsWith('Cache') && vh[k] !== val) fail(`vercel.json header "${k}" differs from public/_headers`);
  }
}

/* 6. Config sanity */
const cfg = read('public/js/config.js');
const token = /storefrontToken:\s*'([^']*)'/.exec(cfg)?.[1] ?? '';
const domain = /shopDomain:\s*'([^']+)'/.exec(cfg)?.[1] ?? '';
if (token && !/^[a-f0-9]{32}$/i.test(token)) fail('storefrontToken does not look like a Storefront token (32 hex characters). Never use an Admin token.');
if (!token) warn('No Storefront token set yet: the site is in preview mode with sample products.');
if (domain && !csp.includes(`https://${domain}`)) fail(`CSP connect-src does not allow https://${domain}`);
if (domain && !/^[a-z0-9-]+\.myshopify\.com$/.test(domain)) warn('shopDomain is not a *.myshopify.com domain; check CSP and allowedCheckoutHosts.');

/* 7. Dependencies */
const pkg = JSON.parse(read('package.json'));
for (const key of ['dependencies', 'devDependencies', 'optionalDependencies']) {
  if (pkg[key] && Object.keys(pkg[key]).length) fail(`package.json has ${key}: the site is intentionally dependency-free`);
}

/* Report */
for (const w of warnings) console.log(`warn  ${w}`);
for (const f of failures) console.log(`FAIL  ${f}`);
console.log(failures.length ? `\n${failures.length} check(s) failed.` : '\nAll security checks passed.');
process.exit(failures.length ? 1 : 0);
