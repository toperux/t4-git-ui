# Plan: Files tab, blame, file history, recent-repos submenu, and three small ones

Three features built in order because each stands on the one before, plus four independent small items (§4, §5). Decisions were taken
with the user on 2026-09-12 (recorded inline as **decided**); the rest is design for the refine
pass. Nothing here is executed.

## 0. What exists, and the shape everything reuses

- Files are only ever listed as *changed* files: the selected commit's list (`ChangedFileList`,
  bound to `diffStore`) and the working-tree lists (`FilesColumn`, `commitStore`). There is no
  view of a commit's whole tree.
- Big views are full-window `Dialog`s over the same components and stores as the pane behind
  them (`DiffDialog` = `ChangedFileList` + `CommitDiff`; `CommitDialog` likewise). Anything added
  *inside* those components is inherited by the dialog; anything bolted onto the pane wrapper is
  not (the parity trap fixed in `b1c3377`). Rule for this plan: **new UI goes inside the shared
  components, never on the wrappers.**
- Reads are git2 (`crates/git-core`), operations are the git CLI through `cli/runner.rs`. The
  diff tool already writes a blob at a revision to a temp file (`tools.rs` `open_diff_tool`).
- The grid takes a `RevSpec` + `LogFilter { text, working_tree }`; an active filter disables the
  graph layout (rows get lane 0). `find_log_row` / `revealOid` load the page holding an oid and
  select it.
- Every list row menu is a `ContextMenu` (`FileContextMenu` is the model: Stage, Discard, Copy
  path, Open, Reveal). `ChangedFileList` has no row menu today.

Cross-cutting choice, **decided**: all three features key on a `(commit, path)` pair. The
working-tree row resolves to HEAD for the commit and to the index + disk for content.

## 1. Files tab

**Decided.** A second tab in `ChangedFileList`'s header: **Changes | Files**. Files lists the
selected commit's whole tree; for the working-tree row it lists the **index** (tracked files, so a
staged add is there and a staged delete is not) minus files missing on disk, and reads content
**from disk**. Folders **collapsed by default**; a **filter box** (case-insensitive substring on the
path) flattens to matching files while non-empty; expand/collapse state kept per session. Selecting
a file shows its **content** (one-sided) on the right. Row menu: **Copy path, Open, Reveal in
folder** (Reveal only on the working-tree row), **Save as…** at this revision, **Show in Changes**
when the file changed in this commit. Blame and History join the menu in §2 and §3.

### Backend (git-core + commands)

- `tree::list(repo, target) -> Vec<TreeEntry { path, size, mode, kind: Blob | Symlink |
  Submodule }>` — for a commit, a recursive tree walk (git2 `Tree::walk`, pre-order); for the
  working tree, `repo.index()` entries filtered by `fs::metadata` existing — **deduped by path**,
  since a conflicted file holds up to three stage entries. Sorted by path, as the status is. One
  call per selection; 47k paths is tens of ms in git2 and ~2 MB over IPC, so no paging. The reply
  carries the **tree oid** (index: none) so the store can cache the list by it and skip the
  refetch when the user moves between commits sharing a tree; a blame drill-down changes the tree
  every step and refetches, which is the accepted cost (lazy per-folder listing is the upgrade
  if it ever shows).
- `tree::read(repo, target, path) -> FileContent { text: Option<String>, binary: bool, size,
  truncated, max_lines }` — blob at the commit (`Tree::get_path` → `Blob`), or the disk file for
  the working tree. Every disk read goes through the `repo_relative` guard `open_path` uses (no
  `..`, no absolute path), even though the path came from our own listing. Binary detection and
  the line cap reuse `diff.rs`'s (`max_lines`, same banner). Symlink → its target as text;
  submodule → a one-line "submodule at <short>".
- `tree::save_as(repo, target, path, dest)` — the blob (or disk file) written to `dest`. Dest
  comes from the native save dialog; the command refuses a dest inside `.git`. The webview's
  capability was narrowed to the calls it makes (P2, 2026-09-12): **`dialog:allow-save` has to be
  added** beside the existing `ask`, deliberately, with the reason in the capability file.
