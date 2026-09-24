# Update and staging fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Five small fixes from the 2026-09-24 walks and the 2026-09-25 decisions, shipped as v0.10.12.

**Architecture:** Each fix is local to one flow:
1. A staged diff reloads when the index side changes: a new `indexStamp` on `StatusEntry`.
2. The updater's network failures get words a person can act on.
3. A successful pull or push retires the "Rejected — Pull first" toast.
4. A successful update check reaches every window: a backend event for the windows already listening, and a cached answer for any window that opens later.
5. Install asks first when any window holds a typed commit message: windows report their drafts to the backend.

**Tech Stack:** Rust (git2, Tauri 2, tauri-plugin-updater 2.12), React 19 + zustand, Vitest 5, TypeScript 7.

**Spec:** the decisions recorded in this session (2026-09-25), plus the observations in:
- `docs/archive/walks/2026-09-24-group-be-walk.md` §Observations 1
- `docs/archive/walks/2026-09-24-update-walk.md` §Observations 1 and 3
- `docs/plans/open-items.md` §N (stale staged diff) and §I F10

The decisions:
- **Update state:** broadcast. After a successful check, every open window takes the result. Still one network check at launch.
- **F10:** confirm first. *"Installing restarts T4 Git UI. The commit message typed in <repos> will be lost."* Cancel / Install.
- **Update to… after a failed re-check:** keep it. No change; the offer is still true.

## Global Constraints

- **Gates**, all green before each commit, run from `F:/src/_ pet projects/t4-git-ui`. Use uppercase `F:/`: lowercase fails every vitest file.
  - `cargo fmt --all --check`
  - `cargo clippy --workspace --all-targets --locked -- -D warnings`
  - `cargo test --workspace --locked`
  - `npm test -- --run`
  - `npm run build`
- **Bash:** no `cd` in a compound command. Use `git -C`, `npm --prefix` and absolute paths.
- **Commit messages** containing backticks go through a quoted heredoc: `git commit -F - <<'EOF'`. End each with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **No push and no tag** without the user's explicit "push".
- **Code comments** explain *why*, in the style of the surrounding code. No new dependencies.
- **Close the app before `tauri build`**: a running exe fails the link with `os error 5`.

## Review Focus

1. **A draft in a background tab** lives in `tabsStore.saved[id].commit`, not in `useCommitStore`. It must count. Pinned in Task 5's `draftRepos` test.
2. **An untouched prefill is not a draft:** amend from HEAD, `MERGE_MSG`, or a history pick. It must not trigger the confirm. Pinned in Task 5's `hasDraft` test.
3. **Another repository's successful push must not retire this repository's rejection toast:** toasts are per window, and a window has several tabs. Pinned in Task 3's test.
4. **A rejection toast already dismissed by hand, then a successful pull:** must not throw or dismiss anything else. Pinned in Task 3's test (stale id).
5. **A staged deletion has no index blob:** `new_file().id()` is zero, so it must stamp `None`, not `0000…`. Pinned in Task 1's second test.

**Out of scope, on purpose:**
- A `git push` typed in the command bar, and a tag push, don't retire the rejection toast.
- Detaching a tab drops its commit draft. That predates this batch and isn't touched here.

---

### Task 1: Stamp the index side of a status entry (§N)

A file staged whole shows `index: modified, workdir: null`, and its `workdirStamp` is `null`. A tool that rewrites it and runs `git add` again changes neither the letters nor that stamp. So `syncWithStatus`'s `eqDeep(entry, diffEntry)` sees no change, and the staged diff keeps the old blob. The fix is the index blob's oid on the entry: `eqDeep` then sees the change with no frontend logic touched.

**Files:**
- Modify:
  - `crates/git-core/src/status.rs:33-42` (field)
  - `crates/git-core/src/status.rs:216-246` (compute)
  - `crates/git-core/src/cli/ops.rs:1181,1191` (fixture literals)
  - `src/api/types.ts:530-536` (type)
  - `src/README.md:101` (one clause)
- Test:
  - `crates/git-core/tests/status.rs` (append)
  - `crates/git-core/tests/serde.rs:299-312`
  - every TS fixture that spells a `StatusEntry` (mechanical)

**Interfaces:**
- Produces: `StatusEntry.index_stamp: Option<String>`, serialized as `indexStamp: string | null`.

- [ ] **Step 0: Reproduce before fixing.** The BD 11 record (`docs/archive/walks/2026-09-21-group-bd-second-walk.md` Findings 2) says a status read landed *between* the rewrite and the `git add`. Traced through `syncWithStatus`, that sequence should already reload: the in-between read changes the entry, and the read after the add changes it again. Only a rewrite plus `git add` with *no* read in between leaves the entry identical, and that is what this task fixes. So check which case is real first:
  1. Back up `%APPDATA%\dev.topher.t4gitui`, then ask the user to **Quit** the app.
  2. Launch the installed 0.10.11 with `docs/smoke/smoke-launch.ps1 -Installed`, on a scratch repository under `C:\tmp\t4`.
  3. Stage a file whole and select it in the Staged list.
  4. **Case A (no read between):** one shell line, `printf 'v2\n' > f.txt && git add f.txt`. Check whether the body stays stale.
  5. **Case B (read between):** `printf 'v3\n' > f.txt`, wait until the row shows a working-tree change, then `git add f.txt`. Check whether the body stays stale.
  6. Record both results in the task report, then restore the store folder.

  If B is stale too, **stop and report**: a second cause exists, for example the diff reading a cached index, and the `indexStamp` fix covers A only.

