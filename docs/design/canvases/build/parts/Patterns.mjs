import { icon, twoUp, shell, section, grid, row, labeled, tokens, resolve } from '../lib.mjs';

function graphSvg(t, { selectedLane = 0 } = {}) {
  const c = (i) => tokens[t][`graph-${i}`];
  const W = 13, H = 26, rows = 7;
  const x = (l) => 10 + l * W;
  const y = (r) => r * H + H / 2;
  const el = [];
  // lanes: 0 main, 1 feature, 2 hotfix
  // row0 working tree (dashed node), row1 HEAD commit lane0, row2 merge lane0 from lane1, row3 lane1 commit, row4 lane0 commit, row5 branch out lane1 from lane0, row6 lane0
  el.push(`<line x1="${x(0)}" y1="${y(0)}" x2="${x(0)}" y2="${y(6)}" stroke="${c(0)}" stroke-width="2"/>`);
  // lane1 from row2 (merge into lane0) to row5 (branches off lane0)
  el.push(`<path d="M${x(0)} ${y(2)} C ${x(0)} ${y(2) + 10}, ${x(1)} ${y(3) - 10}, ${x(1)} ${y(3)}" fill="none" stroke="${c(1)}" stroke-width="2"/>`);
  el.push(`<line x1="${x(1)}" y1="${y(3)}" x2="${x(1)}" y2="${y(4)}" stroke="${c(1)}" stroke-width="2"/>`);
  el.push(`<path d="M${x(1)} ${y(4)} C ${x(1)} ${y(4) + 10}, ${x(0)} ${y(5) - 10}, ${x(0)} ${y(5)}" fill="none" stroke="${c(1)}" stroke-width="2"/>`);
  // lane2 short branch from row4 to row6 on lane0? show a pass-through lane 2
  el.push(`<path d="M${x(0)} ${y(1)} C ${x(0)} ${y(1) + 10}, ${x(2)} ${y(2) - 10}, ${x(2)} ${y(2)}" fill="none" stroke="${c(2)}" stroke-width="2"/>`);
  el.push(`<line x1="${x(2)}" y1="${y(2)}" x2="${x(2)}" y2="${y(6)}" stroke="${c(2)}" stroke-width="2" stroke-dasharray="0"/>`);
  // nodes
  const node = (l, r, col, opts = '') => `<circle cx="${x(l)}" cy="${y(r)}" r="3.5" fill="${col}" ${opts}/>`;
  el.push(`<circle cx="${x(0)}" cy="${y(0)}" r="3.5" fill="none" stroke="${c(0)}" stroke-width="1.5" stroke-dasharray="2 2"/>`); // working tree
  el.push(`<circle cx="${x(0)}" cy="${y(1)}" r="5" fill="none" stroke="${c(0)}" stroke-width="1.5"/>`); // HEAD ring
  el.push(node(0, 1, c(0)));
  el.push(node(0, 2, c(0))); // merge commit
  el.push(node(1, 3, c(1)));
  el.push(node(0, 4, c(0)));
  el.push(node(2, 5, c(2)));
  el.push(node(0, 6, c(0)));
  return `<svg width="${W * 3 + 14}" height="${H * rows}" viewBox="0 0 ${W * 3 + 14} ${H * rows}" style="display: block; flex: none;">${el.join('')}</svg>`;
}

