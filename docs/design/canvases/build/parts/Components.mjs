import { icon, twoUp, shell, section, grid, row, labeled } from '../lib.mjs';

const STATES = [['', 'default'], ['is-hover', 'hover'], ['is-active', 'active'], ['is-focus', 'focus'], ['is-disabled', 'disabled']];

function buttons() {
  const variants = [['primary', 'Commit'], ['secondary', 'Cancel'], ['ghost', 'Reset'], ['danger', 'Delete branch']];
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
  return section('Toolbar', '40px · ghost buttons w/ 18px icons · counts inline · separators 18px',
    `<div class="toolbar" style="border: 1px solid var(--border); border-radius: 6px; width: 100%;">
      <span class="tb-btn">${icon('arrow-down', 18)}Fetch</span>
      <span class="tb-btn is-hover">${icon('arrow-down-up', 18)}Pull <span class="cnt">5</span></span>
      <span class="tb-btn">${icon('arrow-up', 18)}Push <span class="cnt">2</span></span>
      <span class="tb-sep"></span>
      <span class="tb-btn">${icon('git-branch', 18)}Branch</span>
      <span class="tb-btn is-active">${icon('archive', 18)}Stash</span>
      <span class="tb-sep"></span>
      <span class="tb-btn">${icon('git-commit', 18)}Commit <span class="cnt">7</span></span>
      <div style="flex: 1;"></div>
      <span class="input" style="width: 220px; height: 26px;">${icon('search', 14)}<span class="ph">Search commits</span></span>
      <span class="icon-btn">${icon('refresh')}</span>
    </div>`);
}

function inputs() {
  return section('Input · Select', 'inset background, no border at rest · focus swaps to panel bg + accent border + halo',
    `<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px;">
      ${labeled('default', `<span class="input"><span class="ph">Branch name</span></span>`)}
      ${labeled('hover', `<span class="input is-hover"><span class="ph">Branch name</span></span>`)}
      ${labeled('focus', `<span class="input is-focus"><span>feature/</span><span class="caret"></span></span>`)}
      ${labeled('filled', `<span class="input"><span>feature/lane-graph</span></span>`)}
      ${labeled('invalid', `<span class="input is-invalid"><span>feature lane</span></span>`)}
      ${labeled('disabled', `<span class="input is-disabled"><span>origin</span></span>`)}
      ${labeled('search', `<span class="input">${icon('search', 14)}<span class="ph">Filter files</span></span>`)}
      ${labeled('select', `<span class="input select"><span>origin</span>${icon('chevron-down', 14)}</span>`)}
      ${labeled('select · open', `<span class="input select is-focus"><span>origin</span>${icon('chevron-up', 14)}</span>`)}
    </div>`);
}

function checks() {
  return section('Checkbox', '16px · accent fill when checked',
    row([
      labeled('unchecked', `<span class="check"><span class="checkbox"></span>Amend</span>`),
      labeled('checked', `<span class="check"><span class="checkbox is-checked">${icon('check', 12)}</span>Amend</span>`),
      labeled('mixed', `<span class="check"><span class="checkbox is-mixed">${icon('minus', 12)}</span>All</span>`),
      labeled('focus', `<span class="check"><span class="checkbox is-checked is-focus">${icon('check', 12)}</span>Amend</span>`),
      labeled('disabled', `<span class="check"><span class="checkbox is-disabled"></span><span style="opacity: .45;">Sign</span></span>`),
    ], 24));
}

function tabs() {
  return section('Tabs', 'used for Unified / Side-by-side and Unstaged / Staged',
    `<div class="tabs" style="background: var(--bg-panel); border: 1px solid var(--border); border-radius: 6px 6px 0 0;">
      <span class="tab is-selected">Unstaged <span class="cnt">4</span></span>
      <span class="tab">Staged <span class="cnt">2</span></span>
      <span class="tab is-hover">History</span>
    </div>`);
}

