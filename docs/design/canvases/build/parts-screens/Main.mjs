import { frame, tabstrip, toolbar, sidebar, statusbar, grid, DEMO_ROWS, SKELETON, commitDetails, changedFiles, diffHeader, diffBody, dock, splitH, splitV, PAGE_BG } from '../screens.mjs';

// The last page has not arrived yet: two skeleton rows keep their slots (RevisionGrid `.skeleton`).
const ROWS = [...DEMO_ROWS, SKELETON];

export function build(theme) {
  const body = `
  ${tabstrip()}
  ${toolbar({ history: 'graph.rs', update: 'Update' })}
  <div style="display: flex; flex: 1; min-height: 0;">
    ${sidebar({ full: true })}
    ${splitH()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">
      ${grid(theme, ROWS, { selected: 1, hover: 4, height: 24 + ROWS.length * 26 })}
      ${splitV(true)}
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
  return { body: frame(theme, body), bg: PAGE_BG[theme] };
}

export default () => build('light');
