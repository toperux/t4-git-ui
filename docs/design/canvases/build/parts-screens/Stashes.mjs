import { frame, tabstrip, toolbar, sidebar, statusbar, grid, DEMO_ROWS, stashDetails, changedFiles, diffHeader, diffBody, dock, splitH, splitV, icon, PAGE_BG } from '../screens.mjs';

// StashesDialog.tsx — a `full` Dialog holding the same three-panel Group as the details pane:
// controls + list (280) | the selected row's files (320) | its diff. The list opens with the
// working tree above the stashes: selected, the controls are the push form and the two right
// panels are the commit panel's own (FilesColumn / DiffColumn).
const field = (label, control, help = '') =>
  `<div class="field"><span class="field-label">${label}</span>${control}${help ? `<span class="field-help">${help}</span>` : ''}</div>`;
const check = (on, label) => `<span class="check"><span class="checkbox ${on ? 'is-checked' : ''}">${on ? icon('check', 12) : ''}</span>${label}</span>`;
const options = (untracked) => `<div style="display: flex; flex-direction: column; gap: var(--space-4);">${check(untracked, 'Include untracked files')}${check(false, 'Keep the index')}</div>`;

/** The working tree the form would stash — `useStashFiles`, untracked included. */
const FILES = [
  ['M', 'src/screens/RepoWindow/Sidebar.tsx'],
  ['M', 'src/screens/RepoWindow/dialogs/StashDialogs.tsx'],
  ['A', 'src/screens/RepoWindow/dialogs/StashDialogs.module.css'],
  ['R', 'docs/smoke/smoke-test-post-v1.md'],
  ['U', 'scratch/notes.md'],
];
const label = (n) => (n === 0 ? 'Stash' : n === 1 ? 'Stash 1 file' : `Stash ${n} files`);

/** `.dot` — 6px accent, on an entry `stash -u` took untracked files into. */
const entry = (sel, msg, when, untracked) =>
  `<div class="row ${sel ? 'is-selected' : ''}"><span class="tw"></span>${icon('archive', 14)}<span class="label">${msg}</span><span class="meta">${untracked ? '<span style="width: 6px; height: 6px; border-radius: 50%; background: var(--accent);" title="Includes untracked files"></span>' : ''}${when}</span></div>`;

/** The list's first row: the working tree, muted italic like the grid's own row. */
const wtRow = (sel) =>
  `<div class="row ${sel ? 'is-selected' : ''}"><span class="tw"></span><span class="icon" style="display: inline-flex; width: 14px; height: 14px; border-radius: 50%; border: 1.5px dashed currentColor; opacity: 0.8;"></span><span class="label" style="font-style: italic; ${sel ? '' : 'color: var(--fg-muted);'}">Working tree</span><span class="meta">${FILES.length} changes</span></div>`;

/** Above the list: the push form while the working tree is selected, the four entry buttons otherwise. */
function controls(wt) {
  if (!wt)
    return `<div style="display: flex; gap: var(--space-2); flex-wrap: wrap; padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border); flex: none;">
      <span class="btn secondary sm">Apply</span><span class="btn secondary sm">Pop</span><span class="btn danger sm">Drop…</span><span class="btn danger sm">Clear all…</span>
    </div>`;
  return `<div style="display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); border-bottom: 1px solid var(--border); flex: none;">
      ${field('Message', `<span class="input"><span class="ph">WIP on…</span></span>`, 'Shown in the Stashes list; git writes a default one when empty')}
      ${options(true)}
      <div style="display: flex; flex-direction: column; align-items: stretch; gap: var(--space-2);">
        <span class="mono" style="min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--fg-muted);">git stash push -u</span>
        <span class="btn primary" style="justify-content: center;">${label(FILES.length)}</span>
      </div>
    </div>`;
}

function side(wt) {
  return `<div style="width: 280px; flex: none; display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--bg-panel);">
    ${controls(wt)}
    <div class="tree scroll" style="flex: 1; min-height: 0; padding: var(--space-2) 0; overflow: hidden;">
      ${wtRow(wt)}
      ${entry(!wt, 'WIP on main: lane colors', '4h ago', true)}
      ${entry(false, 'On feature/lane-graph: octopus parents', 'Yesterday', false)}
      ${entry(false, 'WIP on main: index.lock retry', 'Aug 28', true)}
      ${entry(false, 'On hotfix-index-lock: porcelain v2', 'Aug 27', false)}
    </div>
  </div>`;
}

/** The middle panel while the working tree is selected: `FilesColumn`, the Changes view's own. */
const STATS = [[42, 7], [18, 4], [61, 0], [0, 0], [23, 0]];
const stats = (a, d) => `<span class="meta">${a ? `<span style="color: var(--success);">+${a}</span>` : ''}${d ? `<span style="color: var(--danger-text);">−${d}</span>` : ''}</span>`;
function wtFiles() {
  const head = `<div class="panel-header" style="flex: none;">${icon('file', 14)}<span class="grow">${FILES.length} files changed</span><span class="pill-tabs"><span class="pill-tab is-on">Changes</span><span class="pill-tab">Files</span></span><span class="icon-btn is-on">${icon('rows', 16)}</span><span class="icon-btn">${icon('folder', 16)}</span></div>`;
  const rows = FILES.map(([g, p], i) =>
    `<div class="row ${i === 0 ? 'is-selected' : ''}" style="padding-left: 8px;"><span class="glyph ${g}">${g}</span><span class="grow mono" style="font-size: 12px;">${p}</span>${stats(...STATS[i])}</div>`).join('');
  return `<div style="display: flex; flex-direction: column; width: 320px; flex: none; min-width: 0; background: var(--bg-panel); border-right: 1px solid var(--border); overflow: hidden;">${head}${rows}</div>`;
}

function stashesDialog(wt) {
  return `<div class="dialog full">
    <div class="dialog-title"><span class="grow">Stashes</span><span class="icon-btn">${icon('x', 16)}</span></div>
    <div class="dialog-body full" style="flex-direction: row;">
      ${side(wt)}
      ${splitH()}
      ${wt ? wtFiles() : changedFiles({ selected: 1, width: 320 })}
      ${splitH()}
      <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; background: var(--bg-panel);">
        ${diffHeader({ path: wt ? FILES[0][1] : 'crates/git-core/src/log/graph.rs', add: wt ? 42 : 12, del: wt ? 7 : 3 })}
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
  return { body: frame(theme, body, { scrim: stashesDialog(true), full: true }), bg: PAGE_BG[theme] };
}

export default () => build('light');
