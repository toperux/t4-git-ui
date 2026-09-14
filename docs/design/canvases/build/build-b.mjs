// Direction B + command palette — the whole app as one view at a time, at three window sizes,
// plus the in-progress states. Built from the repo's own canvas parts (tokens, base.css, screens.mjs).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const build = here;
const out = join(here, '..', 'direction-b');
const S = await import(pathToFileURL(join(build, 'screens.mjs')).href);
const { icon: baseIcon, grid, DEMO_ROWS, commitDetails, changedFiles, stashDetails, diffHeader, diffBody, dock, statusbar, splitH, splitV, PAGE_BG } = S;

const tokens = readFileSync(join(build, 'tokens.css'), 'utf8')
  .replace(/^:root\s*\{/m, '.t-light {')
  .replace(/^\[data-theme="dark"\]\s*\{/m, '.t-dark {');
const base = readFileSync(join(build, 'base.css'), 'utf8');
const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">';

// Icons the shared set lacks (lucide paths).
const extra = {
  command: '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
  package: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  'folder-git': '<path d="M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v5"/><circle cx="13" cy="12" r="2"/><path d="M18 19c-2.8 0-5-2.2-5-5v8"/><circle cx="20" cy="19" r="2"/>',
  'panel-left': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
  'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  'chevrons-up': '<path d="m17 11-5-5-5 5"/><path d="m17 18-5-5-5 5"/>',
};
const icon = (name, size = 16, cls = '') =>
  extra[name]
    ? `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${extra[name]}</svg>`
    : baseIcon(name, size, cls);

function page(body, w, theme) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  ${FONTS}
  <style>
${tokens}
${base}
body { background: ${PAGE_BG[theme]}; }
.canvas-root { width: ${w}px; }
.rail-btn { position: relative; width: 28px; height: 28px; border-radius: var(--radius-sm); display: inline-flex; align-items: center; justify-content: center; color: var(--fg-muted); }
.rail-btn.is-on { background: var(--bg-active); color: var(--fg); }
.rail-btn .n { position: absolute; top: -2px; right: -3px; height: 13px; min-width: 13px; padding: 0 3px; border-radius: 999px; background: var(--bg-inset); color: var(--fg-muted); font-size: 9px; line-height: 13px; font-weight: 600; text-align: center; }
.hunk .grow { white-space: nowrap; }
.panel-header .grow.mono { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.seg { display: inline-flex; height: var(--control-h); padding: 2px; gap: 2px; background: var(--bg-inset); border-radius: var(--radius-md); flex: none; }
.seg > span { display: inline-flex; align-items: center; gap: 6px; padding: 0 10px; border-radius: 3px; color: var(--fg-muted); font-weight: 500; white-space: nowrap; }
.seg > span.is-on { background: var(--bg-panel); color: var(--fg); box-shadow: 0 1px 2px rgba(0,0,0,.08); }
.seg.icons > span { padding: 0 8px; }
  </style>
</helmet>
${body}
</x-dc>
</body>
</html>
`;
}

/** Window frame at any size (the shared one is fixed at 1440×900). */
function frame(w, h, inner, theme = 'light') {
  // Outer root stays .t-light: metrics and fonts are only defined on :root (-> .t-light); .t-dark only swaps colours.
  return `<div class="canvas-root t-light" style="width: ${w}px; height: ${h}px;"><div class="t-${theme} sheet" style="width: ${w}px; height: ${h}px; display: flex; flex-direction: column; overflow: hidden; position: relative;">${inner}</div></div>`;
}

// ---------- toolbar ----------
const tb = (ic, label, cnt, cls = '') => `<span class="tb-btn ${cls}">${icon(ic, 18)}${label ? label : ''}${cnt ? ` <span class="cnt">${cnt}</span>` : ''}</span>`;
const tbIcon = (ic, cnt) => `<span class="tb-btn" style="padding: 0 6px; gap: 2px;">${icon(ic, 18)}${cnt ? `<span class="cnt">${cnt}</span>` : ''}</span>`;
const repoBtn = (label = true) => `<span class="tb-btn repo" style="font-weight: 600; flex: none; ${label ? '' : 'padding: 0 6px;'}">${icon('folder-git', 18)}${label ? '<span class="name">t4-git-ui</span>' : ''}${icon('chevron-down', 14, 'muted')}</span>`;
const search = (w) => `<span class="input" style="width: ${w}px; height: 26px;">${icon('search', 14)}<span class="ph">Search commits</span></span>`;
const filterSel = () => `<span class="input select" style="min-width: 130px; height: 26px;"><span>All branches</span>${icon('chevron-down', 14)}</span>`;
const iconBtn = (ic) => `<span class="icon-btn">${icon(ic)}</span>`;
const kbtn = () => `<span class="icon-btn" title="Command palette (Ctrl+K)">${icon('command', 16)}</span>`;

/** The History | Changes switch. `labels` off = icons only (the <800 toolbar). */
const segSwitch = (view, labels, count) => {
  const cnt = count ? ` <span class="cnt" style="font-size: 11px; color: inherit; opacity: .7;">${count}</span>` : '';
  return `<span class="seg ${labels ? '' : 'icons'}">
    <span class="${view === 'history' ? 'is-on' : ''}">${icon('history', 14)}${labels ? 'History' : ''}</span>
    <span class="${view === 'changes' ? 'is-on' : ''}">${icon('git-commit', 14)}${labels ? 'Changes' : ''}${cnt}</span></span>`;
};

/** B toolbar: today's buttons, the History | Changes switch, and Ctrl+K at every size. */
function toolbarB(mode, view, { count = 4, update = false } = {}) {
  const seg = segSwitch(view, mode !== 'icons', count);
  if (mode === 'full')
    return `<div class="toolbar" style="flex: none;">${repoBtn()}<span class="tb-sep"></span>
      <span class="tb-split">${tb('arrow-down', 'Fetch')}<span class="tb-btn tb-more">${icon('chevron-down', 16)}</span></span>${tb('arrow-down-up', 'Pull', 5)}${tb('arrow-up', 'Push', 2)}<span class="tb-sep"></span>${tb('git-branch', 'Branch')}${tb('archive', 'Stash', 1)}<span class="tb-sep"></span>${seg}
      <div style="flex: 1;"></div>${view === 'history' ? search(update ? 160 : 200) + filterSel() : ''}<span class="tb-sep"></span>${kbtn()}${iconBtn('refresh')}${iconBtn('moon')}${update ? `<span class="btn primary sm">${icon('arrow-up-circle', 14)}Update</span>` : ''}${iconBtn('settings')}</div>`;
  if (mode === 'tight')
    return `<div class="toolbar" style="flex: none;">${repoBtn()}<span class="tb-sep"></span>
      ${tbIcon('arrow-down')}${tbIcon('arrow-down-up', 5)}${tbIcon('arrow-up', 2)}<span class="tb-sep"></span>${tbIcon('git-branch')}${tbIcon('archive', 1)}<span class="tb-sep"></span>${seg}
      <div style="flex: 1;"></div>${view === 'history' ? search(150) : ''}<span class="tb-sep"></span>${kbtn()}${iconBtn('moon')}${iconBtn('settings')}</div>`;
  return `<div class="toolbar" style="flex: none; padding: 0 8px;">${repoBtn(false)}<span class="tb-sep" style="margin: 0 4px;"></span>
      ${tbIcon('arrow-down')}${tbIcon('arrow-down-up', 5)}${tbIcon('arrow-up', 2)}<span class="tb-sep" style="margin: 0 4px;"></span>${seg}
      <div style="flex: 1;"></div>${view === 'history' ? iconBtn('search') : ''}${kbtn()}${iconBtn('ellipsis')}</div>`;
}

/** The ⋯ menu the icons toolbar folds into, right-aligned under its button. */
const overflowMenu = () => `<div class="menu" style="position: absolute; right: 8px; top: 44px; width: 220px; z-index: 3;">
  <div class="menu-item">${icon('git-branch', 16)}<span class="grow">Branch</span><span class="chev">${icon('chevron-right', 14)}</span></div>
  <div class="menu-item">${icon('archive', 16)}<span class="grow">Stash…</span><span class="badge">1</span></div>
  <div class="menu-sep"></div>
  <div class="menu-item">${icon('refresh', 16)}<span class="grow">Refresh</span><span class="kbd">F5</span></div>
  <div class="menu-item">${icon('moon', 16)}<span class="grow">Dark theme</span></div>
  <div class="menu-item">${icon('settings', 16)}<span class="grow">Settings</span></div>
  <div class="menu-sep"></div>
  <div class="menu-item is-hover">${icon('command', 16)}<span class="grow">Command palette</span><span class="kbd">Ctrl+K</span></div>
</div>`;

// ---------- sidebar variants ----------
const tr = (d, s, tw, ic, txt, extra = '') => `<div class="row ${s}" style="--d: ${d};"><span class="tw">${tw ? icon(tw, 12) : ''}</span>${icon(ic, 14, 'muted')}<span class="grow">${txt}</span>${extra}</div>`;
const sh = (open, name, count, extra = '') => `<div class="section-header"><span class="tw">${icon(open ? 'chevron-down' : 'chevron-right', 12)}</span><span class="grow">${name}</span>${extra}<span class="badge">${count}</span></div>`;
const plus = `<span class="icon-btn" style="width: 20px; height: 20px;">${icon('plus', 14)}</span>`;

function localTree(selected = true) {
  return `${tr(0, selected ? 'is-selected' : '', '', 'check', `<span style="font-weight: 600;">main</span>`, `<span class="ab">${icon('arrow-up', 12)}2 ${icon('arrow-down', 12)}5</span>`)}
    ${tr(0, 'folder', 'chevron-down', 'folder-open', 'feature', '<span class="meta">2</span>')}
    ${tr(1, '', '', 'git-branch', 'lane-graph', `<span class="ab">${icon('arrow-up', 12)}2</span>`)}
    ${tr(1, '', '', 'git-branch', 'diff-viewer')}
    ${tr(0, '', '', 'git-branch', 'hotfix-index-lock')}`;
}

function sidebarFull({ width = 260, collapseBtn = false, stashSelected = false } = {}) {
  const head = collapseBtn ? `<div style="display: flex; justify-content: flex-end; padding: 0 6px 2px;"><span class="icon-btn">${icon('panel-left', 14)}</span></div>` : '';
  return `<div class="tree scroll" style="width: ${width}px; flex: none; background: var(--bg-app); border-right: 1px solid var(--border); padding: 4px 0; overflow: hidden;">${head}
    ${sh(true, 'Local', 4)}${localTree(!stashSelected)}
    ${sh(true, 'Remotes', 3, plus)}
    ${tr(0, '', 'chevron-down', 'cloud', 'origin')}
    ${tr(1, '', '', 'git-branch', 'main')}
    ${tr(1, '', '', 'git-branch', 'feature/lane-graph')}
    ${tr(1, '', '', 'git-branch', 'hotfix-index-lock')}
    ${sh(false, 'Tags', 12)}
    ${sh(true, 'Stashes', 1, `<span class="icon-btn" style="width: 20px; height: 20px;">${icon('archive', 14)}</span>`)}
    ${tr(0, stashSelected ? 'is-selected' : '', '', 'archive', 'WIP on main: lane colors')}
  </div>`;
}

/** 36px icon rail: one button per section; click opens that section as a flyout. */
function rail({ on = null } = {}) {
  const b = (ic, n, key) => `<span class="rail-btn ${on === key ? 'is-on' : ''}">${icon(ic, 16)}${n ? `<span class="n">${n}</span>` : ''}</span>`;
  return `<div style="width: 36px; flex: none; background: var(--bg-app); border-right: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 0;">
    ${b('git-branch', 4, 'local')}${b('cloud', 3, 'remotes')}${b('tag', 12, 'tags')}${b('archive', 1, 'stashes')}
    <div style="flex: 1;"></div>
    <span class="rail-btn">${icon('panel-left', 16)}</span>
  </div>`;
}

function railFlyout(top) {
  return `<div class="menu tree" style="position: absolute; left: 40px; top: ${top}px; width: 260px; padding: 4px 0; z-index: 2;">
    ${sh(true, 'Local', 4, plus)}${localTree()}
  </div>`;
}

// ---------- commit panel pieces ----------
const f = (s, g, p, m) => `<div class="row multi ${s}" style="padding-left: 8px;"><span class="glyph ${g}">${g}</span><span class="grow mono" style="font-size: 12px;">${p}</span><span class="meta">${m}</span></div>`;
const fileRows = (conflict) => conflict
  ? `${f('is-selected is-focus', 'C', 'crates/git-core/src/log/graph.rs', 'both modified')}${f('', 'M', 'crates/git-core/src/lib.rs', '+3 −1')}${f('', 'U', 'crates/git-core/src/log/cache.rs', '')}${f('', 'D', 'crates/git-core/src/old_walker.rs', '−120')}`
  : `${f('is-selected is-focus', 'M', 'crates/git-core/src/log/graph.rs', '+42 −7')}${f('', 'M', 'crates/git-core/src/lib.rs', '+3 −1')}${f('', 'U', 'crates/git-core/src/log/cache.rs', '')}${f('', 'D', 'crates/git-core/src/old_walker.rs', '−120')}`;
const stagedRows = () => `${f('', 'A', 'crates/git-core/src/log/types.rs', '+61')}${f('', 'R', 'src/log.rs → src/log/mod.rs', '')}`;
const unstagedHdr = (conflict) => `<div class="panel-header" style="flex: none;">${icon('file', 14)}<span class="grow">Unstaged</span><span class="icon-btn">${icon('folder-tree', 16)}</span><span class="badge${conflict ? ' danger' : ''}">4</span><span class="btn secondary sm" style="height: 20px; font-size: 11px;">Stage all</span></div>`;
const stagedHdr = (split = false) => `<div class="panel-header" style="flex: none; ${split ? '' : 'border-top: 1px solid var(--border);'}">${icon('check', 14)}<span class="grow">Staged</span><span class="badge">2</span><span class="btn secondary sm" style="height: 20px; font-size: 11px;">Unstage all</span></div>`;

function files({ width = 320, flex = false, conflict = false, split = false } = {}) {
  return `<div style="${flex ? 'flex: 1; min-height: 0;' : `width: ${width}px; flex: none;`} display: flex; flex-direction: column; background: var(--bg-panel); ${flex ? '' : 'border-right: 1px solid var(--border);'} overflow: hidden;">
    ${unstagedHdr(conflict)}${fileRows(conflict)}<div style="flex: 1; min-height: 12px;"></div>${split ? splitV() : ''}${stagedHdr(split)}${stagedRows()}<div style="flex: 1; min-height: 12px;"></div>
  </div>`;
}

const msgBox = (h, empty) => `<div style="display: flex; flex-direction: column; background: var(--bg-inset); border: 1px solid var(--${empty ? 'border' : 'accent'}); ${empty ? '' : 'box-shadow: 0 0 0 3px var(--accent-soft);'} border-radius: var(--radius-md); ${h ? `height: ${h}px;` : 'flex: 1; min-height: 0;'}">
  <div style="display: flex; align-items: center; height: 32px; padding: 0 10px; border-bottom: 1px solid var(--border); gap: 6px;">${empty
    ? '<span class="ph faint">Summary</span>'
    : '<span style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Lane layout: eager dedupe of first parent</span><span class="caret"></span>'}<div style="flex: 1;"></div><span class="xs faint">${empty ? '0/72' : '42/72'}</span></div>
  <div style="padding: 8px 10px; flex: 1;"><span class="ph faint sm">Body — what and why. Wrap at 72.</span></div></div>`;

function message({ width = 340, flex = false, compact = false, empty = false } = {}) {
  return `<div style="${flex ? 'flex: none;' : `width: ${width}px; flex: none;`} display: flex; flex-direction: column; background: var(--bg-panel); ${flex ? 'border-top: 1px solid var(--border);' : 'border-left: 1px solid var(--border);'}">
    <div class="panel-header" style="flex: none;">${icon('git-commit', 14)}<span class="grow">Commit message</span><span class="icon-btn">${icon('history', 14)}</span></div>
    <div style="padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; flex: 1;">
      ${msgBox(compact ? 76 : 0, empty)}
      ${compact ? '' : `<div style="display: flex; flex-direction: column; gap: 6px;"><span class="check"><span class="checkbox"></span>Amend last commit</span><span class="check"><span class="checkbox"></span>Add Signed-off-by</span><span class="input select"><span class="val">Sign: as configured</span>${icon('chevron-down', 14, 'chevron')}</span></div><div class="xs muted">${empty ? 'Topher M. · nothing staged' : 'Topher M. · will commit 2 staged files'}</div>`}
      <div style="display: flex; gap: 8px; margin-top: auto; align-items: center;">${compact ? `<span class="icon-btn" title="Amend, sign-off, message history">${icon('ellipsis', 14)}</span>` : ''}<span class="btn primary ${empty ? 'is-disabled' : ''}" style="flex: 1;">${icon('check', 14)}Commit</span><span class="btn secondary ${empty ? 'is-disabled' : ''}">Commit &amp; Push</span></div>
    </div>
  </div>`;
}

function diffCol({ extraBar = true, header = null } = {}) {
  return `<div style="display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; overflow: hidden; background: var(--bg-panel);">
    ${header || diffHeader()}${diffBody({ actions: true, selected: [0, 1] })}
    ${extraBar ? `<div class="hunk" style="flex: none; background: var(--accent-soft); color: var(--fg); border-top: 1px solid var(--border);"><span class="grow">2 lines selected</span><span class="btn secondary" style="height: 20px;">Discard</span><span class="btn primary" style="height: 20px;">Stage 2 lines</span></div>` : ''}
  </div>`;
}

/** Three columns: files | diff | message. */
const commit3 = (fw = 320, mw = 340, opts = {}) => `<div style="display: flex; flex: 1; min-height: 0;">${files({ width: fw, conflict: opts.conflict })}${diffCol(opts)}${message({ width: mw })}</div>`;
/** Two columns: files over message | diff. */
const commit2 = (lw = 300) => `<div style="display: flex; flex: 1; min-height: 0;">
  <div style="width: ${lw}px; flex: none; display: flex; flex-direction: column; border-right: 1px solid var(--border); min-height: 0;">${files({ flex: true })}${message({ flex: true, compact: true })}</div>${diffCol()}</div>`;

/** Details pane: today's three columns, and the narrow tabs. */
const details3 = () => `<div style="display: flex; flex: 1; min-height: 0;">${commitDetails()}<div style="width: 300px; flex: none; display: flex;">${changedFiles({ selected: 0 })}</div><div style="display: flex; flex-direction: column; flex: 1; min-width: 0; background: var(--bg-panel);">${diffHeader()}${diffBody()}</div></div>`;
const details2 = () => {
  const top = commitDetails()
    .replace("width: 340px; flex: none;", "flex: 0 1 auto; min-height: 0; max-height: 50%;")
    .replace("border-right: 1px solid var(--border);", "border-bottom: 1px solid var(--border);");
  const bottom = changedFiles({ selected: 0 })
    .replace("border-right: 1px solid var(--border);", "")
    .replace("flex: 1; min-width: 0;", "flex: 1; min-width: 0; min-height: 0;");
  return `<div style="display: flex; flex: 1; min-height: 0;">
    <div style="width: 300px; flex: none; display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--border);">${top}${bottom}</div>
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; background: var(--bg-panel);">${diffHeader()}${diffBody()}</div></div>`;
};
/** 720: files-only left column; the commit details collapse to a one-line header that expands over the list. */
const details720 = () => {
  const cf = (s, g, p, m) => `<div class="row ${s}" style="padding-left: 8px;"><span class="glyph ${g}">${g}</span><span class="grow mono" style="font-size: 12px;">${p}</span><span class="meta" style="font-size: 11px;">${m}</span></div>`;
  return `<div style="display: flex; flex: 1; min-height: 0;">
    <div style="width: 220px; flex: none; display: flex; flex-direction: column; min-height: 0; background: var(--bg-panel); border-right: 1px solid var(--border); overflow: hidden;">
      <div class="panel-header" style="flex: none; gap: 6px;"><span class="tw">${icon("chevron-right", 12)}</span><span class="grow" style="color: var(--fg); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Dedupe lanes when parent already expected</span><span class="xs muted mono">a1b2c3d</span></div>
      <div class="panel-header" style="flex: none;">${icon("file", 14)}<span class="grow">4 files</span><span class="pill-tabs"><span class="pill-tab is-on">Changes</span><span class="pill-tab">Files</span></span></div>
      ${cf("is-selected", "M", "log/graph.rs", "+42 −7")}${cf("", "A", "log/cache.rs", "+88")}${cf("", "M", "lib.rs", "+3 −1")}${cf("", "R", "log.rs → log/mod.rs", "")}
    </div>
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; background: var(--bg-panel);">${diffHeader()}${diffBody()}</div></div>`;
};
const details1 = () => `<div style="display: flex; flex-direction: column; flex: 1; min-height: 0; background: var(--bg-panel);">
  <div class="panel-header"><span class="pill-tabs"><span class="pill-tab">Commit</span><span class="pill-tab">Files</span><span class="pill-tab is-on">Diff</span></span><span class="grow"></span><span class="xs muted mono">a1b2c3d</span></div>
  ${diffHeader()}${diffBody()}</div>`;

const gridH = (n) => 24 + n * 26;

/** The Changes view's own header bar, in place of the grid. */
const changesBar = ({ text = 'Changes on <span class="mono" style="font-size: 12px;">main</span> <span class="muted" style="font-weight: 400;">· 4 unstaged · 2 staged</span>', stash = true } = {}) =>
  // Stash… sits beside the counts at every width — disabled, not hidden, on a clean tree — and the
  // title shrinks first so the close button stays at the right edge.
  `<div class="panel-header" style="flex: none; height: 32px; gap: 8px;">${icon('git-commit', 14)}<span style="color: var(--fg); font-weight: 500; flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${text}</span><span class="btn ghost sm${stash ? '' : ' is-disabled'}">${icon('archive', 14)}Stash…</span><div style="flex: 1;"></div><span class="icon-btn">${icon('x', 14)}</span></div>`;

// ---------- palette ----------
/** Ctrl+K. Typing filters across groups; an empty query leads with Recent. */
function palette({ query = 'st', width = 520, top = 96, groups = [], footer = false } = {}) {
  const it = ([ic, t, k, hover]) => `<div class="menu-item ${hover ? 'is-hover' : ''}" style="height: 28px;">${icon(ic, 16)}<span class="grow">${t}</span>${k ? `<span class="kbd">${k}</span>` : ''}</div>`;
  const grp = (g, i) => `<div class="label" style="padding: ${i ? 8 : 6}px 8px 4px;">${g.label}</div>${g.items.map(it).join('')}`;
  return `<div style="position: absolute; inset: 0; background: var(--scrim); display: flex; justify-content: center; align-items: flex-start; padding-top: ${top}px; z-index: 3;">
    <div class="menu" style="width: ${width}px; padding: 0; overflow: hidden; box-shadow: var(--shadow-2);">
      <div style="display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px; border-bottom: 1px solid var(--border);">${icon('search', 16, 'muted')}${query ? `<span style="font-size: 14px;">${query}</span>` : '<span class="ph">Type a command, branch, or repository</span>'}<span class="caret"></span><div style="flex: 1;"></div><span class="kbd">Esc</span></div>
      <div style="padding: 6px;">${groups.map(grp).join('')}</div>
      ${footer ? `<div class="xs muted" style="display: flex; gap: 10px; padding: 6px 12px; border-top: 1px solid var(--border); background: var(--bg-app);"><span>↑↓ navigate</span><span>·</span><span>↵ run</span><span>·</span><span>Esc close</span></div>` : ''}
    </div>
  </div>`;
}

const QUERY_GROUPS = [
  { label: 'Stash', items: [['archive', '<b>St</b>ash changes…', '', true], ['archive', 'Manage <b>st</b>ashes…', 'Ctrl+Shift+S'], ['archive', 'Pop late<b>st</b> — WIP on main: lane colors']] },
  { label: 'Branch', items: [['git-branch', 'Checkou<b>t</b>…'], ['git-merge', 'Rebase main on<b>t</b>o…'], ['git-merge', 'Merge in<b>t</b>o main…']] },
  { label: 'Repository', items: [['terminal', 'Run git command…', 'Ctrl+Shift+R'], ['cloud', 'Add remo<b>t</b>e…'], ['folder-git', 'Add work<b>t</b>ree…']] },
  { label: 'Go to', items: [['git-branch', 'feature/lane-graph'], ['git-branch', 'origin/ho<b>t</b>fix-index-lock']] },
  { label: 'View', items: [['git-commit', '<b>S</b>wi<b>t</b>ch to Changes', 'Alt+2']] },
];

const EMPTY_GROUPS = [
  { label: 'Recent', items: [['archive', 'Stash changes…', '', true], ['git-branch', 'Checkout feature/lane-graph'], ['terminal', 'Run git command…', 'Ctrl+Shift+R']] },
  { label: 'Views', items: [['history', 'History', 'Alt+1'], ['git-commit', 'Changes', 'Alt+2']] },
  { label: 'Go to branch', items: [['git-branch', 'main <span class="xs muted">· current</span>'], ['git-branch', 'feature/lane-graph'], ['cloud', 'origin/main'], ['ellipsis', '<span class="muted">+1 more…</span>']] },
  { label: 'Repositories', items: [['folder-git', 'libgit2 <span class="xs muted">· recent</span>'], ['folder-git', 'mbk-portal <span class="xs muted">· recent</span>']] },
];

// ---------- full-window dialogs ----------

/** Dialog.tsx `full`: base.css `.scrim.is-full` + `.dialog.full`, title + close, unpadded body. */
const fullDialog = (title, body) => `<div class="scrim is-full" style="position: absolute; inset: 0; z-index: 3;">
  <div class="dialog full">
    <div class="dialog-title"><span class="grow">${title}</span><span class="icon-btn">${icon('x', 16)}</span></div>
    <div class="dialog-body full" style="flex-direction: row;">${body}</div>
  </div>
</div>`;

/** Inside a dialog the diff header has no "Open diff window": only the pane passes `onExpand`. */
const noExpand = (h) => h.replace(`<span class="icon-btn">${icon('maximize-2', 16)}</span>`, '');

// CommitDialog.tsx — Unstaged / Staged / Message stacked in a 380px panel (the app's defaultSize),
// the diff taking the rest. Split view is off while staging, as DiffColumn's actions mode has it.
const commitDialog = () => fullDialog('Commit', `
  <div style="width: 380px; flex: none; display: flex; flex-direction: column; min-height: 0;">
    ${files({ flex: true, split: true })}${splitV()}${message({ flex: true }).replace('border-top: 1px solid var(--border);', '')}
  </div>
  ${splitH()}
  ${diffCol({ header: noExpand(diffHeader({ staging: true })) })}`);

// DiffDialog.tsx — the details pane's changed file list (320) beside the diff; the title is
// `Diff — <short> <summary>` of the selected commit. The list is the file switcher; there is no other.
const diffWindow = () => fullDialog('Diff — a1b2c3d Dedupe lanes when parent already expected', `
  ${changedFiles({ selected: 0, width: 320 })}
  ${splitH()}
  <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; background: var(--bg-panel);">
    ${noExpand(diffHeader())}${diffBody()}
  </div>`);

// ---------- artboards ----------

/** Every artboard body, built for one theme. */
function boards(t) {
const out = {};
const F = (w, h, inner) => frame(w, h, inner, t);

// --- Row 1 · 1280×800 ---------------------------------------------------------

// History: grid + details, full height. No commit panel in sight.
out.Main = F(1280, 800, `${toolbarB('full', 'history', { update: true })}
  <div style="display: flex; flex: 1; min-height: 0;">${sidebarFull({ collapseBtn: true })}${splitH()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">${grid(t, DEMO_ROWS.slice(0, 14), { selected: 1, hover: 4, height: gridH(14) })}${splitV()}${details3()}</div>
  </div>${dock({ open: false })}${statusbar({ counts: '4 unstaged · 2 staged' })}`);

// Changes: the commit panel gets the whole content area.
out.Changes = F(1280, 800, `${toolbarB('full', 'changes')}
  <div style="display: flex; flex: 1; min-height: 0;">${sidebarFull({ collapseBtn: true })}${splitH()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">${changesBar()}${commit3(340, 360)}</div>
  </div>${dock({ open: false })}${statusbar({ counts: '4 unstaged · 2 staged' })}`);

const historyBody = (rows = 14) => `${toolbarB('full', 'history')}
  <div style="display: flex; flex: 1; min-height: 0;">${sidebarFull({ collapseBtn: true })}${splitH()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">${grid(t, DEMO_ROWS.slice(0, rows), { selected: 1, hover: -1, height: gridH(rows) })}${splitV()}${details3()}</div>
  </div>${dock({ open: false })}${statusbar({ counts: '4 unstaged · 2 staged' })}`;

// The palette with a query typed: no Recent group, matches across every group.
out.Palette = F(1280, 800, `${historyBody()}${palette({ query: 'st', groups: QUERY_GROUPS })}`);

// The palette the moment it opens: Recent first, then views, branches, repositories.
out.PaletteEmpty = F(1280, 800, `${historyBody()}${palette({ query: '', groups: EMPTY_GROUPS, footer: true })}`);

// --- Row 2 · 1000×680 ---------------------------------------------------------

const h1000 = (railOpts, flyout) => `${toolbarB('tight', 'history')}
  <div style="display: flex; flex: 1; min-height: 0; position: relative;">${rail(railOpts)}${flyout || ''}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">${grid(t, DEMO_ROWS.slice(0, 8), { selected: 1, hover: 4, height: gridH(8) })}${splitV()}${details2()}</div>
  </div>${dock({ open: false })}${statusbar({ counts: '4 unstaged · 2 staged' })}`;

// The details pane's middle step: commit + files over one column, diff beside it.
out.History1000 = F(1000, 680, h1000({}));

// Changes still fits three columns at 1000.
out.Changes1000 = F(1000, 680, `${toolbarB('tight', 'changes')}
  <div style="display: flex; flex: 1; min-height: 0;">${rail()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">${changesBar()}${commit3(300, 320)}</div>
  </div>${dock({ open: false })}${statusbar({ counts: '4 unstaged · 2 staged' })}`);

// A rail button opens its section as a flyout over the content.
out.Flyout1000 = F(1000, 680, h1000({ on: 'local' }, railFlyout(4)));

// The dock hangs under either view; the commit panel shrinks above it.
out.Dock1000 = F(1000, 680, `${toolbarB('tight', 'changes')}
  <div style="display: flex; flex: 1; min-height: 0;">${rail()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">${changesBar()}${commit3(300, 320)}</div>
  </div>${dock({ open: true })}${statusbar({ busy: 'Pushing…', counts: '4 unstaged · 2 staged' })}`);

// --- Row 3 · 720×540 ----------------------------------------------------------

const h720 = `${toolbarB('icons', 'history')}
  <div style="display: flex; flex: 1; min-height: 0;">${rail()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">${grid(t, DEMO_ROWS.slice(0, 8), { selected: 1, hover: -1, height: gridH(8), lanes: 2 })}${splitV()}${details720()}</div>
  </div>${dock({ open: false })}${statusbar({ counts: '4 unstaged · 2 staged' })}`;
const c720 = `${toolbarB('icons', 'changes')}
  <div style="display: flex; flex: 1; min-height: 0;">${rail()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">${changesBar()}${commit2(280)}</div>
  </div>${dock({ open: false })}${statusbar({ counts: '4 unstaged · 2 staged' })}`;

out.History720 = F(720, 540, h720);
out.Changes720 = F(720, 540, c720);
out.Overflow720 = F(720, 540, `${c720}${overflowMenu()}`);
// At 540 tall the list is ranked down to the top hits per group; the rest scrolls.
const QUERY_GROUPS_720 = QUERY_GROUPS.map((g) => ({ ...g, items: g.items.slice(0, 2) }));
out.Palette720 = F(720, 540, `${h720}${palette({ query: 'st', width: 720 - 32, top: 48, groups: QUERY_GROUPS_720 })}`);

// --- Row 4 · states · 1280×800 ------------------------------------------------

// banners.ts wording, drawn as States.mjs draws them: TriangleAlert 14, primary button last.
const banner = (kind, text, btns) => `<div class="banner ${kind}" style="flex: none;">${icon('alert', 14)}<span class="grow">${text}</span>${btns}</div>`;
const sec = (l) => `<span class="btn secondary sm">${l}</span>`;
const pri = (l) => `<span class="btn primary sm">${l}</span>`;

// Banners sit above whichever view is showing — here, Changes mid-merge.
out.ChangesMerge = F(1280, 800, `${toolbarB('full', 'changes')}
  ${banner('warning', 'Merge in progress — resolve conflicts, then commit to finish', sec('Abort') + pri('Commit merge'))}
  ${banner('danger', '1 file has conflicts — resolve, then stage it', '')}
  <div style="display: flex; flex: 1; min-height: 0;">${sidebarFull({ collapseBtn: true })}${splitH()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">${changesBar({ text: 'Changes on <span class="mono" style="font-size: 12px;">main</span> <span class="muted" style="font-weight: 400;">· 4 unstaged · 2 staged · 1 conflicted</span>' })}${commit3(260, 280, {
      conflict: true, extraBar: false,
      header: diffHeader({ path: 'src/log/graph.rs', add: 0, del: 0, note: 'conflict markers', resolve: true, staging: true }),
    })}</div>
  </div>${dock({ open: false })}${statusbar({ counts: '4 unstaged · 2 staged · 1 conflicted', state: 'Merge in progress' })}`);

// The working-tree row is the door to Changes: WorkingTreeRow.tsx puts an always-visible
// `Open changes →` hint (`.wtHint`: italic, nowrap, --fg-muted) in the row's author cell.
const dirtyGrid = grid(t, DEMO_ROWS.slice(0, 14), { selected: 1, hover: -1, height: gridH(14) })
  .replace(
    'Working tree · 4 changes</span></span><span class="meta" style="width: 110px;"></span>',
    'Working tree · 4 changes</span></span><span class="meta" style="width: 110px; font-style: italic; white-space: nowrap;">Open changes →</span>',
  );
out.HistoryDirty = F(1280, 800, `${toolbarB('full', 'history')}
  <div style="display: flex; flex: 1; min-height: 0;">${sidebarFull({ collapseBtn: true })}${splitH()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">${dirtyGrid}${splitV()}${details3()}</div>
  </div>${dock({ open: false })}${statusbar({ counts: '4 unstaged · 2 staged' })}`);

// A selected stash takes the details pane, as it does today.
out.StashPreview = F(1280, 800, `${toolbarB('full', 'history')}
  <div style="display: flex; flex: 1; min-height: 0;">${sidebarFull({ collapseBtn: true, stashSelected: true })}${splitH()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">${grid(t, DEMO_ROWS.slice(0, 14), { selected: -1, hover: -1, height: gridH(14) })}${splitV()}
      <div style="display: flex; flex: 1; min-height: 0;">${stashDetails()}${splitH()}
        <div style="display: flex; flex-direction: column; flex: 1; min-width: 0; background: var(--bg-panel);">${diffHeader({ path: 'crates/git-core/src/log/graph.rs', add: 12, del: 3 })}${diffBody()}</div>
      </div>
    </div>
  </div>${dock({ open: false })}${statusbar({ counts: '4 unstaged · 0 staged' })}`);

// A clean tree in Changes is an empty state, not an empty list.
out.ChangesEmpty = F(1280, 800, `${toolbarB('full', 'changes', { count: 0 })}
  <div style="display: flex; flex: 1; min-height: 0;">${sidebarFull({ collapseBtn: true })}${splitH()}
    <div style="display: flex; flex-direction: column; flex: 1; min-width: 0;">${changesBar({ text: 'Changes on <span class="mono" style="font-size: 12px;">main</span> <span class="muted" style="font-weight: 400;">· nothing to commit</span>', stash: false })}
      <div style="display: flex; flex: 1; min-height: 0;">
        <div class="empty" style="flex: 1; background: var(--bg-panel);">${icon('check-circle', 24)}<div class="t">Working tree clean</div><div class="hint">Edit files, or amend the last commit.</div><span class="btn secondary sm" style="margin-top: 6px;">Amend last commit…</span></div>
        ${message({ width: 360, empty: true })}
      </div>
    </div>
  </div>${dock({ open: false })}${statusbar({ counts: '0 unstaged · 0 staged' })}`);

// --- Row 5 · full-window dialogs · 1280×800 -----------------------------------

// Repository › Commit… (or the message column's expand button) over whichever view is showing.
out.CommitDialog = F(1280, 800, `${historyBody()}${commitDialog()}`);

// The diff header's expand button opens the same files + diff as a window of its own.
out.DiffWindow = F(1280, 800, `${historyBody()}${diffWindow()}`);

return out;
}

const sizes = {
  Main: [1280, 800], Changes: [1280, 800], Palette: [1280, 800], PaletteEmpty: [1280, 800],
  History1000: [1000, 680], Changes1000: [1000, 680], Flyout1000: [1000, 680], Dock1000: [1000, 680],
  History720: [720, 540], Changes720: [720, 540], Overflow720: [720, 540], Palette720: [720, 540],
  ChangesMerge: [1280, 800], HistoryDirty: [1280, 800], StashPreview: [1280, 800], ChangesEmpty: [1280, 800],
  CommitDialog: [1280, 800], DiffWindow: [1280, 800],
};
const titles = {
  Main: 'History · 1280', Changes: 'Changes · 1280', Palette: 'Palette · query', PaletteEmpty: 'Palette · empty',
  History1000: 'History · 1000', Changes1000: 'Changes · 1000', Flyout1000: 'Rail flyout · 1000', Dock1000: 'Dock open · 1000',
  History720: 'History · 720', Changes720: 'Changes · 720', Overflow720: 'Overflow menu · 720', Palette720: 'Palette · 720',
  ChangesMerge: 'Merge in progress', HistoryDirty: 'Working tree row', StashPreview: 'Stash preview', ChangesEmpty: 'Clean tree',
  CommitDialog: 'Commit dialog', DiffWindow: 'Diff window',
};
const pos = {
  Main: [0, 0], Changes: [1380, 0], Palette: [2760, 0], PaletteEmpty: [4140, 0],
  History1000: [0, 1080], Changes1000: [1100, 1080], Flyout1000: [2200, 1080], Dock1000: [3300, 1080],
  History720: [0, 1960], Changes720: [820, 1960], Overflow720: [1640, 1960], Palette720: [2460, 1960],
  ChangesMerge: [0, 2700], HistoryDirty: [1380, 2700], StashPreview: [2760, 2700], ChangesEmpty: [4140, 2700],
  CommitDialog: [0, 3700], DiffWindow: [1380, 3700],
};

const THEMES = [['light', ''], ['dark', 'Dark']];
const names = Object.keys(boards('light'));
mkdirSync(out, { recursive: true });
for (const [theme, suffix] of THEMES)
  for (const [name, body] of Object.entries(boards(theme))) {
    writeFileSync(join(out, `${name}${suffix}.dc.html`), page(body, sizes[name][0], theme));
    console.log('wrote', `${name}${suffix}.dc.html`);
  }

const canvas = {
  pages: [
    { id: 'page-1', name: 'Light' },
    { id: 'page-2', name: 'Dark' },
  ],
  artboards: THEMES.flatMap(([theme, suffix]) =>
    names.map((n) => ({
      file: `${n}${suffix}.dc.html`,
      title: theme === 'dark' ? `${titles[n]} · dark` : titles[n],
      x: pos[n][0], y: pos[n][1], w: sizes[n][0], h: sizes[n][1],
      page: theme === 'dark' ? 'page-2' : 'page-1',
    })),
  ),
  annotations: [
    { id: 'row-1', x: 0, y: -220, w: 620, text: "DIRECTION B + PALETTE — one content view at a time\n• The toolbar keeps today's buttons (Branch and Stash stay); the Commit button becomes the History | Changes switch (Alt+1 / Alt+2). Changes carries the working-tree count.\n• History = grid + details, full height. Changes = the commit panel, full content area — three columns still fit at 1000.\n• Search + branch filter belong to History and leave the toolbar in Changes.\n• Ctrl+K opens the palette from anywhere: every action, view switch, go-to-branch, recent repos. Same items the menus have; searchable.\n• The full-window commit dialog and diff window stay, whatever the window size." },
    { id: 'row-1-palette', x: 2760, y: -220, w: 520, text: 'PALETTE — commands, views, go-to. Typing filters across groups; empty shows Recent first. Commit search stays in the toolbar (History only).' },
    { id: 'row-2', x: 0, y: 860, w: 620, text: "1000 WIDE — sidebar becomes the 36px rail (or Alt+0 any time); a rail icon opens the section as a flyout. Details pane goes to two columns (commit + files over | diff) so the changed files stay browsable beside the diff. Changes keeps three columns. The dock still hangs under either view." },
    { id: 'row-3', x: 0, y: 1740, w: 620, text: "720 WIDE — icons-only toolbar with ⋯ overflow. Details pane keeps two columns: a files-only 220px column (paths shown relative to their common folder) beside the diff, with the commit details collapsed to a one-line header that expands over the file list. Changes goes two columns (files over message | diff). Window minimum 700×500." },
    { id: 'row-4', x: 0, y: 2480, w: 620, text: "STATES — banners sit above whichever view is showing. The working-tree row in History is the door to Changes (click or Enter → Changes, with an always-visible `Open changes →` hint at the row's right; double-click → the commit dialog). Selecting a commit or a branch while in Changes stays in Changes; the selection is there when you return with Alt+1. A selected stash takes the details pane as it does today. A clean tree in Changes is an empty state, not an empty list." },
    { id: 'row-5', x: 0, y: 3480, w: 620, text: "FULL-WINDOW DIALOGS — unchanged by B. The commit dialog and the diff window stay reachable at every window size (Repository › Commit…, double-click the working-tree row; the expand button in any diff header). They sit over whichever view is showing." },
    { id: 'decided', x: 5520, y: 0, w: 520, text: "DECIDED 2026-09-14\n1. Branch and Stash keep their toolbar buttons.\n2. Alt+1 History · Alt+2 Changes · Alt+0 sidebar (Ctrl+digit is the repository tabs).\n3. Details pane: three columns → two columns (commit + files | diff) → tabs. Revised once: tabs alone lose the file list next to the diff.\n4. Selecting a commit while in Changes stays in Changes.\n5. Palette = actions + views + branches + recent repos. Commit / file search by prefix → roadmap.\n6. Full-window commit dialog stays.\n\nROADMAP\n• Palette `#` commits / `/` files.\n• Stash dialog does not show the working tree it is about to stash." },
  ],
  launch: { view: 'canvas', page: 'page-1' },
};
writeFileSync(join(out, 'canvas.json'), JSON.stringify(canvas, null, 2) + '\n');
console.log('wrote canvas.json');
