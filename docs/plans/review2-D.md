# Review D — `f6eb8b7..main`, dialogs / Input+Menu / RevisionGrid / Sidebar / actions / StartScreen / GitMissingScreen / capabilities / READMEs

17 commits in range touch the listed paths:
`9b02c28 1da3113 e1f69f9 909a22f f6eb328 d057c90 453d3d5 98f337d 889c39c 830d291 bfaa244 dbb06e6 6d852bd fd0e6b8 b8aff4c c2bf5d1 d820b93`

---

### D1 · med · `src/components/ui/Input/Input.tsx:128-135,147-152,195-197` (with `dialogs/OpsDialogs.tsx:349-353`, `dialogs/OpsDialogs.tsx:603-607`, `dialogs/RefDialogs.tsx:91-95`)

**Claim** — `909a22f` says "the active option is always one that can be picked: a disabled one would swallow Enter (and the Alt+↑ that commits it) without even closing the list." It is not always one that can be picked, and the case it misses is the one `453d3d5` created three of in the same range.

**Trace** — `pickable(i, d)` scans from `i` in direction `d` only and **returns `i` unchanged when the scan finds nothing** (`return i;`, line 131). `show()` calls `pickable(max(0, selected), 1)` — forward only. `453d3d5` appends the `"<ref> (no longer exists)"` option **last** and **disabled**, and it is the *selected* value, so `selected === opts.length - 1`. The forward scan from the last index immediately runs off the end and hands back the disabled index. `active` is now a disabled option, and:

- `Enter` / `Space` → `pick(active)` → `if (o?.disabled) return;` — `e.preventDefault()` already fired, so the key is swallowed and the list stays open.
- `ArrowDown` → `move(1)` → `pickable(min(last, last+1)=last, 1)` → `last` (disabled) → `opts[next].disabled` → returns `i`. Stuck.
- `End` (line 197) reproduces the same state from anywhere: `pickable(last, -1)` on a list whose tail is disabled is fine, but on an **all-disabled** list (`options` empty + phantom only — Merge dialog in a one-branch repo after the sole other branch is pruned) both `Home` and `End` land on a disabled option and every commit key is dead.

`ArrowUp` and `Home` still escape, so it is a dead-end rather than a trap — but it is the exact symptom the commit claims to have removed, in the dialogs shipped two commits earlier.

**Failure scenario** — Open Merge, pick `feature/x`, let a background fetch prune `feature/x`. The Select shows `feature/x (no longer exists)`. Click it open, press `Enter` (or `↓`): nothing happens, the list does not even close. Only `↑`, `Home`, `Escape` or the mouse work.

**Suggested fix** — Make `pickable` fall back to the other direction before giving up: `for (let j = i; j >= 0 && j < opts.length; j -= d) if (!opts[j].disabled) return j;` appended before the final `return i;`.

---

### D2 · med · `src/components/ui/Menu/Menu.tsx:39-46`

**Claim** — `f6eb328`: "close it rather than let the page slide out from under it… Its own scrollbar is not that." The guard only exempts scrolls *inside* the menu; every other scroll in the document closes it, including scrolls the app itself performs with no user gesture and no movement of the menu's anchor.

**Trace** — `document.addEventListener("scroll", drift, true)` is a capture listener, so it sees scrolls on every element, bubbling or not. `src/screens/RepoWindow/OutputDock.tsx:144` does `el.scrollTop = el.scrollHeight` in a `useEffect` keyed on `rowCount`, i.e. once per streamed batch of output (`d057c90` made that a batch per 200 lines / 50 ms, so ~20/s on a busy fetch). Target is the dock's log div — not inside the menu — so `drift` fires `onClose()`. The same applies to any browser-initiated scroll: `useMenuDismiss`'s own second effect calls `.focus()` on the first item, and a `Menu` (non-portal, absolutely positioned inside `.wrap`) that overhangs a scrolling ancestor makes the browser scroll that ancestor to reveal it — closing the menu in the same tick it opened.

