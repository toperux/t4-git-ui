# Plan: say why an ssh or https login failed (fail fast with a clear message)

_Written 2026-09-27, revised through review round 2. Source: the open-items row "ssh prompts the app can't answer well",
measured the same day (Part A of `docs/archive/plans/2026-09-27-ssh-prompts-check-and-cli-pin-plan.md`). The user chose
"fail fast with a clear message"._

**Executed 2026-10-06** on the owner's go, on branch `ssh-fail-fast`: walked on Windows and Linux; review passes 1–5
found no blockers; triage done. Ships in the next release.

## Refresh (2026-10-06, against `main` `c9e2dc4`)

Nothing here is implemented yet. The design and the decisions hold. Every "What is known" fact still reads true in the
code, the clone one included (reasoned from `clone_repo` → `run.out.check()` → `cliDetail`'s first stderr line, not
re-measured). N9's `resolve_dest` and `cb886f4`'s clippy fix don't touch the error path. The callers are still
exhaustive matches, so the compiler and `tsc` still find them. Line numbers below have drifted; the current ones:

| Cited | Now |
|---|---|
| `classify_failure` `:645-697`, its auth arm `:660-661` | starts `cli/ops.rs:654`, the auth arm `:669-670` |
| `OpFailure` `:77`; `AuthFailed` | `cli/ops.rs:76-77`; still a unit variant, `:96` |
| `auth_patterns` test `:1284-1292`; `failure_serde_shape` `:1350` | `cli/ops.rs:1332`; `:1419` |
| `opsStore.ts:160`, `:201`, `:241` | `:178-179`, `:219`, `:259` |
| `types.ts:613` | `:627` (`AppErrorKind` at `:8` still has no `authFailed`) |
| `src-tauri/src/commands/ops.rs:838` (`failure_message`) | `:834-844`, the arm at `:839` |
| `clone_repo` `:1254-1256` | `:1210-1261`, `run.out.check()` at `:1256-1258` |
| `toastStore.ts:104-107` | `:104-106` |
| `GitError::kind()` `error.rs:40-50` | `crates/git-core/src/error.rs:40-54` |
| the `process_group(0)` comment `runner.rs:486-487` | `process_group(0)` at `cli/runner.rs:227`, its comment `:499-500` |

## What is known

- **Measured:** with no askpass (this machine), every case already fails fast, in 0.5–1.4 s, exit 128. What a user
  sees:
  - a passphrase key with no agent: `Permission denied (publickey)`;
  - an unknown host key: `Host key verification failed`;
  - https that needs auth: `could not read Username … terminal prompts disabled`.
- **The app already classifies them.**
  - `AUTH_PATTERNS` (`crates/git-core/src/cli/ops.rs:618`) holds all of them, plus `Authentication failed`,
    lowercase `authentication failed`, and `could not read Password`.
  - `classify_failure` (`:645-697`) returns one `OpFailure::AuthFailed` (`:660-661`).
  - The `auth_patterns` test (`:1284-1292`) covers 3 of the 7 patterns.
  - `OpFailure` is `#[serde(tag = "kind", rename_all = "camelCase")]` (`:77`). It goes over IPC only and is never
    persisted.
- **The toast gets it wrong for most causes.** `src/store/opsStore.ts:160` turns every `authFailed` into
  "Authentication failed — check your credential helper". That's right for https, and wrong for an unknown host key
  or an ssh key problem. The TS type is `{ kind: "authFailed" }` (`src/api/types.ts:613`), and `src/README.md:542`
  describes it the same way.
- **Clone never reaches `classify_failure`.**
  - `clone_repo` (`src-tauri/src/commands/ops.rs:1254-1256`) turns a failed clone into a `cli` error through
    `run.out.check()`.
  - `CloneDialog.tsx:83` shows it through `cliDetail`, which returns the **first** stderr line
    (`toastStore.ts:104-107`).
  - For any clone that reaches the remote, that line is `Cloning into 'x'...`. So **every such failed clone today
    shows "Cloning into 'x'..." as its error**, auth or not (reproduced offline with a stub `GIT_SSH_COMMAND`). A
    failure before the transport (e.g. a missing local path) prints `fatal:` first.
  - Clone is where a first login failure is most likely.
