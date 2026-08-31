import { frame, toolbar, sidebar, statusbar, grid, DEMO_ROWS, commitDetails, changedFiles, diffHeader, diffBody, dock, splitH, splitV, icon, PAGE_BG } from '../screens.mjs';

function mergeDialog() {
  return `<div class="dialog">
    <div class="dialog-title"><span class="grow">Merge into main</span><span class="icon-btn">${icon('x')}</span></div>
    <div class="dialog-body">
      <div class="field"><span class="field-label">Branch to merge</span><span class="input select is-focus"><span style="display: inline-flex; align-items: center; gap: 6px;">${icon('git-branch', 14)}feature/lane-graph</span>${icon('chevron-down', 14)}</span><span class="field-help">3 commits ahead of main · no conflicts detected</span></div>
      <div class="field"><span class="field-label">Strategy</span>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <span class="check"><span class="checkbox is-checked">${icon('check', 12)}</span>Fast-forward when possible</span>
          <span class="check"><span class="checkbox"></span>Always create a merge commit (--no-ff)</span>
          <span class="check"><span class="checkbox"></span>Squash into one commit</span>
        </div>
      </div>
      <div class="field"><span class="field-label">Commit message</span><span class="input"><span>Merge branch ‘feature/lane-graph’ into main</span></span></div>
    </div>
    <div class="dialog-foot"><span class="xs muted">Runs <span class="mono" style="font-size: 11px;">git merge --ff feature/lane-graph</span></span><span class="grow"></span><span class="btn secondary">Cancel</span><span class="btn primary">Merge</span></div>
  </div>`;
}

export function build(theme) {
  const body = `
  ${toolbar()}
  <div style="display: flex; flex: 1; min-height: 0;">
    ${sidebar()}
    ${splitH()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">
      ${grid(theme, DEMO_ROWS, { selected: 1, hover: -1, height: 24 + 12 * 26 })}
      ${splitV()}
      <div style="display: flex; flex: 1; min-height: 0;">
        ${commitDetails()}
        <div style="width: 320px; flex: none; display: flex;">${changedFiles({ selected: 0 })}</div>
        <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; background: var(--bg-panel);">
          ${diffHeader()}
          ${diffBody()}
        </div>
      </div>
    </div>
  </div>
  ${dock({ open: true })}
  ${statusbar({ busy: 'Pushing to origin…' })}`;
  return { body: frame(theme, body, { scrim: mergeDialog() }), bg: PAGE_BG[theme] };
}

export default () => build('light');
