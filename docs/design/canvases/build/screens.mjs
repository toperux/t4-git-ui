// Shared chrome for A2 screen artboards. Everything composes A1 components (base.css classes).
// Values are copied from the app (src/screens/RepoWindow/**), never rounded.
import { icon, tokens, PAGE_BG } from './lib.mjs';
export { icon, tokens, PAGE_BG };

export const W = 1440, H = 900;

/**
 * Full-window frame: 1440×900, themed.
 * `scrim` mirrors Dialog.module.css `.scrim` (fixed, `10vh 24px 24px`); `full` its `.scrimFull`
 * (stretched, an even 16px margin).
 */
export function frame(theme, inner, { scrim = null, full = false } = {}) {
  // Outer root is always .t-light: metrics/fonts are only defined on :root (→ .t-light); .t-dark only swaps colors.
  const pad = full ? 'align-items: stretch; padding: 16px;' : 'align-items: flex-start; padding: 90px 24px 24px;';
  return `<div class="canvas-root t-light" style="width: ${W}px; height: ${H}px;"><div class="t-${theme} sheet" style="width: ${W}px; height: ${H}px; display: flex; flex-direction: column; overflow: hidden; position: relative;">${inner}${scrim ? `<div style="position: absolute; inset: 0; background: var(--scrim); display: flex; justify-content: center; ${pad}">${scrim}</div>` : ''}</div></div>`;
}

/* ---------------------------------------------------------------- tab strip */

/** TabStrip.module.css — hidden while a window has one tab, so every artboard that draws it has two. */
export function tabstrip({ tabs = ['t4-git-ui', 'libgit2'], active = 0, stale = [1] } = {}) {
  const tab = (name, i) =>
    `<span class="tab ${i === active ? 'is-active' : ''}">${icon('folder-git-2', 14)}<span class="name">${name}</span>${stale.includes(i) ? '<span class="stale" title="Changed in the background"></span>' : ''}${i === active ? `<span class="close">${icon('x', 12)}</span>` : ''}</span>`;
  return `<div class="tabstrip" style="flex: none;">${tabs.map(tab).join('')}<span class="add">${icon('plus', 16)}</span></div>`;
}

/* ------------------------------------------------------------------ toolbar */

const SM = 'height: var(--control-h-sm);';

/**
 * Toolbar.tsx order: sidebar toggle · | · Repository · | · Fetch▾ · Pull · Push · | · Branch · Stash · | · Commit ·
 * grow · file-history chip · search · branch filter · | · Refresh · ThemeToggle · UpdateBadge · Settings.
 */
export function toolbar({
  repo = 't4-git-ui',
  pull = 5,
  push = 2,
  commit = 4,
  stash = 1,
  filter = 'All branches',
  search = 'Search commits',
  history = null,
  update = null,
  theme = 'moon',
} = {}) {
  const cnt = (n) => (n ? ` <span class="cnt">${n}</span>` : '');
  return `<div class="toolbar" style="flex: none;">
    <span class="icon-btn">${icon('panel-left', 16)}</span>
    <span class="tb-sep"></span>
    <span class="tb-btn repo">${icon('folder-git-2', 18)}<span class="name">${repo}</span></span>
    <span class="tb-sep"></span>
    <span class="tb-split"><span class="tb-btn">${icon('arrow-down', 18)}Fetch</span><span class="tb-btn tb-more">${icon('chevron-down', 16)}</span></span>
    <span class="tb-btn">${icon('arrow-down-up', 18)}Pull${cnt(pull)}</span>
    <span class="tb-btn">${icon('arrow-up', 18)}Push${cnt(push)}</span>
    <span class="tb-sep"></span>
    <span class="tb-btn">${icon('git-branch', 18)}Branch</span>
    <span class="tb-btn">${icon('archive', 18)}Stash${cnt(stash)}</span>
    <span class="tb-sep"></span>
    <span class="tb-btn ${commit ? '' : 'is-disabled'}">${icon('git-commit', 18)}Commit${cnt(commit)}</span>
    <div style="flex: 1;"></div>
    ${history ? `<span class="tb-history">${icon('history', 13)}<span class="path">History: ${history}</span><span class="icon-btn">${icon('x', 13)}</span></span>` : ''}
    <span class="input" style="width: 240px; ${SM}">${icon('search', 14)}<span class="ph">${search}</span></span>
    <span class="input select" style="min-width: 150px; ${SM} margin-left: var(--space-2);"><span class="val">${filter}</span>${icon('chevron-down', 14, 'chevron')}</span>
    <span class="tb-sep"></span>
    <span class="icon-btn">${icon('refresh')}</span>
    <span class="icon-btn">${icon(theme)}</span>
    ${update ? `<span class="btn primary sm">${icon('arrow-up-circle', 14)}${update}</span>` : ''}
    <span class="icon-btn">${icon('settings')}</span>
  </div>`;
}

/* ------------------------------------------------------------------ sidebar */

/** A tree row: depth, state classes, twisty, 14px kind icon, label, meta. */
const tr = (d, s, tw, ic, txt, meta = '') =>
  `<div class="row ${s}" style="--d: ${d};"><span class="tw">${tw ? icon(tw, 12) : ''}</span>${ic}<span class="label">${txt}</span>${meta ? `<span class="meta">${meta}</span>` : ''}</div>`;
