# t4-git-ui — Style guide

Direction: **quiet precision.** Cool-neutral surfaces, one blue accent, hairline borders, 26px density, hierarchy by weight not size. Semantic color only where it carries meaning (status, diff, danger). Nothing bounces.

- Canvas (editable): https://claude.ai/code/artifact/2aab4454-5757-44b5-b987-be682dcabba6 — page 1 = system, page 2 = alternate directions (low-fi, not built out)
- Screens canvas (A2): https://claude.ai/code/artifact/2e1cc7fb-d31b-4b6a-893d-b7598fdc85f5 — page 1 light, page 2 dark; built from `build/parts-screens/*.mjs` via `node docs/design/canvases/build/build.mjs screens`
- Token source of truth: `docs/design/canvases/build/tokens.css` → generated into `src/theme/tokens.css` (header added; never edit the copy)
- Canvas sources: `docs/design/canvases/*.dc.html` (generated) from `build/parts/*.mjs` + `build/base.css`. Rebuild: `node docs/design/canvases/build/build.mjs` (system) and `node docs/design/canvases/build/build.mjs screens` (both also rewrite `src/theme/tokens.css`); then `node docs/design/canvases/build/contrast.mjs` must print `all pass`
- Reference component CSS: `docs/design/canvases/build/base.css` — class names there map to `src/components/ui/*`

## 1. Tokens

All values live in `tokens.css` as CSS custom properties on `:root` (light) and `[data-theme="dark"]`. Components reference tokens only — never a hex, never a px that has a token.

| Group | Tokens | Rule |
|---|---|---|
| Surfaces | `--bg-app` `--bg-panel` `--bg-elevated` `--bg-inset` `--scrim` | app = window/sidebar/toolbar; panel = content (grid, diff, lists); elevated = menus/dialogs — only one step brighter than panel, emphasis comes from shadow + the `--scrim` backdrop, never from brightness; inset = inputs, output dock |
| Interaction | `--bg-hover` `--bg-active` `--bg-selected` `--bg-selected-unfocused` | hover/active are translucent overlays; selected = accent tint only in the focused pane, neutral elsewhere |
| Text | `--fg` `--fg-muted` `--fg-faint` `--fg-on-accent` | muted = everything secondary that carries information (labels, counts, help text, chevrons, diff signs, gutter numbers); faint = placeholders/disabled ONLY — never for information (held at ≥3:1, not 4.5) |
| Borders | `--border` `--border-strong` | `--border` = dividers/hairlines (decorative, no contrast target); `--border-strong` = control edges (secondary button, checkbox, input hover, spinner track) at ≥3:1 |
| Accent | `--accent` `--accent-hover` `--accent-soft` `--accent-text` | one accent. `--accent` = fills + focus ring (≥3:1 as UI); `--accent-text` = links, renamed glyph, SHA links (≥4.5:1 as text). soft = tints (selected chip, input halo, "N lines selected") |
| Semantic | `--danger` `--danger-hover` `--danger-text` `--danger-soft` · `--success*` `--warning*` | meaning only. `--danger` = fills (danger button, badge, invalid border); `--danger-text` = text/icons (deleted/conflict glyphs, `−N`, destructive menu item, output error line, error toast/banner icon). `--success`/`--warning` are text-safe as is. `*-soft` = banner/toast backgrounds |
| Focus | `--focus-ring` | 2px offset ring (`bg-panel` gap + accent). Inputs use a 3px `accent-soft` halo instead. `:focus-visible` only |
| Elevation | `--shadow-1` `--shadow-2` `--kbd-on-dark-bg` | 1 = menus/tooltips/popovers; 2 = dialogs (always over `--scrim`). No other shadows exist anywhere (tooltip uses `--shadow-1`). `--kbd-on-dark-bg` = kbd chip inside the inverted tooltip |
| Scrollbar | `--scrollbar-thumb` `--scrollbar-thumb-hover` | overlay-style, 4px visible thumb in a 10px gutter, no track/arrows (`::-webkit-scrollbar`); thumb ≥3:1 on panel/app |
| Graph | `--graph-0..7` | lane color = column index mod 8; every lane ≥3:1 on `--bg-panel` |
| Diff | `--diff-add-*` `--diff-del-*` `--diff-hunk-*` `--diff-gutter-fg` | row bg → gutter one step darker → word highlight one more; `--diff-gutter-fg` aliases `--fg-muted` (≥4.5:1 on both gutters and on panel) |
| Syntax | `--syn-{keyword,string,comment,number,type,function,punct}` | diff line highlighting only (`src/lib/highlight.ts`); every one ≥4.5:1 on `--bg-panel` and on both `--diff-add-bg` / `--diff-del-bg`; comment + punct alias `--fg-muted` (comments italic) |
| Ref chips | `--chip-{local,remote,tag,head,stash}-{bg,fg}` | see §4 |
| File status | `--status-{added,modified,deleted,renamed,untracked,conflict}` | glyph color; conflict also gets `--danger-soft` box. Aliases: added→`--success`, modified→`--warning`, deleted/conflict→`--danger-text`, renamed→`--accent-text`, untracked→`--fg-muted` (likewise `--chip-local-bg`→`--accent-soft`, `--chip-tag-bg`→`--warning-soft`, `--chip-head-*`→`--accent`/`--fg-on-accent`) — `var()` aliases, so they cannot drift |

