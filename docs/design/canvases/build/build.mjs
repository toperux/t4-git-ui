// Assembles *.dc.html artboards from parts + tokens.css + base.css. Path-independent (resolves from its own location).
//   node docs/design/canvases/build/build.mjs          → design system: parts/*.mjs → canvases/*.dc.html
//   node docs/design/canvases/build/build.mjs screens  → A2 screens:    parts-screens/*.mjs → canvases/screens/*.dc.html
// Both modes also regenerate src/theme/tokens.css from tokens.css (the source of truth).
// A part exports default () => ({ body, extraCss?, links?, width?, bg? }); `links` = extra <link> tags emitted before <style>.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PAGE_BG } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const set = process.argv[2] === 'screens' ? 'screens' : 'system';
const partsDir = set === 'screens' ? 'parts-screens' : 'parts';
const out = set === 'screens' ? join(here, '..', 'screens') : join(here, '..');

const tokensSrc = readFileSync(join(here, 'tokens.css'), 'utf8');
// The selector rewrite below is a plain text replace; it is only correct for top-level blocks.
if (/@media/.test(tokensSrc)) throw new Error('tokens.css must not contain @media blocks (build.mjs rewrites :root / [data-theme] textually)');
const tokens = tokensSrc
  .replace(/^:root\s*\{/m, '.t-light {')
  .replace(/^\[data-theme="dark"\]\s*\{/m, '.t-dark {');
const base = readFileSync(join(here, 'base.css'), 'utf8');

// Keep the app's copy of the tokens in sync with the source of truth.
const appTokens = join(here, '..', '..', '..', '..', 'src', 'theme', 'tokens.css');
const appHeader = '/* GENERATED from docs/design/canvases/build/tokens.css — do not edit; run node docs/design/canvases/build/build.mjs */\n';
writeFileSync(appTokens, appHeader + tokensSrc.replace(/^\/\*[\s\S]*?\*\/\n+/, ''));
console.log('synced', appTokens);

const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">';

function page({ body, extraCss = '', links = [], width = 1440, bg = PAGE_BG.light }) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  ${[FONTS, ...links].join('\n  ')}
  <style>
${tokens}
${base}
body { background: ${bg}; }
.canvas-root { width: ${width}px; }
${extraCss}
  </style>
</helmet>
${body}
</x-dc>
</body>
</html>
`;
}

mkdirSync(out, { recursive: true });
const parts = readdirSync(join(here, partsDir)).filter((f) => f.endsWith('.mjs'));
for (const f of parts) {
  const mod = await import(pathToFileURL(join(here, partsDir, f)).href);
  const name = f.replace(/\.mjs$/, '');
  const html = page(mod.default());
  writeFileSync(join(out, `${name}.dc.html`), html);
  console.log('wrote', `${name}.dc.html`, html.length, 'bytes');
}
