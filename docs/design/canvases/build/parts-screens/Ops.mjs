import { frame, tabstrip, toolbar, sidebar, statusbar, grid, DEMO_ROWS, commitDetails, changedFiles, diffHeader, diffBody, dock, splitH, splitV, icon, PAGE_BG } from '../screens.mjs';

/** Dialog.tsx: title 44 · body pad 16 gap 12 · footer with `Runs <code>git …</code>` on the left. */
function mergeDialog() {
  return `<div class="dialog">
    <div class="dialog-title"><span class="grow">Merge into main</span><span class="icon-btn">${icon('x', 16)}</span></div>
    <div class="dialog-body">
      <div class="field"><span class="field-label">Branch to merge</span><span class="input select is-focus"><span class="val" style="display: inline-flex; align-items: center; gap: 6px;">${icon('git-branch', 14)}feature/lane-graph</span>${icon('chevron-down', 14, 'chevron')}</span><span class="field-help">3 commits ahead of main · no conflicts detected</span></div>
      <div class="field"><span class="field-label">Strategy</span>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <span class="check"><span class="checkbox is-checked">${icon('check', 12)}</span>Fast-forward when possible</span>
          <span class="check"><span class="checkbox"></span>Always create a merge commit (--no-ff)</span>
          <span class="check"><span class="checkbox"></span>Squash into one commit</span>
        </div>
      </div>
      <div class="field"><span class="field-label">Commit message</span><span class="input"><span>Merge branch ‘feature/lane-graph’ into main</span></span></div>
    </div>
    <div class="dialog-foot"><span class="preview">Runs <code>git merge --ff feature/lane-graph</code></span><span class="grow"></span><span class="btn secondary">Cancel</span><span class="btn primary">Merge</span></div>
  </div>`;
}

export function build(theme) {
  const body = `
  ${tabstrip()}
  ${toolbar()}
  <div style="display: flex; flex: 1; min-height: 0;">
    ${sidebar({ compact: true })}
    ${splitH()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">
      ${grid(theme, DEMO_ROWS.slice(0, 9), { selected: 1, hover: -1, height: 24 + 9 * 26 })}
      ${splitV()}
      <div style="display: flex; flex: 1; min-height: 0;">
        ${commitDetails()}
        ${splitH()}
        ${changedFiles({ selected: 0, width: 320 })}
        ${splitH()}
        <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; background: var(--bg-panel);">
          ${diffHeader()}
          ${diffBody()}
        </div>
      </div>
    </div>
  </div>
  ${dock({ open: true })}
  ${statusbar({ busy: 'Pushing to origin…', counts: '4 unstaged · 2 staged' })}`;
  return { body: frame(theme, body, { scrim: mergeDialog() }), bg: PAGE_BG[theme] };
}

export default () => build('light');