- [ ] **Step 1: Write the failing tests.** Append to `crates/git-core/tests/status.rs`:

```rust
/// A file staged whole and re-staged with new content behind the app keeps its
/// letters (`modified` in the index, nothing in the workdir) and has no workdir
/// stamp, so only the index side's stamp can tell the panel its staged diff
/// went stale (open-items §N).
#[test]
fn restaging_new_content_moves_the_index_stamp() {
    let t = TempRepo::new();
    t.commit(&[("f.txt", "v0\n")], "base");
    let stamp = |t: &TempRepo| {
        let s = status(&t.repo).expect("status");
        let e = s.entries.into_iter().find(|e| e.path == "f.txt").expect("f.txt");
        assert_eq!((e.index, e.workdir), (Some(FileStatus::Modified), None));
        e.index_stamp
    };
    t.write("f.txt", "v1\n");
    t.stage(&["f.txt"]);
    let before = stamp(&t);
    t.write("f.txt", "v2\n");
    t.stage(&["f.txt"]);
    let after = stamp(&t);
    assert!(before.is_some() && before != after, "{before:?} {after:?}");
}

/// A staged deletion has no blob on the index side: its oid is zero, and a
/// zero stamp would make every such entry look alike.
#[test]
fn a_staged_deletion_has_no_index_stamp() {
    let t = TempRepo::new();
    t.commit(&[("f.txt", "v0\n")], "base");
    t.remove("f.txt");
    t.stage(&["f.txt"]);
    let s = status(&t.repo).expect("status");
    let e = s.entries.iter().find(|e| e.path == "f.txt").expect("f.txt");
    assert_eq!(e.index, Some(FileStatus::Deleted));
    assert_eq!(e.index_stamp, None);
}
```

If `t.stage` can't stage a removed path, check `crates/git-core/src/test_util.rs:249`. If it uses `index.add_path`, use `t.repo.index().unwrap().remove_path(Path::new("f.txt"))` then `write()` instead, and say so in the report.

- [ ] **Step 2: Run them to see them fail.**
  - Run: `cargo test -p git-core --test status restaging_new_content_moves_the_index_stamp`
  - Expected: a compile error, `no field index_stamp`.

- [ ] **Step 3: Add the field and compute it.** In `status.rs`, after the `workdir_stamp` field:

```rust
    /// The staged blob's oid, `None` when nothing is staged or the index side
    /// has no blob (a staged deletion). The letters stay `modified` when a
    /// file is re-staged with new content, and a file staged whole has no
    /// workdir stamp, so this is what tells the UI its staged diff went stale.
    pub index_stamp: Option<String>,
```

After the `workdir_stamp` binding (just before `entries.push`):

```rust
        let index_stamp = index
            .and(hi.as_ref())
            .map(|d| d.new_file().id())
            .filter(|id| !id.is_zero())
            .map(|id| id.to_string());
```

Add `index_stamp,` to the `StatusEntry { … }` literal. (`FileStatus` is `Copy`, so `index.and(…)` leaves `index` usable in the literal.)

Add `index_stamp: None,` to both literals in `cli/ops.rs:1181` and `:1191`. In `tests/serde.rs`:
- add `index_stamp: Some("abc".into()),` to the literal;
- add `assert_eq!(ws["entries"][0]["indexStamp"], "abc");`.

- [ ] **Step 4: TS type and fixtures.** In `src/api/types.ts`, after `workdirStamp`:

```ts
  /**
   * The staged blob's oid, `null` when nothing is staged (or for a staged deletion). Re-staging new
   * content keeps the letters and, for a file staged whole, there is no `workdirStamp` — this is what
   * makes the entry differ then.
   */
  indexStamp: string | null;
```

Fixtures: write a one-off node script in the scratchpad. In every `src/**/*.test.ts(x)`, it replaces `/workdirStamp: ((?:"[^"]*")|null)( ?\})/g` with `workdirStamp: $1, indexStamp: null$2`. Then run `npm run build` (tsc) and fix any literal it still names by hand, e.g. `StashesDialog.test.tsx:59` spans lines.

In `src/README.md:101`, after `(mtime:size)`, add ` and \`indexStamp\` (the staged blob)` and keep the rest of the sentence.

- [ ] **Step 5: Run the gates.** Expected: all green. The two new Rust tests pass.

- [ ] **Step 6: Commit.**

```bash
git -C "F:/src/_ pet projects/t4-git-ui" add -A crates src
git -C "F:/src/_ pet projects/t4-git-ui" commit -F - <<'EOF'
fix: a staged diff reloads when its file is re-staged behind the app - the entry carries the staged blob's oid (`indexStamp`), so an outside `git add` of new content is a change (open-items §N)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Updater network failures in plain words

The walk showed reqwest's own text:
- *"error sending request for url (…)"* for a failed check;
- *"error decoding response body"* for a cut download, which is misleading.

Only the `Reqwest` variant is a network failure. Everything else keeps its own text (signature, manifest, platform).

**Files:**
- Modify: `src-tauri/src/commands/update.rs:60-73` and `:95-130`
- Test: `src-tauri/src/commands/update.rs` tests module

**Interfaces:**
- Produces: `fn updater_error(e: tauri_plugin_updater::Error, network: &str) -> AppError` (private).

- [ ] **Step 1: Write the failing test.** Add to the tests module:

```rust
    /// Only a network failure is reworded: the rest (a bad signature, a manifest
    /// without this platform) already say what is wrong, in their own words.
    #[test]
    fn only_network_failures_are_reworded() {
        let e = updater_error(tauri_plugin_updater::Error::ReleaseNotFound, "NETWORK").to_string();
        assert!(e.contains("Could not fetch a valid release JSON"), "{e}");
        assert!(!e.contains("NETWORK"), "{e}");
    }