/** SectionHeader: the button (twisty · title · count) inside a sticky band, then the `children` slot. */
const sh = (open, name, count, extra = '') =>
  `<div class="section-header"><span class="tw">${icon(open ? 'chevron-down' : 'chevron-right', 12)}</span><span class="grow">${name}</span><span class="badge">${count}</span>${extra}</div>`;
const badge = (t, title) => `<span class="badge" title="${title}">${t}</span>`;
const mono = (t) => `<span class="mono">${t}</span>`;
/** An open / closed folder row: TreeRow draws its own glyph, `.row.folder` paints it amber + 600. */
const folderIcon = (open) => icon(open ? 'folder-open' : 'folder', 14);
/** The checked-out branch swaps its glyph for a check, coloured on the svg (Sidebar.module.css `.check`). */
const accentIcon = (name) => icon(name, 14).replace('<svg ', '<svg style="color: var(--accent);" ');

/**
 * Sidebar.tsx — 260px default (resizable 180–560), `--bg-sidebar` with each SectionHeader in its own
 * sticky `--bg-section-header` band. Worktrees appear only past one checkout, Submodules only when there are
 * any: both behind `full`.
 */
export function sidebar({ width = 260, empty = false, detached = false, loading = false, full = false, compact = false } = {}) {
  if (loading) {
    return `<div class="tree scroll" style="width: ${width}px; flex: none; background: var(--bg-sidebar); border-right: 1px solid var(--border); padding: 4px 0; overflow: hidden;"><div class="sm muted" style="padding: 6px 12px;">Loading branches…</div></div>`;
  }
  const body = empty
    ? `${sh(true, 'Local', 0)}<div class="empty" style="padding: 20px 12px;">${icon('git-branch', 20)}<div class="sm">No branches yet</div></div>
       ${sh(true, 'Remotes', 0)}<div class="empty" style="padding: 16px 12px;">${icon('cloud', 20)}<div class="sm">No remotes</div><span class="btn secondary sm">Add remote…</span></div>
       ${sh(false, 'Tags', 0)}${sh(false, 'Stashes', 0)}`
    : `${sh(true, 'Local', 4)}
      ${tr(0, detached ? '' : 'current', '', accentIcon('check'), 'main', `<span class="ab">${icon('arrow-up', 12)}2 ${icon('arrow-down', 12)}5</span>`)}
      ${tr(0, 'folder', 'chevron-down', folderIcon(true), 'feature', '2')}
      ${tr(1, '', '', icon('git-branch', 14), 'lane-graph', `<span class="ab">${icon('arrow-up', 12)}2</span>`)}
      ${tr(1, '', '', icon('git-branch', 14), 'diff-viewer', badge('gone', 'Upstream is gone'))}
      ${tr(0, '', '', icon('git-branch', 14), '<span style="color: var(--fg-muted);">hotfix-index-lock</span>', badge('merged', 'Merged into main — safe to delete'))}
      ${sh(true, 'Remotes', 31)}
      ${tr(0, 'folder', 'chevron-down', icon('cloud', 14), 'origin', '29')}
      ${tr(1, '', '', icon('git-branch', 14), 'main')}
      ${compact ? '' : tr(1, '', '', icon('git-branch', 14), 'feature/lane-graph')}
      ${tr(0, 'folder', 'chevron-right', icon('cloud', 14), 'mirror', '2')}
      ${sh(true, 'Tags', 12)}
      ${tr(0, '', '', icon('tag', 14), 'v0.9.0', badge('local', 'Not on origin or mirror (as of 5m ago)'))}
      ${tr(0, 'folder', 'chevron-right', icon('cloud', 14), 'origin', '11')}
      ${sh(true, 'Stashes', 1, `<span class="icon-btn">${icon('archive', 16)}</span>`)}
      ${tr(0, '', '', icon('archive', 14), 'WIP on main: lane colors', mono('stash@{0}'))}
      ${full
        ? `${sh(true, 'Worktrees', 2)}
           ${tr(0, 'current is-selected', '', icon('folder-git-2', 14), 't4-git-ui', `${mono('main')}${badge('main', 'The working tree the linked ones hang off')}${badge('current', 'The checkout this window is open on')}`)}
           ${tr(0, '', '', icon('folder-git-2', 14), 'wt-release', `${mono('release/0.9')}${badge('locked', 'Cutting 0.9')}`)}
           ${sh(true, 'Submodules', 1)}
           ${tr(0, '', '', icon('package', 14), 'vendor/libgit2', `${mono('a1b2c3d')}${badge('not initialized', 'No checkout on disk — Update clones it')}`)}`
        : ''}`;
  return `<div class="tree scroll" style="width: ${width}px; flex: none; background: var(--bg-sidebar); border-right: 1px solid var(--border); padding: 4px 0; overflow: hidden;">${body}</div>`;
}

/* --------------------------------------------------------------- status bar */

/** RepoWindow.tsx `RepoStatusBar` — the six state labels, with CircleCheck only on Clean. */
export function statusbar({
  branch = 'main',
  ab = true,
  detached = false,
  unborn = false,
  remote = 'origin · github.com:topher/t4-git-ui',
  busy = null,
  loading = null,
  counts = null,
  state = 'Clean',
  git = '2.55.0',
} = {}) {
  const spin = '<span class="spinner sm"></span>';
  return `<div class="statusbar" style="flex: none;">
    <span class="item">${icon('git-branch', 12)}${detached ? `${mono('a1b2c3d')} (detached)` : branch + (unborn ? ' (unborn)' : '')}</span>
    ${ab && !detached ? `<span class="item ab">${icon('arrow-up', 12)}2 ${icon('arrow-down', 12)}5</span>` : ''}
    ${remote ? `<span class="item">${icon('cloud', 12)}${remote}</span>` : ''}
    <span class="grow"></span>
    ${busy ? `<span class="item">${spin}${busy}</span>` : ''}
    ${loading ? `<span class="item">${spin}Loading commits… ${loading}</span>` : ''}
    ${counts ? `<span class="item">${counts}</span>` : ''}
    <span class="item">${icon(state === 'Clean' ? 'check-circle' : 'alert', 12)}${state}</span>
    <span class="item">git ${git}</span>
  </div>`;
}

