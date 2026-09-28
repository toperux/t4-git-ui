# Plan: the markdown viewer's CLAUDE.md wording, and an Accepted limits section in open-items

_Written 2026-09-28. Status: **executed 2026-09-28**, on the owner's go. The plan was reviewed until a pass found
nothing (pass 6; passes 1–5: 19, 11, 5, 7 and 2 findings, owner decisions O1–O13). The change review ran in
passes until one was clean (passes 1–2: 7 and 1 findings, all fixed). Pass 1 found the ref/remote dialog limit
reachable through the detached-HEAD banner, so the §Q entry names that path and gating the banner is deferred to
close-out Phase 2a (§I), on the owner's call. Branch `claude-md-draft` (the draft commit `64c6640`, taken off
`main` on 2026-09-28 because it wasn't ready to go live)._

**Goal:**
- The draft `CLAUDE.md` takes the markdown viewer's wording, except where this repo's conventions differ. The
  rules themselves don't change, apart from filling one gap (step 5 never said to fix the findings).
- `docs/plans/open-items.md` gets a section for open accepted limits (D1), with one rule for what goes there:
  **an accepted limit with a reopen trigger is open (§Q); one with no trigger is closed (the done file)** (O3, O6).
  The accepted items with a trigger now recorded elsewhere in `open-items.md` (D3, O10: scheduled ones too) and in
  `open-items-done.md` (O3, O6, O7) move there.

**Source:** `F:/src/_ pet projects/t4-markdown-viewer/CLAUDE.md` (2026-09-28).

Labels AL1–AL17 below are this plan's only; the files get bold titles, not numbers (the review's Q1–Q32 IDs are
cited live, so a "Q1" would collide).

## Part 1 — `CLAUDE.md` (O1: the viewer's wording, except the kept list)

Take the viewer's text for every line, then apply only these differences:

**Kept from this repo:**
- the title `# CLAUDE.md`;
- step 1's "**Prompt.** The owner says what needs to happen or be implemented.";
- step 2's plan path: `docs/plans/YYYY-MM-DD-<name>-plan.md` (every plan in `docs/plans/` is dated);
- lines hard-wrapped at about 117 columns, like the repo's other docs;
- step 5's list: "every finding that was skipped, and every limit to propose for acceptance" (O5), not the viewer's
  "every accepted limit found": a limit is accepted only once the owner decides it in triage.

**Step 6's Defer and Accept targets, mapped to this repo:**
- **Defer it.** A row in `docs/plans/open-items.md`, in the section it belongs to or a new dated section
  (*Added YYYY-MM-DD — …*), with a reopen trigger.
- **Accept it.** With a reopen trigger, it's an open accepted item: `docs/plans/open-items.md` §Q (*Accepted
  limits*). With none, it's a closed accepted item kept for reference: `docs/plans/open-items-done.md`, in the section
  it came from or a new dated section.

