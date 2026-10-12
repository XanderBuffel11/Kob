// Local preview server. Zero dependencies. Serves ./public with the *same* security
// headers as production by reading public/_headers, so the CSP is tested while you build.
// Not intended for production use: deploy ./public to Netlify, Vercel or Cloudflare Pages.

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const PORT = Number(process.env.PORT) || 3000;
const HOST = '127.0.0.1'; // never expose the dev server to the network

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** Parse the Netlify-style _headers file into [{ pattern, headers }]. */
async function loadRules() {
  const raw = await readFile(path.join(ROOT, '_headers'), 'utf8');
  const rules = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) rules.push({ pattern: line.trim(), headers: {} });
    else {
      const i = line.indexOf(':');
      rules.at(-1).headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return rules;
}

const matches = (pattern, url) =>
  pattern.endsWith('*') ? url.startsWith(pattern.slice(0, -1)) : url === pattern;

const rules = await loadRules();

http
  .createServer(async (req, res) => {
    const send = (status, body, extra = {}) => {
      const headers = {};
      for (const r of rules) if (matches(r.pattern, req.url.split('?')[0])) Object.assign(headers, r.headers);
      res.writeHead(status, { ...headers, ...extra });
      res.end(req.method === 'HEAD' ? undefined : body);
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'Method not allowed', { Allow: 'GET, HEAD' });

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      return send(400, 'Bad request');
    }
    if (pathname.includes('\0')) return send(400, 'Bad request');
    if (pathname.endsWith('/')) pathname += 'index.html';

    const file = path.resolve(ROOT, '.' + pathname);
    const base = path.basename(file);
    // Block path traversal and never serve dotfiles or the headers config itself.
    if (!file.startsWith(ROOT + path.sep) || base.startsWith('.') || base === '_headers') {
      return send(404, await readFile(path.join(ROOT, '404.html')), { 'Content-Type': TYPES['.html'] });
    }

    try {
      if (!(await stat(file)).isFile()) throw new Error('not a file');
      send(200, await readFile(file), { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    } catch {
      send(404, await readFile(path.join(ROOT, '404.html')), { 'Content-Type': TYPES['.html'] });
    }
  })
  .listen(PORT, HOST, () => console.log(`Preview running at http://${HOST}:${PORT}`));
