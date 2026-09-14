import { frame, tabstrip, toolbar, sidebar, statusbar, grid, DEMO_ROWS, commitDetails, changedFiles, diffHeader, diffBody, dock, splitH, splitV, icon, PAGE_BG } from '../screens.mjs';

// SettingsDialog.tsx — a `wide` (560px) Dialog of `.settings-section` groups, each a `.settings-head`
// then its Fields. The body scrolls: eight sections never fit a 900px window at once.
const field = (label, control, help = '') =>
  `<div class="field"><span class="field-label">${label}</span>${control}${help ? `<span class="field-help">${help}</span>` : ''}</div>`;
const select = (val) => `<span class="input select"><span class="val">${val}</span>${icon('chevron-down', 14, 'chevron')}</span>`;
const input = (val, ph = false) => `<span class="input"><span class="${ph ? 'ph' : ''}">${val}</span></span>`;
/** SettingsDialog.module.css `.row`: the field stretches, the buttons keep their width. */
const inline = (...parts) => `<div style="display: flex; align-items: center; gap: var(--space-4);"><span style="flex: 1; min-width: 0; display: flex;">${parts[0]}</span>${parts.slice(1).join('')}</div>`;
const locate = `<span class="btn secondary">${icon('folder-search', 14)}Locate…</span>`;
const check = (on, label) => `<span class="check"><span class="checkbox ${on ? 'is-checked' : ''}">${on ? icon('check', 12) : ''}</span>${label}</span>`;
const sec = (head, body) => `<div class="settings-section"><div class="settings-head">${head}</div>${body}</div>`;

function settingsDialog() {
  return `<div class="dialog wide" style="max-height: 100%;">
    <div class="dialog-title"><span class="grow">Settings</span><span class="icon-btn">${icon('x', 16)}</span></div>
    <div class="dialog-body" style="flex: 1; min-height: 0; overflow: hidden; position: relative;">
      ${sec('Git executable', field('Path', inline(input('C:\\Program Files\\Git\\cmd\\git.exe'), locate, '<span class="btn secondary">Apply</span>'), 'git version 2.55.0.windows.1'))}
      ${sec('Theme', field('Appearance', select('Follow system')))}
      ${sec('Sidebar', field('Sidebar folders', inline(select('Collapsed when more than N refs'), '<span class="input" style="width: 96px;"><span>12</span></span>'), '“More than N” counts the refs under a folder at any depth (1–200).'))}
      ${sec('Diff', `${field('Context lines', '<span class="input" style="width: 96px;"><span>3</span></span>', 'Lines of unchanged context around each hunk (0–100).')}
        <div style="display: flex; flex-direction: column; gap: var(--space-4);">${check(false, 'Ignore whitespace by default')}</div>`)}
      ${sec('Diff tool', `${field('Tool', select('VS Code'), 'Opens a file’s two sides in the tool you pick here.')}
        ${field('Path', inline(input('C:\\Users\\topher\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe'), locate, '<span class="btn secondary">Suggest</span>'), 'Found on this machine. Runs as <span class="mono" style="font-size: var(--text-xs);">"Code.exe" --wait --diff "$LOCAL" "$REMOTE"</span>')}`)}
      ${sec('Merge tool', field('Tool', select('None'), 'Opens a conflict’s three sides in the tool you pick here.'))}
      ${sec('Signing', `${field('Format', select('OpenPGP (gpg)'), 'What signs a commit or tag. Saved in the global git config.')}
        ${field('Signing key', input('Not set', true), 'user.signingkey — a gpg key id, or the path to an SSH public key. Empty to clear.')}
        <div style="display: flex; flex-direction: column; gap: var(--space-4);">${check(true, 'Sign commits')}${check(false, 'Sign annotated tags')}</div>`)}
      ${sec('Updates', `<div style="display: flex; flex-direction: column; gap: var(--space-4);">${check(true, 'Check for updates on launch')}</div>
        ${field('Version', `<div style="display: flex; align-items: center; gap: var(--space-4);"><span class="btn secondary">Check now</span><span class="btn ghost">What's new</span><span class="btn primary">Update to 0.9.1…</span></div>`, 'Version 0.9.1 is available')}`)}
      <div style="position: absolute; right: 3px; top: 8px; width: 4px; height: 220px; border-radius: 999px; background: var(--scrollbar-thumb);"></div>
    </div>
    <div class="dialog-foot"><span class="grow"></span><span class="btn primary">Close</span></div>
  </div>`;
}

export function build(theme) {
  const body = `
  ${tabstrip()}
  ${toolbar({ update: 'Update' })}
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
  return { body: frame(theme, body, { scrim: settingsDialog() }), bg: PAGE_BG[theme] };
}

export default () => build('light');
