import { frame, tabstrip, toolbar, sidebar, statusbar, grid, DEMO_ROWS, commitDetails, changedFiles, fileContent, dock, splitH, splitV, icon, PAGE_BG } from '../screens.mjs';

// The Files tab: ChangedFileList switched to `files` (its own filter row), and FileContent instead of
// the DiffViewer — one gutter, a 180px blame gutter, and the blame hunk's own context menu.
const item = (ic, label, dis = false) =>
  `<div class="menu-item ${dis ? 'is-disabled' : ''}">${icon(ic, 16)}<span class="grow">${label}</span></div>`;

/** ContextMenu (`.menu.fixed`): grows to its longest item, 220–320px. */
function blameMenu() {
  return `<div class="menu fixed" style="position: absolute; left: 690px; top: 470px;">
    ${item('git-commit', 'Select in graph')}
    ${item('corner-up-left', 'Blame parent')}
    ${item('history', 'History of this file')}
    ${item('copy', 'Copy SHA')}
  </div>`;
}

export function build(theme) {
  const body = `
  ${tabstrip()}
  ${toolbar({ history: 'graph.rs' })}
  <div style="display: flex; flex: 1; min-height: 0;">
    ${sidebar({ compact: true })}
    ${splitH()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">
      ${grid(theme, DEMO_ROWS.slice(0, 7), { selected: 1, hover: -1, height: 24 + 7 * 26 })}
      ${splitV()}
      <div style="display: flex; flex: 1; min-height: 0; position: relative;">
        ${commitDetails()}
        ${splitH()}
        ${changedFiles({ selected: 0, tab: 'files', flat: false, width: 320 })}
        ${splitH()}
        ${fileContent({ blame: true })}
        ${blameMenu()}
      </div>
    </div>
  </div>
  ${dock({ open: false })}
  ${statusbar({ counts: '4 unstaged · 2 staged' })}`;
  return { body: frame(theme, body), bg: PAGE_BG[theme] };
}

export default () => build('light');
