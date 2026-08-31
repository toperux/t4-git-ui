// Shared chrome for A2 screen artboards. Everything composes A1 components (base.css classes).
import { icon, tokens, PAGE_BG } from './lib.mjs';
export { icon, tokens, PAGE_BG };

export const W = 1440, H = 900;

/** Full-window frame: 1440×900, themed. */
export function frame(theme, inner, { scrim = null } = {}) {
  // Outer root is always .t-light: metrics/fonts are only defined on :root (→ .t-light); .t-dark only swaps colors.
  return `<div class="canvas-root t-light" style="width: ${W}px; height: ${H}px;"><div class="t-${theme} sheet" style="width: ${W}px; height: ${H}px; display: flex; flex-direction: column; overflow: hidden; position: relative;">${inner}${scrim ? `<div style="position: absolute; inset: 0; background: var(--scrim); display: flex; align-items: flex-start; justify-content: center; padding-top: 160px;">${scrim}</div>` : ''}</div></div>`;
}

export function toolbar({ pull = 5, push = 2, commit = 4, filter = 'All branches', search = 'Search commits' } = {}) {
  return `<div class="toolbar" style="flex: none;">
    <span class="tb-btn">${icon('arrow-down', 18)}Fetch</span>
    <span class="tb-btn">${icon('arrow-down-up', 18)}Pull${pull ? ` <span class="cnt">${pull}</span>` : ''}</span>
    <span class="tb-btn">${icon('arrow-up', 18)}Push${push ? ` <span class="cnt">${push}</span>` : ''}</span>
    <span class="tb-sep"></span>
    <span class="tb-btn">${icon('git-branch', 18)}Branch</span>
    <span class="tb-btn">${icon('archive', 18)}Stash</span>
    <span class="tb-sep"></span>
    <span class="tb-btn">${icon('git-commit', 18)}Commit${commit ? ` <span class="cnt">${commit}</span>` : ''}</span>
    <div style="flex: 1;"></div>
    <span class="input" style="width: 240px; height: 26px;">${icon('search', 14)}<span class="ph">${search}</span></span>
    <span class="input select" style="min-width: 150px; height: 26px; margin-left: 4px;"><span>${filter}</span>${icon('chevron-down', 14)}</span>
    <span class="tb-sep"></span>
    <span class="icon-btn">${icon('refresh')}</span>
    <span class="icon-btn">${icon('settings')}</span>
  </div>`;
}

const tr = (d, s, tw, ic, txt, extra = '') => `<div class="row ${s}" style="--d: ${d};"><span class="tw">${tw ? icon(tw, 12) : ''}</span>${icon(ic, 14, 'muted')}<span class="grow">${txt}</span>${extra}</div>`;
const sh = (open, name, count, extra = '') => `<div class="section-header"><span class="tw">${icon(open ? 'chevron-down' : 'chevron-right', 12)}</span><span class="grow">${name}</span>${extra}<span class="badge">${count}</span></div>`;

export function sidebar({ width = 260, current = 'main', empty = false, detached = false } = {}) {
  const body = empty
    ? `${sh(true, 'Local', 0)}<div class="empty" style="padding: 20px 12px;">${icon('git-branch', 20)}<div class="sm">No branches yet</div></div>${sh(false, 'Remotes', 0)}${sh(false, 'Tags', 0)}${sh(false, 'Stashes', 0)}`
    : `${sh(true, 'Local', 4)}
      ${tr(0, current === 'main' && !detached ? 'is-selected' : '', '', 'git-branch', `<span style="font-weight: 600;">main</span>`, `<span class="ab">${icon('arrow-up', 12)}2 ${icon('arrow-down', 12)}5</span>`)}
      ${tr(0, '', 'chevron-down', 'folder', 'feature')}
      ${tr(1, '', '', 'git-branch', 'lane-graph', `<span class="ab">${icon('arrow-up', 12)}2</span>`)}
      ${tr(1, '', '', 'git-branch', 'diff-viewer')}
      ${tr(0, '', '', 'git-branch', 'hotfix-index-lock')}
      ${sh(true, 'Remotes', 3, `<span class="icon-btn" style="width: 20px; height: 20px;">${icon('plus', 14)}</span>`)}
      ${tr(0, '', 'chevron-down', 'cloud', 'origin')}
      ${tr(1, '', '', 'git-branch', 'main')}
      ${tr(1, '', '', 'git-branch', 'feature/lane-graph')}
      ${tr(1, '', '', 'git-branch', 'hotfix-index-lock')}
      ${sh(false, 'Tags', 12)}
      ${sh(true, 'Stashes', 1)}
      ${tr(0, '', '', 'archive', 'WIP on main: lane colors')}`;
  return `<div class="tree scroll" style="width: ${width}px; flex: none; background: var(--bg-app); border-right: 1px solid var(--border); padding: 4px 0; overflow: hidden;">${body}</div>`;
}

