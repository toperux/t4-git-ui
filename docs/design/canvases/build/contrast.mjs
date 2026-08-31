// Contrast audit for tokens.css (WCAG 2.x relative luminance). Both themes.
// Usage: node docs/design/canvases/build/contrast.mjs   → prints a table, exits 1 on any failure.
// Targets: text ≥ 4.5:1, non-text UI (control borders, icons, graph lanes, focus ring, scrollbar) ≥ 3:1.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const themes = { light, dark };

/** Resolve a token to [r,g,b,a] (0-255, 0-1). Follows var() aliases; composites rgba over `over`. */
function color(t, name) {
  let v = themes[t][name];
  if (v === undefined) throw new Error(`unknown token --${name} (${t})`);
  let m;
  while ((m = v.match(/^var\(--([a-z0-9-]+)\)$/))) v = themes[t][m[1]];
  if ((m = v.match(/^#([0-9a-f]{6})$/i))) {
    const n = parseInt(m[1], 16);
    return [n >> 16, (n >> 8) & 255, n & 255, 1];
  }
  if ((m = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/))) {
    return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  }
  throw new Error(`cannot parse --${name}: ${v}`);
}
function over(fg, bg) {
  const a = fg[3];
  return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)).concat([1]);
}
function lum([r, g, b]) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a, b) {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** bg spec: 'token' or 'token+overlay' (overlay composited over token). */
function resolveBg(t, spec) {
  const [base, ...layers] = spec.split('+');
  let c = over(color(t, base), [255, 255, 255, 1]); // opaque base expected
  for (const l of layers) c = over(color(t, l), c);
  return c;
}

const TEXT = 4.5, UI = 3;
// [fg, bg, min, note]
const pairs = [
  // body text
  ...['bg-app', 'bg-panel', 'bg-elevated', 'bg-inset', 'bg-selected', 'bg-selected-unfocused'].map((b) => ['fg', b, TEXT]),
  ...['bg-app', 'bg-panel', 'bg-elevated', 'bg-inset', 'bg-selected', 'bg-selected-unfocused', 'bg-app+bg-hover', 'bg-panel+bg-hover'].map((b) => ['fg-muted', b, TEXT]),
  // faint: placeholders / disabled only (§5) — still audited so it never silently drops below 3:1
  ...['bg-app', 'bg-panel', 'bg-elevated', 'bg-inset'].map((b) => ['fg-faint', b, UI, 'placeholder']),
  // on-accent text
  ['fg-on-accent', 'accent', TEXT], ['fg-on-accent', 'accent-hover', TEXT], ['fg-on-accent', 'danger', TEXT], ['fg-on-accent', 'danger-hover', TEXT],
  ['chip-head-fg', 'chip-head-bg', TEXT],
  ['bg-panel', 'fg', TEXT, 'tooltip'],
  // semantic as text
  ...['bg-panel', 'bg-app', 'bg-elevated'].flatMap((b) => [['accent-text', b, TEXT], ['danger-text', b, TEXT], ['success', b, TEXT], ['warning', b, TEXT]]),
  ['danger-text', 'danger-soft', TEXT], ['success', 'success-soft', TEXT], ['warning', 'warning-soft', TEXT],
  ['fg', 'warning-soft', TEXT, 'banner'], ['fg', 'danger-soft', TEXT, 'banner'],
  // chips
  ...['local', 'remote', 'tag', 'stash'].map((k) => [`chip-${k}-fg`, `chip-${k}-bg`, TEXT]),
  // status glyphs
  ...['added', 'modified', 'deleted', 'renamed', 'untracked', 'conflict'].map((k) => [`status-${k}`, 'bg-panel', TEXT]),
  ['status-conflict', 'danger-soft', TEXT],
  // diff
  ['diff-gutter-fg', 'diff-add-gutter', TEXT], ['diff-gutter-fg', 'diff-del-gutter', TEXT], ['diff-gutter-fg', 'bg-panel', TEXT],
  ['diff-add-fg', 'diff-add-bg', TEXT], ['diff-add-fg', 'diff-add-word', TEXT], ['diff-del-fg', 'diff-del-bg', TEXT], ['diff-del-fg', 'diff-del-word', TEXT],
  ['diff-hunk-fg', 'diff-hunk-bg', TEXT],
  ['fg-muted', 'diff-add-bg', TEXT, 'sign col'], ['fg-muted', 'diff-del-bg', TEXT, 'sign col'],
  // syntax highlighting: every syn token on the panel and on both diff row tints
  ...['keyword', 'string', 'comment', 'number', 'type', 'function', 'punct'].flatMap((k) => ['bg-panel', 'diff-add-bg', 'diff-del-bg'].map((b) => [`syn-${k}`, b, TEXT])),
  // non-text UI
  ['border-strong', 'bg-panel', UI], ['border-strong', 'bg-app', UI],
  ['accent', 'bg-panel', UI, 'focus ring / primary btn'], ['accent', 'bg-app', UI],
  ['danger', 'bg-inset', UI, 'invalid border'], ['danger', 'bg-panel', UI, 'danger btn / badge edge'],
  ['scrollbar-thumb', 'bg-panel', UI], ['scrollbar-thumb', 'bg-app', UI],
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => [`graph-${i}`, 'bg-panel', UI]),
];

let fail = 0;
const rows = [];
for (const [fg, bg, min, note] of pairs) {
  const r = {};
  for (const t of ['light', 'dark']) {
    const f = over(color(t, fg), resolveBg(t, bg));
    r[t] = ratio(f, resolveBg(t, bg));
    if (r[t] < min) fail++;
  }
  const mark = (v) => `${v.toFixed(2)}${v < min ? ' FAIL' : ''}`.padEnd(10);
  rows.push(`${`${fg} / ${bg}`.padEnd(40)} ≥${String(min).padEnd(4)} ${mark(r.light)} ${mark(r.dark)} ${note ?? ''}`);
}
console.log(`${'pair'.padEnd(40)} min   light      dark`);
console.log(rows.join('\n'));
console.log(fail ? `\n${fail} FAIL` : '\nall pass');
process.exit(fail ? 1 : 0);
