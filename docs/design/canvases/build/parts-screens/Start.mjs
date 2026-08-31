import { frame, icon, PAGE_BG } from '../screens.mjs';

const repo = (s, name, path, when, pinned = false) => `<div class="row ${s}" style="height: 44px; padding: 0 12px; gap: 12px;">
  ${icon('folder', 16, 'muted')}
  <div class="grow" style="display: flex; flex-direction: column; line-height: 16px;"><span style="font-weight: 500;">${name}</span><span class="xs muted" style="overflow: hidden; text-overflow: ellipsis;">${path}</span></div>
  <span class="meta">${when}</span>
  <span class="icon-btn ${pinned ? 'is-on' : ''}" style="width: 20px; height: 20px;">${icon('pin', 13)}</span>
</div>`;

const action = (ic, title, hint, kbd) => `<div class="row" style="height: 56px; padding: 0 14px; gap: 12px; border: 1px solid var(--border-strong); border-radius: var(--radius-md); background: var(--bg-panel);">
  ${icon(ic, 18, 'muted')}
  <div class="grow" style="display: flex; flex-direction: column; line-height: 16px;"><span style="font-weight: 500;">${title}</span><span class="xs muted">${hint}</span></div>
  <span class="kbd">${kbd}</span>
</div>`;

export function build(theme) {
  const body = `
  <div style="display: flex; align-items: center; height: 40px; padding: 0 16px; gap: 8px; border-bottom: 1px solid var(--border); flex: none;">
    ${icon('git-branch', 16, 'muted')}<span style="font-weight: 600;">t4 git ui</span><span class="xs muted">0.1.0</span>
    <div style="flex: 1;"></div>
    <span class="icon-btn">${icon('settings')}</span>
  </div>
  <div style="flex: 1; display: flex; align-items: center; justify-content: center;">
    <div style="width: 960px; display: grid; grid-template-columns: 560px 1fr; gap: 40px; align-items: start;">
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; align-items: center; gap: 8px;"><span class="label">Recent</span><div style="flex: 1;"></div><span class="input" style="width: 220px; height: 26px;">${icon('search', 14)}<span class="ph">Filter repositories</span></span></div>
        <div class="list">
          ${repo('is-selected', 't4-git-ui', 'F:\\src\\_ pet projects\\t4-git-ui', '2h ago', true)}
          ${repo('', 'git', 'C:\\Users\\toper\\src\\git', 'Yesterday', true)}
          ${repo('is-hover', 'rust', 'C:\\Users\\toper\\src\\rust', 'Aug 28')}
          ${repo('', 'GitExtensions', 'C:\\Users\\toper\\src\\gitextensions', 'Aug 22')}
          ${repo('', 'dotfiles', 'C:\\Users\\toper\\dotfiles', 'Aug 12')}
        </div>
        <div class="xs faint">Enter opens · Del removes from list · ${icon('pin', 11)} keeps at top</div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <span class="label">Start</span>
        ${action('folder', 'Open repository…', 'Pick a folder containing a .git', 'Ctrl+O')}
        ${action('cloud', 'Clone…', 'From a URL, with progress', 'Ctrl+Shift+O')}
        ${action('plus', 'Initialize…', 'Create a new repository in a folder', 'Ctrl+N')}
      </div>
    </div>
  </div>
  <div class="statusbar" style="flex: none;"><span class="item">${icon('check-circle', 12)}git 2.55.0 · C:\\Program Files\\Git\\cmd\\git.exe</span><span class="grow"></span><span class="item">5 recent</span></div>`;
  return { body: frame(theme, body), bg: PAGE_BG[theme] };
}

export default () => build('light');
