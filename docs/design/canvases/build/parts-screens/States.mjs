import { toolbar, sidebar, statusbar, grid, gridHeader, DEMO_ROWS, stashDetails, diffHeader, diffBody, dock, splitH, icon, PAGE_BG } from '../screens.mjs';

const MW = 700, MH = 390;

function mini(theme, title, note, inner) {
  return `<div style="display: flex; flex-direction: column; gap: 6px;">
    <div style="display: flex; align-items: baseline; gap: 8px;"><span class="h3">${title}</span><span class="xs muted">${note}</span></div>
    <div class="t-${theme} sheet" style="width: ${MW}px; height: ${MH}px; display: flex; flex-direction: column; overflow: hidden; position: relative; border-radius: 6px; box-shadow: 0 0 0 1px var(--border);">${inner}</div>
  </div>`;
}

/** banners.ts — the real strings; Banner.tsx draws TriangleAlert 14 for both kinds, and `primary` is the last button. */
const banner = (kind, text, btns) => `<div class="banner ${kind}" style="flex: none;">${icon('alert', 14)}<span class="grow">${text}</span>${btns}</div>`;
const sec = (l) => `<span class="btn secondary sm">${l}</span>`;
const pri = (l) => `<span class="btn primary sm">${l}</span>`;

const conflictList = (rows) => {
  const f = (g, p, m) => `<div class="row" style="padding-left: 8px;"><span class="glyph ${g}">${g}</span><span class="grow mono" style="font-size: 12px;">${p}</span><span class="meta">${m}</span></div>`;
  return rows.map(([g, p, m]) => f(g, p, m)).join('');
};

function emptyRepo(theme) {
  return `${toolbar({ pull: 0, push: 0, commit: 0, stash: 0, filter: 'HEAD', update: null })}
  <div style="display: flex; flex: 1; min-height: 0;">
    ${sidebar({ width: 200, empty: true })}${splitH()}
    <div style="display: flex; flex-direction: column; flex: 1; background: var(--bg-panel);">
      ${gridHeader()}
      <div class="empty" style="flex: 1;">${icon('git-commit', 24)}<div class="t">No commits yet</div><div class="hint">Stage files and create the first commit on <span class="mono" style="font-size: 12px;">main</span></div><span class="btn primary" style="margin-top: 6px;">${icon('git-commit', 14)}Open commit panel</span></div>
    </div>
  </div>
  ${statusbar({ branch: 'main', unborn: true, ab: false, remote: null, counts: '3 unstaged · 0 staged', state: 'Clean' })}`;
}

function detached(theme) {
  const rows = DEMO_ROWS.slice(1, 8).map((r, i) => (i === 0 ? { ...r, chips: 'detached' } : r));
  return `${toolbar({ pull: 0, push: 0, update: null })}
  ${banner('warning', 'Detached HEAD at <span class="mono" style="font-size: 11px;">a1b2c3d</span> — new commits won’t belong to any branch', sec('Checkout main') + pri('Create branch…'))}
  <div style="display: flex; flex: 1; min-height: 0;">
    ${sidebar({ width: 200, detached: true, compact: true })}${splitH()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">${grid(theme, rows, { selected: 0, hover: -1 })}</div>
  </div>
  ${statusbar({ detached: true, ab: false, state: 'Clean' })}`;
}

function rebasing(theme) {
  return `${toolbar({ pull: 0, push: 0, commit: 3, update: null })}
  ${banner('warning', 'Rebase in progress — resolve conflicts and stage them, then continue', sec('Abort') + sec('Skip') + pri('Continue'))}
  ${banner('danger', '3 files have conflicts — resolve, then stage them', sec('Open commit panel'))}
  <div style="display: flex; flex: 1; min-height: 0;">
    ${sidebar({ width: 200, compact: true })}${splitH()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; background: var(--bg-panel);">
      <div class="panel-header" style="flex: none;">${icon('file', 14)}<span class="grow">Unstaged</span><span class="badge danger">3</span><span class="btn secondary sm" style="font-size: var(--text-xs);">Stage all</span></div>
      ${conflictList([['C', 'crates/git-core/src/log/graph.rs', 'both modified'], ['C', 'Cargo.lock', 'both modified'], ['C', 'src/theme/tokens.css', 'deleted by them']])}
      <div class="panel-header" style="flex: none; border-top: 1px solid var(--border);">${icon('check', 14)}<span class="grow">Staged</span><span class="badge">1</span><span class="btn secondary sm" style="font-size: var(--text-xs);">Unstage all</span></div>
      ${conflictList([['M', 'crates/git-core/src/lib.rs', 'staged']])}
    </div>
  </div>
  ${statusbar({ branch: 'feature/lane-graph', ab: false, remote: null, counts: '3 unstaged · 1 staged · 3 conflicted', state: 'Rebase in progress' })}`;
}