export function statusbar({ branch = 'main', ab = true, right = 'Clean', busy = null, detached = false } = {}) {
  return `<div class="statusbar" style="flex: none;">
    <span class="item">${icon('git-branch', 12)}${detached ? '<span class="mono" style="font-size: 11px;">a1b2c3d</span> (detached)' : branch}</span>
    ${ab && !detached ? `<span class="item ab">${icon('arrow-up', 12)}2 ${icon('arrow-down', 12)}5</span>` : ''}
    <span class="item">${icon('cloud', 12)}origin · github.com/topher/t4-git-ui</span>
    <span class="grow"></span>
    ${busy ? `<span class="item"><span class="spinner" style="width: 10px; height: 10px; border-width: 1.5px;"></span>${busy}</span>` : ''}
    <span class="item">${icon('check-circle', 12)}${right}</span>
    <span class="item">git 2.55.0</span>
  </div>`;
}

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
  { lane: 1, color: 1, kind: 'commit', lines: [[0, 0, 0], [1, 0, 1]], subj: 'Start lane graph module', chips: 'stash', author: 'Topher M.', date: 'Aug 29', sha: '3b2a1f0' },
  { lane: 0, color: 0, kind: 'commit', lines: [[0, 0, 0]], subj: 'Refs: label map with synced remote rule', author: 'Ada L.', date: 'Aug 28', sha: 'c4d5e6f' },
  { lane: 1, color: 2, kind: 'commit', lines: [[0, 0, 0], [1, 1, 2]], subj: 'Retry on index.lock', chips: 'hotfix', author: 'Ada L.', date: 'Aug 28', sha: 'b7a6c5d' },
  { lane: 0, color: 0, kind: 'commit', lines: [[0, 0, 0], [1, 1, 2]], subj: 'Status: porcelain v2 fallback behind flag', chips: 'v011', author: 'Topher M.', date: 'Aug 27', sha: '0f1e2d3' },
  { lane: 0, color: 0, kind: 'commit', lines: [[0, 0, 0], [1, 0, 2]], subj: 'Diff: two sources (display vs stage-able)', author: 'Topher M.', date: 'Aug 26', sha: '6a5b4c3' },
  { lane: 0, color: 0, kind: 'commit', lines: [[0, 0, 0]], subj: 'git-core: error type + git_version probe', author: 'Topher M.', date: 'Aug 22', sha: 'd9e8f7a' },
  { lane: 0, color: 0, kind: 'commit', lines: [[0, 0, 0]], subj: 'Tauri 2 shell, plugins, tracing', chips: 'v010', author: 'Topher M.', date: 'Aug 21', sha: '2c3d4e5' },
  { lane: 0, color: 0, kind: 'commit', lines: [], subj: 'Initial workspace', author: 'Topher M.', date: 'Aug 20', sha: '0a1b2c3' },
];

