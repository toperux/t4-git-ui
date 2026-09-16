import { icon, twoUp, shell, section, grid, row, labeled } from '../lib.mjs';

const STATES = [['', 'default'], ['is-hover', 'hover'], ['is-active', 'active'], ['is-focus', 'focus'], ['is-disabled', 'disabled']];

function buttons() {
  // Labels stay short: each specimen sits in a 1/5 column of a half-width sheet.
  const variants = [['primary', 'Commit'], ['secondary', 'Cancel'], ['ghost', 'Reset'], ['danger', 'Delete']];
  const head = `<div></div>${STATES.map(([, l]) => `<div class="xs faint" style="font-family: var(--font-mono);">${l}</div>`).join('')}`;
  const rows = variants.map(([v, label]) => `<div class="xs faint" style="font-family: var(--font-mono); align-self: center;">${v}</div>${STATES.map(([s]) => `<div><span class="btn ${v} ${s}">${label}</span></div>`).join('')}`).join('');
  return section('Button', 'height 28 · padding 12 · weight 500 · sm variant 24/8',
    `<div style="display: grid; grid-template-columns: 80px repeat(5, minmax(0, 1fr)); gap: 10px; align-items: start;">${head}${rows}</div>
     ${row([`<span class="btn primary">${icon('arrow-up', 14)}Push</span>`, `<span class="btn secondary">${icon('git-branch', 14)}New branch</span>`, `<span class="btn secondary sm">Amend</span>`, `<span class="btn ghost sm">${icon('ellipsis', 14)}</span>`], 10)}`);
}

function iconButtons() {
  return section('Icon button', '24px hit area · icon 16 · “on” = toggled state (e.g. whitespace toggle)',
    row([['', 'default'], ['is-hover', 'hover'], ['is-on', 'on'], ['is-focus', 'focus'], ['is-disabled', 'disabled']].map(([s, l]) => labeled(l, `<span class="icon-btn ${s}">${icon('refresh')}</span>`)), 20));
}

function toolbar() {
  // The search field and branch filter live on the right in the app (see the A2 Main window); at half
  // sheet width they don't fit beside the buttons, so only the trailing cluster stands in for them.
  return section('Toolbar', '40px · repository button first · ghost buttons w/ 18px icons · counts inline · separators 18px · search + filter sit right (A2)',
    `<div class="toolbar" style="border: 1px solid var(--border); border-radius: 6px; width: 100%;">
      <span class="tb-btn repo">${icon('folder-git-2', 18)}<span class="name">t4-git-ui</span></span>
      <span class="tb-sep"></span>
      <span class="tb-split"><span class="tb-btn is-hover">${icon('arrow-down', 18)}Fetch</span><span class="tb-btn tb-more is-hover-soft">${icon('chevron-down', 16)}</span></span>
      <span class="tb-btn">${icon('arrow-down-up', 18)}Pull <span class="cnt">5</span></span>
      <span class="tb-btn is-disabled">${icon('arrow-up', 18)}Push <span class="cnt">2</span></span>
      <span class="tb-sep"></span>
      <span class="tb-btn">${icon('git-branch', 18)}Branch</span>
      <span class="tb-btn is-active">${icon('archive', 18)}Stash <span class="cnt">1</span></span>
      <div style="flex: 1;"></div>
      <span class="tb-history">${icon('history', 13)}<span class="path">graph.rs</span><span class="icon-btn">${icon('x', 12)}</span></span>
      <span class="icon-btn">${icon('refresh')}</span>
      <span class="icon-btn">${icon('moon')}</span>
      <span class="btn primary sm">${icon('arrow-up-circle', 14)}Update</span>
      <span class="icon-btn">${icon('settings')}</span>
    </div>
    <div class="xs muted">Trailing cluster: Refresh · ThemeToggle (Sun / Moon 16) · UpdateBadge (a <span class="mono">sm primary</span> Button, hidden until a check finds a version) · Settings. The file-history chip appears only under a path filter.</div>`);
}

