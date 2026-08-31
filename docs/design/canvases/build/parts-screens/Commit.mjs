import { frame, toolbar, sidebar, statusbar, grid, DEMO_ROWS, diffHeader, diffBody, dock, splitH, splitV, icon, PAGE_BG } from '../screens.mjs';

const f = (s, g, p, m) => `<div class="row multi ${s}" style="padding-left: 8px;"><span class="glyph ${g}">${g}</span><span class="grow mono" style="font-size: 12px;">${p}</span><span class="meta">${m}</span></div>`;

function files() {
  return `<div style="width: 320px; flex: none; display: flex; flex-direction: column; background: var(--bg-panel); border-right: 1px solid var(--border);">
    <div class="panel-header" style="flex: none;">${icon('file', 14)}<span class="grow">Unstaged</span><span class="badge">4</span><span class="btn secondary sm" style="height: 20px; font-size: 11px;">Stage all</span></div>
    ${f('is-selected is-focus', 'M', 'crates/git-core/src/log/graph.rs', '+42 −7')}
    ${f('is-selected', 'M', 'crates/git-core/src/lib.rs', '+3 −1')}
    ${f('', 'U', 'crates/git-core/src/log/cache.rs', '')}
    ${f('', 'D', 'crates/git-core/src/old_walker.rs', '−120')}
    <div style="flex: 1; min-height: 40px;"></div>
    <div class="panel-header" style="flex: none; border-top: 1px solid var(--border);">${icon('check', 14)}<span class="grow">Staged</span><span class="badge">2</span><span class="btn secondary sm" style="height: 20px; font-size: 11px;">Unstage all</span></div>
    ${f('', 'A', 'crates/git-core/src/log/types.rs', '+61')}
    ${f('', 'R', 'src/log.rs → src/log/mod.rs', '')}
    <div style="flex: 1; min-height: 40px;"></div>
  </div>`;
}

function message() {
  return `<div style="width: 340px; flex: none; display: flex; flex-direction: column; background: var(--bg-panel); border-left: 1px solid var(--border);">
    <div class="panel-header" style="flex: none;">${icon('git-commit', 14)}<span class="grow">Commit message</span><span class="icon-btn">${icon('history', 14)}</span></div>
    <div style="padding: 12px; display: flex; flex-direction: column; gap: 10px; flex: 1;">
      <div style="display: flex; flex-direction: column; background: var(--bg-inset); border: 1px solid var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); border-radius: var(--radius-md); flex: 1; min-height: 0;">
        <div style="display: flex; align-items: center; height: 32px; padding: 0 10px; border-bottom: 1px solid var(--border); gap: 6px;"><span style="font-weight: 500;">Lane layout: eager dedupe of first parent</span><span class="caret"></span><div style="flex: 1;"></div><span class="xs faint">42/72</span></div>
        <div style="padding: 8px 10px; flex: 1;"><span class="ph faint sm">Body — what and why. Wrap at 72.</span></div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <span class="check"><span class="checkbox"></span>Amend last commit</span>
        <span class="check"><span class="checkbox"></span>Add Signed-off-by</span>
      </div>
      <div class="xs muted">Topher M. &lt;topher.m@gmail.com&gt; · will commit 2 staged files</div>
      <div style="display: flex; gap: 8px; margin-top: auto;">
        <span class="btn primary" style="flex: 1;">${icon('check', 14)}Commit</span>
        <span class="btn secondary">Commit &amp; Push</span>
      </div>
    </div>
  </div>`;
}

export function build(theme) {
  const body = `
  ${toolbar()}
  <div style="display: flex; flex: 1; min-height: 0;">
    ${sidebar()}
    ${splitH()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">
      ${grid(theme, DEMO_ROWS.slice(0, 6), { selected: 0, hover: -1, height: 24 + 6 * 26 })}
      ${splitV()}
      <div style="display: flex; flex: 1; min-height: 0;">
        ${files()}
        <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; background: var(--bg-panel);">
          ${diffHeader()}
          ${diffBody({ actions: true, selected: [0, 1] })}
          <div class="hunk" style="flex: none; background: var(--accent-soft); color: var(--fg); border-top: 1px solid var(--border);"><span class="grow">2 lines selected</span><span class="btn secondary" style="height: 20px;">Discard</span><span class="btn primary" style="height: 20px;">Stage 2 lines</span></div>
        </div>
        ${message()}
      </div>
    </div>
  </div>
  ${dock({ open: false })}
  ${statusbar({ right: '4 unstaged · 2 staged' })}`;
  return { body: frame(theme, body), bg: PAGE_BG[theme] };
}

export default () => build('light');
