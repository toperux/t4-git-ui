import { frame, tabstrip, toolbar, sidebar, statusbar, grid, DEMO_ROWS, diffHeader, diffBody, diffBar, dock, splitH, splitV, icon, PAGE_BG } from '../screens.mjs';

/** CommitPanel.module.css: `.row.multi`, hover Stage/Unstage action, tree indent guides. */
const guide = (d) => `background-image: repeating-linear-gradient(90deg, var(--border) 0 1px, transparent 1px var(--tree-indent)); background-repeat: no-repeat; background-size: calc(var(--tree-indent) * ${d}) 100%; background-position: calc(var(--space-4) + 8px) 0;`;
const stats = (a, d) => `<span class="meta">${a ? `<span style="color: var(--success);">+${a}</span>` : ''}${d ? `<span style="color: var(--danger-text);">−${d}</span>` : ''}</span>`;

const file = (s, d, g, p, add, del, action = '') =>
  `<div class="row multi ${s}" style="--d: ${d}; padding-left: calc(var(--space-4) + var(--tree-indent) * ${d}); padding-right: var(--space-4); ${guide(d)}"><span class="tw"></span><span class="glyph ${g}">${g}</span><span class="grow mono" style="font-size: 12px;">${p}</span>${stats(add, del)}${action}</div>`;
const folder = (d, name) =>
  `<div class="row folder" style="--d: ${d}; padding-left: calc(var(--space-4) + var(--tree-indent) * ${d}); ${guide(d)}"><span class="tw">${icon('chevron-down', 12)}</span>${icon('folder-open', 14)}<span class="label">${name}</span></div>`;
/** `.action` is opacity 0 until the row is hovered — only the hovered row shows it. */
const stage = `<span class="icon-btn" style="width: 24px; height: 24px; margin-right: -4px;">${icon('plus', 16)}</span>`;

function files() {
  return `<div style="width: 320px; flex: none; display: flex; flex-direction: column; background: var(--bg-panel); border-right: 1px solid var(--border); overflow: hidden;">
    <div class="panel-header" style="flex: none;">${icon('file', 14)}<span class="grow">Unstaged</span><span class="icon-btn">${icon('folder-tree', 16)}</span><span class="badge">4</span><span class="btn secondary sm" style="font-size: var(--text-xs);">Stage all</span></div>
    ${folder(0, 'crates / git-core / src')}
    ${folder(1, 'log')}
    ${file('is-selected anchor is-focus', 2, 'M', 'graph.rs', 42, 7)}
    ${file('is-selected', 2, 'U', 'cache.rs', 0, 0)}
    ${file('is-hover', 1, 'M', 'lib.rs', 3, 1, stage)}
    ${file('', 1, 'D', 'old_walker.rs', 0, 120)}
    <div style="flex: 1; min-height: 24px;"></div>
    <div class="panel-header" style="flex: none; border-top: 1px solid var(--border);">${icon('check', 14)}<span class="grow">Staged</span><span class="badge">2</span><span class="btn secondary sm" style="font-size: var(--text-xs);">Unstage all</span></div>
    ${folder(0, 'crates / git-core / src / log')}
    ${file('', 1, 'A', 'types.rs', 61, 0)}
    ${file('', 0, 'R', 'src/log.rs → src/log/mod.rs', 0, 0)}
    <div style="flex: 1; min-height: 24px;"></div>
  </div>`;
}

function message() {
  return `<div style="width: 340px; flex: none; display: flex; flex-direction: column; background: var(--bg-panel); border-left: 1px solid var(--border);">
    <div class="panel-header" style="flex: none;">${icon('git-commit', 14)}<span class="grow">Commit message</span><span class="icon-btn">${icon('maximize-2', 16)}</span><span class="icon-btn is-on">${icon('history', 16)}</span></div>
    <div style="padding: 12px; display: flex; flex-direction: column; gap: 10px; flex: 1; min-height: 0;">
      <!-- At rest the editor is a plain --bg-inset box: no border, no halo (CommitPanel.module.css .editor). -->
      <div style="display: flex; flex-direction: column; background: var(--bg-inset); border: 1px solid transparent; border-radius: var(--radius-md); flex: 1; min-height: 0;">
        <div style="display: flex; align-items: center; height: 32px; padding: 0 10px; border-bottom: 1px solid var(--border); gap: 6px;"><span style="flex: 1; min-width: 0; font-weight: 500;">Lane layout: eager dedupe of first parent</span><span class="xs muted" style="font-variant-numeric: tabular-nums;">42/72</span></div>
        <div style="padding: 8px 10px; flex: 1;"><span class="sm faint">Body — what and why. Wrap at 72.</span></div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <span class="check"><span class="checkbox"></span>Amend last commit</span>
        <span class="check"><span class="checkbox"></span>Add Signed-off-by</span>
        <span class="input select"><span class="val">Sign: as configured</span>${icon('chevron-down', 14, 'chevron')}</span>
      </div>
      <div class="xs muted" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Topher M. &lt;topher.m@gmail.com&gt; · will commit 2 staged files</div>
      <div style="display: flex; gap: 8px; margin-top: auto;">
        <span class="btn primary" style="flex: 1;">${icon('check', 14)}Commit</span>
        <span class="btn secondary">Commit &amp; Push</span>
      </div>
    </div>
  </div>`;
}

export function build(theme) {
  const body = `
  ${tabstrip()}
  ${toolbar({ commit: 6 })}
  <div style="display: flex; flex: 1; min-height: 0;">
    ${sidebar({ compact: true })}
    ${splitH()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">
      ${grid(theme, DEMO_ROWS.slice(0, 6), { selected: 0, hover: -1, height: 24 + 6 * 26 })}
      ${splitV()}
      <div style="display: flex; flex: 1; min-height: 0;">
        ${files()}
        ${splitH()}
        <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; background: var(--bg-panel);">
          ${diffHeader({ staging: true })}
          ${diffBody({ actions: true, selected: [0, 1] })}
          ${diffBar(2, 'Stage')}
        </div>
        ${splitH()}
        ${message()}
      </div>
    </div>
  </div>
  ${dock({ open: false })}
  ${statusbar({ counts: '4 unstaged · 2 staged' })}`;
  return { body: frame(theme, body), bg: PAGE_BG[theme] };
}

export default () => build('light');