function tabStrip() {
  return section('Tab strip', 'under the title bar, above the toolbar · tabs 28px, radius md top-only, max 220px · active = --bg-app (the toolbar colour) + border · hidden while a window has one tab',
    `<div class="tabstrip">
      <span class="tab is-active">${icon('folder-git-2', 14)}<span class="name">t4-git-ui</span><span class="close">${icon('x', 12)}</span></span>
      <span class="tab is-hover">${icon('folder-git-2', 14)}<span class="name">libgit2</span><span class="close is-hover">${icon('x', 12)}</span></span>
      <span class="tab">${icon('folder-git-2', 14)}<span class="name">mbk-portal</span><span class="stale" title="Changed in the background"></span></span>
      <span class="drop-caret"></span>
      <span class="tab is-dragging">${icon('folder-git-2', 14)}<span class="name">work</span></span>
      <span class="add">${icon('plus', 16)}</span>
    </div>
    <div class="tabstrip" style="align-items: center; gap: 12px; border-bottom: 0; background: transparent; padding: 0;"><span class="ghost">work</span><span class="xs muted">Dragged out: the slot keeps its width, the ghost (1px accent + shadow-1) follows the cursor, a 2px accent caret marks the drop.</span></div>`);
}

function inputs() {
  return section('Input · Select · Command input', 'inset background, no border at rest · focus swaps to panel bg + accent border + halo · disabled dims the field, not the box',
    `<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px;">
      ${labeled('default', `<span class="input"><span class="ph">Branch name</span></span>`)}
      ${labeled('hover', `<span class="input is-hover"><span class="ph">Branch name</span></span>`)}
      ${labeled('focus', `<span class="input is-focus"><span>feature/</span><span class="caret"></span></span>`)}
      ${labeled('filled', `<span class="input"><span>feature/lane-graph</span></span>`)}
      ${labeled('invalid', `<span class="input is-invalid"><span>feature lane</span></span>`)}
      ${labeled('disabled', `<span class="input is-disabled"><span>origin</span></span>`)}
      ${labeled('search', `<span class="input">${icon('search', 14)}<span class="ph">Filter files</span></span>`)}
      ${labeled('select', `<span class="input select"><span class="val">origin</span>${icon('chevron-down', 14, 'chevron')}</span>`)}
      ${labeled('select · open', `<span class="input select is-open"><span class="val">origin</span>${icon('chevron-up', 14, 'chevron')}</span>`)}
    </div>
    <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start;">
      ${labeled('listbox (app-drawn, portalled)', `<div class="listbox" style="width: 200px;">
        <div class="opt">origin</div>
        <div class="opt is-selected">upstream</div>
        <div class="opt is-active">mirror</div>
        <div class="opt is-disabled">fork (no URL)</div>
      </div>`)}
      ${labeled('command input + completions', `<div style="display: flex; flex-direction: column; gap: 6px;">
        <span class="command-input is-focus"><span class="prefix">$ git</span><span>rebase --onto ma</span><span class="caret"></span></span>
        <div class="listbox" style="width: 100%;">
          <div class="opt is-active"><span class="mono">main</span><span class="hint">local branch</span></div>
          <div class="opt"><span class="mono">origin/main</span><span class="hint">remote branch</span></div>
          <div class="opt"><span class="mono">rebase -i HEAD~5</span><span class="hint">history</span></div>
        </div>
      </div>`)}
    </div>`);
}

function checks() {
  return section('Checkbox', '16px · accent fill when checked · disabled dims the whole label · no mixed state',
    row([
      labeled('unchecked', `<span class="check"><span class="checkbox"></span>Amend</span>`),
      labeled('checked', `<span class="check"><span class="checkbox is-checked">${icon('check', 12)}</span>Amend</span>`),
      labeled('focus', `<span class="check"><span class="checkbox is-checked is-focus">${icon('check', 12)}</span>Amend</span>`),
      labeled('disabled', `<span class="check is-disabled"><span class="checkbox"></span>Sign</span>`),
    ], 24));
}

function tabs() {
  return section('Pill tabs', 'the only tab pair in the app: Changes | Files in the changed-file panel header · 24px, radius sm, --bg-active when on',
    `<div style="display: flex; flex-direction: column; gap: 12px;">
      <div class="list" style="overflow: hidden;">
        <div class="panel-header">${icon('file', 14)}<span class="grow">7 files</span><span class="pill-tabs"><span class="pill-tab is-on">Changes</span><span class="pill-tab is-hover">Files</span></span><span class="icon-btn is-on">${icon('rows', 14)}</span></div>
        <div class="filter-row"><span class="input">${icon('search', 14)}<span class="ph">Filter files</span></span></div>
      </div>
      <div class="xs muted">Unified / side-by-side and staged / unstaged are <em>not</em> tabs: the first pair is two IconButtons in the diff header, the second is two stacked PanelHeaders.</div>
    </div>`);
}