- **Where it would hang:**
  - **An askpass exists but nobody can see it:** Xvfb, i.e. the smoke harness.
  - **Any terminal launch** (a dev run, the AppImage or the installed binary started from a shell): ssh opens the
    terminal from a background process group and is stopped.
  - **On a desktop with an askpass installed or exported** (KDE, `ssh-askpass-gnome`), the dialog works, and users
    may rely on it.

## Design

### 1. Name the cause (the main change)

Split `AuthFailed` by cause, as a struct variant, so every `kind === "authFailed"` check keeps working:

```rust
AuthFailed { cause: AuthCause }
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]   // OpFailure's rename_all renames variants only
enum AuthCause { HostKeyChanged, HostKey, SshKey, NoCredentials, Rejected }
```

Wire shape: `{ kind: "authFailed", cause: "hostKeyChanged" | "hostKey" | "sshKey" | "noCredentials" | "rejected" }`.

| Pattern (stderr) | Cause | Toast title | Detail (what to do) |
|---|---|---|---|
| `REMOTE HOST IDENTIFICATION HAS CHANGED` | `HostKeyChanged` | "Host key changed — possible attack or server rebuild" | "Verify the new key with the server's admin before updating `known_hosts`" |
| `Host key verification failed` | `HostKey` | "Host key not trusted" | "Connect once from a terminal (e.g. `ssh -T git@<host>`) and follow what ssh says" |
| `Permission denied (publickey` | `SshKey` | "SSH key not accepted" | "Load your key into the agent (`ssh-add`), or add its public key to your account on the server" |
| `could not read Username` / `could not read Password` / `terminal prompts disabled` | `NoCredentials` | "Credentials needed" | "Sign in once from a terminal (e.g. `git fetch`) so your credential helper stores them, or use Git Credential Manager" |
| `Authentication failed` / `authentication failed` | `Rejected` | "Authentication failed — credentials were rejected" | "Update the stored credentials" |

- **The `HostKey` wording is neutral on purpose.** A *changed* key ("REMOTE HOST IDENTIFICATION HAS CHANGED", which
  can mean an attack) ends in the same line, so the detail must not say "accept". Whether a changed key gets its own
  cause is a decision below.
- **Why `NoCredentials` doesn't say "set up libsecret or osxkeychain":** those only store credentials. git can't
  prompt (`GIT_TERMINAL_PROMPT=0`), so a first sign-in still fails unless it happens in a terminal, or through GCM,
  which prompts.
