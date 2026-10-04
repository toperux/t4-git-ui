import { frame, tabstrip, toolbar, sidebar, statusbar, grid, DEMO_ROWS, commitDetails, changedFiles, diffHeader, diffBody, dock, splitH, splitV, icon, PAGE_BG } from '../screens.mjs';

// SettingsDialog.tsx — a `wide` (560px) Dialog whose eight `.settings-section` groups, each a
// `.settings-head` then its Fields, are split across three tabs: General, Git, Diff & merge. Shown
// selected here, with a diff tool picked: its Path, Command and Save rows outgrow a 900px window, so
// the body scrolls (the Merge tool's Save row sits below the fold; drawn, not measured in the app).
const field = (label, control, help = '') =>
  `<div class="field"><span class="field-label">${label}</span>${control}${help ? `<span class="field-help">${help}</span>` : ''}</div>`;
const select = (val) => `<span class="input select"><span class="val">${val}</span>${icon('chevron-down', 14, 'chevron')}</span>`;
const input = (val, ph = false) => `<span class="input"><span class="${ph ? 'ph' : ''}">${val}</span></span>`;
/** SettingsDialog.module.css `.row`: the field stretches, the buttons keep their width. */
const inline = (...parts) => `<div style="display: flex; align-items: center; gap: var(--space-4);"><span style="flex: 1; min-width: 0; display: flex;">${parts[0]}</span>${parts.slice(1).join('')}</div>`;
const locate = `<span class="btn secondary">${icon('folder-search', 14)}Locate…</span>`;
const check = (on, label) => `<span class="check"><span class="checkbox ${on ? 'is-checked' : ''}">${on ? icon('check', 12) : ''}</span>${label}</span>`;
const sec = (head, body) => `<div class="settings-section"><div class="settings-head">${head}</div>${body}</div>`;
/** ToolSection.tsx: the Save field under each tool — its help follows the pick, Apply sits right. */
const save = (help) => field('Save', inline('<span></span>', '<span class="btn secondary">Apply</span>'), help);
const CODE = 'C:\\Users\\me\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe';

function settingsDialog() {
  return `<div class="dialog wide" style="max-height: 100%;">
    <div class="dialog-title"><span class="grow">Settings</span><span class="icon-btn">${icon('x', 16)}</span></div>
    <div class="dialog-tabs"><span class="pill-tabs"><span class="pill-tab">General</span><span class="pill-tab">Git</span><span class="pill-tab is-on">Diff &amp; merge</span></span></div>
    <div class="dialog-body" style="flex: 1; min-height: 0;">
      ${sec('Diff', `${field('Context lines', '<span class="input" style="width: 96px;"><span>3</span></span>',
        'Lines of unchanged context around each hunk (0–99).')}
        <div style="display: flex; flex-direction: column; gap: var(--space-4);">${check(false, 'Ignore whitespace by default')}</div>`)}
      ${sec('Diff tool', `${field('Tool', select('VS Code'), 'Opens a file’s two sides in the tool you pick here.')}
        ${field('Path', inline(input(CODE), locate, '<span class="btn secondary">Suggest</span>'),
          'Found on this machine.')}
        ${field('Command',
          `<span class="input"><span class="mono" style="font-size: var(--text-xs); min-width: 0; ` +
            `overflow: hidden; text-overflow: ellipsis;">"${CODE}" --wait --diff "$LOCAL" "$REMOTE"</span></span>`,
          '$LOCAL and $REMOTE are filled in when it runs. Split on whitespace and double quotes — no shell.')}
        ${save('Saved to ~/.gitconfig as diff.guitool / difftool.vscode.*')}`)}
      ${sec('Merge tool', `${field('Tool', select('None'), 'Opens a conflict’s three sides in the tool you pick here.')}
        ${save('Clears merge.tool and merge.guitool in ~/.gitconfig.')}`)}
    </div>
    <div class="dialog-foot"><span class="grow"></span><span class="btn primary">Close</span></div>
  </div>`;
}

/** S4: only the Diff & merge tab is drawn; a canvas note, not app UI. */
const note =
  `<div style="position: absolute; left: 24px; bottom: 64px; padding: 4px 8px; border-radius: var(--radius-sm); ` +
  `background: var(--bg-elevated); color: var(--fg-muted); font-size: var(--text-xs);">` +
  `Canvas note: the General and Git tabs aren’t drawn.</div>`;

export function build(theme) {
  const body = `
  ${tabstrip()}
  ${toolbar({ update: 'Update', theme })}
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
  return { body: frame(theme, body, { scrim: settingsDialog() + note }), bg: PAGE_BG[theme] };
}

export default () => build('light');