function rows() {
  const r = (s, txt, meta) => `<div class="row ${s}"><span class="glyph M">M</span><span class="grow mono" style="font-size: 12px;">${txt}</span><span class="meta">${meta}</span></div>`;
  return section('List row', '26px · hover tint · selected = accent tint (focused pane) or neutral (elsewhere) · the 2px multi-select bar is the commit panel’s alone',
    `<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
      <div class="list">
        ${r('', 'src/lib.rs', '<span style="color: var(--success);">+12</span> <span style="color: var(--danger-text);">−3</span>')}
        ${r('is-hover', 'src/log/graph.rs', '<span style="color: var(--success);">+42</span> <span style="color: var(--danger-text);">−7</span>')}
        ${r('is-selected', 'src/log/cache.rs', '<span style="color: var(--success);">+8</span>')}
        ${r('is-selected-unfocused', 'src/diff.rs', '<span style="color: var(--danger-text);">−1</span>')}
        ${r('is-selected is-focus', 'src/patch.rs', '+3 −3')}
      </div>
      <div class="list">
        ${r('multi is-selected', 'src/a.rs', '+1')}
        ${r('multi is-selected', 'src/b.rs', '+1')}
        ${r('multi', 'src/c.rs', '+1')}
        ${r('multi is-selected is-focus', 'src/d.rs', '+1')}
        ${r('multi', 'src/e.rs', '+1')}
      </div>
    </div>`);
}

function tree() {
  const t = (d, s, tw, ic, txt, extra = '') => `<div class="row ${s}" style="--d: ${d};"><span class="tw">${tw ? icon(tw, 12) : ''}</span>${icon(ic, 14)}<span class="label">${txt}</span>${extra}</div>`;
  return section('Tree row', 'indent 14px per level · chevron 12px in a 16px slot · kind icon 14 · folder rows amber (--folder-fg) + 600 with a ref count in meta · current branch 600, its icon an accent check',
    `<div class="list tree" style="width: 100%;">
      ${t(0, 'current is-selected', '', 'check', 'main', `<span class="ab">${icon('arrow-up', 12)}2 ${icon('arrow-down', 12)}5</span>`)}
      ${t(0, 'folder', 'chevron-down', 'folder', 'feature', `<span class="meta">2</span>`)}
      ${t(1, 'is-hover', '', 'git-branch', 'lane-graph', `<span class="ab">${icon('arrow-up', 12)}2</span>`)}
      ${t(1, '', '', 'git-branch', 'diff-viewer', `<span class="meta"><span class="badge" title="Its upstream is gone">gone</span></span>`)}
      ${t(0, 'folder', 'chevron-right', 'folder', 'release', `<span class="meta">7</span>`)}
      ${t(0, '', '', 'git-branch', '<span class="muted">hotfix-index-lock</span>', `<span class="meta"><span class="badge" title="Already in main">merged</span></span>`)}
      ${t(0, '', '', 'folder-git-2', 'wt-release', `<span class="meta"><span class="mono">release/0.9</span><span class="badge">locked</span></span>`)}
      ${t(0, '', '', 'package', 'vendor/libgit2', `<span class="meta"><span class="mono">a1b2c3d</span></span>`)}
    </div>`);
}

function tableHeader() {
  return section('Table header', '24px · uppercase 11px · sort indicator · 1×12 handles drawn in the gap after each column — inert; widths are fixed at author 110 · date 80 · sha 64, and only the graph column resizes (it animates to the lanes in view)',
    `<div class="list"><div class="th">
      <span class="col" style="width: 80px;">Graph</span>
      <span class="col sort" style="flex: 1;">Subject ${icon('chevron-down', 12)}</span>
      <span class="col" style="width: 110px;">Author</span>
      <span class="col" style="width: 80px;">Date</span>
      <span class="col" style="width: 64px;">SHA</span>
    </div><div class="row"><span style="width: 80px;"></span><span class="grow">Fix lane dedupe when parent already expected</span><span style="width: 110px;" class="meta">Topher M.</span><span style="width: 80px;" class="meta">2h ago</span><span style="width: 64px;" class="meta mono">a1b2c3d</span></div>
    <div class="row"><span style="width: 80px;"></span><span class="grow faint">—</span><span style="width: 110px;" class="meta faint">—</span><span style="width: 80px;" class="meta faint">—</span><span style="width: 64px;" class="meta mono faint">—</span></div></div>`);
}