function gridRows(t) {
  const subj = (s, txt, chips = '', author = 'Topher M.', date = '2h ago', sha = 'a1b2c3d', italic = false) =>
    `<div class="row ${s}" style="padding-left: 0; padding-right: 8px; gap: 8px;"><span class="grow" style="display: flex; align-items: center; gap: 6px; ${italic ? 'color: var(--fg-muted); font-style: italic;' : ''}">${chips ? `<span style="display: inline-flex; gap: 4px; flex: none;">${chips}</span>` : ''}<span style="overflow: hidden; text-overflow: ellipsis;">${txt}</span></span><span class="meta" style="width: 110px;">${author}</span><span class="meta" style="width: 80px;">${date}</span><span class="meta mono" style="width: 64px;">${sha}</span></div>`;
  return section('Revision grid row', 'graph column 13px/lane, width animating to the lanes in view (gone under a text filter) · row 26px · ref chips first (HEAD, current, local, remote, tag, stash, bisect; max 3 then a “+N” button that opens a popover of the rest), then subject · local + tracking remote on the same commit collapse into one chip (rows 4, 6) · author 110 · date 80 · sha 64 mono · working-tree pseudo-row italic on top (“Working tree · 4 changes”, or “Working tree · merge to commit” mid-operation) · Ctrl+click a second row for a compare, tinting both · pages not yet arrived draw “—” in --fg-faint',
    `<div class="list" style="display: flex; padding-left: 4px;">
      ${graphSvg(t)}
      <div style="flex: 1; min-width: 0;">
        ${subj('', 'Working tree · 4 changes', '', '', '', '', true)}
        ${subj('is-selected', 'Dedupe lanes when parent already expected', `<span class="chip head">HEAD</span><span class="chip local current">${icon('git-branch', 11)}main</span>`)}
        ${subj('', 'Merge branch ‘feature/lane-graph’', `<span class="chip remote">${icon('cloud', 11)}origin/main</span>`, 'Topher M.', '3h ago', '9f8e7d6')}
        ${subj('', 'Emit MergeInto lines for octopus parents', `<span class="chip local">${icon('git-branch', 11)}feature/lane-graph<span class="rem">${icon('cloud', 11)}origin</span></span><span class="chip stash">${icon('archive', 11)}stash@{0}</span>`, 'Topher M.', 'Yesterday', '5c4b3a2')}
        ${subj('is-hover', 'Cache log pages by generation', `<span class="chip bisect bad">${icon('bug', 11)}bad</span>`, 'Ada L.', 'Yesterday', '1e2d3c4')}
        ${subj('', 'Hotfix: index lock retry', `<span class="chip local">${icon('git-branch', 11)}hotfix-index-lock<span class="rem">${icon('cloud', 11)}origin</span></span><span class="chip tag">${icon('tag', 11)}v0.1.1</span><span class="chip remote">${icon('cloud', 11)}upstream/hotfix</span><span class="chip remote">+2</span>`, 'Ada L.', 'Aug 28', 'b7a6c5d')}
        ${subj('', 'Initial workspace', `<span class="chip tag">${icon('tag', 11)}v0.1.0</span><span class="chip bisect good">${icon('bug', 11)}good</span>`, 'Topher M.', 'Aug 20', '0a1b2c3')}
        ${subj('', '<span class="faint">—</span>', '', '<span class="faint">—</span>', '<span class="faint">—</span>', '<span class="faint">—</span>')}
      </div>
    </div>`);
}