/* ------------------------------------------------------------- lane graph */

/** Lane-graph SVG. rows: [{ lane, color, lines: [[from, to, color]], kind: 'commit'|'head'|'wt'|'none' }] */
export function graph(theme, rows, { laneW = 13, rowH = 26, lanes = 3 } = {}) {
  const c = (i) => tokens[theme][`graph-${i % 8}`];
  const x = (l) => 8 + l * laneW;
  const y = (r) => r * rowH + rowH / 2;
  const w = 8 + lanes * laneW + 4;
  const el = [];
  rows.forEach((r, i) => {
    for (const [from, to, col] of r.lines || []) {
      const y0 = y(i), y1 = y(i + 1);
      if (from === to) el.push(`<line x1="${x(from)}" y1="${y0}" x2="${x(to)}" y2="${y1}" stroke="${c(col)}" stroke-width="2"/>`);
      else el.push(`<path d="M${x(from)} ${y0} C ${x(from)} ${y0 + rowH * 0.45}, ${x(to)} ${y1 - rowH * 0.45}, ${x(to)} ${y1}" fill="none" stroke="${c(col)}" stroke-width="2" stroke-linecap="round"/>`);
    }
  });
  rows.forEach((r, i) => {
    if (r.kind === 'none') return;
    const cx = x(r.lane), cy = y(i), col = c(r.color);
    if (r.kind === 'wt') el.push(`<circle cx="${cx}" cy="${cy}" r="3.5" fill="none" stroke="${col}" stroke-width="1.5" stroke-dasharray="2 2"/>`);
    else {
      if (r.kind === 'head') el.push(`<circle cx="${cx}" cy="${cy}" r="5.5" fill="none" stroke="${col}" stroke-width="1.5"/>`);
      el.push(`<circle cx="${cx}" cy="${cy}" r="3.5" fill="${col}"/>`);
    }
  });
  return `<svg width="${w}" height="${rowH * rows.length}" viewBox="0 0 ${w} ${rowH * rows.length}" style="display: block; flex: none;">${el.join('')}</svg>`;
}

/** Standard demo history (14 rows). */
export const DEMO_ROWS = [
  { lane: 0, color: 0, kind: 'wt', lines: [[0, 0, 0]], subj: 'Working tree · 4 changes', wt: true },
  { lane: 0, color: 0, kind: 'head', lines: [[0, 0, 0]], subj: 'Dedupe lanes when parent already expected', chips: 'head', author: 'Topher M.', date: '2h ago', sha: 'a1b2c3d' },
  { lane: 0, color: 0, kind: 'commit', lines: [[0, 0, 0], [0, 1, 1]], subj: 'Merge branch ‘feature/lane-graph’ into main', chips: 'origin', author: 'Topher M.', date: '3h ago', sha: '9f8e7d6' },
  { lane: 1, color: 1, kind: 'commit', lines: [[0, 0, 0], [1, 1, 1]], subj: 'Emit MergeInto lines for octopus parents', chips: 'feature', author: 'Topher M.', date: 'Yesterday', sha: '5c4b3a2' },
  { lane: 0, color: 0, kind: 'commit', lines: [[0, 0, 0], [1, 1, 1]], subj: 'Cache log pages by generation', author: 'Ada L.', date: 'Yesterday', sha: '1e2d3c4' },
  { lane: 1, color: 1, kind: 'commit', lines: [[0, 0, 0], [1, 1, 1]], subj: 'Lane layout: eager dedupe of first parent', author: 'Topher M.', date: 'Aug 29', sha: '7d6c5b4' },
  { lane: 1, color: 1, kind: 'commit', lines: [[0, 0, 0], [1, 0, 1]], subj: 'Start lane graph module', chips: 'more', author: 'Topher M.', date: 'Aug 29', sha: '3b2a1f0' },
  { lane: 0, color: 0, kind: 'commit', lines: [[0, 0, 0]], subj: 'Refs: label map with synced remote rule', author: 'Ada L.', date: 'Aug 28', sha: 'c4d5e6f' },
  { lane: 1, color: 2, kind: 'commit', lines: [[0, 0, 0], [1, 1, 2]], subj: 'Retry on index.lock', chips: 'hotfix', author: 'Ada L.', date: 'Aug 28', sha: 'b7a6c5d' },
  { lane: 0, color: 0, kind: 'commit', lines: [[0, 0, 0], [1, 1, 2]], subj: 'Status: porcelain v2 fallback behind flag', chips: 'v011', author: 'Topher M.', date: 'Aug 27', sha: '0f1e2d3' },
  { lane: 0, color: 0, kind: 'commit', lines: [[0, 0, 0], [1, 0, 2]], subj: 'Diff: two sources (display vs stage-able)', author: 'Topher M.', date: 'Aug 26', sha: '6a5b4c3' },
  { lane: 0, color: 0, kind: 'commit', lines: [[0, 0, 0]], subj: 'git-core: error type + git_version probe', author: 'Topher M.', date: 'Aug 22', sha: 'd9e8f7a' },
  { lane: 0, color: 0, kind: 'commit', lines: [[0, 0, 0]], subj: 'Tauri 2 shell, plugins, tracing', chips: 'v010', author: 'Topher M.', date: 'Aug 21', sha: '2c3d4e5' },
  { lane: 0, color: 0, kind: 'commit', lines: [], subj: 'Initial workspace', author: 'Topher M.', date: 'Aug 20', sha: '0a1b2c3' },
];