```

A `reqwest::Error` can't be built outside reqwest, so the `Reqwest` arm is covered by the walk (Task 6, through `throttle-proxy.mjs`).

- [ ] **Step 2: Run it to see it fail.**
  - Run: `cargo test -p t4-git-ui only_network_failures_are_reworded`. If the package name differs, check `src-tauri/Cargo.toml`'s `[package] name`.
  - Expected: a compile error, `cannot find function updater_error`.

- [ ] **Step 3: Implement.** Add above `check_for_update`:

```rust
const UNREACHABLE: &str = "couldn't reach GitHub — check the connection";
const INTERRUPTED: &str = "the download was interrupted — try again";

/// reqwest's own words ("error decoding response body" for a cut download)
/// describe the library, not the problem. The raw text stays in brackets:
/// it is what a bug report needs.
fn updater_error(e: tauri_plugin_updater::Error, network: &str) -> AppError {
    match e {
        tauri_plugin_updater::Error::Reqwest(inner) => {
            AppError::Internal(format!("{network} ({inner})"))
        }
        e => AppError::Internal(e.to_string()),
    }
}
```

Use it at the three network points:
- `check_for_update`'s `.check().await.map_err(…)` → `.map_err(|e| updater_error(e, UNREACHABLE))?`
- `install_update`'s re-check → the same, with `UNREACHABLE`
- `install_update`'s `.download(…).await.map_err(…)` → `.map_err(|e| updater_error(e, INTERRUPTED))?`

Leave the `.updater()` and `.install(bytes)` map_errs as they are.

- [ ] **Step 4: Run the gates.** Expected: all green.

- [ ] **Step 5: Commit.**

```bash
git -C "F:/src/_ pet projects/t4-git-ui" add src-tauri/src/commands/update.rs
git -C "F:/src/_ pet projects/t4-git-ui" commit -F - <<'EOF'
fix: an update check or download that loses the network says so - "couldn't reach GitHub" / "the download was interrupted", with reqwest's text in brackets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: A successful pull or push retires the rejection toast

Error toasts never expire, by design (`toastStore.ts:81`). **Rejected: remote has new commits — Pull first** stayed up through a successful Pull and Push in the BE walk.

- Retire it only on success of the ops that answer it: a branch pull and a branch push, for the same repository.
- Not on a fetch: the branch is still behind.
- Not on a tag push.

**Files:**
- Modify:
  - `src/store/opsStore.ts:118-134` (option)
  - `src/store/opsStore.ts:179-192` (record / retire)
  - `src/screens/RepoWindow/dialogs/OpsDialogs.tsx:147` (Push)
  - `src/screens/RepoWindow/dialogs/OpsDialogs.tsx:216-220` (Pull)
- Test: `src/store/opsStore.test.ts`

**Interfaces:**
- Produces: `RunOpOptions.answersRejection?: boolean`.

- [ ] **Step 1: Write the failing test.** Add inside `describe("opsStore", …)`, after the nonFastForward test (line ~208):

```ts
  it("a successful pull or push of the same repository retires the rejection toast; a fetch does not", async () => {
    const rejected = () => Promise.resolve({ ...ok, code: 1, failure: { kind: "nonFastForward" } } as OpResult);
    const titles = () => toasts().map((t) => t.title);
    await runOp("Pushing…", rejected, { answersRejection: true });
    await runOp("Fetching…", () => Promise.resolve(ok), { success: "Fetched" });
    expect(titles()).toContain("Rejected: remote has new commits — Pull first");
    // Another tab's repository answering its own push says nothing about this one.
    useRepoStore.setState({ repo: { ...REPO, id: "other" } });
    await runOp("Pushing…", () => Promise.resolve(ok), { answersRejection: true, success: "Pushed other" });
    expect(titles()).toContain("Rejected: remote has new commits — Pull first");
    useRepoStore.setState({ repo: REPO });
    await runOp("Pulling…", () => Promise.resolve(ok), { answersRejection: true, success: "Pulled" });
    expect(titles()).toEqual(["Fetched", "Pushed other", "Pulled"]);
  });

  it("a rejection toast dismissed by hand leaves nothing for the next success to retire", async () => {
    await runOp("Pushing…", () => Promise.resolve({ ...ok, code: 1, failure: { kind: "nonFastForward" } }), { answersRejection: true });
    useToastStore.getState().dismiss(toasts()[0].id);
    await runOp("Pulling…", () => Promise.resolve(ok), { answersRejection: true, success: "Pulled" });
    expect(toasts().map((t) => t.title)).toEqual(["Pulled"]);
  });
```