function overlays() {
  return section('Menu · Context menu · Submenu', '220px, 26px items, accent hover, danger last · a ContextMenu grows to its longest item (220–320) instead of ellipsizing · ref names inside labels are mono, coloured by kind · there is no Tooltip component — every hint is a native <span class="mono">title</span>',
    `<div style="display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap;">
      <div class="menu">
        <div class="menu-item">${icon('check')}<span class="grow">Checkout</span></div>
        <div class="menu-item is-hover">${icon('git-merge')}<span class="grow">Merge <span class="ref local">feature/lane-graph</span> into <span class="ref local">main</span></span></div>
        <div class="menu-item">${icon('git-branch')}<span class="grow">New branch here…</span><span class="kbd">Ctrl+B</span></div>
        <div class="menu-item is-disabled">${icon('arrow-up')}<span class="grow">Push</span></div>
        <div class="menu-sep"></div>
        <div class="menu-item">${icon('copy')}<span class="grow">Copy SHA</span><span class="kbd">Ctrl+C</span></div>
        <div class="menu-sep"></div>
        <div class="menu-item danger">${icon('x')}<span class="grow">Delete <span class="ref remote">origin/lane-graph</span></span></div>
      </div>
      <div style="display: flex; align-items: flex-start;">
        <div class="menu">
          <div class="menu-item">${icon('git-commit')}<span class="grow">Commit…</span></div>
          <div class="menu-item">${icon('folder-git-2')}<span class="grow">Add worktree…</span></div>
          <div class="menu-item">${icon('terminal')}<span class="grow">Run git command…</span><span class="kbd">Ctrl+Shift+R</span></div>
          <div class="menu-sep"></div>
          <div class="menu-item">${icon('folder')}<span class="grow">Open repository…</span></div>
          <div class="menu-item is-hover">${icon('folder-git-2')}<span class="grow">More recent</span>${icon('chevron-right', 14, 'chev')}</div>
          <div class="menu-sep"></div>
          <div class="menu-item">${icon('external-link')}<span class="grow">Move to new window</span><span class="kbd">Ctrl+Shift+N</span></div>
          <div class="menu-item">${icon('x')}<span class="grow">Close tab</span><span class="kbd">Ctrl+W</span></div>
        </div>
        <div class="menu submenu" style="margin-left: 2px;">
          <div class="menu-item">${icon('folder-git-2')}<span class="grow">libgit2</span></div>
          <div class="menu-item">${icon('folder-git-2')}<span class="grow">mbk-portal</span></div>
          <div class="menu-item">${icon('folder-git-2')}<span class="grow">work</span></div>
        </div>
      </div>
    </div>`);
}

function chipsBadges() {
  return section('Ref chip · Badge · Ahead/behind · signed', 'chips 18px xs 500 · badge 16px pill · ahead/behind 12px arrows + tabular xs (full color spec on Domain tokens)',
    `<div style="display: flex; flex-direction: column; gap: 12px;">
      ${row([
        `<span class="chip head">HEAD</span>`, `<span class="chip local current">${icon('git-branch', 11)}main</span>`, `<span class="chip local">${icon('git-branch', 11)}feature/lane-graph</span>`, `<span class="chip remote">${icon('cloud', 11)}origin/main</span>`, `<span class="chip tag">${icon('tag', 11)}v0.1.0</span>`, `<span class="chip stash">${icon('archive', 11)}stash@{0}</span>`, `<span class="chip remote">+2</span>`,
        `<span style="width: 12px;"></span>`,
        `<span class="chip bisect good">${icon('bug', 11)}good</span>`, `<span class="chip bisect bad">${icon('bug', 11)}bad</span>`, `<span class="chip bisect">${icon('bug', 11)}skip</span>`,
      ], 8)}
      ${row([
        `<span class="badge">12</span>`, `<span class="badge accent">3</span>`, `<span class="badge danger">!</span>`, `<span class="badge">gone</span>`, `<span class="badge">local</span>`, `<span class="badge">not initialized</span>`,
        `<span style="width: 12px;"></span>`,
        `<span class="ab">${icon('arrow-up', 12)}2 ${icon('arrow-down', 12)}5</span>`,
        `<span style="width: 12px;"></span>`,
        `<span class="sm">Topher M. <span class="signed">signed</span></span>`,
      ], 8)}
    </div>`);
}

