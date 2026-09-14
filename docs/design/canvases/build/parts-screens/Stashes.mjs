import { frame, tabstrip, toolbar, sidebar, statusbar, grid, DEMO_ROWS, stashDetails, changedFiles, diffHeader, diffBody, dock, splitH, splitV, icon, PAGE_BG } from '../screens.mjs';

// StashesDialog.tsx — a `full` Dialog holding the same three-panel Group as the details pane:
// push form + action bar + entry list (280) | changed files (320) | the diff.
const field = (label, control, help = '') =>
  `<div class="field"><span class="field-label">${label}</span>${control}${help ? `<span class="field-help">${help}</span>` : ''}</div>`;
const check = (on, label) => `<span class="check"><span class="checkbox ${on ? 'is-checked' : ''}">${on ? icon('check', 12) : ''}</span>${label}</span>`;

/** `.dot` — 6px accent, on an entry `stash -u` took untracked files into. */
const entry = (sel, msg, when, untracked) =>
  `<div class="row ${sel ? 'is-selected' : ''}"><span class="tw"></span>${icon('archive', 14)}<span class="label">${msg}</span><span class="meta">${untracked ? '<span style="width: 6px; height: 6px; border-radius: 50%; background: var(--accent);" title="Includes untracked files"></span>' : ''}${when}</span></div>`;

function side() {
  return `<div style="width: 280px; flex: none; display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--bg-panel);">
    <div style="display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); border-bottom: 1px solid var(--border); flex: none;">
      ${field('Message', `<span class="input"><span class="ph">WIP on…</span></span>`, 'Shown in the Stashes list; git writes a default one when empty')}
      <div style="display: flex; flex-direction: column; gap: var(--space-4);">${check(true, 'Include untracked files')}${check(false, 'Keep the index')}</div>
      <div style="display: flex; align-items: center; gap: var(--space-3);">
        <span class="mono" style="flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--fg-muted);">git stash push -u</span>
        <span class="btn primary sm">Stash</span>
      </div>
    </div>
    <div style="display: flex; gap: var(--space-2); flex-wrap: wrap; padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border); flex: none;">
      <span class="btn secondary sm">Apply</span><span class="btn secondary sm">Pop</span><span class="btn danger sm">Drop…</span><span class="btn danger sm">Clear all…</span>
    </div>
    <div class="tree scroll" style="flex: 1; min-height: 0; padding: var(--space-2) 0; overflow: hidden;">
      ${entry(true, 'WIP on main: lane colors', '4h ago', true)}
      ${entry(false, 'On feature/lane-graph: octopus parents', 'Yesterday', false)}
      ${entry(false, 'WIP on main: index.lock retry', 'Aug 28', true)}
      ${entry(false, 'On hotfix-index-lock: porcelain v2', 'Aug 27', false)}
    </div>
  </div>`;
}

function stashesDialog() {
  return `<div class="dialog full">
    <div class="dialog-title"><span class="grow">Stashes</span><span class="icon-btn">${icon('x', 16)}</span></div>
    <div class="dialog-body full" style="flex-direction: row;">
      ${side()}
      ${splitH()}
      ${changedFiles({ selected: 1, width: 320 })}
      ${splitH()}
      <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; background: var(--bg-panel);">
        ${diffHeader({ path: 'crates/git-core/src/log/graph.rs', add: 12, del: 3 })}
        ${diffBody()}
      </div>
    </div>
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
      ${grid(theme, DEMO_ROWS.slice(0, 9), { selected: -1, hover: -1, height: 24 + 9 * 26 })}
      ${splitV()}
      <div style="display: flex; flex: 1; min-height: 0;">
        ${stashDetails()}
        ${splitH()}
        ${changedFiles({ selected: 1, width: 320 })}
        ${splitH()}
        <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; background: var(--bg-panel);">
          ${diffHeader({ path: 'crates/git-core/src/log/graph.rs', add: 12, del: 3 })}
          ${diffBody()}
        </div>
      </div>
    </div>
  </div>
  ${dock({ open: false })}
  ${statusbar({ counts: '4 unstaged · 0 staged' })}`;
  return { body: frame(theme, body, { scrim: stashesDialog(), full: true }), bg: PAGE_BG[theme] };
}

export default () => build('light');