- [ ] **Step 2: Run to see it fail.**
  - Run: `npm --prefix "F:/src/_ pet projects/t4-git-ui" test -- --run src/store/opsStore.test.ts`
  - Expected: FAIL. tsc isn't run by vitest, so the unknown option is ignored; the first test fails on the final `toEqual` because the rejection toast is still there.

- [ ] **Step 3: Implement.** In `RunOpOptions`, after `remote`:

```ts
  /**
   * A branch pull or push: its success is the answer to an earlier "Rejected — Pull first", so that
   * toast goes. Error toasts never expire on their own, and this one otherwise outlives its cause.
   */
  answersRejection?: boolean;
```

Above `runOp`:

```ts
/** The "Rejected — Pull first" toast still up, by repository: the next pull or push that succeeds retires it. */
const rejections = new Map<RepoId, number>();
```

In `runOp`, replace line 186:

```ts
      if (!opts.quietFailure || loud) {
        const toast = push({ kind: stopped ? "info" : "error", ...failureToast(failure) });
        if (failure.kind === "nonFastForward") rejections.set(repo.id, toast);
      }
```

In the success branch, before `if (opts.success)`:

```ts
      const rejection = opts.answersRejection ? rejections.get(repo.id) : undefined;
      if (rejection !== undefined) {
        rejections.delete(repo.id);
        // Not `dismiss`: that hands the focus back to the toast's origin, and nothing was clicked.
        useToastStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== rejection) }));
      }
```

In `OpsDialogs.tsx`:
- Push (`:147`): add `answersRejection: true` to its options object.
- Pull (`:216-220`): add `answersRejection: true,` beside `remote`.
- Leave the tag push (`:64`) and fetch alone.

- [ ] **Step 4: Run the gates.** Expected: all green.

- [ ] **Step 5: Commit.**

```bash
git -C "F:/src/_ pet projects/t4-git-ui" add src/store/opsStore.ts src/store/opsStore.test.ts src/screens/RepoWindow/dialogs/OpsDialogs.tsx
git -C "F:/src/_ pet projects/t4-git-ui" commit -F - <<'EOF'
fix: a successful pull or push retires the "Rejected - Pull first" toast of the same repository (smoke BE observation 1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: An update check's answer reaches every window

Only the main window checks at launch (`App.tsx:87`, on purpose: one network call). Any other window shows no badge and no offer until you press Check now in it.

An event alone is not enough. The main window starts its check *before* `restoreTabs()` spawns the other restored windows (`App.tsx:87-91`). A fast answer lands before their listeners exist, and a window opened later (a torn-off tab, a new window) always misses it. So the backend does two things with every successful check's answer:
- **emits it** to every window, for the windows already open;
- **keeps it** in `AppState`, for a window that opens later and asks on startup.

**Files:**
- Modify:
  - `src-tauri/src/state.rs` (field, init, two methods)
  - `src-tauri/src/commands/update.rs:14` (const), `:16-29` (`UpdateCheck`), `:60-73` (keep + emit), plus a new command
  - `src-tauri/src/lib.rs:179-180` (register)
  - `src/api/types.ts` (`UpdateCheck`)
  - `src/api/ipc.ts:161-167` (`lastUpdateCheck`)
  - `src/api/events.ts` (subscriber)
  - `src/store/updateStore.ts` (`learn`)
  - `src/App.tsx:117-130` (wire)
- Test:
  - `src-tauri/src/commands/update.rs` tests
  - `src/store/updateStore.test.ts`

**Interfaces:**
- Consumes: `UpdateInfo` from `src/api/types.ts`.
- Produces:
  - `AppState::set_last_update(&self, info: Option<UpdateInfo>)` and `AppState::last_update(&self) -> UpdateCheck`;
  - Rust `UpdateCheck { checked: bool, info: Option<UpdateInfo> }`, TS `UpdateCheck { checked: boolean; info: UpdateInfo | null }`;
  - command `last_update_check → UpdateCheck` and `ipc.lastUpdateCheck(): Promise<UpdateCheck>`;
  - event `update://checked` with payload `UpdateInfo | null`;
  - `onUpdateChecked(cb: (info: UpdateInfo | null) => void): () => void`;
  - `UpdateStore.learn(info: UpdateInfo | null): void`.

- [ ] **Step 1: Write the failing tests.** In `update.rs`'s tests module:

```rust
    /// Nothing is known until a check comes back; after that, a window that
    /// opens later is told the answer, a "nothing newer" included.
    #[test]
    fn the_last_answer_is_kept_for_windows_that_open_later() {
        let state = AppState::default();
        assert!(!state.last_update().checked);
        state.set_last_update(None);
        let kept = state.last_update();
        assert!(kept.checked && kept.info.is_none());
    }
```

Append to `updateStore.test.ts`:

```ts
describe("updateStore.learn", () => {
  // Another window's check came back: this one shows the same offer without a network call of its own.
  it("takes another window's answer as this window's own", () => {
    useUpdateStore.setState({ error: "couldn't reach GitHub" });
    useUpdateStore.getState().learn(release);
    // Its own failed check is answered now: the stale message would sit beside a live offer.
    expect(useUpdateStore.getState()).toMatchObject({ info: release, checked: true, error: null });
    expect(mocked.checkForUpdate).not.toHaveBeenCalled();
  });

  it("leaves a failed install's message alone while one runs", () => {
    useUpdateStore.setState({ installing: true, error: "the download was interrupted" });
    useUpdateStore.getState().learn(release);
    expect(useUpdateStore.getState().error).toBe("the download was interrupted");
  });
});
```