- `open_path` for a commit's file: reuse the diff-tool temp-copy path (`tools.rs`) to write the
  blob and open it with the configured editor; the working tree opens the real file (existing
  `open_path`).
- Commands: `list_tree`, `read_file`, `save_file_as`; `open_path` gains an optional target.

### Frontend

- `diffStore` gains `tab: "changes" | "files"`, `tree: TreeEntry[] | null`, `treeLoading`,
  `treeFilter`, `treeSelectedPath`, `content: FileContent | null`, and `loadTree` / `loadContent`
  with the same generation counter pattern as `load` / the diff (a late reply for a previous
  target is dropped).
- `ChangedFileList`: a `Tabs` strip in the header (two buttons, `role="tablist"`, left of the
  tree toggle); the Files body is the same virtualized row list with `buildFileTree` /
  `flattenTree` (already generic over `{ path }`) and the same keyboard handling — which today
  closes over the changed-files array and the diff selection, so the handler is lifted to take
  the row source and the select callback as parameters and both tabs call it. The **filter
  `Input` sits on a second row of its own, rendered only on the Files tab** — the header is one
  row and the Diff dialog's list panel goes down to 180 px, where tabs + toggle + an input do not
  fit. Rows show the name and the size, no status letter. The tab remembers its selection per
  target.
- Content view: a **sibling component `FileContent`**, not a mode of `DiffViewer`. The viewer is
  28 KB of hunks, stage/discard actions, line selection and a cursor model, none of which a
  content view needs; the sibling shares its row CSS, `highlight.ts` / `lang` detection, the
  virtualizer and the truncation banner + binary notice, and renders `{ n, text }` rows with one
  line-number column and no sign. `CommitDiff` picks `FileContent` when the Files tab is active.
  Blame's gutter (§2) lives in this component only.
- Row menu: a `ContextMenu` on both tabs (Changes gets the same Copy path / Open / Reveal / Save
  as… items — parity between the two tabs is free once the menu is one component). "Show in
  Changes" only when `files.some(f => f.path === row.path)`.
- `DiffDialog` inherits all of it (title unchanged).

### Edge cases

- Working tree with an unborn HEAD: index only. Empty index → "No tracked files".
- A file deleted on disk but in the index: dropped from the list (decided); it is still in the
  Changes/unstaged list as deleted.
- Files over the cap: content truncated with the banner; Save as… writes the whole blob.
- Compare mode (`selectCompare`): Files shows the *to* commit's tree.
- Filter with thousands of matches: results capped at 2000 rows with a "N more" line.

### Tests

- git-core: `list` on a fixture with nested dirs, a symlink, a submodule; `read` text / binary /
  truncated; working tree list drops a missing file and includes a staged add; `save_as` refuses
  `.git/`.
- vitest: tab switch keeps per-tab selection; collapsed default; filter flattens and clears;
  Show in Changes switches tab and selects; menu items enabled by row kind; content view renders
  numbers and no sign column; DiffDialog shows the Files tab.
- Walk (CDP): `work` fixture, both tabs, both surfaces; Open on a commit's file opens a temp copy;
  Save as… via the native dialog helper.

## 2. Blame

**Decided.** Blame is a **mode of the Files tab's content view**: a "Blame" toggle in the content
header adds a per-hunk gutter (short SHA, author, age) with a faint age tint. Blame from a changed
row or a commit-panel row switches to the Files tab with that file selected and the gutter on.
**Clicking a hunk's commit selects it in the revision grid**; the Files tab follows the selection,
so the same file at that commit is shown with blame still on (the drill-down). Hover on the gutter
shows summary, author and date. A "Blame parent" item on the hunk menu selects the hunk's
`previous` commit.
**Options: only the diff's existing "ignore whitespace" setting** (`-w`); no move/copy detection.

### Backend