function merging(theme) {
  return `${toolbar({ pull: 0, push: 0, commit: 5, update: null })}
  ${banner('warning', 'Merge in progress — resolve conflicts, then commit to finish', sec('Abort') + pri('Commit merge'))}
  ${banner('danger', '1 file has conflicts — resolve, then stage it', sec('Open commit panel'))}
  <div style="display: flex; flex: 1; min-height: 0;">
    ${sidebar({ width: 200, compact: true })}${splitH()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; background: var(--bg-panel);">
      ${diffHeader({ path: 'src/log/graph.rs', add: 0, del: 0, note: 'conflict markers', resolve: true, staging: true })}
      ${diffBody()}
    </div>
  </div>
  ${statusbar({ branch: 'main', ab: false, remote: null, counts: '5 unstaged · 0 staged · 1 conflicted', state: 'Merge in progress' })}`;
}

function cherryPick(theme) {
  return `${toolbar({ pull: 0, push: 0, commit: 2, update: null })}
  ${banner('warning', 'Cherry-pick in progress — resolve conflicts, then commit to finish', sec('Abort') + pri('Commit'))}
  <div style="display: flex; flex: 1; min-height: 0;">
    ${sidebar({ width: 200, compact: true })}${splitH()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">${grid(theme, DEMO_ROWS.slice(1, 9), { selected: 0, hover: -1 })}</div>
  </div>
  ${statusbar({ branch: 'main', ab: false, remote: null, counts: '2 unstaged · 0 staged', state: 'Cherry-pick in progress' })}`;
}

function bisecting(theme) {
  // computeBanners: with a good and a bad end marked, all four buttons; before that, Reset alone.
  const rows = DEMO_ROWS.slice(1, 9).map((r, i) => (i === 0 ? { ...r, chips: 'testing' } : i === 3 ? { ...r, chips: 'bad' } : i === 6 ? { ...r, chips: 'good' } : r));
  return `${toolbar({ pull: 0, push: 0, commit: 0, update: null })}
  ${banner('warning', 'Bisecting — testing <span class="mono" style="font-size: 11px;">9f8e7d6</span> · 1 good · 1 bad', sec('Good') + sec('Bad') + sec('Skip') + sec('Reset'))}
  <div style="display: flex; flex: 1; min-height: 0;">
    ${sidebar({ width: 200, detached: true, compact: true })}${splitH()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">${grid(theme, rows, { selected: 0, hover: -1 })}</div>
  </div>
  ${statusbar({ detached: true, ab: false, remote: null, state: 'Bisect in progress' })}`;
}

function loading(theme) {
  const rows = DEMO_ROWS.slice(1, 7);
  return `${toolbar({ update: null })}
  <div style="display: flex; flex: 1; min-height: 0;">
    ${sidebar({ width: 200, loading: true })}${splitH()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">
      ${grid(theme, rows, { selected: -1, hover: -1, loading: true })}
    </div>
  </div>
  ${dock({ open: false, empty: true })}
  ${statusbar({ loading: '12,400', remote: null, state: 'Clean' })}
  <div style="position: absolute; top: 52px; left: 50%; transform: translateX(-50%);"><div class="toast error">${icon('x-circle')}<div class="grow"><div class="t">Push rejected</div><div class="d">origin/main has 3 new commits. Pull first.</div><div class="actions"><span class="btn secondary sm">Pull</span></div></div><span class="icon-btn">${icon('x', 16)}</span></div></div>`;
}

function stashPreview(theme) {
  return `${toolbar({ update: null })}
  <div style="display: flex; flex: 1; min-height: 0;">
    ${sidebar({ width: 180, compact: true })}${splitH()}
    <div style="display: flex; flex: 1; min-height: 0;">
      ${stashDetails()}
      ${splitH()}
      <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; background: var(--bg-panel);">
        ${diffHeader({ path: 'crates/git-core/src/log/graph.rs', add: 12, del: 3 })}
        ${diffBody()}
      </div>
    </div>
  </div>
  ${statusbar({ counts: '4 unstaged · 0 staged', remote: null })}`;
}

export function build(theme) {
  const bg = PAGE_BG[theme];
  const body = `<div class="canvas-root t-light"><div class="t-${theme} sheet" style="width: 1440px; background: transparent; display: flex; flex-direction: column; gap: 20px; padding: 20px 10px;">
    <div style="display: grid; grid-template-columns: repeat(2, ${MW}px); gap: 20px;">
      ${mini(theme, 'Empty repository', 'after Init; unborn branch', emptyRepo(theme))}
      ${mini(theme, 'Detached HEAD', 'banner + HEAD chip without a branch', detached(theme))}
      ${mini(theme, 'Rebase + conflicts', 'stacked banners, banners.ts wording', rebasing(theme))}
      ${mini(theme, 'Merge in progress', 'conflict markers in the diff, Resolve in editor', merging(theme))}
      ${mini(theme, 'Cherry-pick in progress', 'one text for every stop; Abort · Commit', cherryPick(theme))}
      ${mini(theme, 'Bisect', 'Good / Bad / Skip / Reset; until both ends are marked it reads “Bisecting — mark a good commit to begin” with Reset alone', bisecting(theme))}
      ${mini(theme, 'Loading + error toast', 'Progress thin over the grid; toasts top-center', loading(theme))}
      ${mini(theme, 'Stash preview', 'the previewed stash takes the details pane', stashPreview(theme))}
    </div>
  </div></div>`;
  return { body, bg };
}

export default () => build('light');