function graphAnatomy(t) {
  const c = (i) => tokens[t][`graph-${i}`];
  const item = (svg, l, d) => `<div style="display: flex; gap: 10px; align-items: center;"><div style="width: 40px; height: 32px; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 4px; display: flex; align-items: center; justify-content: center;">${svg}</div><div><div class="sm" style="font-weight: 500;">${l}</div><div class="xs muted">${d}</div></div></div>`;
  const s = (inner) => `<svg width="30" height="30" viewBox="0 0 30 30">${inner}</svg>`;
  return section('Graph anatomy', 'lines 2px, round joins · curves are cubic between row centers (no diagonals) · node r 3.5 · HEAD = 5px ring · working tree = dashed ring',
    grid(2, [
      item(s(`<line x1="15" y1="0" x2="15" y2="30" stroke="${c(0)}" stroke-width="2"/><circle cx="15" cy="15" r="3.5" fill="${c(0)}"/>`), 'Commit', 'filled node on its lane'),
      item(s(`<line x1="15" y1="0" x2="15" y2="30" stroke="${c(0)}" stroke-width="2"/><circle cx="15" cy="15" r="5" fill="none" stroke="${c(0)}" stroke-width="1.5"/><circle cx="15" cy="15" r="3.5" fill="${c(0)}"/>`), 'HEAD', 'ring around node; chip in subject too'),
      item(s(`<line x1="15" y1="15" x2="15" y2="30" stroke="${c(0)}" stroke-width="2"/><circle cx="15" cy="15" r="3.5" fill="none" stroke="${c(0)}" stroke-width="1.5" stroke-dasharray="2 2"/>`), 'Working tree', 'dashed ring, top row only when dirty'),
      item(s(`<line x1="10" y1="0" x2="10" y2="30" stroke="${c(0)}" stroke-width="2"/><path d="M10 15 C 10 22, 22 8, 22 30" fill="none" stroke="${c(1)}" stroke-width="2"/><circle cx="10" cy="15" r="3.5" fill="${c(0)}"/>`), 'Merge in', 'second parent curves into the node'),
      item(s(`<line x1="10" y1="0" x2="10" y2="30" stroke="${c(0)}" stroke-width="2"/><path d="M10 15 C 10 8, 22 22, 22 0" fill="none" stroke="${c(1)}" stroke-width="2"/><circle cx="10" cy="15" r="3.5" fill="${c(0)}"/>`), 'Branch out', 'child lane curves away below the node'),
      item(s(`<line x1="10" y1="0" x2="10" y2="30" stroke="${c(0)}" stroke-width="2"/><line x1="20" y1="0" x2="20" y2="30" stroke="${c(2)}" stroke-width="2" opacity=".9"/><circle cx="10" cy="15" r="3.5" fill="${c(0)}"/>`), 'Pass-through', 'other lanes draw straight, under nodes'),
      item(s(`<rect x="0" y="0" width="30" height="30" fill="${resolve(t, 'bg-selected')}"/><line x1="15" y1="0" x2="15" y2="30" stroke="${c(0)}" stroke-width="2"/><circle cx="15" cy="15" r="3.5" fill="${c(0)}"/>`), 'Selected row', 'row tint spans graph column; lane colors unchanged'),
      item(s(`<line x1="15" y1="0" x2="15" y2="30" stroke="${c(3)}" stroke-width="2"/><circle cx="15" cy="15" r="3.5" fill="${c(3)}"/><circle cx="15" cy="15" r="1.5" fill="${resolve(t, 'bg-panel')}"/>`), 'Stash / tag-only', 'hollow center marks non-branch refs (optional)'),
    ], 12));
}

function sidebar() {
  const t = (d, s, tw, ic, txt, extra = '') => `<div class="row ${s}" style="--d: ${d};"><span class="tw">${tw ? icon(tw, 12) : ''}</span>${icon(ic, 14)}<span class="label">${txt}</span>${extra}</div>`;
  const head = (open, title, count, children = '') => `<div class="section-header"><span class="tw">${icon(open ? 'chevron-down' : 'chevron-right', 12)}</span><span class="grow">${title}</span><span class="badge">${count}</span>${children}</div>`;
  return section('Sidebar', '260px default, resizable 180–560 · --bg-app, with each section header in its own sticky --bg-panel band · sections Local / Remotes / Tags / Stashes, then Worktrees (only past one) and Submodules (only when there are any) · tree by “/” · a badge counts refs, never the grouping rows (Remotes counts remote branches) · folder rows amber + 600 with their ref count in meta · the checked-out branch swaps its glyph for an accent check; rows whose ref is the grid’s selected commit take the selected tint',
    `<div class="list tree" style="width: 260px; background: var(--bg-app); padding-bottom: 4px;">
      ${head(true, 'Local', 4)}
      ${t(0, 'current is-selected', '', 'check', 'main', `<span class="ab">${icon('arrow-up', 12)}2 ${icon('arrow-down', 12)}5</span>`)}
      ${t(0, 'folder', 'chevron-down', 'folder', 'feature', `<span class="meta">2</span>`)}
      ${t(1, '', '', 'git-branch', 'lane-graph', `<span class="ab">${icon('arrow-up', 12)}2</span>`)}
      ${t(1, '', '', 'git-branch', 'diff-viewer', `<span class="meta"><span class="badge" title="Its upstream is gone">gone</span></span>`)}
      ${t(0, '', '', 'git-branch', '<span class="muted">hotfix-index-lock</span>', `<span class="meta"><span class="badge" title="Already in main">merged</span></span>`)}
      ${head(true, 'Remotes', 31)}
      ${t(0, 'folder', 'chevron-right', 'cloud', 'origin', `<span class="meta">29</span>`)}
      ${t(0, 'folder', 'chevron-right', 'cloud', 'mirror', `<span class="meta">2</span>`)}
      ${head(true, 'Tags', 12)}
      ${t(0, '', '', 'tag', 'v0.9.0', `<span class="meta"><span class="badge" title="Not on origin (as of 5m ago)">local</span></span>`)}
      ${t(0, 'folder', 'chevron-right', 'cloud', 'origin', `<span class="meta">11</span>`)}
      ${head(true, 'Stashes', 1, `<span class="icon-btn">${icon('archive', 14)}</span>`)}
      ${t(0, '', '', 'archive', 'WIP on main: lane colors', `<span class="meta mono">stash@{0}</span>`)}
      ${head(true, 'Worktrees', 2)}
      ${t(0, 'current', '', 'folder-git-2', 't4-git-ui', `<span class="meta"><span class="mono">main</span><span class="badge">main</span><span class="badge">current</span></span>`)}
      ${t(0, '', '', 'folder-git-2', 'wt-release', `<span class="meta"><span class="mono">release/0.9</span><span class="badge">locked</span></span>`)}
      ${head(true, 'Submodules', 1)}
      ${t(0, '', '', 'package', 'vendor/libgit2', `<span class="meta"><span class="mono">a1b2c3d</span><span class="badge">not initialized</span></span>`)}
    </div>
    <div class="xs muted">Tags are a tree like the branches: the local ones nested by “/” (the count is those), then one cloud folder per remote that answered, holding the tags that remote has. A tag on none of them carries a <span class="badge">local</span> badge. Header menus: Worktrees → Add worktree… · Prune; Submodules → Update all; a remote’s folder row → fetch · copy URL · rename, change URL · remove. No remotes at all → an EmptyState with <span class="mono">Add remote…</span>; refs not in yet → a “Loading branches…” line.</div>`);
}