/** A page that has not arrived: the row is there, its cells are `—` in --fg-faint. */
export const SKELETON = { lane: 0, color: 0, kind: 'none', lines: [], skeleton: true };

const CHIPS = {
  head: `<span class="chip head">HEAD</span><span class="chip local current">${icon('git-branch', 11)}main</span>`,
  origin: `<span class="chip remote">${icon('cloud', 11)}origin/main</span>`,
  feature: `<span class="chip local">${icon('git-branch', 11)}feature/lane-graph<span class="rem">${icon('cloud', 11)}origin</span></span>`,
  stash: `<span class="chip stash">${icon('archive', 11)}stash@{0}</span>`,
  hotfix: `<span class="chip local">${icon('git-branch', 11)}hotfix-index-lock<span class="rem">${icon('cloud', 11)}origin</span></span>`,
  v011: `<span class="chip tag">${icon('tag', 11)}v0.1.1</span>`,
  v010: `<span class="chip tag">${icon('tag', 11)}v0.1.0</span>`,
  detached: `<span class="chip head">HEAD</span>`,
  // `+N` is a real control: it opens a popover of the refs that did not fit.
  more: `<span class="chip stash">${icon('archive', 11)}stash@{0}</span><span class="chip local">+3</span>`,
  // Bisect marks (Chip kind `bisect`, Bug icon): skip is the plain remote grey.
  good: `<span class="chip bisect good">${icon('bug', 11)}good</span>`,
  bad: `<span class="chip bisect bad">${icon('bug', 11)}bad</span>`,
  skip: `<span class="chip bisect">${icon('bug', 11)}skip</span>`,
  testing: `<span class="chip head">HEAD</span><span class="chip bisect">${icon('bug', 11)}testing</span>`,
};

/** RevisionGrid.module.css `.th` — the handles are drawn by base.css and are inert; widths 110 / 80 / 64. */
export function gridHeader() {
  return `<div class="th" style="flex: none;">
    <span class="col" style="width: 56px;">Graph</span>
    <span class="col sort" style="flex: 1;">Subject ${icon('chevron-down', 12)}</span>
    <span class="col" style="width: 110px;">Author</span>
    <span class="col" style="width: 80px;">Date</span>
    <span class="col" style="width: 64px;">SHA</span>
  </div>`;
}

export function grid(theme, rows, { selected = 1, hover = 4, compare = [], height = null, lanes = 3, loading = false } = {}) {
  const rowsHtml = rows.map((r, i) => {
    const s = i === selected || compare.includes(i) ? 'is-selected' : i === hover ? 'is-hover' : '';
    if (r.skeleton) {
      return `<div class="row ${s}" style="padding: 0 var(--space-4) 0 var(--space-2); gap: 8px;"><span class="grow faint">—</span><span class="meta faint" style="width: 110px;">—</span><span class="meta faint" style="width: 80px;">—</span><span class="meta mono faint" style="width: 64px;">—</span></div>`;
    }
    const chips = r.chips ? `<span class="chips" style="display: inline-flex; gap: 4px; flex: none;">${CHIPS[r.chips]}</span>` : '';
    const subj = r.wt ? `<span style="color: var(--fg-muted); font-style: italic;">${r.subj}</span>` : `<span style="overflow: hidden; text-overflow: ellipsis;">${r.subj}</span>`;
    return `<div class="row ${s}" style="padding: 0 var(--space-4) 0 var(--space-2); gap: 8px;"><span class="grow" style="display: flex; align-items: center; gap: 6px;">${chips}${subj}</span><span class="meta" style="width: 110px;">${r.author || ''}</span><span class="meta" style="width: 80px;">${r.date || ''}</span><span class="meta mono" style="width: 64px;">${r.sha || ''}</span></div>`;
  }).join('');
  return `<div style="display: flex; flex-direction: column; flex: ${height ? 'none' : '1'}; ${height ? `height: ${height}px;` : ''} min-height: 0; background: var(--bg-panel); overflow: hidden; position: relative;">
    ${gridHeader()}
    ${loading ? `<div class="progress thin indet" style="position: absolute; top: 24px; left: 0; right: 0; z-index: 1;"><div></div></div>` : ''}
    <div style="display: flex; flex: 1; min-height: 0; overflow: hidden; position: relative;">
      <div style="width: 56px; flex: none; padding-left: 4px;">${graph(theme, rows, { lanes })}</div>
      <div style="flex: 1; min-width: 0;">${rowsHtml}</div>
      <div style="position: absolute; right: 3px; top: 8px; width: 4px; height: 90px; border-radius: 999px; background: var(--scrollbar-thumb);"></div>
    </div>
  </div>`;
}

/* --------------------------------------------------------------------- diff */

export const dl = (cls, o, n, sg, tx) => `<div class="dl ${cls}"><span class="no">${o}</span><span class="no">${n}</span><span class="sg">${sg}</span><span class="tx">${tx}</span></div>`;