const CHIPS = {
  head: `<span class="chip head">HEAD</span><span class="chip local current">${icon('git-branch', 11)}main</span>`,
  origin: `<span class="chip remote">${icon('cloud', 11)}origin/main</span>`,
  feature: `<span class="chip local">${icon('git-branch', 11)}feature/lane-graph<span class="rem">${icon('cloud', 11)}origin</span></span>`,
  stash: `<span class="chip stash">${icon('archive', 11)}stash@{0}</span>`,
  hotfix: `<span class="chip local">${icon('git-branch', 11)}hotfix-index-lock<span class="rem">${icon('cloud', 11)}origin</span></span>`,
  v011: `<span class="chip tag">${icon('tag', 11)}v0.1.1</span>`,
  v010: `<span class="chip tag">${icon('tag', 11)}v0.1.0</span>`,
  detached: `<span class="chip head">HEAD</span>`,
};

export function gridHeader() {
  return `<div class="th" style="flex: none;">
    <span class="col" style="width: 56px;">Graph</span><span class="rs"></span>
    <span class="col sort" style="flex: 1;">Subject ${icon('chevron-down', 12)}</span><span class="rs"></span>
    <span class="col" style="width: 110px;">Author</span><span class="rs"></span>
    <span class="col" style="width: 80px;">Date</span><span class="rs"></span>
    <span class="col" style="width: 64px;">SHA</span>
  </div>`;
}

export function grid(theme, rows, { selected = 1, hover = 4, height = null, lanes = 3 } = {}) {
  const rowsHtml = rows.map((r, i) => {
    const s = i === selected ? 'is-selected' : i === hover ? 'is-hover' : '';
    const chips = r.chips ? `<span style="display: inline-flex; gap: 4px; flex: none;">${CHIPS[r.chips]}</span>` : '';
    const subj = r.wt ? `<span style="color: var(--fg-muted); font-style: italic;">${r.subj}</span>` : `<span style="overflow: hidden; text-overflow: ellipsis;">${r.subj}</span>`;
    return `<div class="row ${s}" style="padding-left: 4px; padding-right: 8px; gap: 8px;"><span class="grow" style="display: flex; align-items: center; gap: 6px;">${chips}${subj}</span><span class="meta" style="width: 110px;">${r.author || ''}</span><span class="meta" style="width: 80px;">${r.date || ''}</span><span class="meta mono" style="width: 64px;">${r.sha || ''}</span></div>`;
  }).join('');
  return `<div style="display: flex; flex-direction: column; flex: ${height ? 'none' : '1'}; ${height ? `height: ${height}px;` : ''} min-height: 0; background: var(--bg-panel); overflow: hidden;">
    ${gridHeader()}
    <div style="display: flex; flex: 1; min-height: 0; overflow: hidden; position: relative;">
      <div style="width: 56px; flex: none; padding-left: 4px;">${graph(theme, rows, { lanes })}</div>
      <div style="flex: 1; min-width: 0;">${rowsHtml}</div>
      <div style="position: absolute; right: 3px; top: 8px; width: 4px; height: 90px; border-radius: 999px; background: var(--scrollbar-thumb);"></div>
    </div>
  </div>`;
}

export const dl = (cls, o, n, sg, tx) => `<div class="dl ${cls}"><span class="no">${o}</span><span class="no">${n}</span><span class="sg">${sg}</span><span class="tx">${tx}</span></div>`;

export function diffHeader({ path = 'crates/git-core/src/log/graph.rs', stats = '+42 −7', split = false } = {}) {
  return `<div class="panel-header" style="flex: none;">${icon('file', 14)}<span class="grow mono" style="font-size: 12px; color: var(--fg);">${path}</span><span class="xs" style="color: var(--success);">+42</span><span class="xs" style="color: var(--danger-text);">−7</span><span class="tb-sep"></span><span class="icon-btn ${split ? '' : 'is-on'}">${icon('rows', 14)}</span><span class="icon-btn ${split ? 'is-on' : ''}">${icon('columns', 14)}</span><span class="icon-btn">${icon('arrow-down-up', 14)}</span></div>`;
}

