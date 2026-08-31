import { frame, toolbar, sidebar, statusbar, grid, DEMO_ROWS, commitDetails, changedFiles, diffHeader, diffBody, dock, splitH, splitV, PAGE_BG } from '../screens.mjs';

export function build(theme) {
  const body = `
  ${toolbar()}
  <div style="display: flex; flex: 1; min-height: 0;">
    ${sidebar()}
    ${splitH()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">
      ${grid(theme, DEMO_ROWS, { selected: 1, hover: 4, height: 24 + 14 * 26 })}
      ${splitV(true)}
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
  ${dock({ open: false })}
  ${statusbar()}`;
  return { body: frame(theme, body), bg: PAGE_BG[theme] };
}

export default () => build('light');
