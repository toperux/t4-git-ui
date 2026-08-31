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
    `<div class="row ${s}" style="padding-left: 0; padding-right: 8px; gap: 8px;"><span class="grow" style="display: flex; align-items: center; gap: 6px; ${italic ? 'color: var(--fg-muted); font-style: italic;' : ''}">${chips ? `<span style="display: inline-flex; gap: 4px; flex: none;">${chips}</span>` : ''}<span style="overflow: hidden; text-overflow: ellipsis;">${txt}</span></span><span class="meta" style="width: 84px;">${author}</span><span class="meta" style="width: 60px;">${date}</span><span class="meta mono" style="width: 56px;">${sha}</span></div>`;
  return section('Revision grid row', 'graph column 13px/lane · row 26px · ref chips first (HEAD, current, local, remote, tag, stash; max 3 then “+N”), then subject · local + tracking remote on the same commit collapse into one chip (rows 4, 6) · author 84 · date 60 · sha 56 mono · working-tree pseudo-row italic on top',
    `<div class="list" style="display: flex; padding-left: 4px;">
      ${graphSvg(t)}
      <div style="flex: 1; min-width: 0;">
        ${subj('', 'Working tree · 4 changes', '', '', '', '', true)}
        ${subj('is-selected', 'Dedupe lanes when parent already expected', `<span class="chip head">HEAD</span><span class="chip local current">${icon('git-branch', 11)}main</span>`)}
        ${subj('', 'Merge branch ‘feature/lane-graph’', `<span class="chip remote">${icon('cloud', 11)}origin/main</span>`, 'Topher M.', '3h ago', '9f8e7d6')}
        ${subj('', 'Emit MergeInto lines for octopus parents', `<span class="chip local">${icon('git-branch', 11)}feature/lane-graph<span class="rem">${icon('cloud', 11)}origin</span></span><span class="chip stash">${icon('archive', 11)}stash@{0}</span>`, 'Topher M.', 'Yesterday', '5c4b3a2')}
        ${subj('is-hover', 'Cache log pages by generation', '', 'Ada L.', 'Yesterday', '1e2d3c4')}
        ${subj('', 'Hotfix: index lock retry', `<span class="chip local">${icon('git-branch', 11)}hotfix-index-lock<span class="rem">${icon('cloud', 11)}origin</span></span><span class="chip tag">${icon('tag', 11)}v0.1.1</span><span class="chip remote">${icon('cloud', 11)}upstream/hotfix</span><span class="chip remote">+2</span>`, 'Ada L.', 'Aug 28', 'b7a6c5d')}
        ${subj('', 'Initial workspace', `<span class="chip tag">${icon('tag', 11)}v0.1.0</span>`, 'Topher M.', 'Aug 20', '0a1b2c3')}
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
  const t = (d, s, tw, ic, txt, extra = '') => `<div class="row ${s}" style="--d: ${d};"><span class="tw">${tw ? icon(tw, 12) : ''}</span>${icon(ic, 14, 'muted')}<span class="grow">${txt}</span>${extra}</div>`;
  return section('Sidebar', '220–320px · sections collapsible · tree by “/” · counts as badges · HEAD branch bold',
    `<div class="list tree" style="width: 260px; background: var(--bg-app); padding-bottom: 4px;">
      <div class="section-header"><span class="tw">${icon('chevron-down', 12)}</span><span class="grow">Local</span><span class="badge">4</span></div>
      ${t(0, 'is-selected', '', 'git-branch', '<span style="font-weight: 600;">main</span>', `<span class="ab">${icon('arrow-up', 12)}2 ${icon('arrow-down', 12)}5</span>`)}
      ${t(0, '', 'chevron-down', 'folder', 'feature')}
      ${t(1, '', '', 'git-branch', 'lane-graph', `<span class="ab">${icon('arrow-up', 12)}2</span>`)}
      ${t(1, '', '', 'git-branch', 'diff-viewer')}
      ${t(0, '', '', 'git-branch', 'hotfix-index-lock')}
      <div class="section-header"><span class="tw">${icon('chevron-down', 12)}</span><span class="grow">Remotes</span><span class="badge">1</span></div>
      ${t(0, '', 'chevron-right', 'cloud', 'origin')}
      <div class="section-header"><span class="tw">${icon('chevron-right', 12)}</span><span class="grow">Tags</span><span class="badge">12</span></div>
      <div class="section-header"><span class="tw">${icon('chevron-down', 12)}</span><span class="grow">Stashes</span><span class="badge">1</span></div>
      ${t(0, '', '', 'archive', 'WIP on main: lane colors')}
    </div>`);
}

function diffAnatomy() {
  const line = (cls, o, n, sg, tx) => `<div class="dl ${cls}"><span class="no">${o}</span><span class="no">${n}</span><span class="sg">${sg}</span><span class="tx">${tx}</span></div>`;
  return section('Diff line · Hunk header · Line selection', 'gutters 40+40 · sign 14 · 20px lines · hunk header 24px with actions on hover · selected lines get accent sign column + “Stage N lines”',
    `<div style="display: flex; flex-direction: column; gap: 12px;">
      <div class="diff">
        <div class="hunk"><span class="grow">@@ -12,6 +12,8 @@ pub fn walk()</span><span class="btn secondary">Discard</span><span class="btn primary">Stage hunk</span></div>
        ${line('', 12, 12, ' ', 'let mut walk = repo.revwalk()?;')}
        ${line('add is-selected', '', 13, '+', 'walk.push_head()?;')}
        ${line('add is-selected', '', 14, '+', 'walk.push_glob("refs/heads/*")?;')}
        ${line('del', 13, '', '−', 'walk.push_glob("refs/*")?;')}
        ${line('', 14, 15, ' ', 'walk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;')}
        <div class="hunk" style="background: var(--accent-soft); color: var(--fg);"><span class="grow">2 lines selected</span><span class="btn primary">Stage 2 lines</span></div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 6px; overflow: hidden;">
        <div class="diff" style="border: 0; border-radius: 0;">${line('', 12, '', ' ', 'let mut walk = …')}${line('del', 13, '', '−', 'walk.push_glob(<span class="w">"refs/*"</span>)?;')}${line('', '', '', '', '')}${line('', 14, '', ' ', 'walk.set_sorting(…')}</div>
        <div class="diff" style="border: 0; border-radius: 0;">${line('', '', 12, ' ', 'let mut walk = …')}${line('add', '', 13, '+', 'walk.push_head()?;')}${line('add', '', 14, '+', 'walk.push_glob(<span class="w">"refs/heads/*"</span>)?;')}${line('', '', 15, ' ', 'walk.set_sorting(…')}</div>
      </div>
      <div class="xs muted">Side-by-side pairs consecutive −/+ runs; unpaired side shows an empty 20px filler row. Long lines wrap only when the “wrap” toggle is on.</div>
    </div>`);
}

function outputDock() {
  return section('Output dock', 'bottom, 160–320px, collapsible · header shows running op + elapsed + Cancel · mono body auto-scrolls · exit line colored',
    `<div class="list" style="overflow: hidden;">
      <div class="panel-header">${icon('terminal', 14)}<span class="grow">git push origin main</span><span class="xs muted">4.2s</span><span class="spinner" style="width: 10px; height: 10px; border-width: 1.5px;"></span><span class="btn secondary sm">Cancel</span><span class="icon-btn">${icon('chevron-down', 14)}</span></div>
      <div class="output" style="border-radius: 0;"><div class="cmd">$ git push --progress origin main</div><div>Enumerating objects: 12, done.</div><div>Counting objects: 100% (12/12), done.</div><div>Writing objects:  58% (7/12), 1.2 MiB | 600 KiB/s</div></div>
      <div class="progress" style="border-radius: 0; height: 3px;"><div style="width: 58%;"></div></div>
    </div>
    <div class="output" style="margin-top: 8px;"><div class="cmd">$ git fetch --progress origin</div><div>From github.com:topher/t4-git-ui</div><div>   a1b2c3d..9f8e7d6  main -> origin/main</div><div class="ok">✓ exit 0 · 1.1s</div></div>
    <div class="output" style="margin-top: 8px;"><div class="cmd">$ git push origin main</div><div class="err">! [rejected] main -> main (fetch first)</div><div class="err">✗ exit 1 · 0.8s</div></div>`);
}

function dialogLayout() {
  return section('Dialog layout', 'title / body / footer · fields stacked, gap 12 · options as checkboxes · output-bearing dialogs are 560px and grow an output dock below the fields while running; footer primary becomes “Cancel” until exit',
    `<div class="scrim"><div class="dialog wide">
      <div class="dialog-title"><span class="grow">Push</span><span class="icon-btn">${icon('x')}</span></div>
      <div class="dialog-body">
        <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
          <div class="field"><span class="field-label">Remote</span><span class="input select"><span>origin</span>${icon('chevron-down', 14)}</span></div>
          <div class="field"><span class="field-label">Branch</span><span class="input select"><span>main → origin/main</span>${icon('chevron-down', 14)}</span></div>
        </div>
        <div style="display: flex; gap: 20px;"><span class="check"><span class="checkbox"></span>Force (with lease)</span><span class="check"><span class="checkbox"></span>Push tags</span><span class="check"><span class="checkbox is-checked">${icon('check', 12)}</span>Set upstream</span></div>
        <div class="output" style="display: flex; flex-direction: column; gap: 0;"><div class="cmd">$ git push --progress origin main</div><div>Enumerating objects: 12, done.</div><div>Writing objects:  58% (7/12), 1.2 MiB | 600 KiB/s</div></div>
        <div class="progress" style="height: 3px;"><div style="width: 58%;"></div></div>
      </div>
      <div class="dialog-foot"><span class="spinner"></span><span class="xs muted">4.2s</span><span class="grow"></span><span class="btn secondary">Cancel</span><span class="btn primary is-disabled">Push</span></div>
    </div></div>`);
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
    twoUp((t) => [gridRows(t), graphAnatomy(t), sidebar(), diffAnatomy(), outputDock(), dialogLayout(), shortcuts()].join(''))),
});
