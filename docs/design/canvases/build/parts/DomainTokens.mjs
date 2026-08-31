import { icon, twoUp, shell, section, swatch, grid, row, labeled, tokens } from '../lib.mjs';

function lanes(t) {
  const colors = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => tokens[t][`graph-${i}`]);
  // small SVG: 8 vertical lanes with nodes
  const w = 13, h = 26 * 4;
  const svg = `<svg width="${w * 8 + 8}" height="${h}" viewBox="0 0 ${w * 8 + 8} ${h}">${colors.map((c, i) => `<line x1="${i * w + 10}" y1="0" x2="${i * w + 10}" y2="${h}" stroke="${c}" stroke-width="2"/><circle cx="${i * w + 10}" cy="${13 + i * 12}" r="3.5" fill="${c}"/>`).join('')}</svg>`;
  return section('Graph lanes', 'cycle 0–7 by column; equal weight, readable on both surfaces',
    `<div style="display: flex; gap: 20px; align-items: flex-start;">
      <div style="background: var(--bg-panel); border: 1px solid var(--border); border-radius: 6px; padding: 8px 12px;">${svg}</div>
      ${grid(4, [0, 1, 2, 3, 4, 5, 6, 7].map((i) => swatch(`graph-${i}`, t)), 10)}
    </div>`);
}

function diff(t) {
  const line = (cls, o, n, sg, tx) => `<div class="dl ${cls}"><span class="no">${o}</span><span class="no">${n}</span><span class="sg">${sg}</span><span class="tx">${tx}</span></div>`;
  return section('Diff', 'tinted rows; gutter darker than row; word-level change one step darker again',
    `<div style="display: flex; flex-direction: column; gap: 12px;">
      <div class="diff">
        <div class="hunk"><span class="grow">@@ -118,7 +118,9 @@ impl LaneLayout</span></div>
        ${line('', 118, 118, ' ', '    let lane = cols.iter().position(|c| c.expecting == oid);')}
        ${line('del', 119, '', '−', '    let lane = lane.<span class="w">unwrap()</span>;')}
        ${line('add', '', 119, '+', '    let lane = lane.<span class="w">unwrap_or_else(|| self.new_column(oid))</span>;')}
        ${line('add', '', 120, '+', '    self.emit_merges(lane, oid);')}
        ${line('', 120, 121, ' ', '    cols[lane].expecting = parents[0];')}
      </div>
      ${grid(5, ['diff-add-bg', 'diff-add-gutter', 'diff-add-word', 'diff-add-fg', 'diff-gutter-fg', 'diff-del-bg', 'diff-del-gutter', 'diff-del-word', 'diff-del-fg', 'diff-hunk-bg', 'diff-hunk-fg'].map((n) => swatch(n, t)), 10)}
    </div>`);
}

function chips(t) {
  return section('Ref chips', 'lead the grid row, before the subject; order HEAD → current → local → remote → tag → stash; max 3 then “+N”; current branch gets the outline',
    `<div style="display: flex; flex-direction: column; gap: 14px;">
      ${row([
        `<span class="chip head">HEAD</span>`,
        `<span class="chip local current">${icon('git-branch', 11)}main</span>`,
        `<span class="chip local">${icon('git-branch', 11)}feature/lane-graph</span>`,
        `<span class="chip local">${icon('git-branch', 11)}feature/lane-graph<span class="rem">${icon('cloud', 11)}origin</span></span>`,
        `<span class="chip local current">${icon('git-branch', 11)}main<span class="rem">${icon('cloud', 11)}origin, upstream</span></span>`,
        `<span class="chip remote">${icon('cloud', 11)}origin/main</span>`,
        `<span class="chip tag">${icon('tag', 11)}v0.1.0</span>`,
        `<span class="chip stash">${icon('archive', 11)}stash@{0}</span>`,
        `<span class="chip remote">+2</span>`,
      ], 8)}
      <div class="xs muted">Local + its tracking remote on the same commit → one chip with a remote segment (“feature/lane-graph · origin”; several remotes comma-joined). Remote ahead/behind → separate <span class="chip remote" style="height: 16px;">origin/x</span> chip on its own row.</div>
      ${grid(5, ['chip-head-bg', 'chip-local-bg', 'chip-local-fg', 'chip-remote-bg', 'chip-remote-fg', 'chip-tag-bg', 'chip-tag-fg', 'chip-stash-bg', 'chip-stash-fg'].map((n) => swatch(n, t)), 10)}
    </div>`);
}

function glyphs(t) {
  const g = (k, f, d) => `<div class="row" style="padding: 0;"><span class="glyph ${k}">${k}</span><span class="grow mono" style="font-size: 12px;">${f}</span><span class="xs muted">${d}</span></div>`;
  return section('File status', 'one-letter mono glyph, colored; conflict gets a tinted box',
    `<div style="display: flex; gap: 20px; align-items: flex-start;">
      <div class="list" style="width: 320px; padding: 4px 8px;">
        ${g('A', 'src/log/graph.rs', 'added')}
        ${g('M', 'src/lib.rs', 'modified')}
        ${g('D', 'src/old_walker.rs', 'deleted')}
        ${g('R', 'src/diff.rs → src/diff/mod.rs', 'renamed')}
        ${g('U', 'notes.txt', 'untracked')}
        ${g('C', 'Cargo.lock', 'conflict')}
      </div>
      ${grid(3, ['status-added', 'status-modified', 'status-deleted', 'status-renamed', 'status-untracked', 'status-conflict'].map((n) => swatch(n, t)), 10)}
    </div>`);
}

function ab() {
  return section('Ahead / behind', 'tabular numerals; muted; arrows are 12px icons',
    row([
      `<span class="ab">${icon('arrow-up', 12)}2</span>`,
      `<span class="ab">${icon('arrow-down', 12)}5</span>`,
      `<span class="ab">${icon('arrow-up', 12)}2 ${icon('arrow-down', 12)}5</span>`,
      `<span class="badge">12</span>`,
      `<span class="badge accent">3</span>`,
      `<span class="badge danger">!</span>`,
    ], 16));
}

export default () => ({
  body: shell('Domain tokens', 'Git-specific color vocabulary: graph lanes, diff, ref chips, file status. Same rule as Foundations — components use these names, never the hex.',
    twoUp((t) => [lanes(t), diff(t), chips(t), glyphs(t), ab()].join(''))),
});