- **Order:** one pattern → cause table, checked in table order: `HostKeyChanged` first (its banner comes with "Host
  key verification failed."), then `HostKey`. Order only matters when stderr
  mixes several remotes' failures (`fetch --all`, submodules); for one remote, a host-key failure never reaches
  authentication.
- **The wording** is a draft for the user to approve.
- **The ssh host isn't named:** the messages don't contain it (decision below).
- **Unmatched login failures still fall to `Other`**, which shows `Could not read from remote repository.`. That
  covers another method order (`Permission denied (password)`) and plink/TortoisePlink ("No supported
  authentication methods"). Widening the pattern to `Permission denied (` would catch the first (decision below).
  Git for Windows' ssh and Windows OpenSSH print the upstream strings, so they match.

### 2. Clone (decision)

- **Recommended:** in `clone_repo`, classify a failed clone with `classify_failure`. That fixes both the auth text
  and the "Cloning into 'x'..." line.
- **How the result reaches the dialog** (a sub-decision). `clone_repo` returns `Result<RepoSummary, AppError>`, and
  `AppError` is only `{ kind, message }` (`src/api/types.ts:48-51`, `src-tauri/src/error.rs:6`). The toast wording
  lives in TS (`failureToast`). Options:
  - **(a) recommended:** a new `AppError` kind `authFailed`, with the cause as `message`. `CloneDialog` maps it
    through the same cause → text code as `failureToast`. Any other failure returns a `cli` error whose text is
    `classify_failure`'s `Other` message (the last `fatal:` line), not the first stderr line.
  - **(b):** only replace the `cli` text with `classify_failure`'s message. That fixes "Cloning into", but an auth
    failure shows git's raw line, not the cause text.
  - **(c):** `clone_repo` returns an outcome carrying `OpFailure`, like the other ops. That's the most consistent,
    but a bigger change to the command's signature.
- **Alternative:** keep clone out of scope, and file the "Cloning into" bug as its own open-items row. The by-hand
  test then uses a fetch.

### 3. `BatchMode`: where, if anywhere (decision; A reverses the recorded choice)

The user's choice of "fail fast" was first framed with `BatchMode=yes` (the open-items row listed it as the means).
The measurements change the picture: without an askpass, ssh already fails fast. `BatchMode` would only change setups
that have one, where it would **remove a working dialog**. Options:

- **A. No runner change (recommended). This reverses the recorded `BatchMode=yes`.**
  - The messages carry the fix.
  - The harness guard is optional (decision below): `SSH_ASKPASS_REQUIRE=never` plus `GIT_ASKPASS=` (empty) on the
    `tauri-driver` line.
    - `SSH_ASKPASS_REQUIRE=never` turns off ssh's askpass.
    - An empty `GIT_ASKPASS` tells git "no askpass", which skips `core.askPass` and `SSH_ASKPASS` for https too.
    - It's a no-op on this machine today, since no askpass is installed.
  - Desktop users keep their askpass dialog.
- **B. `SSH_ASKPASS_REQUIRE=never` in the runner's environment:** askpass users lose the ssh dialog, and it isn't
  "fail fast everywhere":
  - a terminal launch still stops on the terminal (only §4 fixes that);
  - https askpass is untouched.
  - Not `GIT_SSH_COMMAND`: that overrides a user's `core.sshCommand`.
  - It needs OpenSSH ≥ 8.4; older macOS ssh ignores it.
- **C. B, but only when no askpass is configured:** with no askpass it already fails fast, so this equals A in
  practice. Not worth the code.

### 4. The terminal-launch hang (decision)

On Unix, run git in its own session instead of just its own process group: **replace** `cmd.process_group(0)`
(`runner.rs:258`) with a `pre_exec` that calls `libc::setsid()`.
- **Don't keep both.** std runs `setpgid` before the `pre_exec` closures, so the child would already lead a group,
  `setsid()` would fail with EPERM, and every git spawn would fail.
- **What it fixes:** any terminal launch (dev, the AppImage or the installed binary from a shell). ssh can't open the
  launching terminal, so it goes to the askpass or fails fast instead of being stopped.
- **Cancel still works.** The kill is `libc::kill(-pgid, SIGKILL)` (`runner.rs:489`) with pgid = `child.id()`, and a
  session leader's group id is its pid.
- **Also:**
  - update the comment at `runner.rs:486-487`;
  - `unsafe` is already used there with a SAFETY comment, and no lint forbids it;
  - `setsid` is async-signal-safe;
  - any `pre_exec` gives up std's posix_spawn fast path (fork+exec instead), which is negligible here;
  - SIGHUP behaviour is unchanged (a background group gets none today).

## Steps

1. **`crates/git-core/src/cli/ops.rs`:**
   - `AuthCause` with its own `#[serde(rename_all = "camelCase")]` and the derives above;
   - `AuthFailed { cause }`;
   - the pattern → cause table replaces `AUTH_PATTERNS`, and `classify_failure` returns the cause.
2. **Callers** (the compiler and `tsc` find the rest):
   - `src-tauri/src/commands/ops.rs:838`: `failure_message` matches `AuthFailed { .. }`;
   - `src/api/types.ts:613`: the union gets `cause`;
   - `src/store/opsStore.ts`: `failureToast` switches on the cause; the kind checks at `:201` and `:241` are
     unaffected;
   - `src/README.md:542`: the `authFailed` description.
3. **Clone** (if in, per §2): `clone_repo` classifies. By (a):
   - the new kind goes in `GitError::kind()` (`crates/git-core/src/error.rs:40-50`), carried by `AppError`
     (`src-tauri/src/error.rs:6`);
   - add `"authFailed"` to the TS `AppErrorKind` union (`src/api/types.ts:8`);
   - `CloneDialog` renders the cause's title and detail through a helper shared with `failureToast`.
   - The error's text is the bare cause (`"hostKey"`), so keep it clone-only: no generic `toastError` path may show
     it.
4. **The harness guard** (if in, per §3 A): `smoke-linux.md` §2's `tauri-driver` line, with one sentence of why.
   Done in #18 on every Xvfb launch.
5. **`setsid`** (if in, per §4): replace `process_group(0)`, and update the comment.
6. **Docs:**
   - the open-items row: the `BatchMode=yes` line updated to the chosen option (done in #18); the row marked fixed
     on its branch, citing this plan;
   - `src/README.md`.

## Tests

- **Rust:**
  - A table test with one row per pattern (all 7), pattern → expected cause. Use the measured lines verbatim:
    `git@github.com: Permission denied (publickey).`, `Host key verification failed.`,
    `fatal: could not read Username for 'https://github.com': terminal prompts disabled`.
  - A synthetic multi-remote stderr (a host-key failure plus another remote's publickey line), to prove `HostKey`
    wins. A mutation check: swapping the order must fail it.
  - `failure_serde_shape` (`ops.rs:1350`) gains the `{"kind":"authFailed","cause":"hostKey"}` shape.
  - **If clone is in:** a small pure helper (a failed clone's `CliOutput` → `AppError`), tested on its own: an auth
    stderr gives `authFailed` with its cause, and any other failure gives the last `fatal:` line, not
    `Cloning into`. `clone_repo` itself is a Tauri command that needs an `AppHandle`.
- **TS:**
  - `opsStore.test.ts`: each cause gives its title and detail;
  - the existing tests at `:268` and `:281` get a `cause`, which `tsc` requires;
  - the `CloneDialog` test, if clone is in.
- **If `setsid` is in:** a `#[cfg(target_os = "linux")]` runner test using the existing alias pattern
  (`runner.rs:858`). The alias reads the session id from `/proc/self/stat` (field 6), which works where `ps -o sid=`
  may not: CI also runs `cargo test` on macOS. The test checks that the session id isn't `libc::getsid(0)`. The
  existing cancel tests must still pass.
- **Gates:** npm tests, `tsc`, `cargo test`, `clippy -D warnings`.
- **By hand, offline:**
  - **ssh:** a small stub script that prints each measured line and exits 255. For the changed key, it prints the
    verbatim multi-line "REMOTE HOST IDENTIFICATION HAS CHANGED" banner plus "Host key verification failed.".
    - **For fetch:** set it as the fixture repo's `core.sshCommand`.
    - **For clone** (no repository config yet): set it in the harness's scratch `HOME` `~/.gitconfig`, or as
      `GIT_SSH_COMMAND` on the app's launch line.
  - **https:** a small local server answering 401:
    - `http://127.0.0.1:PORT/x` gives `could not read Username` (`NoCredentials`);
    - `http://u@…` gives `could not read Password`;
    - `http://u:p@…` gives `Authentication failed for` (`Rejected`).
  - No GitHub contact is needed.

## Decisions (2026-09-27)

1. **Clone:** in, via (a): a new `authFailed` error kind, rendered with the same cause text. Other failures show the
   last `fatal:` line. **(amended 2026-10-06: the first `fatal:` line, W2)**
2. **`BatchMode`:** A, no runner change. This reverses the earlier "`BatchMode=yes`": the measurements showed
   `BatchMode` would only remove working askpass dialogs.
3. **The harness guard:** added: `SSH_ASKPASS_REQUIRE=never` plus `GIT_ASKPASS=` on the `tauri-driver` line.
   Done ahead of the code (PR #18) on every Xvfb launch: `smoke-linux.md` §2, the AppImage section, and
   `direct.sh`'s `dlaunch`.
4. **A changed host key:** its own cause, `HostKeyChanged`, with a warning (the table's first row).
5. **The toast wording:** approved as drafted. Wording changes found in review come back to the user.
6. **The ssh pattern:** keep `Permission denied (publickey`; not widened.
7. **The host in the detail:** the generic `ssh -T git@<host>` form.
8. **`setsid`:** in, replacing `process_group(0)`.
9. **Branch:** its own PR after #18 merges.

## Accepted limits (accepted by the user 2026-09-27)

- plink/TortoisePlink messages fall to `Other`.
- A multi-remote failure shows one cause.
- `remote_tags` (`ops.rs:1171-1191`) still shows the raw `cli` line on a login failure.
- A cancelled GCM dialog reads as `NoCredentials`.
- `LogLevel QUIET` (or `-q`) in the user's ssh config hides the ssh lines, so the failure goes to `Other`.
- The changed-host-key stderr wasn't checked against a real sshd (none installed); it rests on the OpenSSH source
  (`error()` for the banner, then `fatal()`, both to stderr).
- The `setsid` test runs on Linux only.

## Execution and rulings (2026-10-06)

- **The coder's deviations (round 1):** the toast text's wording was approved without the backticks the plan's
  draft used; the clone banner wraps for an auth error (a new `wrap` prop on the shared `Banner`, used only by the
  Clone dialog).
- **Windows walk findings and rulings:**
  - **W1:** `credential.interactive=false` makes git print "fatal: unable to get password from user", which fell
    to `Other` ("Operation failed"). Ruled: add the pattern to `NoCredentials`.
  - **W2:** a missing local source prints two `fatal:` lines; the banner showed the last one, losing the cause on
    the line before. Ruled: show the **first** `fatal:` line instead. This amends Decision 1 above, which said
    "last".
  - **W3:** a failed clone logged nothing (only a success logs "cloned"). Ruled: log clone failures too, and
    redact userinfo from clone URLs in the log — the existing "cloned" line was leaking `https://user:password@…`
    URLs to the log, pre-existing.
- **Credential-leak rulings (round 4, after the owner's re-look):** the debug "spawned git" line, the dock's
  started-event command, and the CLI error command (blame/history/status) showed a URL's credentials. Ruled: all
  three go through `display_cmd`, which now redacts every argument with userinfo in a URL.
- **The banner icon:** aligned beside the first line on a wrapped banner, not kept vertically centred.
- **Triage T1–T12** (the running triage list, 2026-10-06):
  - T1 icon on a wrapped banner: fixed (aligned to the first line).
  - T2 the Clone dialog's own frontend preview shows the typed password: accepted, closed.
  - T3 `display_cmd` shortens any URL-like argument with userinfo, even outside a clone (e.g. a commit message):
    accepted, closed.
  - T4 an unescaped `/` in a URL password isn't stripped by `redact_url`: accepted, closed.
  - T5 `GitError::AuthFailed`'s message is the bare cause, clone-only today: accepted, closed.
  - T6 ops reporting through `cli_failure` (rebase -i, checkout -b, worktree remove, tag -a) keep the plain
    "authentication failed" with no cause: accepted, closed.
  - T7 other spawns via `host_command` get no `setsid`: accepted, closed.
  - T8 a stray "Couldn't open repository" toast from an earlier StartScreen test's `openRepo` mock: fixed (the
    mock now returns a proper repo summary).
  - T9 hand-written test stderr lines and a rebuilt/abbreviated changed-host-key banner (not captured from a real
    sshd): accepted, closed.
  - T10 a live check of the redacted dock/log/debug lines: fixed by a walk (a 401 clone with `user:secret`,
    `RUST_LOG=debug`).
  - T11 a local clone into its own source folder makes an empty repository (pre-existing git behaviour): accepted,
    moved to `open-items.md` §Q.
  - T12 the reviewers' and coder's "fine" list across passes 1–4 (pattern order, serde shapes, callers exhaustive,
    clone fallback, setsid/kill pgid, `pre_exec` safety, cfg compile, wording, test counts, rustfmt noise, README
    line drift, a rustc OOM rerun, the `stage.rs` quoting side effect, git's own ssh `-G` probe, a cancelled GCM
    dialog as an accepted limit, a tester's own mangled-path warning): accepted, closed.
- **The parent-folder ruling:** a failed clone leaves an empty parent folder that git created, when the chosen
  parent didn't exist before. Accepted, closed.
