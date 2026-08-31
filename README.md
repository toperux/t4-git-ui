# t4-git-ui

Cross-platform GitExtensions-style git client. Rust core (`git2` + system `git`), Tauri 2 shell, React UI.

- Plan: [`docs/plans/2026-08-31-git-ui-v1-plan.md`](docs/plans/2026-08-31-git-ui-v1-plan.md)
- Design system: [`docs/design/style-guide.md`](docs/design/style-guide.md) · canvas sources in `docs/design/canvases/`
- Layout: `crates/git-core` (pure Rust, tested) · `src-tauri` (IPC glue) · `src` (frontend)

```sh
npm install
cargo tauri dev          # run
cargo test -p git-core   # core tests
npm run build && cargo clippy --workspace
```
