# Close-out triage — the skips and accepted limits of Phases 0–1

**Parent:** `docs/plans/2026-09-26-close-out-plan.md`. Runs before Phase 1b / 2a.

**Goal:** every skip and accepted limit collected during Phases 0–1 and their review loop has a recorded
decision, and the three that need work are done.

**Status:** decisions taken 2026-09-26 (below); reviewed in a three-pass loop the same day (the last pass
clean). Waits on a go.

---

## Decisions (the user, 2026-09-26)

| # | Item | Decision |
|---|---|---|
| T1 | Settings' version text and the start screen read `package.json`, not the binary, so a local build with a version override shows the wrong version | **Accepted.** Test builds only: the Release workflow's `version` job fails a run whose `package.json` and `Cargo.toml` disagree. Walks must not take a version from the UI text (the Phase 1 plan already says so) |
| T2 | Escape did not close Settings mid-walk (2026-09-24 and 2026-09-26) | **Real bug, moved to Phase 2a with an audit** (decided after the plan's review found the cause) — Step 1 |
| T3 | open-items §B's Windows signing row cites `F:/src/_ pet projects/signing-and-repo-setup.md`, outside the public repo | **Reword now** — Step 2 |
| T4 | Only §I rows carry close-out phase tags | **Accepted.** The open-items header points at the plan; per-row tags would go stale as phases move |
| T5 | After a failed update check the earlier offer stays beside the error | **Kept** — the 2026-09-25 decision (done file §I, F10's decisions) |
| T6 | `x.json` (`{}`) in `%APPDATA%\dev.topher.t4gitui` | **Left.** No app code references it. Older than this session: the 2026-09-21 BD walk already backed it up (its last write, 2026-09-26 04:33, is not its creation). Probably a store-plugin probe from an earlier walk. Harmless; backups carry it |
| T7 | The finished Phase 0 / Phase 1 plans keep their original line numbers, assumptions and hashes | **Accepted.** Records of what was planned; their status lines name the differences |
| T8 | `smoke-launch.ps1` has no proxy option, so each network walk needs a wrapper | **Add `-Proxy`** — Step 3 |
| T9 | `%TEMP%\t4-smoke-wv2-9222` (23 MB) left after walks | **Accepted.** One folder per port, reused by every walk; the test profile's settings and WebView2 caches, nothing of the user's |
| T10 | README says the installer was walked "on a clean Windows 11"; it ran in Windows Sandbox | **Accepted.** Group BF treats the Sandbox image as the clean machine; the record has the details |
| T11 | A leftover `--click` in one `cdp.mjs` call hit the Settings scrim mid-walk | **Accepted.** No effect, recorded in the walk file; the cause was the command, not the app |

## Step 1 — T2, record the bug and move it to Phase 2a

The cause, read from the code during the plan's review: `Dialog` catches Esc in its form's `onKeyDown`
(`Dialog.tsx:97-103`), so it only works while the focus is inside the dialog. **Check now** is
`disabled={checking || installing}` (`SettingsDialog.tsx:232`); disabling the focused button drops the focus to `<body>`.
`Dialog` puts the focus back only when its `busy` prop clears (`Dialog.tsx:88-95`), and Settings passes
`busy={installing}` (`:160`), not `checking`. So after **Check now**, Esc is dead until a click lands inside the
dialog. That is the 2026-09-24 reading exactly (*after Check now had been clicked there*); the opener (badge,
gear, Ctrl+,) plays no part. A mouse or keyboard user meets it as well; no CDP needed.

No hand check needed: the repro is known.
- `open-items.md` §M: a row *Esc is dead in Settings after Check now*, with the cause above and the repro
  (Settings › Check now → Esc → nothing; click inside → Esc works).
- Close-out plan, Phase 2 table: a **2a** row (the user's choice, 2026-09-26), with its fix given: at the root,
  in `Dialog`, not only Settings — while a dialog is open and the focus falls to `<body>`, put it back on the
  dialog's first body field (the rule `Dialog.tsx:88-95` already applies when `busy` clears, generalised; the
  2a plan picks the trigger, since whether Blink dispatches `focusout` for a disabled control is to be checked).
  Plus an audit of every dialog for a control that disables itself during its own action, and a test per case
  found. Sources: `Dialog.tsx:88-103`, `SettingsDialog.tsx:160,232`. Two constraints for the 2a plan (from
  this plan's review): the rule must stay quiet while the dialog unmounts, or it fights the cleanup's return
  of focus to the opener (`Dialog.tsx:77-85`); and when a dialog opens another in the same commit (Commit &
  Push), where the new one's `autoFocus` must win.

## Step 2 — T3, the signing reference

The local doc cannot simply be replaced: the Phase 1b table's *Doc item* numbers (1a–1c, 2a–2e) and "the
doc's verify sequence" are its sections, and the repo settings it covers (the `signing` environment, secrets,
Actions settings) are in no workflow file. So name both, without the local path:
- `open-items.md` §B, Windows code signing: *ports t4-markdown-viewer's setup — its public
  `.github/workflows/release.yml` (`toperux/t4-markdown-viewer`) is the reference implementation, and the
  user's `signing-and-repo-setup.md` (a working copy outside the repo) lists the repo settings and the verify
  steps*. Keep the Certum facts (thumbprint `F06C…8151`, expires 2027-09-22).
- Close-out plan, Phase 1b's first line: the same wording. Its table keeps the doc's section numbers, now
  read as "the working copy's sections"; the Phase 1b plan carries whatever it needs into the repo.

## Step 3 — T8, `smoke-launch.ps1 -Proxy`

- `docs/smoke/fixtures/smoke-launch.ps1`: a `[string]$Proxy` parameter; when set, `$env:HTTPS_PROXY` and
  `$env:HTTP_PROXY` are set to it before `Start-Process`, so the launched app inherits them. Add a usage
  line to the header comment (`-Proxy http://127.0.0.1:8888`).
- `docs/smoke/smoke-cdp.md` *Pulling the network for the app alone* (`:103-108`) and group BG's recipe
  (`smoke-test-post-v1.md:2036`): use `-Proxy` instead of setting the variables by hand.
- Run it as `pwsh -File …`, as the header already shows: the variables then live in that child process only.
  Invoked with `&` from an interactive shell, all four would stay set in that shell afterwards — the two it
  sets today (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`, `WEBVIEW2_USER_DATA_FOLDER`, `:45-46`) and the two
  proxy ones. A leftover `HTTPS_PROXY` would send a later launch through a dead proxy, silently offline. Say
  so in the header, naming all four.
- Verify: launch the local build with `-Proxy http://127.0.0.1:8888` and the proxy running; its log shows
  `CONNECT github.com` — from the launch check if *Check for updates on launch* is on (the store is shared
  with the installed app, so it is whatever the user left), else press Settings › **Check now**. Then close
  the app. (Needs the installed app closed — do it when
  a build is on disk and the app is closed anyway, e.g. Phase 2a's walk.)

## Step 4 — record and commit

- `open-items-done.md`: one entry under §B, *close-out triage 2026-09-26*, pointing at this file for the
  eleven decisions.
- Close-out plan: status line gains *triage done*.
- One commit (`git commit -F -`, quoted heredoc). No push without the user's word.

**Who:** the main session — small edits, all docs except the few lines of `smoke-launch.ps1`.