**What that brings in from the viewer** (for the review to check against): the intro line ("Follow these steps in
order. Don't skip a step, and don't merge two steps into one."); step 3's and step 5's "fix what the review finds /
the findings, and review again" and "When a finding needs a decision, ask the owner at once"; step 5's "Collect …
show the list to the owner"; step 6's heading and bold **Fix it / Defer it / Accept it**; step 7's "Only once the
review-fix loops are done, squash related commits into logical ones for the push or PR" (the draft's "then push or
open a PR" goes) and "A go on the task is not a go to push; each needs the owner's go-ahead at that moment".

**D2, "owner":** every place the draft means the person who decides — today `:5`, `:6`, `:9` ("the user's to
make"), `:11` ("a user edit" → "an edit by the owner", as the viewer has it), `:12`, `:18`, `:30`, `:31`. Kept:
`:36`, "what the user sees" (someone using the app). D2 covers `CLAUDE.md` only; `open-items.md` and the plans keep
"the user".

## Part 2 — `open-items.md` §Q, *Accepted limits — open, each with a reopen trigger*

**The section:** `## Q. Accepted limits — open, each with a reopen trigger`, after §P, before *Order*. Q is free in
both files, and a letter keeps the file's rule working.

**Its intro:**
- **The rule:** an accepted limit with a reopen trigger is open and lives here; one with no trigger is closed and
  lives in `open-items-done.md`. A row marked "do not re-offer" keeps that note here: it is raised again only if its
  trigger fires (O6).
- **When one closes** (its trigger fired and it was fixed, or the trigger no longer applies): it moves to
  `open-items-done.md` §Q; the pointer at its origin stays.
- **Plans:** accepted-limit tables inside live plans stay in those plans. When a plan is archived, its accepted
  limits that have a reopen trigger move here (O9), since archived plans are frozen.
- **Scope (O13):** the rule covers `open-items.md`, `open-items-done.md` and the plans. A smoke doc's inline
  "accepted" note describes a walk's expected result and stays where it is.

**Other text the move makes untrue, edited in this change:**
- `open-items.md:5-6`: "every row except §C's roadmap is scheduled…" gains "; §Q's accepted limits wait on their
  reopen triggers, and three of them are also in a close-out phase".
- `open-items.md:8-10` (the note on the done file): one line pointing at §Q.
- `open-items.md:90`, §I's title ("the `ponytail:` ceilings, in one place"), and `:95`, §I's intro ("Rows closed as
  will-not-fix or accepted are in the done file."): both name §Q — the `Menu.tsx` ceiling (AL10) is a `ponytail:`
  ceiling that now lives there, and accepted rows with a trigger are there too.
- `open-items.md` §P `:394-397`, the `.sig` row (O2): gains "scheduled in close-out Phase 1b (row 2d)".
- `open-items-done.md:3-6`, its header: one line saying open accepted limits are in `open-items.md` §Q.
- `open-items-done.md:98` "(Notarization stays open — `open-items.md` §B.)": left as written (the done file's text
  is kept as written; AL7's origin pointer covers it).
- `open-items-done.md:574` "Closed, will not fix (one): Push's bare branch name — see §I": gains "(in open-items §Q
  since 2026-09-28)" (O11).

**Each entry:** a bold title, the limit in plain words, when and where it was accepted, the reopen trigger, and
where it came from. **Every origin keeps a one-line pointer** ("accepted limit, moved to open-items §Q, *<title>*,
2026-09-28"), so every existing reference to the old section still leads somewhere (e.g. the AppImage plan's
`:238`, "noted in open-items §P"; done `:364`'s "§E has the reasoning").

### Moved from `open-items.md`

| # | From | Limit | Reopen trigger |
|---|---|---|---|
| AL1 | §B `:62` | Real GPU hardware and a HiDPI panel not walked on Linux | a user reports a GPU-specific or HiDPI bug |
| AL2 | §O `:278-281` | *F7 of the 2026-09-27 fix batch*: on WebKitGTK, focus moved by script back from a text field after only Ctrl/⌘ chords comes back without the focus ring. Chromium is expected to ring it; unwalked. The fix would be to also mark in `focusin` when `relatedTarget` is an input or textarea | a report, or the next WebKitGTK focus work |
| AL3 | §P `:294-298` | In the Linux harness: other ssh hosts, a fetch/push through the app itself, the unisolated `~/.ssh`, and ssh signing under the moved `HOME` are not covered (the last two documented in `smoke-linux.md` §2) | a harness walk that needs one of them |
| AL4 | §P `:365` | The AppImage fix is untested on an Ubuntu 22.04 host (accepted 2026-09-26) and with the NVIDIA proprietary driver (2026-09-27) | a report from either |
| AL5 | §P `:366-369` | The AppImage always runs under XWayland; on some GPUs (seen on a VMware guest) it also needs `WEBKIT_DISABLE_DMABUF_RENDERER=1`, which the README documents rather than the app setting it | a report that the README workaround isn't enough, or Tauri's AppImage dropping the forced `GDK_BACKEND=x11` |
| AL6 | §P `:301-302` | No timeout on git ops: a stuck ssh/https op ends only on Cancel (a timeout would misfire on a slow fetch or clone) | a report of a hang the ssh fail-fast change doesn't cover |
| AL15 | §A `:28-32` | `status.rs`: no `git status --porcelain=v2 -z` fallback behind a flag (v1 accepted limit); libgit2 status measured 1.5 s at 47k tracked files, 50 ms at 61k files on disk. Still measured in close-out Phase 3 | the `slow status` log line (≥ 250 ms) shows a real machine hitting it — or Phase 3's measurement crossing its threshold. If Phase 3 measures it fine, it stays here with the numbers added (O12) |
| AL16 | §I `:113-114`, the Q23 half (the *Close-out Phase 2* tag at `:115` stays with C6) | Q23: when another commit is selected, the details pane goes blank until that commit's details arrive, instead of keeping the previous commit's details on screen. P1-4's fix (`6a95389`) clears `detail` and `error` on a new commit id; the blank was decided at P1-4 (`CF:47`, `:233`, `:520`). ("C6/Q23" at `open-items.md:113` is a label collision: this Q23 was the second pass's C6, not the consolidated C6, `close_repo`.) At execution: confirm `CommitDetails` still clears on a new oid. Still in close-out Phase 2's table, *design needed* | it flickers on the smoke walk |
| AL17 | §P `:388-393` | `requireSignedVersion` off: a signature with no version is still accepted, a downgrade bypass (low threat: the manifest is served over HTTPS from GitHub releases). Decided 2026-09-27 to track, not schedule | its precondition holds — every artifact a `latest.json` can point at carries a version, true from the first release after the CLI pin change (2026-09-28) |

**O10:** AL15–AL17 are scheduled in the close-out plan too; they move anyway, and the close-out rows that name them
point at §Q (Part 3). §I's C6 half of `:112-115` stays in §I.

**O4:** with AL3's cases gone, the struck-through *ssh under the moved `HOME` (T4)* row (`:294-298`) is fully done
and moves to `open-items-done.md` §P, with the pointer.

### Moved from `open-items-done.md` (O3, O6, O7: every accepted or will-not-fix row with a reopen trigger)

| # | From | Limit | Reopen trigger |
|---|---|---|---|
| AL7 | §B `:149-151` | macOS notarization, won't do for now (needs a paid Apple Developer account) | a Mac user |
| AL8 | §I `:365-370` | Push sends a bare branch name, ambiguous when a tag has the same name; git refuses such a push. Do not re-offer | the refusal is reported as confusing |
| AL9 | §I `:371-380` | *F7 / Linux residual risk* (2026-09-20 review): a set-but-unparseable `DBUS_SESSION_BUS_ADDRESS` panics the single-instance plugin at startup | a user reports a startup crash on Linux, or the plugin stops unwrapping |
| AL10 | §I `:404-406` | The `Menu.tsx` ceiling: a submenu panel takes the parent's width (still marked `ponytail:` in `Menu.tsx`) | a submenu's labels clip |
| AL11 | §N `:531-537`, `:548` | A foreign working-tree write of a declared kind within 50 ms after an op ends isn't shown until Refresh. The fix, when reopened: one more status read a grace after the op, or classify by path instead of by time | a report of a working-tree write missed after an op, e.g. a hook's background child (trigger added 2026-09-28: the source names only the fix) |
| AL12 | §I `:363-364` (reasoning §E `:200-209`) | Opening a dirty repository walks the graph twice. Do not re-offer | the walker learns to add the working-tree column without restarting |
| AL13 | §B `:124-127` | Dependabot's `glib` 0.18 alert dismissed: Linux-only, reached through Tauri's gtk pin, an API the app never calls | Tauri's pin starts carrying something the app does call (worth a look at each Tauri bump) |
| AL14 | Context `:55-56` | A ref or remote dialog closes, and its input is lost, when its op is refused because another is running (they call `onClose()` before `runOp`, e.g. `RefDialogs.tsx:243-244`, `RemoteDialogs.tsx:29-30`; `runOp` then refuses with *Operation in progress*, `opsStore.ts:189-191`). The fix, when reopened: close only on `out.ok`, as `WorktreeDialogs.tsx:152` does (`runOp` already returns `OpOutcome` with `error.kind === "busy"`; the source's "`ran` flag" is superseded). At execution: check whether that busy state is reachable from these dialogs, and write the answer into the entry | it bites: a report of a dialog closing on a refused op |

**Looked at in the done file, not moved** (no reopen trigger, or not a limit): §I F8 test cost; §M `:497-504`
window-restore accepted limits and `:505-506` staging cost (no trigger); §N `:588-592`, closed without a change so
they aren't re-offered (no trigger); §N `:595-597` `linesShown` (it has a trigger, but it was closed as nothing to
do, not as a limit); §C custom titlebar (stays in open-items §C).

### Looked at in `open-items.md`, not moved (none is an accepted limit)

- §B `:58-61` the dock's range and collapse not walked with real Wayland input: not re-walked, not accepted.
- §I F3, S3, E6 (reopen / "if it bites" wording): deferred, not accepted; close-out Phases 2 and 3.
- §J "if the first weeks say so": close-out open decision 1.
- §L both "reopen only if" rows and §M `:175-180` toast detail ("left until one bites"): not accepted any more — the
  close-out plan gives fixes for them (Phase 2, `:113`, `:116-117`), and their sections' intros keep the reopen
  wording as history (§L `:151-153`, §M `:171-173`).
- §O `:233` restored window ("guarded, not fixed"): the Linux track's Phase A/B. §O `:276` macOS T12: Phase 5.
- §P `:292`, `:376` `.rpm` ruled covered by the `.deb` walk: travels with the AC row.
- §P `:312` askpass "Windows is unchecked": the ssh fail-fast plan. §P `:352` T5 "DPI stays out of reach": the T5
  plan.
- §P `:394-397` only the AppImage's updater `.sig` verified in CI (O2): a Phase 1b task now, not an accepted limit.

## Part 3 — the close-out plan

- `:3-6`, the goal "every row either fixed and walked, or moved to `open-items-done.md` with a reason… §C kept open
  by decision": a closure that ends as an accepted limit with a reopen trigger moves to §Q, not the done file (e.g.
  Phase 5's macOS rows closed on CI's leg, a Phase 2b design row ending "accept, reconsider if…"); §Q is kept open by
  design. A Phase 3 "measured, fine" closure is not an accepted limit and still goes to the done file — except
  `status.rs` (AL15), which stays in §Q with the numbers (O12).
- The rows naming AL15–AL17 (O10) point at §Q: Phase 2's §I Q23 row (`:124`), Phase 3's `status.rs` bullet (`:153`),
  and the Linux track's `requireSignedVersion` line (`:186`, the only live mention).
- *Gate after every close-out release* (`:77-104`) gains a line: after the first release since the CLI pin change,
  turn on `requireSignedVersion` (open-items §Q) — AL17's trigger fires at that release, and the gate is where it is
  seen.
- `:16`, "(§A–§P)" → "(§A–§Q)".
- `:25-26`, Phase 0's summary: after the `Menu.tsx` ceiling's "closed as won't-fix" and notarization's "closed as
  won't do for now", add "(in open-items §Q since 2026-09-28)" (O8).
- Phase 1b row 2d: the `.sig` check on the Windows and macOS legs becomes a listed task (O2).

## Decisions (the owner, 2026-09-28)

- **D1:** open accepted items get their own section in `open-items.md`.
- **D2:** "owner", as the markdown viewer has it (in `CLAUDE.md`).
- **D3:** the existing open accepted items move in this change.
- **O1:** take the viewer's wording except the kept list.
- **O2:** the `.sig` row isn't moved; it becomes a Phase 1b task.
- **O3:** the done file's accepted rows with a reopen trigger move too.
- **O4:** the T4 row moves to the done file.
- **O5:** step 5 says "every limit to propose for acceptance", one more difference from the viewer.
- **O6:** "do not re-offer" rows with a trigger move too (AL8, AL12); the rule is trigger or no trigger.
- **O7:** the `glib` alert and the `runOp` note move (AL13, AL14).
- **O8:** the close-out plan's Phase 0 summary gets a "(in open-items §Q since 2026-09-28)" note.
- **O9:** when a plan is archived, its accepted limits with a trigger move to §Q.
- **O10:** accepted rows with a trigger that are already scheduled in the close-out plan move too (AL15–AL17), with
  the close-out rows pointing at §Q. No exception to the rule.
- **O11:** done §N `:574` gets the same "(in open-items §Q since 2026-09-28)" note as O8.
- **O12:** if Phase 3 measures `status.rs` fine, AL15 stays in §Q with the numbers.
- **O13:** §Q's intro says the rule covers `open-items.md`, the done file and plans, not smoke docs.

## Verify

- **`CLAUDE.md` vs the viewer's:** join each file's wrapped lines first, then `git diff --no-index --word-diff`;
  the only differences are the kept list and step 6's Defer and Accept targets.
- **Line width:** no added or changed line over 120 characters (existing long lines are out of scope).
- **Consistency:** these agree with the rule and with §Q: `open-items.md:1-10`, `:90`, `:95`, §Q's intro, the `.sig`
  row; `open-items-done.md:3-6`, `:574`; the close-out plan's `:3-6`, `:16`, `:25-26`, row 2d, the gate line and
  the rows naming AL15–AL17; `CLAUDE.md` step 6.
- **Pointers:** every AL item's origin holds its pointer; the T4 row is in done §P.
- **References:** `git grep` for each AL item's title words and old section in `docs/plans/`, `docs/smoke/`,
  `.claude/` and `README.md` (not `docs/archive/`, which is frozen): each hit still leads to the item.

## How it runs

1. On the owner's go: the edits on `claude-md-draft`, committed locally.
2. Change review loop; triage anything skipped or proposed for acceptance.
3. Squash the branch's commits into logical ones (rehearsed in a throwaway worktree, tree checked identical).
4. Ask before pushing: the owner said they still want to edit `CLAUDE.md`, so the push is theirs to call.