- [ ] **Step 2: Run them to see them fail.**
  - Run: `cargo test -p t4-git-ui the_last_answer_is_kept`. Expected: a compile error, `no method last_update`.
  - Run: `npm --prefix "F:/src/_ pet projects/t4-git-ui" test -- --run src/store/updateStore.test.ts`. Expected: FAIL, `learn is not a function`.

- [ ] **Step 3: Implement.**

In `update.rs`, beside `PROGRESS_EVENT`:

```rust
/// Every successful check's answer, to every window: only the main window
/// checks at launch, and the others would otherwise offer nothing until
/// Check now is pressed in each.
const CHECKED_EVENT: &str = "update://checked";
```

After `UpdateInfo`:

```rust
/// The last check's answer, for a window that opens after it came back.
/// `checked` is what tells "nothing newer" from "nobody asked yet".
#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateCheck {
    pub checked: bool,
    pub info: Option<UpdateInfo>,
}
```

In `state.rs`, add `use crate::commands::update::{UpdateCheck, UpdateInfo};`, then:
- field, after `drag_target`:

```rust
    /// The last update check's answer: a window that opens after it came back
    /// missed its `update://checked` event.
    last_update: Mutex<UpdateCheck>,
```

- initializer: `last_update: Mutex::new(UpdateCheck::default()),`
- methods, beside `op_running`:

```rust
    pub fn set_last_update(&self, info: Option<UpdateInfo>) {
        *lock(&self.last_update) = UpdateCheck { checked: true, info };
    }

    pub fn last_update(&self) -> UpdateCheck {
        lock(&self.last_update).clone()
    }
```

In `update.rs`:
- add `state: State<'_, AppState>` to `check_for_update`'s parameters;
- replace its `Ok(found.map(…))` tail:

```rust
    let info = found.map(|update| UpdateInfo {
        version: update.version,
        installable: installable(),
        release_url: release_url(),
    });
    state.set_last_update(info.clone());
    let _ = app.emit(CHECKED_EVENT, &info);
    Ok(info)
```

- after `check_for_update`:

```rust
/// The last check's answer, for a window that opened after it came back.
#[tauri::command]
pub fn last_update_check(state: State<'_, AppState>) -> UpdateCheck {
    state.last_update()
}
```

In `lib.rs`, register `commands::update::last_update_check,` after `check_for_update`.

In `types.ts`, after `UpdateInfo`:

```ts
/** The last update check's answer; `checked` tells "nothing newer" from "nobody asked yet". */
export interface UpdateCheck {
  checked: boolean;
  info: UpdateInfo | null;
}
```

In `ipc.ts`, after `checkForUpdate`:

```ts
/** The last check's answer, whichever window asked — for a window that opened after it came back. */
export const lastUpdateCheck = () => call<UpdateCheck>("last_update_check");
```

In `events.ts`, add `UpdateInfo` to the type import, then:

```ts
/**
 * A check came back in some window (`update://checked`), the asking one included. Only the main
 * window checks at launch, so this is how the others learn of a release.
 */
export const onUpdateChecked = (cb: (info: UpdateInfo | null) => void) => subscribe<UpdateInfo | null>("update://checked", cb);
```

In `updateStore.ts`:
- in the interface after `install(): Promise<void>;`:

```ts
  /** Another window's check came back (`update://checked`): its answer is this window's too. */
  learn(info: UpdateInfo | null): void;
```

- in the store after `install`:

```ts
  // The check this window failed is answered now, so its message goes, unless an install is running:
  // that message is about the download, not the check.
  learn: (info) => set((s) => (s.installing ? { info, checked: true } : { info, checked: true, error: null })),
```

In `App.tsx`:
- add `onUpdateChecked` to the events import and `lastUpdateCheck` to the ipc import;
- in the listener array after `onSettingsChanged(…)`:

```ts
      // A check in any window answers for all of them: only the main window checks at launch.
      onUpdateChecked((info) => useUpdateStore.getState().learn(info)),
```

- in the same effect, right after the `unlisten` array is built:

```ts
    // A window restored at launch, or opened later, may have missed the event: ask for the last answer.
    // ponytail: an answer landing between this reply and the listener attaching is missed; Check now covers it.
    void lastUpdateCheck()
      .then((c) => {
        if (c.checked) useUpdateStore.getState().learn(c.info);
      })
      .catch(() => undefined);
```

- [ ] **Step 4: Run the gates.** Expected: all green.

- [ ] **Step 5: Commit.**

```bash
git -C "F:/src/_ pet projects/t4-git-ui" add src-tauri/src src/api src/store/updateStore.ts src/store/updateStore.test.ts src/App.tsx
git -C "F:/src/_ pet projects/t4-git-ui" commit -F - <<'EOF'
fix: an update check's answer reaches every window - the backend emits `update://checked` and keeps the answer for windows that open later, so a second window offers the release without its own Check now

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Install asks first when a commit message is typed anywhere (§I F10)

Install restarts the app. A typed, uncommitted message lives only in its window's memory: the active tab's `useCommitStore`, or a background tab's `tabsStore.saved[id].commit`. Each window reports the names of the repositories it holds a draft for, whenever that list changes. `install()` reads every window's list and confirms.