function diffAnatomy() {
  const line = (cls, o, n, sg, tx) => `<div class="dl ${cls}"><span class="no">${o}</span><span class="no">${n}</span><span class="sg">${sg}</span><span class="tx">${tx}</span></div>`;
  const bl = (age, label) => `<span class="bl" style="--age: ${age}; width: 120px;"><span class="grow">${label}</span></span>`;
  return section('Diff line · Hunk header · Line selection · Blame', 'gutters 40+40 · sign 14 · 20px lines · hunk header 24px with 24px buttons on hover · selected lines get accent sign column + inset ring and a sticky “N lines selected” bar · syntax highlighting per --syn-* · the Files tab adds a 180px blame gutter tinted by hunk age',
    `<div style="display: flex; flex-direction: column; gap: 12px;">
      <div class="diff">
        <div class="hunk"><span class="grow">@@ -12,6 +12,8 @@ pub fn walk()</span><span class="btn secondary">Discard</span><span class="btn primary">Stage hunk</span></div>
        ${line('', 12, 12, ' ', '<span class="syn-keyword">let</span> <span class="syn-keyword">mut</span> walk = repo.<span class="syn-function">revwalk</span>()?;')}
        ${line('add is-selected', '', 13, '+', 'walk.<span class="syn-function">push_head</span>()?;')}
        ${line('add is-selected', '', 14, '+', 'walk.<span class="syn-function">push_glob</span>(<span class="syn-string">"heads/*"</span>)?;')}
        ${line('del', 13, '', '−', 'walk.<span class="syn-function">push_glob</span>(<span class="syn-string">"refs/*"</span>)?; <span class="syn-comment">// all refs</span>')}
        ${line('', 14, 15, ' ', 'walk.<span class="syn-function">set_sorting</span>(<span class="syn-type">Sort</span><span class="syn-punct">::</span>TOPOLOGICAL)?;')}
        <div class="diff-bar"><span class="grow">2 lines selected</span><span class="btn secondary">Discard 2 lines</span><span class="btn primary">Stage 2 lines</span></div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 6px; overflow: hidden;">
        <div class="diff" style="border: 0; border-radius: 0;">${line('', 12, '', ' ', 'let mut walk = …')}${line('del', 13, '', '−', 'walk.push_glob(<span class="emph">"refs/*"</span>)?;')}<div class="dl filler"></div>${line('', 14, '', ' ', 'walk.set_sorting(…')}</div>
        <div class="diff" style="border: 0; border-radius: 0;">${line('', '', 12, ' ', 'let mut walk = …')}${line('add', '', 13, '+', 'walk.push_head()?;')}${line('add', '', 14, '+', 'walk.push_glob(<span class="emph">"heads/*"</span>)?;')}${line('', '', 15, ' ', 'walk.set_sorting(…')}</div>
      </div>
      <div class="diff">
        <div class="dl">${bl(5, 'Topher M. · 2h')}<span class="no">12</span><span class="tx">pub fn walk(repo: &Repository) {</span></div>
        <div class="dl">${bl(5, '')}<span class="no">13</span><span class="tx">    let mut walk = repo.revwalk()?;</span></div>
        <div class="dl">${bl(2, 'Ada L. · Aug 28')}<span class="no">14</span><span class="tx">    walk.set_sorting(Sort::TIME)?;</span></div>
        <div class="dl">${bl(1, 'Topher M. · Aug 20')}<span class="no">15</span><span class="tx">}<span class="nonl">\\ No newline at end of file</span></span></div>
      </div>
      <div class="xs muted">Side-by-side pairs consecutive −/+ runs; the unpaired side shows an empty 20px filler row. The blame label sits on a hunk’s first row and the tint alone on the rest — <span class="mono">--accent</span> at <span class="mono">--age × 4%</span>, five steps, oldest to newest.</div>
    </div>`);
}

