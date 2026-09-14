import { frame, tabstrip, toolbar, sidebar, statusbar, grid, DEMO_ROWS, commitDetails, changedFiles, diffHeader, diffBody, dock, splitH, splitV, icon, PAGE_BG } from '../screens.mjs';

// RebaseInteractiveDialog.tsx — git writes the todo, the dialog edits it. Row anatomy:
// a 104px action Select (spelled out, read-only, on a merge line) · short oid · subject · ↑ / ↓.
const ACTION = 'width: 104px; min-width: 104px; flex: none;';
const SHORT = 'flex: none; font-family: var(--font-mono); font-size: var(--text-xs); color: var(--fg-muted);';
const SUBJ = 'flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
const ROW = 'display: flex; align-items: center; gap: var(--space-4); padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm);';

const arrows = (up = true, down = true) =>
  `<span class="icon-btn ${up ? '' : 'is-disabled'}">${icon('arrow-up', 14)}</span><span class="icon-btn ${down ? '' : 'is-disabled'}">${icon('arrow-down', 14)}</span>`;
const select = (val) => `<span class="input select" style="${ACTION}"><span class="val">${val}</span>${icon('chevron-down', 14, 'chevron')}</span>`;

const row = (active, action, short, subject, up, down) =>
  `<div style="${ROW} ${active ? 'background: var(--bg-selected);' : ''}">${select(action)}<span style="${SHORT}">${short}</span><span style="${SUBJ}">${subject}</span>${arrows(up, down)}</div>`;
/** A merge line is replayed as it stands: the action column spells it out instead of offering a Select. */
const mergeRow = (subject) =>
  `<div style="${ROW}"><span style="width: 104px; flex: none; font-size: var(--text-xs); color: var(--fg-muted);">merge</span><span style="${SUBJ}">${subject}</span></div>`;

function rebaseDialog() {
  return `<div class="dialog wide" style="max-height: 100%;">
    <div class="dialog-title"><span class="grow">Rebase main onto origin/main</span><span class="icon-btn">${icon('x', 16)}</span></div>
    <div class="dialog-body">
      <div class="scroll" style="max-height: 450px; overflow: hidden; padding: var(--space-2); background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-md);">
        ${row(false, 'pick', 'a1b2c3d', 'Dedupe lanes when parent already expected', false, true)}
        ${row(true, 'reword', '9f8e7d6', 'Emit MergeInto lines for octopus parents', true, true)}
        ${row(false, 'squash', '5c4b3a2', 'Cache log pages by generation', true, true)}
        ${row(false, 'fixup', '1e2d3c4', 'Lane layout: eager dedupe of first parent', true, true)}
        ${mergeRow('Merge branch ‘feature/lane-graph’ into main')}
        ${row(false, 'edit', '3b2a1f0', 'Start lane graph module', true, true)}
        ${row(false, 'drop', 'c4d5e6f', 'Refs: label map with synced remote rule', true, false)}
      </div>
      <textarea class="selectable" style="min-height: 96px; padding: var(--space-3) var(--space-4); background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-md); color: var(--fg); font: inherit; font-size: var(--text-sm); line-height: var(--lh-sm); resize: vertical;">Emit MergeInto lines for octopus parents

Cache log pages by generation</textarea>
      <p style="font-size: var(--text-sm); line-height: var(--lh-sm); margin: 0;">1 merge commit in this range</p>
      <div style="display: flex; gap: var(--space-7);">
        <label style="display: flex; align-items: center; gap: var(--space-3); font-size: var(--text-sm);"><input type="radio" checked>Keep merges</label>
        <label style="display: flex; align-items: center; gap: var(--space-3); font-size: var(--text-sm);"><input type="radio">Flatten</label>
      </div>
      <div style="display: flex; flex-direction: column; gap: var(--space-4);">
        <span class="check"><span class="checkbox"></span>Update branches that point into this range (--update-refs)</span>
      </div>
    </div>
    <div class="dialog-foot">
      <span class="preview">Runs <code>git rebase -i --rebase-merges origin/main</code></span>
      <span class="grow"></span>
      <span style="flex: none; white-space: nowrap; font-size: var(--text-xs); color: var(--danger-text);">c4d5e6f needs a message</span>
      <span class="btn secondary">Cancel</span>
      <span class="btn primary is-disabled">Rebase</span>
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
  ${dock({ open: false })}
  ${statusbar({ counts: '4 unstaged · 2 staged' })}`;
  return { body: frame(theme, body, { scrim: rebaseDialog() }), bg: PAGE_BG[theme] };
}

export default () => build('light');
