# t4-git-ui

A GitExtensions-style git client for Windows, macOS and Linux: commit graph, staging down to the line, branch / remote operations with live output — in a compact, keyboard-friendly desktop app.

Rust core (`git2` for reads and the index, the system `git` for everything that touches the network, hooks or merges), Tauri 2 shell, React UI.

> Screenshots: _coming with the first release_ (light + dark; see the design canvases under `docs/design/canvases/` meanwhile).

## Features (v1)

- **Revision grid** — lane graph for all branches or the current one, ref chips (HEAD, local, remote, tags, stashes), text filter, working-tree row while the tree is dirty; virtualized, fine with very large histories.
- **Details pane** — commit metadata, changed files (flat / tree), unified and side-by-side diffs with per-line syntax highlighting (JS/TS, Rust, CSS, JSON, HTML, Python), whitespace toggle.
- **Commit panel** — unstaged / staged lists with multi-select, stage / unstage whole files, hunks or selected lines, discard, amend, Signed-off-by, message history, Commit & Push. Hooks and GPG signing run through the real `git`.
- **Branch and remote operations** — fetch / pull / push, merge, rebase (continue / abort), checkout, create / rename / delete branches, create / push / delete tags (locally or on a remote), stash push / apply / pop / drop, each with a dialog that previews the exact `git …` command; output streams into a dock with Cancel.
- **State banners** — detached HEAD, merge / rebase in progress, conflicts.
- **Start screen** — recent repositories (pin, filter), open, clone with progress, init; a friendly screen when `git` is missing.
- Light and dark themes following the OS, no flash on launch; every colour pair audited for WCAG contrast.

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

cargo test -p git-core   # core tests (temp repos; some need the git CLI)
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
| Repo window | `` Ctrl+` `` | Toggle output dock |
| Repo window | `Ctrl+Shift+W` | Close repository |
| Lists | `↑` `↓` `Home` `End` · `Shift`/`Ctrl`+click · `Ctrl+A` | Move · multi-select · select all |
| Commit panel | `Enter` / double-click · `Delete` | Stage / unstage selection · discard |
| Commit panel | `Ctrl+Enter` | Commit |
| Diff (staging) | click · `Shift`+click · `Ctrl`+click | Select lines / extend / toggle |
| Sidebar | `Shift+F10` · double-click | Context menu · checkout |
| Dialogs | `Enter` · `Esc` | Submit · close |

## Status / roadmap

v1 is feature-complete and covered by 106 Rust and 173 frontend tests. It has **not yet been
accepted in a real window** — the first launch on Windows found five bugs (all fixed; see the plan),
and `docs/smoke-test.md` is the acceptance walkthrough whose remaining sections are the gate. Linux and macOS are compiled in CI only (no rendering check, no signing /
notarization yet). Deliberate v1 omissions are listed in `docs/plans/2026-08-31-git-ui-v1-plan.md`
› Known gaps.

Next: interactive rebase, blame and file history, submodules and worktrees, cherry-pick / revert, hunk- and line-level discard, custom titlebar, multi-repo tabs, settings dialog (git path, theme), i18n.