export function diffBody({ actions = false, selected = [] } = {}) {
  const sel = (i) => (selected.includes(i) ? 'is-selected' : '');
  const hunkBtns = actions ? `<span class="btn secondary">Discard</span><span class="btn primary">Stage hunk</span>` : '';
  return `<div class="diff scroll" style="flex: 1; border: 0; border-radius: 0; overflow: hidden;">
    <div class="hunk"><span class="grow">@@ -112,9 +112,14 @@ impl LaneLayout</span>${hunkBtns}</div>
    ${dl('', 112, 112, ' ', '    pub fn push(&amp;mut self, oid: Oid, parents: &amp;[Oid]) -&gt; RowLayout {')}
    ${dl('', 113, 113, ' ', '        let matches: Vec&lt;usize&gt; = self.cols.iter().positions(|c| c.expecting == oid).collect();')}
    ${dl('del', 114, '', '−', '        let lane = matches[0];')}
    ${dl('add ' + sel(0), '', 114, '+', '        let lane = match matches.first() {')}
    ${dl('add ' + sel(1), '', 115, '+', '            Some(&amp;l) =&gt; l,')}
    ${dl('add ' + sel(2), '', 116, '+', '            None =&gt; self.new_column(oid),')}
    ${dl('add ' + sel(3), '', 117, '+', '        };')}
    ${dl('', 115, 118, ' ', '        let mut lines = Vec::new();')}
    ${dl('', 116, 119, ' ', '        for &amp;j in matches.iter().skip(1) {')}
    ${dl('add', '', 120, '+', '            lines.push(GraphLine { from: j as u16, to: lane as u16, color: self.cols[j].color, kind: Merge });')}
    ${dl('del', 117, '', '−', '            lines.push(merge_line(j, lane));')}
    ${dl('', 118, 121, ' ', '            self.remove.push(j);')}
    ${dl('', 119, 122, ' ', '        }')}
    <div class="hunk"><span class="grow">@@ -140,4 +145,9 @@ impl LaneLayout</span>${hunkBtns}</div>
    ${dl('', 140, 145, ' ', '        if let Some(&amp;p0) = parents.first() {')}
    ${dl('add', '', 146, '+', '            if let Some(k) = self.cols.iter().position(|c| c.expecting == p0) {')}
    ${dl('add', '', 147, '+', '                lines.push(GraphLine { from: lane as u16, to: k as u16, color: self.cols[lane].color, kind: Branch });')}
    ${dl('add', '', 148, '+', '                self.remove.push(lane);')}
    ${dl('add', '', 149, '+', '            } else {')}
    ${dl('', 141, 150, ' ', '            self.cols[lane].expecting = p0;')}
  </div>`;
}

export function changedFiles({ selected = 1, flat = true } = {}) {
  const f = (s, g, p, m) => `<div class="row ${s}" style="padding-left: 8px;"><span class="glyph ${g}">${g}</span><span class="grow mono" style="font-size: 12px;">${p}</span><span class="meta">${m}</span></div>`;
  return `<div style="display: flex; flex-direction: column; flex: 1; min-width: 0; background: var(--bg-panel); border-right: 1px solid var(--border);">
    <div class="panel-header" style="flex: none;">${icon('file', 14)}<span class="grow">4 files changed</span><span class="icon-btn ${flat ? 'is-on' : ''}">${icon('rows', 14)}</span><span class="icon-btn ${flat ? '' : 'is-on'}">${icon('folder', 14)}</span></div>
    ${f(selected === 0 ? 'is-selected' : '', 'M', 'crates/git-core/src/log/graph.rs', '+42 −7')}
    ${f(selected === 1 ? 'is-selected' : '', 'A', 'crates/git-core/src/log/cache.rs', '+88')}
    ${f(selected === 2 ? 'is-selected' : '', 'M', 'crates/git-core/src/lib.rs', '+3 −1')}
    ${f(selected === 3 ? 'is-selected' : '', 'R', 'src/log.rs → src/log/mod.rs', '')}
  </div>`;
}