/**
 * DiffViewer.tsx header: note · Resolve · mode chip · +N −M · separator · five IconButtons
 * (Open diff window, Open in diff tool, unified, split, ignore whitespace).
 */
export function diffHeader({
  path = 'crates/git-core/src/log/graph.rs',
  add = 42,
  del = 7,
  split = false,
  ws = false,
  mode = null,
  note = null,
  resolve = false,
  staging = false,
} = {}) {
  return `<div class="panel-header" style="flex: none;">${icon('file', 14)}<span class="grow mono" style="font-size: 12px; color: var(--fg);">${path}</span>
    ${note ? `<span class="diff-note">${note}</span>` : ''}
    ${resolve ? `<span class="btn secondary sm">Resolve in editor</span>` : ''}
    ${mode ? `<span class="diff-mode">${mode}</span>` : ''}
    ${add ? `<span class="xs" style="color: var(--success);">+${add}</span>` : ''}${del ? `<span class="xs" style="color: var(--danger-text);">−${del}</span>` : ''}
    <span class="tb-sep"></span>
    <span class="icon-btn">${icon('maximize-2', 16)}</span>
    <span class="icon-btn">${icon('external-link', 16)}</span>
    <span class="icon-btn ${split ? '' : 'is-on'}">${icon('rows', 16)}</span>
    <span class="icon-btn ${split ? 'is-on' : ''} ${staging ? 'is-disabled' : ''}">${icon('columns', 16)}</span>
    <span class="icon-btn ${ws ? 'is-on' : ''} ${staging ? 'is-disabled' : ''}">${icon('arrow-down-up', 16)}</span>
  </div>`;
}

const K = (t) => `<span class="syn-keyword">${t}</span>`;
const F = (t) => `<span class="syn-function">${t}</span>`;
const S = (t) => `<span class="syn-string">${t}</span>`;
const T = (t) => `<span class="syn-type">${t}</span>`;
const N = (t) => `<span class="syn-number">${t}</span>`;
const P = (t) => `<span class="syn-punct">${t}</span>`;
const C = (t) => `<span class="syn-comment">${t}</span>`;
const E = (t) => `<span class="emph">${t}</span>`;