`Select` has the identical listener (`Input.tsx:110-117`), but there the close-on-any-scroll predates this range; only the `Menu` one is new.

**Failure scenario** — Expand the output dock, start a `fetch --all` on a repo with many remotes, then open the toolbar's Branch menu while output is still streaming. The menu closes by itself within ~50 ms, repeatedly, and looks like a broken button.

**Suggested fix** — Close only when the scrolled node actually moves the menu: `if (e?.target instanceof Node && !(e.target === document || e.target === document.documentElement || (e.target as Element).contains?.(wrap.current))) return;` — or, cheaper, make the dock's autoscroll conditional on being pinned to the bottom so it stops firing during streaming.

---

### D3 · med · `src/screens/GitMissingScreen/GitMissingScreen.tsx:25` + `src/App.tsx:30-40`

**Claim** — `1da3113`: "`--end-of-options` is git 2.24, so the stated floor moves up from 2.20." The floor is *stated* in three places (README.md:39, GitMissingScreen.tsx:25, cli/ops.rs:102 — all consistent at 2.24, grep for `2.20` is clean) but nothing **checks** it, and the raise is a hard break, not a soft one.

**Trace** — `App.probe()` calls `probeGit()`, which runs `git --version` (`crates/git-core/src/lib.rs:24`) and returns the trimmed string; `setGitVersion` stores it. `Phase` is only ever `gitMissing` when the *invocation itself throws*. There is no parse, no comparison, no `MIN_GIT` constant anywhere in the tree. Before this range every builder worked on 2.20; now every single op builder (`fetch/pull/push/merge/rebase/cherry-pick/revert/checkout/reset/branch -f/clone/ls-remote` + `cli/rebase.rs` `read_args`/`run_args`) unconditionally emits `--end-of-options`.

**Failure scenario** — A user on Debian oldstable git 2.20: the app launches normally, the repo opens (status/log go through libgit2), and then *every* button fails with `error: unknown option \`end-of-options'` surfaced as `OpFailure::Other`. The screen that would have told them their git is too old is unreachable because git is present.

