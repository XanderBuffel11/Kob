// Drawn bottle illustration, used when a product has no photo yet.
// Colour comes from CSS (the parent's data-family), so no inline styles are needed.

import { svg } from './dom.js';

const SHAPES = [
  // tall rectangle
  { body: 'M62 96h76a8 8 0 0 1 8 8v128a12 12 0 0 1-12 12H66a12 12 0 0 1-12-12V104a8 8 0 0 1 8-8z', liquid: 'M58 150h84v82a8 8 0 0 1-8 8H66a8 8 0 0 1-8-8z' },
  // round flask
  { body: 'M100 92c-4 0-8 3-8 8v8c-30 12-46 38-46 70 0 38 24 62 54 62s54-24 54-62c0-32-16-58-46-70v-8c0-5-4-8-8-8z', liquid: 'M48 186c0 34 22 54 52 54s52-20 52-54z' },
  // low square
  { body: 'M54 120h92a10 10 0 0 1 10 10v102a12 12 0 0 1-12 12H56a12 12 0 0 1-12-12V130a10 10 0 0 1 10-10z', liquid: 'M48 168h104v64a8 8 0 0 1-8 8H56a8 8 0 0 1-8-8z' },
];

function pick(seed) {
  let n = 0;
  for (const ch of seed) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return SHAPES[n % SHAPES.length];
}

export function bottle(seed = '') {
  const shape = pick(seed);
  const capY = shape === SHAPES[2] ? 92 : shape === SHAPES[1] ? 70 : 62;
  return svg(
    'svg',
    { class: 'bottle', viewBox: '0 0 200 260', role: 'img', 'aria-label': 'Illustrated bottle' },
    svg('ellipse', { class: 'bottle-shadow', cx: 100, cy: 250, rx: 62, ry: 6 }),
    svg('path', { class: 'bottle-liquid', d: shape.liquid }),
    svg('path', { class: 'bottle-glass', d: shape.body }),
    svg('rect', { class: 'bottle-cap', x: 80, y: capY, width: 40, height: 30, rx: 5 }),
    svg('path', { class: 'bottle-shine', d: 'M70 120v96', 'stroke-linecap': 'round' }),
  );
}
