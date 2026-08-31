# t4-git-ui

Cross-platform GitExtensions-style git client. Rust core (`git2` + system `git`), Tauri 2 shell, React UI.

- Plan: [`docs/plans/2026-08-31-git-ui-v1-plan.md`](docs/plans/2026-08-31-git-ui-v1-plan.md)
- Design system: [`docs/design/style-guide.md`](docs/design/style-guide.md) · canvas sources in `docs/design/canvases/`
- Layout: `crates/git-core` (pure Rust, tested) · `src-tauri` (IPC glue) · `src` (frontend)

```sh
npm install
npm run tauri dev        # run (pinned @tauri-apps/cli; `cargo tauri dev` works too if tauri-cli is installed)
cargo test -p git-core   # core tests
npm run build && cargo clippy --workspace
```

Design canvases are generated: `node docs/design/canvases/build/build.mjs` (design system → `docs/design/canvases/*.dc.html`) and `node docs/design/canvases/build/build.mjs screens` (screens → `docs/design/canvases/screens/`). Both also regenerate `src/theme/tokens.css`; `node docs/design/canvases/build/contrast.mjs` audits token contrast.
