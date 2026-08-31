import { icon, twoUp, shell, section, swatch, grid, row, labeled, tokens } from '../lib.mjs';

const sw = (n, t, o) => swatch(n, t, o);

function surfaces(t) {
  return section('Surfaces', 'four layers + interaction tints',
    grid(4, ['bg-app', 'bg-panel', 'bg-elevated', 'bg-inset', 'bg-hover', 'bg-active', 'bg-selected', 'bg-selected-unfocused', 'scrim'].map((n) => sw(n, t))));
}
function text(t) {
  return section('Text', 'three levels; never lighter than faint for readable copy',
    grid(4, [
      `<div class="swatch"><div class="swatch-box" style="background: var(--bg-panel); color: var(--fg); display: flex; align-items: center; padding: 0 10px; font-weight: 500;">Primary copy</div><div class="swatch-name">--fg</div><div class="swatch-val">${tokens[t].fg}</div></div>`,
      `<div class="swatch"><div class="swatch-box" style="background: var(--bg-panel); color: var(--fg-muted); display: flex; align-items: center; padding: 0 10px;">Secondary, metadata</div><div class="swatch-name">--fg-muted</div><div class="swatch-val">${tokens[t]['fg-muted']}</div></div>`,
      `<div class="swatch"><div class="swatch-box" style="background: var(--bg-panel); color: var(--fg-faint); display: flex; align-items: center; padding: 0 10px;">Placeholder, hints</div><div class="swatch-name">--fg-faint</div><div class="swatch-val">${tokens[t]['fg-faint']}</div></div>`,
      `<div class="swatch"><div class="swatch-box" style="background: var(--accent); color: var(--fg-on-accent); display: flex; align-items: center; padding: 0 10px; font-weight: 500;">On accent</div><div class="swatch-name">--fg-on-accent</div><div class="swatch-val">${tokens[t]['fg-on-accent']}</div></div>`,
    ]));
}
function borders(t) {
  return section('Borders', 'hairlines everywhere; strong only on controls',
    grid(4, [sw('border', t), sw('border-strong', t)]));
}
function accent(t) {
  return section('Accent + semantic', 'one accent. semantic colors only for meaning, never decoration',
    grid(5, ['accent', 'accent-hover', 'accent-soft', 'danger', 'danger-soft', 'success', 'success-soft', 'warning', 'warning-soft'].map((n) => sw(n, t))));
}
function typography(t) {
  const scale = [
    ['2xl', '20 / 28 · 600', 'h1'], ['xl', '16 / 24 · 600', 'h2'], ['lg', '14 / 20 · 600', 'h3'],
    ['md', '13 / 18 · 400 — base UI', ''], ['sm', '12 / 16 · 400', 'sm'], ['xs', '11 / 16 · 400', 'xs'],
  ];
  return section('Typography', 'Inter (UI) + JetBrains Mono (code, hashes, paths). Hierarchy by weight, not size.',
    `<div style="display: flex; flex-direction: column; gap: 10px; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 8px; padding: 16px;">
      ${scale.map(([k, d, cls]) => `<div style="display: flex; align-items: baseline; gap: 16px;"><div class="swatch-val" style="width: 160px; flex: none;">--text-${k} · ${d}</div><div class="${cls}" style="font-size: var(--text-${k}); line-height: var(--lh-${k});">Merge branch 'feature/lane-graph' into main</div></div>`).join('')}
      <div style="display: flex; align-items: baseline; gap: 16px;"><div class="swatch-val" style="width: 160px; flex: none;">--font-mono · 12 / 18</div><div class="mono">a1b2c3d src/log/graph.rs +42 −7</div></div>
      <div style="display: flex; align-items: baseline; gap: 16px;"><div class="swatch-val" style="width: 160px; flex: none;">.label</div><div class="label">Local branches</div></div>
    </div>`);
}
function spacing() {
  const s = [2, 4, 6, 8, 12, 16, 20, 24, 32];
  return section('Spacing', '4px base; 2px and 6px exist for chip/glyph internals',
    row(s.map((px, i) => `<div style="display: flex; flex-direction: column; gap: 4px; align-items: center;"><div style="width: ${px}px; height: 24px; background: var(--accent); border-radius: 2px;"></div><div class="swatch-val">${px}</div></div>`), 20, 'align-items: flex-end;'));
}
function radii() {
  return section('Radii', 'sm: chips, glyphs · md: controls, rows · lg: cards, menus, dialogs',
    row([['sm', 3], ['md', 5], ['lg', 8], ['pill', 999]].map(([k, v]) => `<div style="display: flex; flex-direction: column; gap: 4px; align-items: center;"><div style="width: 56px; height: 40px; background: var(--bg-panel); border: 1px solid var(--border-strong); border-radius: var(--radius-${k});"></div><div class="swatch-val">--radius-${k} · ${v}</div></div>`), 20));
}
function shadows() {
  return section('Elevation', 'two levels; dialogs additionally sit on --scrim — emphasis by contrast, not brightness',
    row([
      `<div style="width: 200px; padding: 12px; background: var(--bg-elevated); border-radius: var(--radius-lg); box-shadow: var(--shadow-1);"><div class="sm" style="font-weight: 500;">--shadow-1</div><div class="xs muted">menus, tooltips, popovers</div></div>`,
      `<div style="width: 200px; padding: 12px; background: var(--bg-elevated); border-radius: var(--radius-lg); box-shadow: var(--shadow-2);"><div class="sm" style="font-weight: 500;">--shadow-2</div><div class="xs muted">dialogs</div></div>`,
    ], 32));
}
function focus() {
  return section('Focus', '2px offset ring; inputs use a soft 3px halo instead. Only on keyboard focus (:focus-visible).',
    row([
      `<div class="btn primary is-focus">Commit</div>`,
      `<div class="btn secondary is-focus">Cancel</div>`,
      `<div class="icon-btn is-focus">${icon('refresh')}</div>`,
      `<div class="input is-focus" style="width: 200px;">${icon('search', 14)}<span>graph</span><span class="caret"></span></div>`,
      `<div class="list" style="width: 180px;"><div class="row is-selected is-focus"><span class="grow">main</span></div></div>`,
    ], 16));
}
function density() {
  const m = [['--row-h', 26, 'grid / list / tree rows'], ['--control-h', 28, 'buttons, inputs'], ['--control-h-sm', 24, 'icon buttons, chips row'], ['--section-h', 28, 'panel + sidebar headers'], ['--toolbar-h', 40, 'main toolbar'], ['--statusbar-h', 24, 'status bar']];
  return section('Density', 'fixed heights so virtualized lists and the graph line up',
    `<div style="display: flex; flex-direction: column; gap: 6px;">${m.map(([k, v, d]) => `<div style="display: flex; align-items: center; gap: 12px;"><div class="swatch-val" style="width: 130px;">${k} · ${v}</div><div style="width: 240px; height: ${v}px; background: var(--bg-panel); border: 1px solid var(--border-strong); border-radius: var(--radius-sm);"></div><div class="xs muted">${d}</div></div>`).join('')}</div>`);
}
function scrollbar() {
  return section('Scrollbar', 'overlay-style thin thumb, no track, no arrows',
    row([
      `<div class="sb-demo" style="width: 200px;"><div class="thumb"></div><div class="xs faint" style="padding: 10px;">default</div></div>`,
      `<div class="sb-demo" style="width: 200px;"><div class="thumb hover"></div><div class="xs faint" style="padding: 10px;">hover</div></div>`,
    ], 16));
}
function icons() {
  const names = ['git-branch', 'git-commit', 'git-merge', 'arrow-down', 'arrow-up', 'archive', 'search', 'refresh', 'folder', 'tag', 'cloud', 'history', 'file', 'check', 'x', 'plus', 'chevron-right', 'chevron-down', 'ellipsis', 'settings', 'alert', 'info'];
  return section('Icons', 'lucide · stroke 1.75 · 16px in rows, 18px in toolbar · color = --fg-muted unless active',
    `<div style="display: flex; flex-direction: column; gap: 12px;">
      <div style="display: flex; gap: 10px; flex-wrap: wrap; color: var(--fg-muted);">${names.map((n) => icon(n, 16)).join('')}</div>
      <div style="display: flex; gap: 12px; flex-wrap: wrap; color: var(--fg-muted);">${names.slice(0, 11).map((n) => icon(n, 18)).join('')}</div>
    </div>`);
}
function motion() {
  return section('Motion', '',
    `<div class="sm" style="display: flex; flex-direction: column; gap: 4px;">
      <div><span class="mono">--dur 120ms</span> <span class="muted">hover, press, selection, chip appear</span></div>
      <div><span class="mono">--dur-panel 150ms</span> <span class="muted">collapse/expand, dock show/hide, dialog fade+2px rise</span></div>
      <div><span class="mono">--ease cubic-bezier(.2,0,0,1)</span> <span class="muted">ease-out only; nothing bounces. Respect prefers-reduced-motion.</span></div>
    </div>`);
}

export default () => ({
  body: shell('Foundations', 'Tokens for t4-git-ui. Left = light, right = dark. Every value here is a CSS custom property in <span class="mono">src/theme/tokens.css</span>; components reference tokens, never raw colors.',
    twoUp((t) => [surfaces(t), text(t), borders(t), accent(t), typography(t), spacing(), radii(), shadows(), focus(), density(), scrollbar(), icons(), motion()].join(''))),
});
