# t4-git-ui

A GitExtensions-style git client for Windows, macOS and Linux: commit graph, staging down to the line, branch / remote operations with live output — in a compact, keyboard-friendly desktop app.

Rust core (`git2` for reads and the index, the system `git` for everything that touches the network, hooks or merges), Tauri 2 shell, React UI.

> Screenshots: _coming with the first release_ (light + dark; see the design canvases under `docs/design/canvases/` meanwhile).

## Features (v1)

- **Revision grid** — lane graph for all branches or the current one (the graph column fits the rows in view), ref chips (HEAD, local, remote, tags, stashes), text filter, working-tree row while the tree is dirty; virtualized, fine with very large histories. Right-click a commit to check out or reset the branches sitting on it, merge it (or a branch on it) into the current branch, rebase the current branch onto it, create a branch or tag there, or copy the SHA.
- **Sidebar** — local branches, remotes, tags and stashes; branches with `/` nest in folders (remote ones too), a branch whose tip is already inside another is marked `merged`.
- **Details pane** — commit metadata, changed files (flat / tree), unified and side-by-side diffs with per-line syntax highlighting (JS/TS, Rust, CSS, JSON, HTML, Python), whitespace toggle.
- **Commit panel** — unstaged / staged lists (flat or as a folder tree — chains of single folders fold into one row, guide lines mark the depth) with multi-select and a right-click menu (stage / unstage, discard, copy path, open, reveal in folder), stage / unstage / discard whole files, hunks or selected lines (mode changes ride along), keep *ours* or *theirs* per conflicted file, amend, Signed-off-by, message history, Commit & Push; or the same as a full-window commit dialog (lists and message stacked left, diff right). Hooks and GPG signing run through the real `git`.
- **Branch and remote operations** — fetch / pull / push, merge, rebase (continue / abort), checkout, create / rename / delete branches, create (optionally pushing right away) / push / delete tags (locally or on a remote), stash push / apply / pop / drop, each with a dialog that previews the exact `git …` command; output streams into a dock with Cancel. Anything else: **Run git command…** (`Ctrl+Shift+R`, or the prompt line in the dock) runs any `git …` line with completions for subcommands, flags, refs and your history.
- **State banners** — detached HEAD, merge / rebase in progress, conflicts.
- **Start screen** — recent repositories (pin, filter), open, clone with progress, init; a friendly screen when `git` is missing.
- Light and dark themes following the OS, or a toggle in the toolbar; no flash on launch; every colour pair audited for WCAG contrast.
- **Settings** — git executable, theme (light / dark / follow the OS), diff context lines and whitespace default; applied on change, the git path on Apply.

Shipped since v1: cherry-pick / revert from a commit row, interactive rebase, and in-app updates. Still not here: blame, file history, submodules, worktrees, bisect, multi-repo tabs.

## Install

Grab the installer for your platform from the [Releases](../../releases) page:

- Windows: `T4-Git-UI_<version>_x64-setup.exe` (NSIS, per-user, no admin prompt)
- macOS: `T4-Git-UI_<version>_universal.dmg` (Apple Silicon and Intel; unsigned for now —
  right-click → Open on first launch)
- Linux: `.deb`, `.rpm` or `.AppImage`

Every package has a `.sha256` sidecar next to it.

Requirements: `git` ≥ 2.20 on `PATH`. Windows installs the WebView2 runtime automatically if it is missing.

## Updating

On launch the app asks GitHub once whether there is a newer release; if there is, a badge
appears next to the Settings gear, on the start screen and in the repo toolbar. Clicking it
opens **Settings → Updates**.

That page has a *Check for updates on launch* toggle, a status line naming the version you
are on, a **Check now** button that works with the toggle off, and an **Update to X…** button
beside it — greyed out and reading *Up to date* until a check finds something. Clicking it
downloads with a progress bar, installs, and restarts. Nothing installs without that click.

`.deb` and `.rpm` installs are not updated in place — those belong to the package manager, so
the button reads **Download…** and opens the releases page instead. An AppImage updates in
place, like Windows and macOS.

Downloads are verified against a signing key held outside this repository. A release built
without that key ships no signatures, and the app refuses it.

Anything installed before v0.5.0 predates all of this and has to be replaced by hand once.

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

`npm run tauri build` needs `TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` set — the bundler now generates updater signatures, and a
public key with no private key is an error, not a warning. `npm run dev` and plain `cargo
build` are unaffected.

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
| Diff (staging) | click · `Shift`+click · `Ctrl`+click · `Enter` · `Delete` | Select lines / extend / toggle · stage · discard |
| Grid · Sidebar · Commit panel rows | `Shift+F10` · right-click | Context menu |
| Sidebar | double-click | Checkout |
| Dialogs | `Enter` · `Esc` | Submit · close |

## Status / roadmap

v1 is feature-complete, covered by `cargo test --workspace`, `npm test` and
`cargo clippy --workspace --all-targets -- -D warnings`, and **accepted on Windows**:
the `docs/smoke-test.md` walkthrough was completed end to end on 2026-09-01 apart from the three
steps this machine cannot reach (Resolve in editor ×2, DPI change), and everything it found is
fixed. CI is green on Linux, Windows and macOS; macOS is compiled there only (no rendering check,
no signing / notarization yet) — Linux rendering was walked under WSLg
(`docs/plans/2026-09-05-full-rewalk.md`) — and the installer has not been tried on a
clean Windows machine. Deliberate v1 omissions are listed in
`docs/plans/2026-08-31-git-ui-v1-plan.md` › Known gaps.

Since then: five releases (v0.1.0 through **v0.5.0**), cherry-pick / revert and interactive rebase
from a commit row, and in-app updates — the app checks GitHub for a newer release and installs it on
Windows, macOS and the AppImage, pointing `.deb` and `.rpm` users at their package manager instead.

What is still open — deferred features, verification that needs other machines, the three
suggestions filed as issues, and the longer roadmap (blame, submodules, multi-repo tabs, …) — is
listed in one place: `docs/plans/2026-09-02-next-plan.md`.
