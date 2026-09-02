# t4-git-ui

A GitExtensions-style git client for Windows, macOS and Linux: commit graph, staging down to the line, branch / remote operations with live output — in a compact, keyboard-friendly desktop app.

Rust core (`git2` for reads and the index, the system `git` for everything that touches the network, hooks or merges), Tauri 2 shell, React UI.

> Screenshots: _coming with the first release_ (light + dark; see the design canvases under `docs/design/canvases/` meanwhile).

## Features (v1)

- **Revision grid** — lane graph for all branches or the current one (the graph column fits the rows in view), ref chips (HEAD, local, remote, tags, stashes), text filter, working-tree row while the tree is dirty; virtualized, fine with very large histories. Right-click a commit to check out or reset the branches sitting on it, create a branch or tag there, or copy the SHA.
- **Sidebar** — local branches, remotes, tags and stashes; branches with `/` nest in folders (remote ones too), a branch whose tip is already inside another is marked `merged`.
- **Details pane** — commit metadata, changed files (flat / tree), unified and side-by-side diffs with per-line syntax highlighting (JS/TS, Rust, CSS, JSON, HTML, Python), whitespace toggle.
- **Commit panel** — unstaged / staged lists (flat or as a folder tree — chains of single folders fold into one row, guide lines mark the depth) with multi-select, stage / unstage whole files, hunks or selected lines, discard, amend, Signed-off-by, message history, Commit & Push; or the same as a full-window commit dialog (lists and message stacked left, diff right). Hooks and GPG signing run through the real `git`.
- **Branch and remote operations** — fetch / pull / push, merge, rebase (continue / abort), checkout, create / rename / delete branches, create / push / delete tags (locally or on a remote), stash push / apply / pop / drop, each with a dialog that previews the exact `git …` command; output streams into a dock with Cancel. Anything else: **Run git command…** (`Ctrl+Shift+R`, or the prompt line in the dock) runs any `git …` line with completions for subcommands, flags, refs and your history.
- **State banners** — detached HEAD, merge / rebase in progress, conflicts.
- **Start screen** — recent repositories (pin, filter), open, clone with progress, init; a friendly screen when `git` is missing.
- Light and dark themes following the OS, or a toggle in the toolbar; no flash on launch; every colour pair audited for WCAG contrast.

Not in v1: interactive rebase, blame, file history, submodules, worktrees, bisect, cherry-pick / revert UI, multi-repo tabs.

## Install

Grab the installer for your platform from the [Releases](../../releases) page:

- Windows: `t4-git-ui_<version>_x64-setup.exe` (NSIS) or the `.msi`
- macOS: `.dmg` (unsigned for now — right-click → Open on first launch)
- Linux: `.deb`, `.rpm` or `.AppImage`

Requirements: `git` ≥ 2.20 on `PATH`. Windows installs the WebView2 runtime automatically if it is missing.

## Build from source

Prerequisites: Rust stable, Node 24, `git`. Linux additionally needs the Tauri 2 packages
(`libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`).

```sh
npm install
npm run tauri dev        # run with hot reload
npm run tauri build      # installers under target/release/bundle/

cargo test --workspace   # core tests (temp repos; some need the git CLI) + the Tauri crate's
npm test                 # frontend tests (vitest)
cargo clippy --workspace --all-targets -- -D warnings
```

Layout: `crates/git-core` (pure Rust, no Tauri) · `src-tauri` (IPC glue) · `src` (React; see [`src/README.md`](src/README.md)).
Design: [`docs/design/style-guide.md`](docs/design/style-guide.md) is the token source of truth; `node docs/design/canvases/build/build.mjs` regenerates `src/theme/tokens.css` and the canvases, `node docs/design/canvases/build/contrast.mjs` audits contrast.
Plan and milestone log: [`docs/plans/2026-08-31-git-ui-v1-plan.md`](docs/plans/2026-08-31-git-ui-v1-plan.md).

## Keyboard shortcuts

Ctrl is ⌘ on macOS.

| Where | Keys | Action |
|---|---|---|
| Start screen | `Ctrl+O` / `Ctrl+Shift+O` / `Ctrl+N` | Open / Clone / Initialize |
| Start screen | `↑` `↓` `Home` `End` `Enter` `Delete` | Navigate recents / open / remove |
| Repo window | `F5` · `Ctrl+F5` | Refresh · Fetch |
| Repo window | `Ctrl+Shift+L` · `Ctrl+Shift+U` | Pull… · Push… |
| Repo window | `Ctrl+B` | Create branch… |
| Repo window | `Ctrl+Shift+R` | Run git command… |
| Repo window | `` Ctrl+` `` | Toggle output dock |
| Repo window | `Ctrl+Shift+W` | Close repository |
| Lists | `↑` `↓` `Home` `End` · `Shift`/`Ctrl`+click · `Ctrl+A` | Move · multi-select · select all |
| Commit panel | `Enter` / double-click · `Delete` | Stage / unstage selection · discard |
| Commit panel | `Ctrl+Enter` | Commit |
| Commit panel | double-click the working-tree row | Open the commit dialog |
| Diff (staging) | click · `Shift`+click · `Ctrl`+click | Select lines / extend / toggle |
| Grid · Sidebar | `Shift+F10` · right-click | Context menu |
| Sidebar | double-click | Checkout |
| Dialogs | `Enter` · `Esc` | Submit · close |

## Status / roadmap

v1 is feature-complete, covered by 126 Rust and 247 frontend tests, and **accepted on Windows**:
the `docs/smoke-test.md` walkthrough was completed end to end on 2026-09-01 and everything it
found is fixed. CI is green on Linux, Windows and macOS, but Linux and macOS are compiled there
only (no rendering check, no signing / notarization yet), and the installer has not been tried on a
clean Windows machine. Deliberate v1 omissions are listed in
`docs/plans/2026-08-31-git-ui-v1-plan.md` › Known gaps.

What is still open — deferred features, verification that needs other machines, and the longer
roadmap (interactive rebase, blame, submodules, multi-repo tabs, …) — is listed in one place:
`docs/plans/2026-09-02-next-plan.md`.