function dialog() {
  return section('Dialog shell', 'over --scrim · 440px forms · 560px (.wide) when the dialog shows output · full = the commit and diff windows · title 44px · body 16px pad · footer right-aligned, primary last, the “Runs git …” preview on the left · Esc closes',
    `<div style="display: flex; gap: 12px; align-items: flex-start;">
      <div class="scrim" style="flex: 1; min-width: 0;"><div class="dialog" style="width: 100%; max-width: 440px;">
        <div class="dialog-title"><span class="grow">Create branch</span><span class="icon-btn">${icon('x')}</span></div>
        <div class="dialog-body">
          <div class="field"><span class="field-label">Name</span><span class="input is-focus"><span>feature/</span><span class="caret"></span></span></div>
          <div class="field"><span class="field-label">Start point</span><span class="input select"><span class="val mono" style="font-size: 12px;">a1b2c3d · main</span>${icon('chevron-down', 14, 'chevron')}</span><span class="field-help">Selected commit</span></div>
          <span class="check"><span class="checkbox is-checked">${icon('check', 12)}</span>Check out after creating</span>
        </div>
        <div class="dialog-foot"><span class="preview">Runs <code>git branch feature/… a1b2c3d</code></span><span class="grow"></span><span class="btn secondary">Cancel</span><span class="btn primary">Create</span></div>
      </div></div>
      <div style="width: 200px; flex: none;">
        <div class="scrim is-full" style="height: 168px; padding: 8px;"><div class="dialog full">
          <div class="dialog-title" style="height: 28px; font-size: var(--text-sm); padding: 0 var(--space-4);"><span class="grow">Commit</span>${icon('maximize-2', 14)}</div>
          <div class="dialog-body full" style="display: flex; flex-direction: row;">
            <div style="flex: 1; border-right: 1px solid var(--border); background: var(--bg-panel);"></div>
            <div style="flex: 1.4; border-right: 1px solid var(--border); background: var(--bg-panel);"></div>
            <div style="flex: 1; background: var(--bg-panel);"></div>
          </div>
        </div></div>
        <div class="xs muted" style="margin-top: 6px;">full — the commit and diff windows, a slim even margin and no fixed width.</div>
      </div>
    </div>`);
}

function headers() {
  return section('Panel header · Section header · Split handle', 'panel headers 28px on --bg-app · section headers sit in a sticky --bg-panel band with a top border, over an --bg-app sidebar; only the inner button takes the hover tint, the children slot sits outside it · split handles 5px hit, 1px line, accent on hover',
    `<div style="display: flex; flex-direction: column; gap: 12px;">
      <div class="list"><div class="panel-header">${icon('file', 14)}<span class="grow mono" style="font-size: 12px;">src/log/graph.rs</span><span class="diff-mode">100644 → 100755</span><span class="icon-btn">${icon('external-link', 14)}</span><span class="icon-btn">${icon('columns', 14)}</span><span class="icon-btn is-on">${icon('rows', 14)}</span></div></div>
      <div class="list" style="background: var(--bg-app);">
        <div class="section-header"><span class="tw">${icon('chevron-down', 12)}</span><span class="grow">Local</span><span class="badge">14</span></div>
        <div class="row"><span class="tw"></span>${icon('check', 14)}<span class="label">main</span></div>
        <div class="section-header is-hover"><span class="tw">${icon('chevron-right', 12)}</span><span class="grow">Stashes</span><span class="badge">1</span><span class="icon-btn">${icon('archive', 14)}</span></div>
      </div>
      <div style="display: flex; height: 60px; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 6px;"><div style="flex: 1;"></div><div class="split-h"></div><div style="flex: 1;"></div><div class="split-h is-hover"></div><div style="flex: 1;"></div></div>
    </div>`);
}

