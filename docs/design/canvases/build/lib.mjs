import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
export { icon } from './icons.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''); // comments may mention tokens

function parseBlock(re) {
  const m = src.match(re);
  const vals = {};
  if (!m) return vals;
  for (const [, k, v] of m[1].matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) vals[k] = v.trim();
  return vals;
}
const light = parseBlock(/:root\s*\{([\s\S]*?)\n\}/);
const dark = { ...light, ...parseBlock(/\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/) };
export const tokens = { light, dark };
/** Token value with var() aliases followed (for SVG attributes, which can't use var()). */
export function resolve(t, name) {
  let v = tokens[t][name], m;
  while (v && (m = v.match(/^var\(--([a-z0-9-]+)\)$/))) v = tokens[t][m[1]];
  return v;
}

/** Canvas backdrop behind artboards (design-tool chrome only — NOT an app token; the app never paints this). */
export const PAGE_BG = { light: '#cfd3da', dark: '#0f1114' };

/** Same content rendered in a light and a dark column. fn(theme) -> html */
export function twoUp(fn, { gap = 24 } = {}) {
  const col = (t) =>
    `<div class="t-${t} sheet" style="display: flex; flex-direction: column; gap: 28px; padding: 20px; border-radius: 8px; min-width: 0;">${fn(t)}</div>`;
  return `<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: ${gap}px;">${col('light')}${col('dark')}</div>`;
}

export function shell(title, sub, inner, width = 1440) {
  return `<div class="canvas-root t-light sheet" style="background: transparent; display: flex; flex-direction: column; gap: 20px; padding: 24px;">
  <div style="display: flex; flex-direction: column; gap: 4px;">
    <div class="h1" style="color: var(--fg);">${title}</div>
    <div style="color: var(--fg-muted); font-size: 13px; line-height: 18px; max-width: 900px;">${sub}</div>
  </div>
  ${inner}
</div>`;
}

export function section(title, note, body) {
  return `<div class="sec">
  <div class="sec-title"><div class="h3">${title}</div>${note ? `<div class="sm muted">${note}</div>` : ''}</div>
  ${body}
</div>`;
}

export function swatch(name, t, { label, textOn } = {}) {
  const v = tokens[t][name];
  const fg = textOn ? `color: var(--${textOn});` : '';
  return `<div class="swatch"><div class="swatch-box" style="background: var(--${name}); ${fg} display: flex; align-items: center; justify-content: center; font-size: 12px;">${textOn ? 'Aa' : ''}</div><div class="swatch-name">--${name}</div><div class="swatch-val">${label ?? v}</div></div>`;
}

export function grid(cols, items, gap = 12) {
  return `<div style="display: grid; grid-template-columns: repeat(${cols}, minmax(0, 1fr)); gap: ${gap}px;">${items.join('')}</div>`;
}

export function row(items, gap = 12, extra = '') {
  return `<div style="display: flex; align-items: center; gap: ${gap}px; flex-wrap: wrap; ${extra}">${items.join('')}</div>`;
}

export function labeled(label, html) {
  return `<div style="display: flex; flex-direction: column; gap: 6px; min-width: 0;"><div class="xs muted" style="font-family: var(--font-mono);">${label}</div>${html}</div>`;
}