- `blame::blame(repo, git, target, path, ignore_ws) -> Blame { hunks: Vec<BlameHunk { start,
  lines, oid, short, author, time, summary, orig_path, uncommitted: bool }> }` via the CLI:
  `git blame --porcelain [-w] --end-of-options <rev> -- <path>` (for the working tree: no `<rev>`,
  so uncommitted lines come back as the zero oid → `uncommitted`). The porcelain parser is a
  small state machine over the header lines; commit metadata is emitted once per commit in the
  stream, so the parser keeps a map. CLI over git2 because libgit2's blame is O(history × file)
  and has no `-w`; the runner is already there, and blame is a read, so nothing is forwarded to
  the output dock and it does not take the op lock. **The runner keeps only the last 4 MB of each
  stream** (`MAX_RETAINED`, tail kept — right for an op log, useless for blame, whose porcelain
  doubles the line count). The parser therefore consumes the **event stream** (`on_event` chunks,
  a line at a time) rather than `CliOutput.stdout`, and never sees a truncated tail. The
  porcelain `previous <oid> <path>` header is kept per hunk: it is the **"Blame parent"** target
  (commit *and* path before a rename), so the hunk menu does not need the commit's parent list.
- Command `get_blame(id, target, path, ignoreWhitespace)`; cancellation by generation on the
  frontend (a late reply is dropped), and the process is killed when the repo closes (runner
  already does that for ops — reuse the job handle).

### Frontend

- `diffStore`: `blame: Blame | null`, `blameOn: boolean`, `blameLoading`, `loadBlame`. Turning
  the toggle on loads; changing the selected file or target with the toggle on reloads; the
  toggle persists per session (it is a view mode, like split/unified).
- `FileContent`: when `blameOn`, each row gets a left gutter cell; consecutive rows of one hunk
  render the label once (first row) and a tint bar for the rest. **No per-row tab stops**: rows
  are virtualized and unmount on scroll, so a button per hunk would vanish from the tab order.
  The list keeps one row cursor (as `DiffViewer` does); with blame on, Enter on the cursor row →
  `revealOid(hunk.oid)`, the context-menu key / right-click → hunk menu (Select in graph, Blame
  parent, Copy SHA), and a mouse click on the gutter does the same as Enter. The gutter cell
  carries the accessible name (`Blame: <short> <author> <age>`) on the row. Age tint: 5 steps on
  a log scale from newest to oldest hunk *in this file*, tokens from the theme, not hard-coded.
- Entry points: "Blame" in the row menus of the Files tab, the Changes tab and the commit panel
  lists (`FileContextMenu`). From the commit panel: select the working-tree row's target if it is
  not already the selection, then Files tab + file + blame on.
- `revealOid` can miss: the hunk's commit is an ancestor of the blamed commit, but the grid may be
  under a `Head`-only spec or a text filter. On `false`, toast "Not in the current view — clear
  the filter" (info), no other change.

### Edge cases

- Binary or truncated file: blame toggle disabled with a title ("Blame needs the whole file").
- Renamed file: porcelain's `filename` header gives `orig_path` per hunk; shown in the hover.
- The working tree with an unborn HEAD: blame disabled (nothing to blame against).
- git not configured / too old: `--end-of-options` needs git ≥ 2.24, already the floor the ops
  use, so no new requirement; blame and history show the same disabled-with-reason the ops do
  when the probe fails.

### Tests

- Rust: porcelain parser on a fixture with two commits, a rename and an uncommitted edit
  (`-w` variant asserted through the args builder, not by running git twice).
- vitest: gutter renders once per hunk; click calls `revealOid`; miss → toast; toggle disabled on
  binary; Blame from `FileContextMenu` lands on Files tab + blame on.
- Walk: `work` fixture, blame a file at HEAD and at an older commit, click a hunk → grid moves and
  the content follows; Blame parent; uncommitted lines labelled.

## 3. File history