function rows() {
  const r = (s, txt, meta) => `<div class="row ${s}"><span class="glyph M">M</span><span class="grow mono" style="font-size: 12px;">${txt}</span><span class="meta">${meta}</span></div>`;
  return section('List row', '26px · hover tint · selected = accent tint (focused) or neutral (pane unfocused) · multi-select adds left bar',
    `<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
      <div class="list">
        ${r('', 'src/lib.rs', '+12 −3')}
        ${r('is-hover', 'src/log/graph.rs', '+42 −7')}
        ${r('is-selected', 'src/log/cache.rs', '+8')}
        ${r('is-selected-unfocused', 'src/diff.rs', '−1')}
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
  const t = (d, s, tw, ic, txt, extra = '') => `<div class="row ${s}" style="--d: ${d};"><span class="tw">${tw ? icon(tw, 12) : ''}</span>${icon(ic, 14, 'muted')}<span class="grow">${txt}</span>${extra}</div>`;
  return section('Tree row', 'indent 14px per level · chevron 12px in 16px slot · current branch bold + HEAD dot',
    `<div class="list tree" style="width: 100%;">
      ${t(0, '', 'chevron-down', 'folder', 'feature')}
      ${t(1, 'is-hover', '', 'git-branch', 'lane-graph', `<span class="ab">${icon('arrow-up', 12)}2</span>`)}
      ${t(1, '', '', 'git-branch', 'diff-viewer')}
      ${t(0, 'is-selected', '', 'git-branch', '<span style="font-weight: 600;">main</span>', `<span class="ab">${icon('arrow-up', 12)}2 ${icon('arrow-down', 12)}5</span>`)}
      ${t(0, '', 'chevron-right', 'folder', 'release')}
    </div>`);
}

function tableHeader() {
  return section('Table header', '24px · uppercase 11px · sort indicator · resize handles',
    `<div class="list"><div class="th">
      <span class="col" style="width: 120px;">Graph</span><span class="rs"></span>
      <span class="col sort" style="flex: 1;">Subject ${icon('chevron-down', 12)}</span><span class="rs"></span>
      <span class="col is-hover" style="width: 120px;">Author</span><span class="rs"></span>
      <span class="col" style="width: 100px;">Date</span><span class="rs"></span>
      <span class="col" style="width: 64px;">SHA</span>
    </div><div class="row"><span style="width: 120px;"></span><span class="grow">Fix lane dedupe when parent already expected</span><span style="width: 120px;" class="meta">Topher M.</span><span style="width: 100px;" class="meta">2h ago</span><span style="width: 64px;" class="meta mono">a1b2c3d</span></div></div>`);
}

function overlays() {
  return section('Tooltip · Context menu', 'tooltip: inverted, 12px, shortcut at right · menu: 220px, 26px items, accent hover, danger last',
    `<div style="display: flex; gap: 24px; align-items: flex-start;">
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <span class="tooltip">Fetch all remotes <span class="kbd">Ctrl</span><span class="kbd">F5</span></span>
        <span class="tooltip">Stage hunk</span>
      </div>
      <div class="menu">
        <div class="menu-item">${icon('check')}<span class="grow">Checkout</span></div>
        <div class="menu-item is-hover">${icon('git-merge')}<span class="grow">Merge into main</span></div>
        <div class="menu-item">${icon('git-branch')}<span class="grow">New branch here…</span><span class="kbd">Ctrl+B</span></div>
        <div class="menu-item is-disabled">${icon('arrow-up')}<span class="grow">Push</span></div>
        <div class="menu-sep"></div>
        <div class="menu-item">${icon('copy')}<span class="grow">Copy SHA</span><span class="kbd">Ctrl+C</span></div>
        <div class="menu-sep"></div>
        <div class="menu-item danger">${icon('x')}<span class="grow">Delete branch</span></div>
      </div>
    </div>`);
}

function chipsBadges() {
  return section('Ref chip · Badge · Ahead/behind', 'chips 18px xs 500 · badge 16px pill · ahead/behind 12px arrows + tabular xs (full color spec on Domain tokens)',
    row([
      `<span class="chip head">HEAD</span>`, `<span class="chip local current">${icon('git-branch', 11)}main</span>`, `<span class="chip local">${icon('git-branch', 11)}feature/lane-graph</span>`, `<span class="chip remote">${icon('cloud', 11)}origin/main</span>`, `<span class="chip tag">${icon('tag', 11)}v0.1.0</span>`, `<span class="chip stash">${icon('archive', 11)}stash@{0}</span>`, `<span class="chip remote">+2</span>`,
      `<span style="width: 12px;"></span>`,
      `<span class="badge">12</span>`, `<span class="badge accent">3</span>`, `<span class="badge danger">!</span>`,
      `<span style="width: 12px;"></span>`,
      `<span class="ab">${icon('arrow-up', 12)}2 ${icon('arrow-down', 12)}5</span>`,
    ], 8));
}

function dialog() {
  return section('Dialog shell', 'shown over --scrim · 440px forms · 560px (.wide) when the dialog shows output ·  · title 44px · body 16px pad · footer right-aligned, primary last · Esc closes',
    `<div class="scrim"><div class="dialog">
      <div class="dialog-title"><span class="grow">Create branch</span><span class="icon-btn">${icon('x')}</span></div>
      <div class="dialog-body">
        <div class="field"><span class="field-label">Name</span><span class="input is-focus"><span>feature/</span><span class="caret"></span></span></div>
        <div class="field"><span class="field-label">Start point</span><span class="input select"><span class="mono" style="font-size: 12px;">a1b2c3d · main</span>${icon('chevron-down', 14)}</span><span class="field-help">Selected commit</span></div>
        <span class="check"><span class="checkbox is-checked">${icon('check', 12)}</span>Check out after creating</span>
      </div>
      <div class="dialog-foot"><span class="grow"></span><span class="btn secondary">Cancel</span><span class="btn primary">Create</span></div>
    </div></div>`);
}

function headers() {
  return section('Panel header · Section header · Split handle', 'headers 28px · split handles 5px hit, 1px line, accent on hover',
    `<div style="display: flex; flex-direction: column; gap: 12px;">
      <div class="list"><div class="panel-header">${icon('file', 14)}<span class="grow">src/log/graph.rs</span><span class="icon-btn">${icon('columns', 14)}</span><span class="icon-btn is-on">${icon('rows', 14)}</span></div></div>
      <div class="list"><div class="section-header"><span class="tw">${icon('chevron-down', 12)}</span><span class="grow">Local branches</span><span class="badge">14</span></div><div class="section-header is-hover"><span class="tw">${icon('chevron-right', 12)}</span><span class="grow">Remotes</span><span class="icon-btn" style="width: 20px; height: 20px;">${icon('plus', 14)}</span></div></div>
      <div style="display: flex; height: 60px; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 6px;"><div style="flex: 1;"></div><div class="split-h"></div><div style="flex: 1;"></div><div class="split-h is-hover"></div><div style="flex: 1;"></div></div>
    </div>`);
}

function statusFeedback() {
  return section('Status bar · Toast · Banner · Progress', 'status bar 24px · toasts 360px bottom-right, 5s · banners full-width top of content',
    `<div style="display: flex; flex-direction: column; gap: 12px;">
      <div class="statusbar" style="border: 1px solid var(--border); border-radius: 6px;"><span class="item">${icon('git-branch', 12)}main</span><span class="item ab">${icon('arrow-up', 12)}2 ${icon('arrow-down', 12)}5</span><span class="grow"></span><span class="item"><span class="spinner" style="width: 10px; height: 10px; border-width: 1.5px;"></span>Fetching origin…</span><span class="item">${icon('check-circle', 12)}Clean</span></div>
      <div style="display: flex; gap: 12px; flex-wrap: wrap;">
        <div class="toast error">${icon('x-circle')}<div class="grow"><div class="t">Push rejected</div><div class="d">origin/main has 3 new commits. Pull first.</div></div><span class="icon-btn">${icon('x', 14)}</span></div>
        <div class="toast success">${icon('check-circle')}<div class="grow"><div class="t">Pushed 2 commits to origin/main</div></div><span class="icon-btn">${icon('x', 14)}</span></div>
      </div>
      <div class="banner warning" style="border-radius: 6px;">${icon('git-merge', 14)}<span class="grow">Rebase in progress — 2 of 5 commits applied</span><span class="btn secondary sm">Abort</span><span class="btn primary sm">Continue</span></div>
      <div class="banner danger" style="border-radius: 6px;">${icon('alert', 14)}<span class="grow">3 files have conflicts</span><span class="btn secondary sm">Open in editor</span></div>
      <div style="display: flex; gap: 16px; align-items: center;"><div class="progress" style="width: 200px;"><div style="width: 62%;"></div></div><div class="progress indet" style="width: 200px;"><div></div></div><span class="spinner"></span></div>
    </div>`);
}

function empty() {
  return section('Empty state', 'icon 24 faint · one line title · one line hint · optional single action',
    `<div class="list"><div class="empty">${icon('inbox', 24)}<div class="t">No changes</div><div class="sm">Working tree is clean</div></div></div>`);
}

export default () => ({
  body: shell('Components', 'Every reusable piece and its states. One component here = one file in <span class="mono">src/components/ui/</span>. Only interactive components get the full state matrix.',
    twoUp((t) => [buttons(), iconButtons(), toolbar(), inputs(), checks(), tabs(), rows(), tree(), tableHeader(), chipsBadges(), overlays(), dialog(), headers(), statusFeedback(), empty()].join(''))),
});