### Type
- `--font-ui` Inter (woff2 to be bundled in `src/assets/fonts` at M1-UI; until then the fallback stack renders) → Segoe UI / system-ui / Cantarell. `--font-mono` JetBrains Mono → Cascadia Code / Menlo / DejaVu Sans Mono.
- Scale: `2xl 20/28 600` · `xl 16/24 600` · `lg 14/20 600` · `md 13/18 400` (base) · `sm 12/16` · `xs 11/16` · mono `12/18`.
- Weights: 400 body, 500 buttons/labels/selected, 600 headings + current branch. Never 700.
- `.label` (section headers, table headers `.th`): xs, 600, uppercase, 0.06em tracking, `--fg-muted`.
- Numbers that align (ahead/behind, counts, dates, +/−): `font-variant-numeric: tabular-nums`.
- Mono for: SHAs, paths, branch names inside diffs/output, diff content. UI branch names (sidebar, chips) use `--font-ui`.

### Spacing / radii / density
- Spacing scale: 2, 4, 6, 8, 12, 16, 20, 24, 32. Gaps in flex/grid, not margins.
- Radii: `sm 3` chips/glyphs/menu items · `md 5` controls/rows/lists · `lg 8` cards/menus/dialogs · `pill` badges.
- Fixed heights (virtualization + graph depend on them): `--row-h 26` · `--control-h 28` · `--control-h-sm 24` · `--section-h 28` · `--toolbar-h 40` · `--statusbar-h 24`. Diff lines 20px. Table header 24px.
- Graph: `--lane-w 13`, `--node-r 3.5`, `--lane-stroke 2`. The canvas SVGs hardcode these literals; the app's `GraphCell` must read them via `getComputedStyle` (or a generated constants module) so tokens stay the single source.

### Motion
- `--dur 120ms` hover/press/selection; `--dur-panel 150ms` collapse/expand, dock, dialog (fade + 2px rise). `--ease` ease-out only. Honor `prefers-reduced-motion` (set durations to 0).

## 2. Icons
- lucide, stroke 1.75, round caps/joins. 16px in rows/menus/inputs, 18px in toolbar, 12px inside chips/ahead-behind/tree chevrons, 24px in empty states.
- Color `--fg-muted` at rest, `--fg` when the parent is hovered/active/selected. Never colored icons except semantic (toast/banner).
- No emoji anywhere in UI.

## 3. Components (`src/components/ui/`)
One file per row. States are CSS classes on the reference sheet (`is-hover` etc.) and real pseudo-classes in the app.