**Decided.** History is a **path filter on the revision grid**: "History" on a file row sets it,
shown as a clearable chip beside the text filter ("History: src/x.ts ×"). The graph is not laid
out under a filter (existing behaviour). Selecting a row shows that commit in the details pane
with the file **preselected** in the Changes tab; the Files tab follows too, so blame at any point
of the history is one click. **Renames are followed** (`git log --follow`), and the row's path at
that commit is what gets preselected.

### Backend

- `LogFilter` gains `path: Option<String>`. `is_active` counts it, so layout is skipped as for
  `text`.
- The walker, when `path` is set, does not revwalk: it runs
  `git log --follow --format=%H --name-status -z --end-of-options <spec…> -- <path>` through
  the runner (captured, not streamed) and takes the ordered `(oid, path-at-commit)` pairs; rows
  are built from those oids through the existing row builder (commit lookup, labels, no layout),
  paged like any walk. The spec still applies (`All` → `--all`; `Head` → `HEAD`; `Refs` → the
  ref names), and `text` composes with `path` (rows filtered after the CLI list, as today).
  `LogRow` gains `path: Option<String>` carrying the path at that commit.
- `start_log` / `get_log_page` unchanged in shape; `find_log_row` works on the filtered list as it
  does for `text`.
- Merge simplification is git's default for a path (`--simplify-history` behaviour); no
  `--full-history` option in this round.

### Frontend

- `repoStore.filter.path`; the toolbar renders the chip when set; `×` clears it (and only it).
  The chip's title shows the full path.
- Details pane: when the selected row carries `path`, `diffStore.load` preselects it instead of
  the first file (the file is in the commit's change list by construction; if rename detection
  in the changed-files diff names it differently, fall back to the first file).
- Entry points: "History" in the three row menus (Files, Changes, commit panel), and on the blame
  hunk menu ("History of this file").
- Clearing the filter keeps the selected commit (existing `revealOid` on re-walk).

### Edge cases

- A path that is new in the working tree (untracked / staged add with no commits): "No history
  yet" empty state in the grid.
- Follow across a rename into a path that exists today under another name: rows preselect the
  old path; the Files tab shows the tree at that commit, so the old path resolves.
