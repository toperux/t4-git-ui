# `src/` — frontend (React 19 + TS + Vite, Tauri 2 webview)

```
src/
  main.tsx                 mounts App; imports fonts.css → tokens.css → base.css; LucideProvider (16px, stroke 1.75)
  App.tsx                  probe_git → GitMissingScreen | no repo → StartScreen | repo → RepoWindow; persists localStorage.lastRepo
  api/
    types.ts               TS mirror of the Rust IPC contract (serde camelCase) — edit only together with the Rust structs
    ipc.ts                 one typed `invoke` wrapper per command; every rejection is an AppError {kind, message}; isAppError/toAppError
    events.ts              onLogProgress(cb) → unlisten  (`log://progress`)
  store/
    repoStore.ts           zustand: repo, refs, log {generation,total,complete,error,flat}, sparse rows[], selection, reveal
                           actions: openRepo, closeRepo, refreshRefs, startLog, ensureRows (500-row pages, dedupe, stale drop), select, revealOid
    diffStore.ts           zustand: selected commit → files (get_commit_files), selectedPath (default first), diff (get_file_diff, context 3),
                           stale responses dropped via seq counters; view unified|split (localStorage.diffView), ignoreWhitespace,
                           fileListMode flat|tree (localStorage.fileListMode)
  theme/
    tokens.css             GENERATED from docs/design/canvases/build/tokens.css — never edit; run `node docs/design/canvases/build/build.mjs`
    base.css               reset, body, scrollbar, :focus-visible, .selectable, reduced-motion
    fonts.css              @font-face for the bundled variable fonts in assets/fonts
    theme.ts               light/dark preference → <html data-theme>
    useThemeTokens.ts      reads --graph-0..7 / --lane-w / --node-r / --lane-stroke / --row-h via getComputedStyle; re-reads on data-theme change
  assets/fonts/            InterVariable(.woff2, -Italic), JetBrainsMono[wght](.woff2, -Italic) + licenses
  lib/                     cx(), relativeDate()/absoluteDate()
  components/ui/<Name>/    one folder per style-guide component: <Name>.tsx + <Name>.module.css (incl. StatusGlyph A/M/D/R/U/C)
  screens/
    StartScreen/           Open repository… (dialog plugin) — recents/clone/init arrive in M5
    GitMissingScreen/      probe_git failed → message + Retry
    RepoWindow/            RepoWindow (layout: toolbar 40 / sidebar 260 | grid ÷ details / dock 28 / statusbar 24)
                           Toolbar, Sidebar, DetailsPane (bottom pane: Commit 340 | ChangedFileList 320 | DiffViewer, resizable), OutputDock
      RevisionGrid/        RevisionGrid (virtualized, role=grid, keyboard nav), GridRow (memo, per-row store selectors),
                           GraphCell (<canvas> per row), graphGeometry.ts (pure: laneX, curveControls, rowSegments), RefChips
      ChangedFileList/     ChangedFileList (role=listbox, ↑/↓, flat | tree toggle, StatusGlyph + start-ellipsis mono path + `+N −M`),
                           fileTree.ts (pure: nest by `/`, folders first)
      DiffViewer/          DiffViewer (header: path, stats, unified/split/whitespace IconButtons; virtualized body, role=region,
                           `.selectable` text, CR → ␍, no-newline marker, binary/truncated states),
                           diffRows.ts (pure: flattenUnified / flattenSplit — del/add run zipping, 20px lines / 24px hunk rows)
```

## How tokens flow

`docs/design/canvases/build/tokens.css` is the single source of truth. `node docs/design/canvases/build/build.mjs`
(or `… build.mjs screens`) rewrites `src/theme/tokens.css`. Components reference tokens only (`var(--…)`) —
no raw colors, sizes, radii or fonts. The one place CSS vars can't reach is the graph `<canvas>`;
`useThemeTokens()` reads the computed values once and again when `data-theme` flips.

Selection colour follows the focused pane: rows use `--bg-selected-unfocused` by default and
`--bg-selected` under `:focus-within` of their pane (`RevisionGrid` scroll container, `TREE_PANE_CLASS` for the sidebar).

## Adding a component (style guide §7)

1. Wireframe → compose from existing `components/ui/*` and §4 patterns. If a new component is needed, add it to
   the Components artboard (`docs/design/canvases/build/parts/Components.mjs`) and `docs/design/style-guide.md` first,
   plus its reference CSS in `build/base.css`.
2. Create `src/components/ui/<Name>/<Name>.tsx` + `<Name>.module.css`; port the `base.css` rules 1:1
   (class states `is-hover` etc. become real pseudo-classes). Icons: `lucide-react`, sizes 16 rows / 18 toolbar /
   12 chips / 24 empty states; `aria-label` + `title` on icon-only buttons.
3. Keep tests small: pure helpers get a unit test; render tests only for rules the UI must never break
   (e.g. `RevisionGrid.test.tsx` enforces "chips before subject").

## Scripts

`npm test` (vitest, jsdom) · `npm run build` (tsc + vite) · `npm run tauri dev` (app).