export function commitDetails() {
  const kv = (k, v) => `<div style="display: flex; gap: 8px; font-size: 12px; line-height: 16px;"><span class="muted" style="width: 64px; flex: none;">${k}</span><span style="min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${v}</span></div>`;
  return `<div class="scroll" style="width: 340px; flex: none; display: flex; flex-direction: column; background: var(--bg-panel); border-right: 1px solid var(--border); overflow: hidden;">
    <div class="panel-header" style="flex: none;">${icon('git-commit', 14)}<span class="grow">Commit</span><span class="icon-btn">${icon('copy', 14)}</span><span class="icon-btn">${icon('ellipsis', 14)}</span></div>
    <div style="padding: 10px 12px; display: flex; flex-direction: column; gap: 10px;">
      <div style="display: flex; gap: 4px; flex-wrap: wrap;">${CHIPS.head}${CHIPS.origin}</div>
      <div class="h3" style="font-weight: 600;">Dedupe lanes when parent already expected</div>
      <div class="sm" style="color: var(--fg); white-space: pre-line;">When a commit's first parent is already expected by another column, emit a Branch line into that column and drop the current lane instead of creating a duplicate expectation. Keeps wide histories narrow.

Fixes #12.</div>
      <div style="display: flex; flex-direction: column; gap: 4px; padding-top: 6px; border-top: 1px solid var(--border);">
        ${kv('Author', 'Topher M. &lt;topher.m@gmail.com&gt;')}
        ${kv('Date', 'Aug 31, 2026 14:02 (2h ago)')}
        ${kv('SHA', '<span class="mono" style="font-size: 12px;">a1b2c3d4e5f60718293a4b5c6d7e8f9012345678</span>')}
        ${kv('Parent', '<span class="mono" style="font-size: 12px; color: var(--accent-text);">9f8e7d6</span>')}
      </div>
    </div>
  </div>`;
}

export function dock({ open = false, running = null } = {}) {
  if (!open) {
    return `<div class="panel-header" style="flex: none; border-top: 1px solid var(--border); border-bottom: 0;">${icon('terminal', 14)}<span class="grow mono" style="font-size: 12px; color: var(--fg-muted);">$ git fetch --progress origin</span><span class="xs" style="color: var(--success);">✓ exit 0 · 1.1s</span><span class="icon-btn">${icon('chevron-up', 14)}</span></div>`;
  }
  return `<div style="flex: none; height: 200px; display: flex; flex-direction: column; border-top: 1px solid var(--border);">
    <div class="panel-header" style="flex: none;">${icon('terminal', 14)}<span class="grow mono" style="font-size: 12px; color: var(--fg);">$ git push --progress origin main</span><span class="xs muted">4.2s</span><span class="spinner" style="width: 10px; height: 10px; border-width: 1.5px;"></span><span class="btn secondary sm">Cancel</span><span class="icon-btn">${icon('chevron-down', 14)}</span></div>
    <div class="output scroll" style="flex: 1; border-radius: 0; overflow: hidden;">
      <div class="cmd">$ git fetch --progress origin</div><div>From github.com:topher/t4-git-ui</div><div>   a1b2c3d..9f8e7d6  main       -&gt; origin/main</div><div class="ok">✓ exit 0 · 1.1s</div>
      <div class="cmd" style="margin-top: 6px;">$ git push --progress origin main</div><div>Enumerating objects: 12, done.</div><div>Counting objects: 100% (12/12), done.</div><div>Compressing objects: 100% (8/8), done.</div><div>Writing objects:  58% (7/12), 1.2 MiB | 600 KiB/s</div>
    </div>
    <div class="progress" style="border-radius: 0; height: 3px; flex: none;"><div style="width: 58%;"></div></div>
  </div>`;
}

export function splitV(hover = false) { return `<div class="split-v ${hover ? 'is-hover' : ''}" style="flex: none;"></div>`; }
export function splitH(hover = false) { return `<div class="split-h ${hover ? 'is-hover' : ''}" style="flex: none;"></div>`; }