| Component | Spec |
|---|---|
| `Button` | 28px, pad 12, weight 500, radius md. Variants: `primary` (accent), `secondary` (panel bg + strong border), `ghost`, `danger`. `sm` = 24px/pad 8/12px text. Disabled = opacity .45. Icon (14px) left of label, gap 6 |
| `IconButton` | 24×24, radius sm, icon 16, `--fg-muted` → `--fg` on hover. `on` (toggled) = `--bg-active`. Tooltip mandatory |
| `ToolbarButton` | 28px ghost, icon 18 + label + optional count (xs, muted). Separators 1×18 `--border` |
| `Input` | 28px, `--bg-inset`, no border at rest; hover = strong border; focus = panel bg + accent border + 3px soft halo; invalid = danger border/halo. Placeholder `--fg-faint`; leading icon 14px `--fg-muted` |
| `Select` | Input anatomy + chevron-down 14; open = focus style + chevron-up. Min width 160 |
| `Checkbox` | 16px, radius sm; checked/mixed = accent fill, white 12px check/minus. Label gap 8 |
| `Tabs` | 28px, 2px accent underline on selected, count pill in `--bg-inset` + `--fg-muted`. Used for Unified/Side-by-side, Unstaged/Staged |
| `ListRow` | 26px, pad 8, gap 8, nowrap + ellipsis on the grow cell. hover / selected / selected-unfocused / focus (inset 1px accent). Multi-select adds a 2px accent left bar per selected row |
| `TreeRow` | ListRow + 14px indent per depth, 16px chevron slot (12px icon), 14px kind icon. Current branch = 600 weight |
| `TableHeader` | 24px, label style, sort chevron 12 on the sorted column, 1×12 resize handles |
| `RefChip` | 18px, pad 6, xs 500, radius sm, 11px icon. Kinds + order in §4. Lead the grid row before the subject; max 3 per row then `+N` remote-styled chip |
| `Badge` | 16px pill, xs 600, `--bg-inset`/muted; `accent` and `danger` variants |
| `AheadBehind` | 12px arrow icons + tabular xs, muted |
| `StatusGlyph` | 16×16 mono xs 600 letter (A M D R U C), colored per `--status-*`; C on `--danger-soft` |
| `Tooltip` | inverted (`--fg` bg, `--bg-panel` text), 12px, pad 4/8, radius sm, `--shadow-1`, shortcut kbd(s) at right on `--kbd-on-dark-bg`. 500ms delay |
| `Menu` / `ContextMenu` | 220px, pad 4, `--bg-elevated` + shadow-1, radius lg. Items 26px radius sm, icon 16 muted, kbd right; hover = accent bg + white text; separators 1px; destructive item last, `--danger-text`. Right-click anywhere without a `ContextMenu` shows **nothing** — the webview's own menu is suppressed app-wide (`lib/nativeMenu.ts`), except in editable fields and on selected `.selectable` text, where it is the only mouse route to the clipboard |
| `Kbd` | 16px, 10px 500, `--bg-inset` + border, radius sm. Ctrl/Shift on Win+Linux, ⌘/⇧ on macOS |
| `Dialog` | 440px (forms) / 560px (output-bearing), `--bg-elevated` + shadow-2, radius lg. Title 44px 14/600 + close IconButton; body pad 16 gap 12; footer pad 12/16, buttons right, primary last. Esc closes, Enter submits |
| `Field` | label sm 500 muted, control, help xs muted |
| `PanelHeader` | 28px `--bg-app`, sm 600 muted, icon 14, actions as IconButtons right |
| `SectionHeader` | 28px label style, chevron slot, count badge; hover tint; click toggles |
| `SplitHandle` | 5px hit area, 1px `--border` line; hover/drag = 2px accent |
| `StatusBar` | 24px `--bg-app`, xs muted; branch + ahead/behind left, running op (spinner + text) and tree state right |
| `Toast` | 360px, `--bg-elevated` + shadow-1, radius lg, icon 16 semantic color (`--danger-text` / `--success` / `--accent-text`), title 500 + sm muted detail, close IconButton. Top-center stack below the toolbar, 5s (errors persist) |
| `Banner` | 32px full-width at top of content, `*-soft` bg, icon 14 semantic, sm text, `sm` buttons right. Used for merge/rebase in progress, conflicts, detached HEAD |
| `Progress` | 4px pill; indeterminate = 30% sweeping. 3px when attached to a dock |
| `Spinner` | 14px, 2px, accent top arc |
| `BusyOverlay` | Full-window `--scrim` + centered `--bg-elevated` card (Spinner + text), shown for a blocking wait (opening a repository); appears after 150ms so fast opens never flash it |
| `EmptyState` | icon 24 muted, title 500, one-line sm hint, optional single secondary button |