**Suggested fix** — Parse the major/minor out of `git_version` in `probe()` and route `< 2.24` to `gitMissing` with the version in the message (the screen's hint already states the floor).

---

### D4 · low · `src/screens/StartScreen/CloneDialog.tsx:47`

**Claim** — `1da3113`: "`gitArgs.ts` and the two hand-written `push … --delete` previews mirror the real argv… a preview that omitted it would lie about what runs." A third hand-written preview was missed.

**Trace** — `gitops::clone` (`crates/git-core/src/cli/ops.rs:410-424`) now emits `clone --progress [--recurse-submodules] [--depth N] --end-of-options <url> <dest>`. `CloneDialog`'s `cmd` is still `["git clone --progress", recurse && "--recurse-submodules", shallow && "--depth 1", url, dest]` — no separator. Every other preview in the range matches its builder exactly (checked pairwise: `fetch/pull/push/merge/rebase/rebase -i/cherry-pick/revert/reset/branch -f/checkout` in `gitArgs.ts` vs `cli/ops.rs`, and both `push … --delete … refs/{heads,tags}/…` strings vs `gitops::delete_remote_branch`).

**Failure scenario** — User copies the clone preview to reproduce a failure in a terminal; the command they run is not the command the app ran.

**Suggested fix** — Insert `"--end-of-options"` before `url.trim() || "<url>"` in the `cmd` array.

---

### D5 · low · `src/screens/RepoWindow/RevisionGrid/GridRow.tsx:57-68`

**Claim** — `b8aff4c`: "Only the left button acts now", with selection handed to `onContextMenu`. That is true for loaded rows; for a not-yet-loaded row it drops selection entirely.

**Trace** — `onContextMenu` opens with `if (!commit) return;` — it bails *before* `select(index)`. A virtualized row whose page has not arrived has `row === undefined`, so `commit` is undefined. Before this commit the `onMouseDown` path ran on any button and called `select(index)` unconditionally; now right-click on a skeleton row does nothing at all (no selection, no menu, and the native context menu is suppressed by `App.tsx`'s document-level `contextmenu` handler only when `keepsNativeMenu` says so).

**Failure scenario** — Scroll fast into an unloaded region and right-click a `—` row: nothing happens, not even a selection, where previously the row at least became selected and the page load would then populate the panel.

**Suggested fix** — Move `select(index)` above the `if (!commit) return;` guard in `onContextMenu`.

---

### D6 · low · `src/components/ui/Input/Input.tsx:197`

**Claim** — `End` moves to the last pickable option.

**Trace** — On an empty `opts` (`MergeDialog` in a repo with exactly one branch renders `options.map()` over an empty array and `!valid && branch` is false, so the listbox has zero children), `pickable(opts.length - 1, -1)` is `pickable(-1, -1)`; the loop condition `j >= 0` is false immediately and it returns `-1`. `setActive(-1)` then renders `aria-activedescendant={`${id}--1`}` on the combobox, pointing at an element that does not exist.

**Failure scenario** — Open Merge in a single-branch repo, click the Select, press `End`: a screen reader is told the active descendant is `:r3:--1`, which is nothing.

**Suggested fix** — `setActive(opts.length ? pickable(opts.length - 1, -1) : 0);` (or clamp `pickable`'s fallback to `Math.max(0, i)`).

---

### D7 · low · `src/screens/RepoWindow/actions.ts:74-80`

**Claim** — `9b02c28`: the confirmation names the entry "by both index and message — the index shifts with every drop".

**Trace** — The `await ask(...)` happens *before* `runOp`, so the whole confirmation window sits outside `opsStore`'s `busy` gate. The row menu's `{...op}` disabled props read that gate, so while a confirm is pending nothing is disabled: the user can reopen the row menu and click Drop again. Two `ask` promises then resolve against two `runOp(index)` calls with the same literal index. The second one drops whatever occupies `stash@{2}` *after* the first drop landed — which, by the commit's own reasoning about shifting indices, is a different stash from the one its prompt named.

**Failure scenario** — Right-click stash@{2} → Drop → (confirm dialog up) → right-click stash@{2} → Drop → accept both. The first drops the intended entry; the second drops the entry that was stash@{3}, while its prompt quoted the message of the one already gone.

**Suggested fix** — Resolve the entry to its oid before confirming, or set the ops busy flag around the `ask()` as well as the run.

---

## Verified clean

- **`Select` scroll-inside guard** (`e1f69f9`) — `list.current?.contains(e.target)` matches the node itself, so the `scrollIntoView({block:"nearest"})` at line 124 (whose target *is* the listbox, since the list is portaled to `document.body` and is its own only scrollable ancestor) no longer closes the list. A page scroll still closes it, which is right: `useDropPosition` places the list once from the field's rect.
- **`onMouseMove` disabled skip** — a disabled option no longer steals `active`; `pick()` already refused it, so no pointer path regressed.
- **Alt+↑ semantics in the rebase dialog** — `ACTIONS = ["pick","reword","edit","squash","fixup","drop"]` and only `squash`/`fixup` are ever disabled, so `pickable(selected, 1)` always reaches `drop`; D1's dead end cannot occur here. The capture guard (`RebaseInteractiveDialog.tsx:114`) is correct: focus stays on the trigger button, so `e.target.closest('[role="combobox"]')` is that button and `aria-expanded` renders `"false"` (not absent) when closed, so the list still claims the chord when no dropdown is open.
- **`valid` after refs return** — `valid`/`startExists` are derived per render from the live store (`options.some(...)`), never stored in state. Refs coming back re-arms the button and removes the phantom option in the same render. No staleness.
- **Disabled *selected* option rendering** — `opts[selected]?.label` puts `"<ref> (no longer exists)"` in the closed trigger, `aria-selected` + `aria-disabled` coexist legally, and no React key collision is possible (the phantom is only rendered when its value is absent from `options`).
- **Enter/submit still reachable with a vanished ref** — `submit()` is guarded by `!valid` in all three dialogs, the primary button is `disabled`, and a form-level Enter still routes to the same guarded `submit`.
- **`CreateBranchDialog` default `start="HEAD"`** — `useStartPoints` always emits `HEAD` as option 0 even when `refs` is null, so `startExists` is never falsely false on mount.
- **Delete remote branch full ref** (`98f337d`) — `refs/heads/<name>` reaches `gitops::delete_remote_branch` → `push <remote> --delete --end-of-options refs/heads/<name>`, and `DeleteRemoteTagDialog` already sent `refs/tags/<name>` through the same command. Preview and argv agree.
- **`--end-of-options` placement** — every builder puts it after its last flag and before its first user positional; `fetch --all` correctly stays on git's side. All commands used (`fetch pull push merge rebase cherry-pick revert checkout reset branch ls-remote clone`) are parse_options builtins, so the separator is accepted, including `push <remote> --end-of-options <refspec>` where it follows a positional (git push permutes rather than stopping at the first non-option).
- **`ref_arg` coverage vs. bypass** — applied to every argv-building command that takes a user ref/remote/refspec/url. `delete_branch`, `rename_branch`, `create_tag`, `delete_tag`, `add_remote`, `set_remote_url` go through libgit2 (`git2_op`), never argv, so they need none; their `git …` preview strings are decorative and never executed.
- **`ref_arg` false positives** — nothing the UI can offer starts with `-`: `git branch`/`git tag` refuse such names, the lists are built from refs, and remotes/urls cannot begin with `-`. `git checkout -` (previous branch) would be refused, but the app never sends it and the Run-command dialog is deliberately exempt.
- **`Menu` Tab close** — `onClose()` without `preventDefault`; React flushes the discrete update inside the dispatch, `useRestoreFocus`'s `lost` check then puts focus on the trigger, and the browser's default Tab runs afterwards from there. Focus is not stranded.
- **`Menu` Home/End** — `ITEMS` excludes `:disabled`, and `MenuItem` renders a real `<button disabled>` inside `DisabledHint`, so disabled entries are skipped by both the jump and the wrap.
- **`DialogHost` `key={dialog.kind}`** — return-focus survives: React runs the deleted subtree's passive cleanups before the replacement's `autoFocus`, so `Dialog`'s "only when closing dropped the focus" restore fires on `<body>` and the new dialog's `autoFocus` then takes it. The only behaviour change is cherry-pick↔revert, which is the point.
- **Right-click selection after `b8aff4c`** — preserved via `onContextMenu` → `select(index)` for loaded rows (see D5 for the skeleton-row gap). Middle-click no longer selects, which is the intent.
- **`StartScreen` busy guard** — `busy` is in the effect's dep array (line 136), so the listener is re-registered and the closure is never stale.
- **git floor consistency** — `2.24` in README.md:39, GitMissingScreen.tsx:25, cli/ops.rs:102, docs/smoke-test-post-v1.md:445. No `2.20` left outside `package-lock.json` node ranges. (The absence of an enforcing check is D3.)
- **`capabilities/default.json`** — `openUrl` (`SettingsDialog.tsx:86`, an https release-page URL) is the only `plugin-opener` call in TS, and `allow-default-urls` covers http/https/mailto/tel. `reveal_item_in_dir`/`open_path` are called from Rust (`commands/repo.rs:358-362`), which is not ACL-gated. `dialog:default` is still present, so `ask()` in the new `stashDrop` and `open()` in StartScreen/CloneDialog/SettingsDialog keep working; `clipboard-manager:allow-write-text` covers `writeText`; `plugin-store` is covered by `store:default`. Nothing else imports a plugin. Correct and minimal.
- **`d820b93` / `bfaa244` dead-code drops** — `get_commit_files`, `ping` and `recentsStore.loaded` have zero remaining references anywhere in `src/` or `src-tauri/src/`.

---

## Test adequacy

| Commit | Verdict | Why |
|---|---|---|
| `9b02c28` stash drop confirm | adequate | Pins all three states — pending (no drop yet, exact prompt text and options), declined, and `ask` rejecting. Fails without the fix at the very first `expect(dropped).not.toHaveBeenCalled()`. |
| `1da3113` `--end-of-options` / `ref_arg` | adequate (strongest in the range) | The Rust integration test actually reproduces the exploit (upstream + one commit ahead, hostile ref via `update-ref`) and asserts no `pwned.txt`; `ref_arg` has its own table test; every builder's argv is pinned. Gap: only `rebase` is exercised end-to-end — the other ten builders are pinned by string equality, so a builder that emits the separator in the *wrong position* would still pass. |
| `e1f69f9` Select scroll guard | adequate | Both directions asserted (own list = stays, document = closes); fails without the guard. Cannot exercise the real `scrollIntoView` trigger under jsdom, which is acceptable. |
| `909a22f` `pickable` | **weak** | The two tests cover `move()` and `onMouseMove` only. Neither `show()` nor `Home`/`End` is tested with a disabled option in the scan direction — which is precisely the path left broken (D1). A test that opened a Select whose *last* option is the disabled selected one would have caught it. |
| `f6eb328` menu drift | adequate for `ContextMenu`, untested for `Menu` | Asserts both the inside-scroll exemption and the document-scroll close. It does not cover the `Menu` variant, nor any scroll made by the app itself rather than by the user (D2). |
| `453d3d5` vanished ref | adequate | All three dialogs; each asserts the label *and* the disabled button, and each would fail before (button enabled, Select rendering blank). Does not assert that the phantom disappears when refs return — cheap to add. |
| `98f337d` delete remote branch | adequate | Pins both the preview string and the exact ipc argument; fails on the old short name. |
| `889c39c` StartScreen busy | adequate | Uses a never-resolving `openRepo` to hold `busy`, then asserts the picker was not opened. Fails without the guard. |
| `dbb06e6` Checkout combobox | adequate | `getByRole("combobox")` alone fails pre-fix (the field was a textbox); also pins `aria-controls`, `aria-expanded` and that ↓ moves `aria-activedescendant`. |
| `6d852bd` Tab / Home / End | adequate on Tab, **weak** on Home/End | The two-item harness makes `End` indistinguishable from `ArrowDown` and `Home` from `ArrowUp`. It still fails pre-fix (Home/End were no-ops), but it does not pin "jump to the end" — a three-item list would. |
| `fd0e6b8` DialogHost key | adequate | Toggles the shared `PickDialog` checkbox and asserts it resets across the kind switch; fails without the `key`. Does not cover return-focus across the remount. |
| `b8aff4c` non-left mousedown | **weak** | Fails pre-fix (the ctrl+button-2 mousedown used to set `compare`), so not vacuous — but it never fires `contextMenu`, so the behaviour most at risk from the change (right-click still selects, via the other handler) is unpinned, and the skeleton-row regression (D5) is invisible to it. |
| `d057c90` streamed output bounds | adequate (outside this review's focus) | Its in-scope footprint is one line in `CloneDialog` (`event.lines.at(-1)`); the batching itself is covered in `opsStore.test.ts` / `runner.rs`. |
| `c2bf5d1` capabilities | none — acceptable | An ACL manifest; verified by grep instead (see Verified clean). |
| `830d291`, `bfaa244`, `d820b93` | none needed | Docs and dead-code removal; `bfaa244` correctly deletes the now-meaningless assertions rather than leaving them. |