function statusFeedback() {
  return section('Status bar · Toast · Banner · Progress · Spinner', 'status bar 24px — HEAD, ahead/behind and the remote left; running op, log progress, working-tree counts and tree state right · toasts 360px top-center, 5s, actions under the detail · banners full-width at the top of the content',
    `<div style="display: flex; flex-direction: column; gap: 12px;">
      <div class="statusbar" style="border: 1px solid var(--border); border-radius: 6px;"><span class="item">${icon('git-branch', 12)}main</span><span class="item ab">${icon('arrow-up', 12)}2 ${icon('arrow-down', 12)}5</span><span class="item">${icon('cloud', 12)}origin · github.com/topher/t4-git-ui</span><span class="grow"></span><span class="item"><span class="spinner sm"></span>Loading commits… 4096</span><span class="item">3 unstaged · 1 staged · 2 conflicted</span><span class="item">${icon('check-circle', 12)}Clean</span></div>
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <div class="toast error">${icon('x-circle')}<div class="grow"><div class="t">Push rejected</div><div class="d">origin/main has 3 new commits. Pull first.</div><div class="actions"><span class="btn secondary sm">Retry</span><span class="btn ghost sm">Dismiss</span></div></div><span class="icon-btn">${icon('x', 14)}</span></div>
        <div class="toast info">${icon('info')}<div class="grow"><div class="t">Refreshed remote tags</div><div class="d">origin 42 · mirror 41</div></div><span class="icon-btn">${icon('x', 14)}</span></div>
      </div>
      <div class="banner warning" style="border-radius: 6px;">${icon('git-merge', 14)}<span class="grow">Rebase paused — amend or add commits in the commit panel, then Continue</span><span class="btn secondary sm">Abort</span><span class="btn secondary sm">Skip</span><span class="btn primary sm">Continue</span></div>
      <div class="banner warning" style="border-radius: 6px;">${icon('bug', 14)}<span class="grow">Bisecting — testing a1b2c3d · 3 good · 1 bad</span><span class="btn secondary sm">Good</span><span class="btn secondary sm">Bad</span><span class="btn secondary sm">Skip</span><span class="btn secondary sm">Reset</span></div>
      <div class="banner danger" style="border-radius: 6px;">${icon('alert', 14)}<span class="grow">3 files have conflicts — resolve, then stage them</span><span class="btn secondary sm">Open commit panel</span></div>
      <div style="display: flex; gap: 16px; align-items: center;"><div class="progress" style="width: 160px;"><div style="width: 62%;"></div></div><div class="progress indet" style="width: 160px;"><div></div></div><div class="progress thin" style="width: 160px;"><div style="width: 30%;"></div></div><span class="spinner"></span><span class="spinner sm"></span></div>
      <div class="xs muted"><span class="mono">thin</span> (3px, square) is what hangs under a panel header or over the grid; <span class="mono">sm</span> spinners (10px / 1.5px) are the status bar’s and the dock header’s.</div>
    </div>`);
}

function misc() {
  return section('Busy overlay · Empty state · Disabled hint', 'the blocking wait, the nothing-here state, and the wrapper that makes a disabled control’s title hoverable',
    `<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start;">
      <div class="busy-overlay" style="height: 120px; border-radius: 6px;"><div class="busy-card"><span class="spinner"></span>Opening repository…</div></div>
      <div class="list"><div class="empty">${icon('inbox', 24)}<div class="t">No changes</div><div class="hint">Working tree is clean</div></div></div>
      <div style="grid-column: span 2;">${row([
        `<span class="disabled-hint" title="No changes to commit"><span class="btn primary is-disabled">Commit</span></span>`,
        `<div class="xs muted" style="flex: 1; min-width: 0;">A disabled control fires no pointer events, so its <span class="mono">title</span> — almost always the reason it is dead — never shows. <span class="mono">DisabledHint</span> is a boxless wrapper that takes the hover instead; it is <span class="mono">display: contents</span> until it has something to say.</div>`,
      ], 12)}</div>
    </div>`);
}

export default () => ({
  body: shell('Components', 'Every reusable piece and its states. One component here = one file in <span class="mono">src/components/ui/</span> (or the screen module named in <span class="mono">build/base.css</span>). Only interactive components get the full state matrix.',
    twoUp((t) => [buttons(), iconButtons(), toolbar(), tabStrip(), inputs(), checks(), tabs(), rows(), tree(), tableHeader(), chipsBadges(), overlays(), dialog(), headers(), statusFeedback(), misc()].join(''))),
});