- The working-tree row stays at the top under a history filter only when the file is currently
  modified (the row's existing rule); otherwise it is hidden like under a text filter.

### Tests

- Rust: the CLI list on a fixture with a rename (`--follow` yields both paths); spec → args;
  `text` + `path` composition.
- vitest: chip renders / clears; row `path` preselects the file; History from each menu sets the
  filter; empty state.
- Walk: history of a renamed file on `work` (rename fixture from group AB), click through rows,
  blame from a history row.

## 4. Recent repositories: five inline, the rest in a submenu

**Decided.** The Repository menu lists recents flat today (up to 20 unpinned + pinned, current
repo excluded), which is the long list the user and issue #3 both object to. New shape: the
**first five in store order** (pinned first, then most recently opened, current repo excluded)
stay inline; a sixth item **"More recent ▸"** opens a **real submenu** with the rest, same rows.
With five or fewer, no submenu item. The count is fixed at five, no setting. Issue #3 asked for
everything nested under "Open recent ▸"; this keeps the common case one click and is the answer to
post on the issue when it ships (the user decides whether to close it).

### `Menu` gains submenus

- `MenuItem` gets `submenu?: ReactNode` (a prop on the existing component, not a new one): the
  item renders `aria-haspopup="menu"`, `aria-expanded`, a chevron, and on hover (after a short
  delay), click, Enter or ArrowRight opens the panel; ArrowLeft or Escape closes **only** the
  panel and returns focus to the item. **The panel has its own keydown handler that stops
  Escape** — the parent `Menu`'s `closeOnEscape` sits on `wrap`, an ancestor in the React tree,
  and an unstopped Escape would close everything (the same shape as the `ContextMenu` fix in
  `b1c3377`).
- Placement: the panel is a second `.menu` rendered **inside the parent's `wrap` but as a sibling
  of the parent's `.menu`, not inside it** — `onMenuKeyDown` collects `[role="menuitem"]` under
  the `.menu` it is bound to, so rows nested inside it would join the parent's Up/Down cycle.
  Being inside `wrap` still gives it `useMenuDismiss`'s outside-mousedown rule and the parent's
  stacking context for free; not portalled. Position: on open the item reports its `offsetTop`,
  and the panel sits at `left: 100%` of the parent menu at that top (flipped to the left edge when
  the viewport is short on the right). Arrow keys inside the panel use `onMenuKeyDown` unchanged;
  Tab closes both.
- One open submenu at a time. It closes when another item receives **focus** (keyboard) or after a
  ~150 ms **hover grace** on a sibling — the pointer crosses sibling items on its diagonal path
  from the item into the panel, and closing on the first hover would make the panel unreachable
  by mouse. Selecting a row in the panel closes the whole menu (the existing item `onClick` →
  `onClose` path).
- `ContextMenu` does not get submenus in this round (nothing needs one).

### Toolbar

- `Toolbar.tsx`'s `others` splits into `others.slice(0, 5)` inline and `others.slice(5)` for the
  panel. Row rendering is the existing recent item (name, title = path); the panel reuses it.
- The start screen's full list is untouched.

### Tests

- vitest (`Menu.test.tsx`): submenu opens on Enter/ArrowRight/click/hover; ArrowLeft and Escape
  close only the panel and refocus the item; Tab closes both; a mousedown in the panel does not
  close the menu; selecting a panel row calls the parent's `onClose`.
- vitest (`Toolbar.test.tsx`): 4 recents → no "More recent"; 7 → five inline + panel of two;
  pinned rows lead; the current repo is absent from both.
- Walk: recents ≥ 6 on this machine already; keyboard round trip in the Repository menu.

## 5. Three small items

### 5a. Sidebar folder collapse — a setting (issue #2, extended)

**Decided.** Settings gains **Sidebar folders**: *Always expanded* (today's behaviour) · *Always
collapsed* · *Collapsed when more than N refs* with an N field, default **10**. It governs **every
folder row** in the sidebar — branch name folders, the same under each remote, tag folders — and
never the top-level groups. N counts **refs under the folder at any depth**. The rule **seeds**
folder state on repo open and when the setting changes; a manual expand/collapse then wins for the
session, a refs refresh never re-collapses an opened folder, and a folder that first appears
mid-session gets the rule applied once when it appears.

- `settingsStore`: `sidebarFolders: "expanded" | "collapsed" | "auto"`, `sidebarFoldersMax:
  number`. Persisted where `diffContext` and the other options live — the app store file
  (`recents.json` in the app data dir), which is edited by hand only with the app closed.
- `Sidebar.tsx`: `collapsed` stays the session state, but its seed comes from
  `seedCollapsed(tree, setting)` computed when the repo opens or the setting changes; on each refs
  refresh, folders not yet in a `seen` set are seeded and added, the rest untouched. `seen` and
  `collapsed` share the key scheme (`folderKey(path)` per tree); the top-level `remote:<name>` /
  `tag:<remote>` groups never enter it because the rule only visits `renderTree` folders.
  `buildTree` returns nested `TreeNode`s with `children`, so the descendant count is a fold over
  it, no second pass.
- Settings dialog: the kit has no radio group — a `Select` for the three modes and a number
  `Input` beside it, enabled only for *auto*, validation 1..999; same row shape as the diff
  context setting.
- Tests: seed by each mode on a fixture tree with nested folders (counts at depth); manual toggle
  survives a refresh; a new folder mid-session is seeded once; setting change reseeds.
- Answers issue #2 on shipping (user decides whether to close).

### 5b. Issue templates (issue #1)

**Decided.** Two YAML issue forms under `.github/ISSUE_TEMPLATE/`: **Bug report** (app version,
OS, git version, steps, expected / actual, log excerpt — the field text names where the log is:
Tauri's `app_log_dir()`, i.e. `%APPDATA%\dev.topher.t4gitui\logs` on Windows,
`~/Library/Logs/dev.topher.t4gitui` on macOS, `~/.local/share/dev.topher.t4gitui/logs` on Linux)
labelled `bug`; **Suggestion** (the problem, the proposal) labelled `enhancement`. Blank issues
stay allowed, which is GitHub's default, so no `config.yml` unless a contact link is wanted. Both
labels exist. No code; verified by opening "New issue" on GitHub after the push.

### 5c. Toast Retry / Dismiss return focus

**Decided.** A toast **remembers the element that had focus when the failing action started**
and **Retry and Dismiss restore it** when it is still in the document; otherwise the open
dialog's first field (via `dialogStore`), otherwise nothing. Same code in the pane and the commit
window.

- Captured at **action start, not at push**: `toastError` fires in the mutation wrapper's `catch`,
  by which time `busy` has disabled the clicked control and `document.activeElement` is already
  `<body>`. `commitStore.run` reads `activeElement` on entry and passes it to `toastError` as a
  fourth argument, `origin`; the Retry closure carries the same origin through a retry loop. The
  other 19 `toastError` call sites pass nothing and keep today's behaviour.
- The toast holds `origin: HTMLElement | null` directly — error toasts live until dismissed and
  zustand state is never serialized, so no `WeakRef`. `dismiss(id)` and the action handler call
  `restoreFocus(origin)` after removing the toast. Auto-dismiss (info toasts) does **not** move
  focus — nothing was clicked.
- Tests: Retry returns focus to the button that failed; Dismiss likewise; a detached origin falls
  back to the dialog field; auto-dismiss leaves focus alone.

## 6. Order, size, gates

1. Files tab (backend `tree` module + commands; store; tab + content view + menu) — the largest
   piece, ~2 days of agent work in three commits (backend, store+list, content view+menu).
2. Blame (porcelain parser + command; gutter; entry points) — one day, two commits.
3. History (`LogFilter.path` + CLI list in the walker; chip; preselect; entry points) — one day,
   two commits.
4. Recents submenu (`Menu` submenu support; Toolbar split) — half a day, one commit. Independent
   of 1–3; can go first if a small win is wanted before the long piece.
5. Sidebar folder setting (5a) — half a day; issue templates (5b) — an hour; toast focus (5c) —
   an hour. All independent; natural to land with 4 as one "small items" commit each.

Each lands with its tests, the usual gates (fmt, clippy, cargo test, tsc, vitest), a CDP walk on
`c:/tmp/t4/work` in both the pane and the Diff dialog, and a smoke group appended to
`smoke-test-post-v1.md`. Commits stay local until the user asks for a push.

## 7. Open for the refine pass

- Tab strip placement: in `ChangedFileList`'s header (left of the tree toggle), or a header row
  of its own above it. Recommendation: same header, the list header is already a toolbar.
- The history chip lives in the Toolbar next to the branch filter, or inside the grid header.
  Recommendation: Toolbar, beside the text filter, same height.
- Age tint on blame: on by default or behind the toggle. Recommendation: on with blame; it is
  what makes the gutter readable at a glance.

## 8. Audit 2026-09-12 (folded in above)

§5 (three small items) audited 2026-09-13: toast origin captured at action start through
`commitStore.run`, no `WeakRef`; `Select` not a radio group; `seen` keyed like `collapsed`; the
setting persists in the app store file; the bug form names the log directory; no `config.yml`.

§4 (recents submenu) audited separately the same day: panel as a sibling of the parent `.menu`
(arrow cycle), own Escape stop, `offsetTop` placement, hover grace, `MenuItem` prop not a new
component; §1's list keyboard handler lifted to take its row source.

Runner's 4 MB tail cap → blame parses the event stream; content view as a sibling `FileContent`,
not a `DiffViewer` mode; "Blame parent" from porcelain's `previous` header; gutter driven by the
row cursor, no per-row tab stops; index listing deduped across conflict stages;
`dialog:allow-save` capability named; Files filter on its own row for the 180 px case; tree oid
returned for the cache key; `repo_relative` guard on disk reads; git ≥ 2.24 floor already met.

