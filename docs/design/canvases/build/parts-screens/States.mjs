import { toolbar, sidebar, statusbar, grid, gridHeader, DEMO_ROWS, dock, splitH, icon, PAGE_BG } from '../screens.mjs';

const MW = 700, MH = 390;

function mini(theme, title, note, inner) {
  return `<div style="display: flex; flex-direction: column; gap: 6px;">
    <div style="display: flex; align-items: baseline; gap: 8px;"><span class="h3">${title}</span><span class="xs muted">${note}</span></div>
    <div class="t-${theme} sheet" style="width: ${MW}px; height: ${MH}px; display: flex; flex-direction: column; overflow: hidden; position: relative; border-radius: 6px; box-shadow: 0 0 0 1px var(--border);">${inner}</div>
  </div>`;
}

const banner = (kind, ic, text, btns) => `<div class="banner ${kind}" style="flex: none;">${icon(ic, 14)}<span class="grow">${text}</span>${btns}</div>`;

function emptyRepo(theme) {
  return `${toolbar({ pull: 0, push: 0, commit: 0, filter: 'main' })}
  <div style="display: flex; flex: 1; min-height: 0;">
    ${sidebar({ width: 200, empty: true })}${splitH()}
    <div style="display: flex; flex-direction: column; flex: 1; background: var(--bg-panel);">
      ${gridHeader()}
      <div class="empty" style="flex: 1;">${icon('git-commit', 24)}<div class="t">No commits yet</div><div class="sm">Stage files and create the first commit on <span class="mono" style="font-size: 12px;">main</span></div><span class="btn primary" style="margin-top: 6px;">${icon('git-commit', 14)}Open commit panel</span></div>
    </div>
  </div>
  ${statusbar({ branch: 'main (unborn)', ab: false, right: '3 untracked' })}`;
}

function detached(theme) {
  const rows = DEMO_ROWS.slice(1, 8).map((r, i) => (i === 0 ? { ...r, chips: 'detached', subj: r.subj } : r));
  return `${toolbar({ pull: 0, push: 0 })}
  ${banner('warning', 'alert', 'Detached HEAD at <span class="mono" style="font-size: 11px;">a1b2c3d</span> — new commits won’t belong to any branch', `<span class="btn secondary sm">Checkout main</span><span class="btn primary sm">Create branch…</span>`)}
  <div style="display: flex; flex: 1; min-height: 0;">
    ${sidebar({ width: 200, detached: true })}${splitH()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">${grid(theme, rows, { selected: 0, hover: -1 })}</div>
  </div>
  ${statusbar({ detached: true, right: 'Clean' })}`;
}

function rebasing(theme) {
  const f = (g, p, m) => `<div class="row" style="padding-left: 8px;"><span class="glyph ${g}">${g}</span><span class="grow mono" style="font-size: 12px;">${p}</span><span class="meta">${m}</span></div>`;
  return `${toolbar({ pull: 0, push: 0, commit: 3 })}
  ${banner('warning', 'git-merge', 'Rebase in progress — 2 of 5 commits applied onto <span class="mono" style="font-size: 11px;">main</span>', `<span class="btn secondary sm">Abort</span><span class="btn primary sm">Continue</span>`)}
  ${banner('danger', 'alert', '3 files have conflicts — resolve, then stage them', `<span class="btn secondary sm">Open in editor</span>`)}
  <div style="display: flex; flex: 1; min-height: 0;">
    ${sidebar({ width: 200 })}${splitH()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; background: var(--bg-panel);">
      <div class="panel-header" style="flex: none;">${icon('file', 14)}<span class="grow">Conflicts</span><span class="badge danger">3</span></div>
      ${f('C', 'crates/git-core/src/log/graph.rs', 'both modified')}
      ${f('C', 'Cargo.lock', 'both modified')}
      ${f('C', 'src/theme/tokens.css', 'deleted by them')}
      <div class="panel-header" style="flex: none; border-top: 1px solid var(--border);">${icon('check', 14)}<span class="grow">Resolved</span><span class="badge">1</span></div>
      ${f('M', 'crates/git-core/src/lib.rs', 'staged')}
    </div>
  </div>
  ${statusbar({ branch: 'feature/lane-graph', ab: false, right: 'Rebasing 2/5' })}`;
}

function loading(theme) {
  const rows = DEMO_ROWS.slice(1, 6);
  return `${toolbar()}
  <div style="display: flex; flex: 1; min-height: 0;">
    ${sidebar({ width: 200 })}${splitH()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">
      ${grid(theme, rows, { selected: -1, hover: -1, height: 24 + 5 * 26 })}
      <div style="flex: 1; background: var(--bg-panel); display: flex; flex-direction: column;">
        <div class="progress indet" style="border-radius: 0; height: 3px; flex: none;"><div></div></div>
        <div style="display: flex; align-items: center; gap: 8px; padding: 8px 12px;" class="sm muted"><span class="spinner" style="width: 12px; height: 12px;"></span>Loading commits… 12,400 so far</div>
      </div>
    </div>
  </div>
  ${dock({ open: false })}
  ${statusbar({ busy: 'Walking history' })}
  <div style="position: absolute; right: 12px; bottom: 60px;"><div class="toast error">${icon('x-circle')}<div class="grow"><div class="t">Push rejected</div><div class="d">origin/main has 3 new commits. Pull first.</div></div><span class="icon-btn">${icon('x', 14)}</span></div></div>`;
}

export function build(theme) {
  const bg = PAGE_BG[theme];
  const body = `<div class="canvas-root t-light"><div class="t-${theme} sheet" style="width: 1440px; background: transparent; display: flex; flex-direction: column; gap: 20px; padding: 20px;">
    <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px;">
      ${mini(theme, 'Empty repository', 'after Init; unborn branch', emptyRepo(theme))}
      ${mini(theme, 'Detached HEAD', 'banner + HEAD chip without a branch', detached(theme))}
      ${mini(theme, 'Rebase in progress + conflicts', 'stacked banners; conflict list replaces file list', rebasing(theme))}
      ${mini(theme, 'Loading + error toast', 'grid fills incrementally; toasts bottom-right', loading(theme))}
    </div>
  </div></div>`;
  return { body, bg };
}

export default () => build('light');