function outputDock() {
  return section('Output dock', 'bottom, 160–320px, collapsible · header shows the running op + elapsed + Cancel · mono body on --bg-inset auto-scrolls, stderr italic · exit line coloured, with a 12px Check / X · a “$ git” prompt row sits under the log, outside it · no progress bar in the dock',
    `<div class="list" style="overflow: hidden;">
      <div class="panel-header">${icon('terminal', 14)}<span class="grow">git push origin main</span><span class="xs muted">4.2s</span><span class="spinner sm"></span><span class="btn secondary sm">Cancel</span><span class="icon-btn">${icon('chevron-down', 14)}</span></div>
      <div class="output" style="border-radius: 0;"><div class="cmd">$ git push --progress origin main</div><div>Enumerating objects: 12, done.</div><div class="stderr">Counting objects: 100% (12/12), done.</div><div class="stderr">Writing objects:  58% (7/12), 1.2 MiB | 600 KiB/s</div></div>
      <div class="prompt"><span class="command-input"><span class="prefix">$ git</span><span class="ph">rebase --onto …</span></span></div>
    </div>
    <div class="output" style="margin-top: 8px;"><div class="cmd">$ git fetch --progress origin</div><div>From github.com:topher/t4-git-ui</div><div>   a1b2c3d..9f8e7d6  main -&gt; origin/main</div><div class="ok" style="display: flex; align-items: center; gap: 4px;">${icon('check', 12)}exit 0 · 1.1s</div></div>
    <div class="output" style="margin-top: 8px;"><div class="cmd">$ git push origin main</div><div class="stderr">! [rejected] main -&gt; main (fetch first)</div><div class="err" style="display: flex; align-items: center; gap: 4px;">${icon('x', 12)}exit 1 · 0.8s</div></div>
    <div class="xs muted" style="margin-top: 8px;">The prompt holds a mono CommandInput with ↑ history and ref completion. With no operation yet the body reads “No output yet”.</div>`);
}