**Files:**
- Modify:
  - `src-tauri/src/state.rs` (field, init, two methods)
  - `src-tauri/src/lib.rs:122-132` (cleanup on destroy)
  - `src-tauri/src/lib.rs:179-180` (register)
  - `src-tauri/src/commands/update.rs` (two commands)
  - `src/api/ipc.ts:161-167`
  - `src/store/commitStore.ts` (`hasDraft`)
  - `src/store/tabsStore.ts` (`draftRepos`)
  - `src/App.tsx:150-159` (reporter)
  - `src/store/updateStore.ts:50` (confirm)
- Test:
  - `src-tauri/src/commands/update.rs` tests
  - `src/store/commitStore.test.ts`
  - `src/store/tabsStore.test.ts`
  - `src/store/updateStore.test.ts`
  - `src/screens/SettingsDialog/SettingsDialog.test.tsx:6` (mock gains `ask`)

**Interfaces:**
- Produces:
  - `AppState::set_drafts(&self, window: &str, repos: Vec<String>)`
  - `AppState::drafts(&self) -> Vec<String>` (sorted)
  - commands `set_commit_drafts { repos: string[] }` and `commit_drafts → string[]`
  - `ipc.setCommitDrafts(repos: string[]): Promise<void>` and `ipc.commitDrafts(): Promise<string[]>`
  - `hasDraft(c: Pick<CommitStore, "summary" | "body" | "prefill">): boolean` (exported from `commitStore.ts`)
  - `draftRepos(): string[]` (exported from `tabsStore.ts`)

- [ ] **Step 1: Write the failing Rust test** in `update.rs`'s tests module:

```rust
    /// Each window's report replaces its last one, an empty report clears it,
    /// and Install sees them all.
    #[test]
    fn drafts_are_kept_per_window() {
        let state = AppState::default();
        state.set_drafts("main", vec!["web".into(), "api".into()]);
        state.set_drafts("w1", vec!["docs".into()]);
        assert_eq!(state.drafts(), ["api", "docs", "web"]);
        state.set_drafts("main", Vec::new());
        assert_eq!(state.drafts(), ["docs"]);
    }
```

- [ ] **Step 2: Write the failing TS tests.**

`commitStore.test.ts`, a new `describe`. Import `hasDraft` beside the existing store import:

```ts
describe("hasDraft", () => {
  const c = (summary: string, body = "", prefill: { summary: string; body: string; from: "amend" | "pending" | "history" } | null = null) => ({ summary, body, prefill });
  it("a typed message is one", () => {
    expect(hasDraft(c("wip"))).toBe(true);
    expect(hasDraft(c("", "notes"))).toBe(true);
  });
  // An untouched prefill came from HEAD, MERGE_MSG or history: all still there after a restart.
  it("an empty editor or an untouched prefill is not", () => {
    expect(hasDraft(c("  ", "\n"))).toBe(false);
    expect(hasDraft(c("Fix it", "body", { summary: "Fix it", body: "body", from: "amend" }))).toBe(false);
    expect(hasDraft(c("Fix it!", "body", { summary: "Fix it", body: "body", from: "amend" }))).toBe(true);
  });
});
```

`tabsStore.test.ts`, a new `describe`. Import `draftRepos`, and `useCommitStore` if not already imported. Reuse the file's existing `beforeEach` resets:

```ts
describe("draftRepos", () => {
  it("names the active tab's draft and every background tab's", () => {
    useTabsStore.setState({
      tabs: [
        { id: "a", path: "/a", name: "alpha", stale: false },
        { id: "b", path: "/b", name: "beta", stale: false },
        { id: "c", path: "/c", name: "gamma", stale: false },
      ],
      active: "a",
      saved: {
        b: { commit: { summary: "wip", body: "", prefill: null } } as unknown as Snapshot,
        c: { commit: { summary: "", body: "", prefill: null } } as unknown as Snapshot,
      },
    });
    useCommitStore.setState({ summary: "", body: "", prefill: null });
    expect(draftRepos()).toEqual(["beta"]);
    useCommitStore.setState({ summary: "typed" });
    expect(draftRepos()).toEqual(["alpha", "beta"]);
  });
});
```

(`Snapshot` is exported from `tabsStore.ts`; import it as a type.)

`SettingsDialog.test.tsx:6`: its dialog-plugin mock is `{ open: vi.fn() }`, and `updateStore` now imports `ask` from that module. Vitest only throws on *use* of a missing mock export, and no Settings test installs today. Make it `{ open: vi.fn(), ask: vi.fn() }` anyway, so the first one that does isn't a puzzle.

`updateStore.test.ts`:
- Add `commitDrafts: vi.fn()` to the ipc mock.
- Add `const ask = vi.hoisted(() => vi.fn());` and `vi.mock("@tauri-apps/plugin-dialog", () => ({ ask }));` above the imports.
- Add `"commitDrafts"` to the `mocked` record's key union.
- In `beforeEach`: `mocked.commitDrafts.mockResolvedValue([]); ask.mockResolvedValue(true);`.
- In the existing test "listens for progress before the install starts": the install now awaits `commitDrafts` first, so replace its three synchronous expectations after `const done = …install();` (`onProgress` called once, `installUpdate` not called, `await flush()`) with:

```ts
    await flush();
    // The subscription is made before `install_update` is invoked, so no early percentage is lost.
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress.mock.invocationCallOrder[0]).toBeLessThan(mocked.installUpdate.mock.invocationCallOrder[0]);
```

  Keep the rest of that test.
- New tests inside `describe("updateStore.install", …)`:

```ts
  it("asks first when a commit message is typed in any window, and a No installs nothing", async () => {
    useUpdateStore.setState({ info: release });
    mocked.commitDrafts.mockResolvedValue(["api", "web"]);
    ask.mockResolvedValue(false);
    await useUpdateStore.getState().install();
    expect(ask.mock.calls[0][0]).toContain("api, web");
    expect(mocked.installUpdate).not.toHaveBeenCalled();
    expect(useUpdateStore.getState()).toMatchObject({ installing: false, error: null });
  });

  it("a Yes installs; no draft installs without asking", async () => {
    useUpdateStore.setState({ info: release });
    mocked.installUpdate.mockResolvedValue(undefined);
    mocked.commitDrafts.mockResolvedValueOnce(["api"]);
    await useUpdateStore.getState().install();
    expect(mocked.installUpdate).toHaveBeenCalledTimes(1);
    await useUpdateStore.getState().install();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(mocked.installUpdate).toHaveBeenCalledTimes(2);
  });
```

- [ ] **Step 3: Run them to see them fail.**
  - Run: `cargo test -p t4-git-ui drafts_are_kept_per_window`. Expected: a compile error, `no method set_drafts`.
  - Run: `npm --prefix "F:/src/_ pet projects/t4-git-ui" test -- --run src/store/commitStore.test.ts src/store/tabsStore.test.ts src/store/updateStore.test.ts`. Expected: FAIL, since `hasDraft`, `draftRepos` and `commitDrafts` are missing.

- [ ] **Step 4: Backend.** In `state.rs`:
- field, after `drag_target`:

```rust
    /// The repositories each window holds a typed, uncommitted commit message
    /// for, by window label — what an update's restart would throw away.
    drafts: Mutex<HashMap<String, Vec<String>>>,
```

- initializer: `drafts: Mutex::new(HashMap::new()),`
- methods, beside `op_running`:

```rust
    /// Replaces `window`'s report; an empty one forgets the window.
    pub fn set_drafts(&self, window: &str, repos: Vec<String>) {
        let mut drafts = lock(&self.drafts);
        if repos.is_empty() {
            drafts.remove(window);
        } else {
            drafts.insert(window.to_string(), repos);
        }
    }

    /// Every window's, sorted — for Install's confirmation.
    pub fn drafts(&self) -> Vec<String> {
        let mut all: Vec<String> = lock(&self.drafts).values().flatten().cloned().collect();
        all.sort();
        all
    }
```

In `update.rs`, add `Window` to the `tauri` import, and after `install_update`:

```rust
/// A window reports the repositories it holds a typed commit message for,
/// whenever that list changes, so Install can ask before the restart.
#[tauri::command]
pub fn set_commit_drafts(window: Window, state: State<'_, AppState>, repos: Vec<String>) {
    state.set_drafts(window.label(), repos);
}

/// Every window's reported drafts.
#[tauri::command]
pub fn commit_drafts(state: State<'_, AppState>) -> Vec<String> {
    state.drafts()
}
```

In `lib.rs`:
- register `commands::update::set_commit_drafts, commands::update::commit_drafts,` after `install_update`;
- in `on_window_destroyed`, after `state.pending().remove(label);`, add:

```rust
    // Its drafts went with it: Install must not warn about a message nobody can lose any more.
    state.set_drafts(label, Vec::new());
```

- [ ] **Step 5: Frontend.** In `ipc.ts`, after `installUpdate`:

```ts
/** Reports the repositories this window holds a typed commit message for; Install asks before a restart loses one. */
export const setCommitDrafts = (repos: string[]) => call<void>("set_commit_drafts", { repos });

/** Every window's reported drafts, sorted. */
export const commitDrafts = () => call<string[]>("commit_drafts");
```

In `commitStore.ts`, above `SNAPSHOT_KEYS`:

```ts
/**
 * A message someone typed: not blank, and not a prefill left as it was. HEAD's message, `MERGE_MSG`
 * and a history entry all survive a restart; only typing is lost.
 */
export const hasDraft = (c: Pick<CommitStore, "summary" | "body" | "prefill">) =>
  (c.summary.trim() !== "" || c.body.trim() !== "") && !(c.prefill && c.summary === c.prefill.summary && c.body === c.prefill.body);
```

In `tabsStore.ts`:
- extend the commitStore import with `hasDraft, useCommitStore`;
- at the end of the file:

```ts
/** This window's repositories with a typed commit message: the active tab's editor, and every background tab's snapshot. */
export function draftRepos(): string[] {
  const { tabs, active, saved } = useTabsStore.getState();
  return tabs.filter((t) => (t.id === active ? hasDraft(useCommitStore.getState()) : !!saved[t.id] && hasDraft(saved[t.id].commit))).map((t) => t.name);
}
```

In `App.tsx`:
- add `setCommitDrafts` to the ipc import;
- add `draftRepos` to the tabsStore import;
- add `useCommitStore` to the store imports;
- in the effect that subscribes to `useTabsStore` (`:152`), after that subscription:

```ts
    // The backend keeps each window's drafts for Install's confirmation. Sent only when the list
    // changes: the editor's store changes on every keystroke and every diff load.
    let reported = "";
    const reportDrafts = () => {
      const repos = draftRepos();
      const key = repos.join("\n");
      if (key === reported) return;
      reported = key;
      void setCommitDrafts(repos).catch(() => undefined);
    };
    const unsubscribeDrafts = [useCommitStore.subscribe(reportDrafts), useTabsStore.subscribe(reportDrafts)];
```

In that effect's cleanup, add `for (const u of unsubscribeDrafts) u();`. Read the effect's existing return to place it.

In `updateStore.ts`:
- add `import { ask } from "@tauri-apps/plugin-dialog";` and `import { APP_NAME } from "../lib/app";`;
- at the top of `install()`, before `set({ installing: true, … })`:

```ts
    // The restart takes every window with it, and a typed commit message lives only in its window.
    // A failed query installs anyway: an update must not be blocked by bookkeeping.
    const drafts = await ipc.commitDrafts().catch(() => [] as string[]);
    if (drafts.length > 0) {
      const ok = await ask(`Installing restarts ${APP_NAME}. The commit message typed in ${drafts.join(", ")} will be lost.`, {
        title: "Install the update",
        kind: "warning",
        cancelLabel: "Cancel",
        okLabel: "Install",
      }).catch(() => false);
      if (!ok) return;
    }
```

- [ ] **Step 6: Run the gates.** Expected: all green.

- [ ] **Step 7: Commit.**

```bash
git -C "F:/src/_ pet projects/t4-git-ui" add -A src src-tauri
git -C "F:/src/_ pet projects/t4-git-ui" commit -F - <<'EOF'
fix: Install asks first when a commit message is typed in any window - each window reports its drafts, and the restart would lose them (open-items §I F10)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Walk, record, squash

**Files:**
- Modify:
  - `docs/smoke/smoke-test-post-v1.md` (new group BG)
  - `docs/plans/open-items.md` (drop §N stale-diff and §I F10)
  - `docs/plans/open-items-done.md` (add them, plus the three decisions)
- Create: `docs/archive/walks/2026-09-25-group-bg-walk.md`

- [ ] **Step 1: Build.**
  - Back up `%APPDATA%\dev.topher.t4gitui` first (see `docs/smoke/smoke-cdp.md`).
  - Ask the user to **Quit** the installed app.
  - Build as a lower version, so the published 0.10.11 is offered: `npm --prefix "F:/src/_ pet projects/t4-git-ui" run tauri build -- --no-bundle --config "{\"version\":\"0.10.10\"}"`.
  - Launch it with `docs/smoke/smoke-launch.ps1`.

- [ ] **Step 2: Write group BG** in `smoke-test-post-v1.md`, one box per fix:
  - **BG 1:** stage a file whole and show it in the Staged list. Then, outside the app, rewrite it and `git add` it, both ways from Task 1 Step 0:
    - in one shell line;
    - with the row allowed to show the working-tree change in between.

    Each time, the staged diff shows the new content without reselecting the row.
  - **BG 2:** with the network cut through `throttle-proxy.mjs`, *Check now* reads *couldn't reach GitHub — check the connection (…)*. A download cut mid-way reads *the download was interrupted — try again (…)*.
  - **BG 3:** a rejected push (`dogfood-fixture.sh diverge`) shows the toast. A successful Pull, or Push, removes it. A fetch leaves it.
  - **BG 4:** relaunch with two windows restored and the launch check on. The secondary window shows the badge without its own check, whichever came first: the answer or its listener. Then tear a tab off into a new window: it shows the badge too, from the kept answer.
  - **BG 5:** type a summary in a background tab of window 2, then press Install in window 1. The confirm names that repo; Cancel installs nothing. Clear the summary and press Install again: no confirm.
    - Run the proxy **throttled** first (`node docs/smoke/fixtures/throttle-proxy.mjs <port> 200000`, 200 KB/s), and kill it within the first few percent.
    - A late kill would let the 0.10.11 setup install over the user's installed 0.10.11 and restart it. Same version, so harmless, but not what the walk intends.

- [ ] **Step 3: Walk BG 1–5 over CDP** (`docs/smoke/cdp.mjs`, `CDP_TITLE` to pick a window). Tick each box, and write the walk record.
- [ ] **Step 4: Restore the store folder** byte-exact from the backup, then tell the user the installed app can be started again.
- [ ] **Step 5: open-items.**
  - Move §N's stale-staged-diff bullet and §I F10 into `open-items-done.md` under the same letters, each with its commit.
  - Record the three decisions (broadcast; confirm; keep the offer after a failed re-check) in the done file's §I.
- [ ] **Step 6: Commit the docs**, then squash into four commits:
  - the staging fix;
  - the three update fixes (Tasks 2, 4, 5);
  - the toast fix;
  - the docs.

  Use a non-interactive rebase: `git reset --soft` onto the base and recommit in order, or `GIT_SEQUENCE_EDITOR`. Keep a `backup/pre-squash-2026-09-25` branch until the user says otherwise.
- [ ] **Step 7: Stop.** Report the result, and wait for "push". Then do the version bump to 0.10.12 and the release, following `.claude/skills/release/SKILL.md`.