export function diffBody({ actions = false, selected = [] } = {}) {
  const sel = (i) => (selected.includes(i) ? 'is-selected' : '');
  const hunkBtns = actions ? `<span class="btn secondary">Discard</span><span class="btn primary">Stage hunk</span>` : '';
  return `<div class="diff scroll" style="flex: 1; border: 0; border-radius: 0; overflow: hidden;">
    <div class="hunk"><span class="grow">@@ -112,9 +112,14 @@ impl LaneLayout</span>${hunkBtns}</div>
    ${dl('', 112, 112, ' ', `    ${K('pub')} ${K('fn')} ${F('push')}(&amp;${K('mut')} ${K('self')}, oid: ${T('Oid')}, parents: &amp;[${T('Oid')}]) -&gt; ${T('RowLayout')} {`)}
    ${dl('', 113, 113, ' ', `        ${K('let')} matches: ${T('Vec')}${P('&lt;')}${T('usize')}${P('&gt;')} = ${K('self')}.cols.${F('iter')}().${F('positions')}(|c| c.expecting == oid).${F('collect')}();`)}
    ${dl('del', 114, '', '−', `        ${K('let')} lane = ${E('matches[0]')};`)}
    ${dl('add ' + sel(0), '', 114, '+', `        ${K('let')} lane = ${E(`${K('match')} matches.${F('first')}() {`)}`)}
    ${dl('add ' + sel(1), '', 115, '+', `            ${T('Some')}(&amp;l) =&gt; l,`)}
    ${dl('add ' + sel(2), '', 116, '+', `            ${T('None')} =&gt; ${K('self')}.${F('new_column')}(oid),`)}
    ${dl('add ' + sel(3), '', 117, '+', `        };`)}
    ${dl('', 115, 118, ' ', `        ${K('let')} ${K('mut')} lines = ${T('Vec')}${P('::')}${F('new')}();`)}
    ${dl('', 116, 119, ' ', `        ${K('for')} &amp;j ${K('in')} matches.${F('iter')}().${F('skip')}(${N('1')}) {`)}
    ${dl('add', '', 120, '+', `            lines.${F('push')}(${T('GraphLine')} { from: j ${K('as')} ${T('u16')}, to: lane ${K('as')} ${T('u16')}, color: ${K('self')}.cols[j].color, kind: ${T('Merge')} });`)}
    ${dl('del', 117, '', '−', `            lines.${F('push')}(${F('merge_line')}(j, lane));`)}
    ${dl('', 118, 121, ' ', `            ${K('self')}.remove.${F('push')}(j);`)}
    ${dl('', 119, 122, ' ', `        }`)}
    <div class="hunk"><span class="grow">@@ -140,4 +145,9 @@ impl LaneLayout</span>${hunkBtns}</div>
    ${dl('', 140, 145, ' ', `        ${K('if')} ${K('let')} ${T('Some')}(&amp;p0) = parents.${F('first')}() {   ${C('// the first parent keeps the lane')}`)}
    ${dl('add', '', 146, '+', `            ${K('if')} ${K('let')} ${T('Some')}(k) = ${K('self')}.cols.${F('iter')}().${F('position')}(|c| c.expecting == p0) {`)}
    ${dl('add', '', 147, '+', `                lines.${F('push')}(${T('GraphLine')} { from: lane ${K('as')} ${T('u16')}, to: k ${K('as')} ${T('u16')}, kind: ${T('Branch')} });`)}
    ${dl('add', '', 148, '+', `                ${K('self')}.remove.${F('push')}(lane);`)}
    ${dl('add', '', 149, '+', `            } ${K('else')} {`)}
    ${dl('', 141, 150, ' ', `            ${K('self')}.cols[lane].expecting = p0;`)}
    ${dl('', 142, 151, ' ', `        }<span class="nonl">\\ No newline at end of file</span>`)}
  </div>`;
}

/** The sticky "N lines selected" bar under the lines (DiffViewer `.bar` / base.css `.diff-bar`). */
export const diffBar = (n = 2, verb = 'Stage') =>
  `<div class="diff-bar" style="flex: none;"><span class="grow">${n} lines selected</span><span class="btn primary">${verb} ${n} lines</span><span class="btn danger">Discard ${n} lines</span></div>`;

/**
 * FileContent.tsx — the Files tab's right-hand side: one gutter, no sign column, and a 180px blame
 * gutter whose tint is `--accent` at `--age × 4%` (1 = the file's oldest hunk, 5 = its newest).
 */
export function fileContent({ path = 'crates/git-core/src/log/graph.rs', blame = true, lines = 26 } = {}) {
  const bl = (age, label) => `<span class="bl" style="--age: ${age};">${label ? `<span class="grow">${label}</span>` : ''}</span>`;
  const src = [
    [5, 'a1b2c3d Topher M. 2h ago', `${K('use')} ${T('git2')}${P('::')}{${T('Oid')}, ${T('Repository')}};`],
    [5, '', ``],
    [5, '', `${C('/// One row of the lane layout: which column the commit sits on, and')}`],
    [5, '', `${C('/// the lines that leave it.')}`],
    [4, '9f8e7d6 Topher M. 3h ago', `${K('pub')} ${K('struct')} ${T('RowLayout')} {`],
    [4, '', `    ${K('pub')} lane: ${T('u16')},`],
    [4, '', `    ${K('pub')} lines: ${T('Vec')}${P('&lt;')}${T('GraphLine')}${P('&gt;')},`],
    [4, '', `}`],
    [4, '', ``],
    [3, '5c4b3a2 Topher M. yesterday', `${K('impl')} ${T('LaneLayout')} {`],
    [3, '', `    ${K('pub')} ${K('fn')} ${F('push')}(&amp;${K('mut')} ${K('self')}, oid: ${T('Oid')}) -&gt; ${T('RowLayout')} {`],
    [3, '', `        ${K('let')} matches = ${K('self')}.${F('expecting')}(oid);`],
    [2, '1e2d3c4 Ada L. Aug 28', `        ${K('let')} lane = ${K('match')} matches.${F('first')}() {`],
    [2, '', `            ${T('Some')}(&amp;l) =&gt; l,`],
    [2, '', `            ${T('None')} =&gt; ${K('self')}.${F('new_column')}(oid),`],
    [2, '', `        };`],
    [1, '0a1b2c3 Topher M. Aug 20', `        ${K('let')} ${K('mut')} lines = ${T('Vec')}${P('::')}${F('new')}();`],
    [1, '', `        ${K('for')} &amp;j ${K('in')} matches.${F('iter')}().${F('skip')}(${N('1')}) {`],
    [1, '', `            lines.${F('push')}(${F('merge_line')}(j, lane));`],
    [1, '', `        }`],
    [1, '', `        ${T('RowLayout')} { lane: lane ${K('as')} ${T('u16')}, lines }`],
    [1, '', `    }`],
    [1, '', `}`],
  ];
  const body = src.slice(0, lines).map(([age, label, tx], i) =>
    `<div class="dl">${blame ? bl(age, label) : ''}<span class="no">${i + 1}</span><span class="tx">${tx}</span></div>`).join('');
  return `<div style="display: flex; flex-direction: column; flex: 1; min-width: 0; background: var(--bg-panel); overflow: hidden;">
    <div class="panel-header" style="flex: none;">${icon('file', 14)}<span class="grow mono" style="font-size: 12px; color: var(--fg);">${path}</span>
      <span class="diff-note">248 lines</span>
      <span class="icon-btn ${blame ? 'is-on' : ''}">${icon('user-search', 16)}</span>
      <span class="icon-btn">${icon('maximize-2', 16)}</span>
    </div>
    <div class="diff scroll" style="flex: 1; border: 0; border-radius: 0; overflow: hidden;">${body}</div>
  </div>`;
}

/* ------------------------------------------------------- changed file list */

const stats = (a, d) => `<span class="meta">${a ? `<span style="color: var(--success);">+${a}</span>` : ''}${d ? `<span style="color: var(--danger-text);">−${d}</span>` : ''}</span>`;
/** The indent guide the app paints with a repeating gradient (ChangedFileList.module.css `.treeRow`). */
const guide = (d) => `background-image: repeating-linear-gradient(90deg, var(--border) 0 1px, transparent 1px var(--tree-indent)); background-repeat: no-repeat; background-size: calc(var(--tree-indent) * ${d}) 100%; background-position: calc(var(--space-4) + 8px) 0;`;

/**
 * ChangedFileList.tsx — Changes | Files pill tabs in the header, the flat / tree toggles after them,
 * and (Files tab only) a filter row of its own between the header and the list.
 */
export function changedFiles({ selected = 0, flat = true, tab = 'changes', width = null } = {}) {
  const f = (i, g, p, a, d) =>
    `<div class="row ${i === selected ? 'is-selected' : ''}" style="padding-left: 8px;"><span class="glyph ${g}">${g}</span><span class="grow mono" style="font-size: 12px;">${p}</span>${stats(a, d)}</div>`;
  const fTree = (i, d, g, p, add, del) =>
    `<div class="row ${i === selected ? 'is-selected' : ''}" style="--d: ${d}; padding-left: calc(var(--space-4) + var(--tree-indent) * ${d}); ${guide(d)}"><span class="tw"></span><span class="glyph ${g}">${g}</span><span class="grow mono" style="font-size: 12px;">${p}</span>${stats(add, del)}</div>`;
  const folder = (d, name) =>
    `<div class="row folder" style="--d: ${d}; padding-left: calc(var(--space-4) + var(--tree-indent) * ${d}); ${guide(d)}"><span class="tw">${icon('chevron-down', 12)}</span>${folderIcon(true)}<span class="label">${name}</span></div>`;
  const head = `<div class="panel-header" style="flex: none;">${icon('file', 14)}<span class="grow">${tab === 'files' ? '412 files' : '4 files changed'}</span><span class="pill-tabs"><span class="pill-tab ${tab === 'changes' ? 'is-on' : ''}">Changes</span><span class="pill-tab ${tab === 'files' ? 'is-on' : ''}">Files</span></span><span class="icon-btn ${flat ? 'is-on' : ''}">${icon('rows', 16)}</span><span class="icon-btn ${flat ? '' : 'is-on'}">${icon('folder', 16)}</span></div>`;
  const body = tab === 'files'
    ? `<div class="filter-row" style="flex: none;"><span class="input">${icon('search', 14)}<span class="ph">Filter files</span></span></div>
       ${folder(0, 'crates / git-core / src')}
       ${['log/graph.rs', 'log/cache.rs', 'log/types.rs', 'lib.rs'].map((p, i) =>
         `<div class="row ${i === selected ? 'is-selected' : ''}" style="--d: 1; padding-left: calc(var(--space-4) + var(--tree-indent) * 1); ${guide(1)}"><span class="tw"></span><span class="grow mono" style="font-size: 12px;">${p}</span><span class="meta">${['14.2 kB', '6.1 kB', '2.8 kB', '9.4 kB'][i]}</span></div>`).join('')}
       ${folder(0, 'src / screens')}
       ${['RepoWindow.tsx', 'Sidebar.tsx'].map((p, i) =>
         `<div class="row" style="--d: 1; padding-left: calc(var(--space-4) + var(--tree-indent) * 1); ${guide(1)}"><span class="tw"></span><span class="grow mono" style="font-size: 12px;">${p}</span><span class="meta">${['18.0 kB', '43.8 kB'][i]}</span></div>`).join('')}`
    : flat
      ? `${f(0, 'M', 'crates/git-core/src/log/graph.rs', 42, 7)}
         ${f(1, 'A', 'crates/git-core/src/log/cache.rs', 88, 0)}
         ${f(2, 'M', 'crates/git-core/src/lib.rs', 3, 1)}
         ${f(3, 'R', 'src/log.rs → src/log/mod.rs', 0, 0)}`
      : `${folder(0, 'crates / git-core / src')}
         ${folder(1, 'log')}
         ${fTree(0, 2, 'M', 'graph.rs', 42, 7)}
         ${fTree(1, 2, 'A', 'cache.rs', 88, 0)}
         ${fTree(2, 1, 'M', 'lib.rs', 3, 1)}
         ${folder(0, 'src')}
         ${fTree(3, 1, 'R', 'log.rs → log/mod.rs', 0, 0)}`;
  return `<div style="display: flex; flex-direction: column; ${width ? `width: ${width}px; flex: none;` : 'flex: 1;'} min-width: 0; background: var(--bg-panel); border-right: 1px solid var(--border); overflow: hidden;">${head}${body}</div>`;
}

/* -------------------------------------------------------------- details pane */

const kv = (k, v) => `<div style="display: flex; gap: 8px; font-size: 12px; line-height: 16px;"><span class="muted" style="width: 64px; flex: none;">${k}</span><span style="min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${v}</span></div>`;
const pane = (inner, width = 340) =>
  `<div class="scroll" style="width: ${width}px; flex: none; display: flex; flex-direction: column; background: var(--bg-panel); border-right: 1px solid var(--border); overflow: hidden;">${inner}</div>`;

/** DetailsPane.tsx `CommitDetails` — the header carries Copy only. */
export function commitDetails() {
  return pane(`<div class="panel-header" style="flex: none;">${icon('git-commit', 14)}<span class="grow">Commit</span><span class="icon-btn">${icon('copy', 16)}</span></div>
    <div style="padding: 10px 12px; display: flex; flex-direction: column; gap: 10px;">
      <div style="display: flex; gap: 4px; flex-wrap: wrap;">${CHIPS.head}${CHIPS.origin}${CHIPS.v011}</div>
      <div class="h3" style="font-weight: 600;">Dedupe lanes when parent already expected</div>
      <div class="sm" style="color: var(--fg); white-space: pre-line;">When a commit's first parent is already expected by another column, emit a Branch line into it and drop the current lane. Keeps wide histories narrow.

Fixes #12.</div>
      <div style="display: flex; flex-direction: column; gap: 4px; padding: 6px 8px; background: var(--bg-field); border-left: 2px solid var(--chip-tag-bg);">
        <div class="sm" style="display: flex; align-items: center; gap: 4px; font-weight: 600; color: var(--fg-muted);">${icon('tag', 12)}v0.1.1</div>
        <div class="sm" style="color: var(--fg); white-space: pre-line;">Lane dedupe, and the log cache behind it.</div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px; padding-top: 6px; border-top: 1px solid var(--border);">
        ${kv('Author', 'Topher M. &lt;topher.m@gmail.com&gt;<span class="signed" title="This commit carries a signature (not verified)">signed</span>')}
        ${kv('Committer', 'Ada L. &lt;ada@example.com&gt;')}
        ${kv('Date', 'Aug 31, 2026 14:02 (2h ago)')}
        ${kv('SHA', '<span class="mono" style="font-size: 12px;">a1b2c3d4e5f60718293a4b5c6d7e8f9012345678</span>')}
        ${kv('Parents', '<a class="mono" href="#" style="font-size: 12px;">9f8e7d6</a> <a class="mono" href="#" style="font-size: 12px;">5c4b3a2</a>')}
      </div>
    </div>`);
}

/** DetailsPane.tsx `StashDetails` — a previewed stash takes the whole pane. */
export function stashDetails() {
  return pane(`<div class="panel-header" style="flex: none;">${icon('archive', 14)}<span class="grow">stash@{0}</span></div>
    <div style="padding: 10px 12px; display: flex; flex-direction: column; gap: 10px;">
      <div class="h3" style="font-weight: 600;">WIP on main: lane colors</div>
      <div style="display: flex; gap: 4px; flex-wrap: wrap;">
        <span class="btn secondary sm">Apply</span><span class="btn secondary sm">Pop</span><span class="btn danger sm">Drop…</span><span class="btn secondary sm">Open browser</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px; padding-top: 6px; border-top: 1px solid var(--border);">
        ${kv('On', '<span class="mono" style="font-size: 12px;">a1b2c3d</span> Dedupe lanes when parent already expected')}
        ${kv('Date', 'Aug 31, 2026 11:40 (4h ago)')}
        ${kv('Untracked', 'included, listed as added')}
      </div>
    </div>`);
}

/** DetailsPane.tsx `CompareDetails` — Ctrl+click on a second row. */
export function compareDetails() {
  return pane(`<div class="panel-header" style="flex: none;">${icon('git-compare', 14)}<span class="grow">Compare</span></div>
    <div style="padding: 10px 12px; display: flex; flex-direction: column; gap: 10px;">
      <div style="display: flex; flex-direction: column; gap: 4px;">
        ${kv('From', '<span class="mono" style="font-size: 12px;">a1b2c3d</span> Dedupe lanes when parent already expected · 2h ago')}
        ${kv('To', '<span class="mono" style="font-size: 12px;">b7a6c5d</span> Retry on index.lock · Aug 28')}
      </div>
      <div class="xs muted">Files and diffs are what the Ctrl+clicked commit changed relative to the selected one. Ctrl+click either row to leave.</div>
    </div>`);
}

/* ---------------------------------------------------------------- output dock */

/** OutputDock.tsx — collapsed 28px header; open = header + log + the `$ git` prompt row. No progress bar. */
export function dock({ open = false, empty = false } = {}) {
  const exit = (ok, text) => `<span class="xs" style="display: inline-flex; align-items: center; gap: 4px; color: var(--${ok ? 'success' : 'danger-text'});">${icon(ok ? 'check' : 'x', 12)}${text}</span>`;
  if (!open) {
    return `<div class="panel-header" style="flex: none; border-top: 1px solid var(--border); border-bottom: 0;">${icon('terminal', 14)}<span class="grow mono" style="font-size: 12px; color: var(--fg-muted);">${empty ? 'No output yet' : '$ git fetch --progress origin'}</span>${empty ? '' : exit(true, 'exit 0 · 1.1s')}<span class="icon-btn ${empty ? 'is-disabled' : ''}">${icon('chevron-up', 16)}</span></div>`;
  }
  return `<div style="flex: none; height: 200px; display: flex; flex-direction: column; border-top: 1px solid var(--border);">
    <div class="panel-header" style="flex: none;">${icon('terminal', 14)}<span class="grow mono" style="font-size: 12px; color: var(--fg);">$ git push --progress origin main</span><span class="xs muted">4.2s</span><span class="spinner sm"></span><span class="btn secondary sm">Cancel</span><span class="icon-btn">${icon('chevron-down', 16)}</span></div>
    <div class="output scroll" style="flex: 1; border-radius: 0; overflow: hidden;">
      <div class="cmd">$ git fetch --progress origin</div><div>   a1b2c3d..9f8e7d6  main       -&gt; origin/main</div><div class="ok" style="display: flex; align-items: center; gap: 4px;">${icon('check', 12)}exit 0 · 1.1s</div>
      <div class="cmd" style="margin-top: 6px;">$ git push --progress origin main</div><div>Enumerating objects: 12, done.</div><div class="stderr">Writing objects:  58% (7/12), 1.2 MiB | 600 KiB/s</div>
    </div>
    <div class="prompt" style="flex: none;"><span class="command-input"><span class="prefix">$ git</span><span class="ph">Type a git command</span></span></div>
  </div>`;
}

/* ------------------------------------------------------------------ splitters */

export function splitV(hover = false) { return `<div class="split-v ${hover ? 'is-hover' : ''}" style="flex: none;"></div>`; }
export function splitH(hover = false) { return `<div class="split-h ${hover ? 'is-hover' : ''}" style="flex: none;"></div>`; }