function dialogLayout() {
  return section('Dialog layout', 'title / body / footer · fields stacked, gap 12 · options as checkboxes · output-bearing dialogs are 560px and grow an output dock below the fields while running; footer primary becomes “Cancel” until exit',
    `<div class="scrim"><div class="dialog wide">
      <div class="dialog-title"><span class="grow">Push</span><span class="icon-btn">${icon('x')}</span></div>
      <div class="dialog-body">
        <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
          <div class="field"><span class="field-label">Remote</span><span class="input select"><span class="val">origin</span>${icon('chevron-down', 14, 'chevron')}</span></div>
          <div class="field"><span class="field-label">Branch</span><span class="input select"><span class="val">main → origin/main</span>${icon('chevron-down', 14, 'chevron')}</span></div>
        </div>
        <div style="display: flex; gap: 20px;"><span class="check"><span class="checkbox"></span>Force (with lease)</span><span class="check"><span class="checkbox"></span>Push tags</span><span class="check"><span class="checkbox is-checked">${icon('check', 12)}</span>Set upstream</span></div>
        <div class="output" style="display: flex; flex-direction: column; gap: 0;"><div class="cmd">$ git push --progress origin main</div><div>Enumerating objects: 12, done.</div><div>Writing objects:  58% (7/12), 1.2 MiB | 600 KiB/s</div></div>
        <div class="progress" style="height: 3px;"><div style="width: 58%;"></div></div>
      </div>
      <div class="dialog-foot"><span class="spinner"></span><span class="xs muted">4.2s</span><span class="preview">Runs <code>git push origin main</code></span><span class="grow"></span><span class="btn secondary">Cancel</span><span class="btn primary is-disabled">Push</span></div>
    </div></div>`);
}

function detailsPane() {
  const kv = (k, v) => `<div class="row" style="height: auto; padding: 2px var(--space-4); align-items: baseline;"><span class="meta" style="width: 72px;">${k}</span><span class="grow">${v}</span></div>`;
  return section('Details pane', '340px, resizable 240–560 (its file list 320 / 200–640) · header carries Copy only · a previewed stash takes the whole pane, pushing the selected commit behind it, and a Ctrl+click compare replaces it with a From / To panel',
    `<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start;">
      <div class="list">
        <div class="panel-header">${icon('git-commit', 14)}<span class="grow">Commit</span><span class="icon-btn">${icon('copy', 14)}</span></div>
        ${kv('Author', 'Topher M. <span class="signed">signed</span>')}
        ${kv('Committer', 'Ada L.')}
        ${kv('Parents', '<a class="mono" href="#">9f8e7d6</a> <a class="mono" href="#">5c4b3a2</a>')}
      </div>
      <div class="list">
        <div class="panel-header">${icon('archive', 14)}<span class="grow">stash@{0}</span></div>
        <div style="padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-4);">
          <div>WIP on main: lane colors</div>
          ${row([`<span class="btn secondary sm">Apply</span>`, `<span class="btn secondary sm">Pop</span>`, `<span class="btn danger sm">Drop…</span>`, `<span class="btn secondary sm">Open browser</span>`], 6)}
        </div>
        ${kv('On', 'main · a1b2c3d')}
        ${kv('Untracked', '2 files')}
      </div>
    </div>`);
}

function shortcuts() {
  const k = (...ks) => ks.map((x) => `<span class="kbd">${x}</span>`).join('');
  const r = (a, b) => `<div style="display: flex; align-items: center; gap: 8px; height: 22px;"><span class="grow" style="flex: 1;">${a}</span><span style="display: inline-flex; gap: 3px;">${b}</span></div>`;
  return section('Keyboard hints', 'shortcuts appear in tooltips and menus, never as labels · Ctrl on Win/Linux, ⌘ on macOS',
    `<div class="sm" style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 24px; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 6px; padding: 8px 12px;">
      ${r('Commit', k('Ctrl', 'Enter'))}${r('Fetch', k('Ctrl', 'F5'))}
      ${r('Stage / unstage file', k('Space'))}${r('Pull', k('Ctrl', 'Shift', 'L'))}
      ${r('Stage selected lines', k('S'))}${r('Push', k('Ctrl', 'Shift', 'U'))}
      ${r('Search commits', k('Ctrl', 'F'))}${r('Toggle output', k('Ctrl', '`'))}
    </div>`);
}

export default () => ({
  body: shell('Patterns', 'How components compose into the recurring pieces of the main window. Screens (canvas 2) are built only from these.',
    twoUp((t) => [gridRows(t), graphAnatomy(t), sidebar(), detailsPane(), diffAnatomy(), outputDock(), dialogLayout(), shortcuts()].join(''))),
});