## 4. Domain rules
- **Ref chips**: placed at the **start of the grid row, before the subject** (GitExtensions-style); the subject truncates, chips never do. `head` solid accent (only on HEAD row); `local` accent-soft; `current` local + 1px inset outline + 600; `remote` neutral inset; `tag` warning-soft; `stash` violet-soft. Order: HEAD, current, local…, remote…, tags, stash, `+N` (max 3 visible; `+N` opens a popover listing the rest).
- **Synced local + remote**: when a local branch and its *tracking* remote branch point at the same commit, render one local chip with a remote segment (`main · ☁ origin`; several remotes comma-joined: `origin, upstream`). The segment carries the remote's name alone only while the upstream is named after the local branch; a differently-named upstream is spelled out in full (`feature · ☁ origin/trunk`), or the segment would read as `origin/feature` — which may be a different branch entirely, sitting on the same commit. The segment is regular weight at 85% opacity behind a hairline divider. A remote branch at the same commit that is *not* the tracking branch keeps its own `remote` chip. When local and remote diverge they naturally land on different rows and show separately.
- **Graph**: lines 2px round; curves are cubic Béziers between row centers (no diagonals); nodes r 3.5 filled in lane color; HEAD = extra 5px ring; working-tree row = dashed ring, italic muted subject, only when dirty; pass-through lanes draw under nodes; selected-row tint spans the graph column, lane colors unchanged.
- **Diff**: gutters 40+40 (old/new, `--diff-gutter-fg`), sign column 14 (`--fg-muted`), 20px lines; header stats `+N` `--success` / `−N` `--danger-text`; line content is `.selectable` (gutter + sign are not); add/del row tint, darker gutter, darker word highlight; hunk header 24px `--diff-hunk-*` mono xs with Discard / Stage hunk buttons on hover; selected lines get accent sign column + inset ring and a sticky "N lines selected · Stage N lines" bar; side-by-side pairs −/+ runs with 20px filler rows.
- **Conflicts**: a conflicted file is diffed as *ours* against the file on disk, so the `<<<<<<<` / `=======` / `>>>>>>>` markers git wrote are what the user reads; no hunk or line actions (whole-file staging is what marks it resolved), header note "Conflict — stage the file once resolved" and a `sm` **Resolve in editor** button beside it that hands the three sides to VS Code's merge editor. Resolution itself is never in-app. Staging a file that still has its markers is how git marks it resolved, and nothing undoes that — while a merge or rebase is in progress such a file gets the note "Marked resolved, but the conflict markers are still here" and a `sm` **Restore conflict** button, which overwrites the working file and so asks first.
- **Output dock**: bottom, 160–320px; header = PanelHeader with command, elapsed, spinner, Cancel, collapse; body mono on `--bg-inset`; `$ cmd` in `--fg`, output muted, exit line `--success`/`--danger-text`. Body is `.selectable`.
- **Sidebar**: 260px default, resizable 180–560px, `--bg-app`; sections Local / Remotes / Tags / Stashes; branches tree by `/`; counts as badges. A badge counts **refs**, never the grouping rows: Remotes shows how many remote branches exist across all remotes, not how many remotes (the remotes are visible rows, the branches under a collapsed one are not); folder rows in the local tree don't count either. (The original 220–320 range made the splitter feel dead — long branch paths need the room.)
- **Selection model**: one focused pane owns `--bg-selected`; others show `--bg-selected-unfocused`. File lists support Shift/Ctrl multi-select.

## 5. Accessibility
- Text contrast ≥ 4.5:1 on its surface; non-text UI (control edges, icons, focus ring, scrollbar thumb, graph lanes) ≥ 3:1. Contrast audit: `node docs/design/canvases/build/contrast.mjs` checks 99 token pairs × 2 themes and exits non-zero on failure — run it after any token change. Computed minimums: text 4.50 (light `--danger-text` on `--bg-app`), non-text 3.01 (light `--graph-7` on `--bg-panel`); `--fg-muted` ≥ 4.52 on every surface incl. selected rows and the hover composite; `--fg-on-accent` ≥ 4.57 on every accent/danger fill.
- `--fg-faint` = placeholders/disabled only; never for information (held at ≥3:1, not 4.5). Anything a user must read — labels, counts, help text, chevrons, diff signs — uses `--fg-muted`.
- Text-safe variants: `--accent-text` and `--danger-text` for text/icons; `--accent`/`--danger` are fills. Dark-theme hovers darken (not lighten) so white text stays ≥4.5:1.
- Focus always visible on keyboard (`:focus-visible`), never on mouse.
- Hit targets ≥ 24px; toolbar/list rows accept full-width clicks.
- Color never sole carrier: status glyph letters, diff signs, chip icons, ahead/behind arrows.
- Selection: `body` is `user-select: none`; content the user may copy (diff line text, commit message, output dock body) opts in with `.selectable` (`src/theme/base.css`).
- `prefers-reduced-motion` respected. Theme: `src/theme/theme.ts` — `localStorage('theme')` = `light` | `dark` overrides; absent = follow `prefers-color-scheme` live; `setTheme('light'|'dark'|'system')` writes/clears the key and applies `data-theme` on `<html>`.

## 6. Do / don't
- Do: gap-based layout, tokens only, one primary action per dialog, verbs on buttons ("Create", "Stage hunk"), sentence case.
- Don't: pure white (`#fff`) on any surface — it exists only as `--fg-on-accent`; large panes sit on `--bg-panel` (#eef0f3), chrome on `--bg-app`. No raw colors (canvas parts read hex only via `tokens`/`resolve()` from `build/lib.mjs`; the canvas backdrop `PAGE_BG` is tool chrome, not an app token), gradients, shadows other than `--shadow-1/2`, left-border accent cards, bold 700, more than 3 chips inline, icons without tooltips, emoji.

## 7. Adding a feature (post-v1)
Wireframe (boxes + labels) → compose from §3 components and §4 patterns → done. Need a new component? Add it to the Components artboard + this file first, then build it in `src/components/ui/`.
