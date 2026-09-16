# Handoff — 2026-09-16

> **Superseded, archived 2026-09-16.** Everything this file parked has since landed and shipped in
> **v0.10.2**: open item 1 (the rail override latch) is fixed in `f4917d3` and walked as R1 of
> `docs/archive/walks/2026-09-16-review-fix-walk.md`; the toast timer note is fixed in `toastStore.ts`;
> the four commits it calls unpushed are pushed and released. The repo state below is a mid-session
> snapshot and is no longer true — read `docs/plans/open-items.md` §K instead. What is still worth
> reading here: open item 2 (review labels whose text was lost — do not reconstruct them), the
> environment gotchas, and the standing constraints.

Written at the end of a session that reviewed, fixed and squashed the unpushed range. Everything
below was verified against the working tree at the time of writing, not recalled. One section is
explicitly marked as **not recoverable**; treat nothing in it as fact.

## Repo state

`main`, clean working tree (0 dirty entries apart from this file), **4 commits ahead of
`origin/main`**, nothing pushed:

```
01235b5 fix: the dock heals its height, and the rail override stops latching
b0b94fa feat: resizing the window moves only the commit grid and the diff
89123cb fix: bisect and cherry-pick/revert get their own groups in the commit row menu
3f4fdc9 feat: clicking anywhere on a toast dismisses it, and toasts last 5 s
--- origin/main ---
ae24dde fix: one sidebar toggle, and the rail flyout's header and scrolling
```

- Gates at last run: `tsc --noEmit` clean, `vitest run` **862 passed (75 files)**.
- Only `main` exists locally. The five `backup/*` branches were deleted after confirming each held
  nothing unique.
- The pre-squash tip `2839e77` is orphaned but still in the reflog if anything needs recovering.

## What landed this session

Three defects were found by adversarially reviewing the unpushed commits, reproduced in the running
app over CDP, fixed, and re-walked. All three are folded into the commits that introduced them:

| Defect | Fix | Now in |
|---|---|---|
| A double-click in a toast's detail dismissed the toast (the `getSelection` guard only survives a drag) | the detail is out of the dismiss target entirely — `closest("button, .selectable")` | `3f4fdc9` |
| Dismissing an origin-less toast threw the caret into an open dialog's first field | `restoreFocus` returns early with no `origin`; the toast also cancels its own mousedown | `3f4fdc9` |
| The toolbar's width model counted neither the file-history chip nor the update badge | `toolbarTierFor(width, nameWidth, extras)` reserves `HISTORY_CHIP_W = 228` for the chip only | `b0b94fa` |

The walk record is `docs/archive/walks/2026-09-15-toast-and-toolbar-fix-walk.md`. It documents a
false start worth keeping in mind: the first version of the toolbar fix **also** reserved 96px for
the update badge, which was wrong — `.search` is the row's one elastic control (240px → 120px
`min-width`) and that give exists precisely to absorb the badge, as the CSS comment says and as smoke
group AU step 9 walked. Reserving it folded the toolbar to `tight` at widths where the row still fit.

## Open item 1 — the rail override latches (the only fully-specified one)

**Status: analysed, answer delivered, nothing implemented. Waiting on a go.**

### Current logic

Three pieces:

```ts
// src/screens/RepoWindow/layout.ts:6,33
export const RAIL_BELOW = 1000;
railAuto: width < RAIL_BELOW,
```

```ts
// src/store/viewStore.ts:25-28
toggleRail: (auto) => {
  const next = !(get().railOverride ?? auto);
  set({ railOverride: next === auto ? null : next });
},
```

```tsx
// src/screens/RepoWindow/RepoWindow.tsx:53-63
const railAuto = useLayout().railAuto;
const railOverride = useViewStore((st) => st.railOverride);
const rail = railOverride ?? railAuto;
const setRailOverride = useViewStore((st) => st.setRailOverride);
useEffect(() => {
  if (railOverride === railAuto) setRailOverride(null);
}, [railOverride, railAuto, setRailOverride]);
```

`railOverride` is `null` (follow the width) or an explicit `true`/`false` set by ``Ctrl+Shift+` ``.
It is **not persisted**, so it resets per window.

Both the toggle and the effect try to hand control back to automatic:

- **toggle-time** (`viewStore.ts:27`) — toggling to the state the width would pick stores `null`.
- **width-driven** (`RepoWindow.tsx:61-63`) — wipes the override the instant it agrees with the width.

### The defect

Only the width-driven effect causes it. Force the rail on at 1400 (`override=true`, `auto=false`) →
narrow to 900, where `auto` becomes `true` → the two agree → the effect discards the override →
widen back to 1400 → the sidebar expands. The user's explicit choice is lost by a round trip that
merely passed through a width where it coincided with the default.

### Proposed fix

Delete the effect at `RepoWindow.tsx:61-63` (and its comment). Keep the toggle-time normalisation,
which is already the escape hatch: one toggle to whatever the width would pick stores `null` and
hands the decision back.

The effect's own comment defends itself with *"forced on at 900, then widened to 1400 where the width
agrees anyway, it would still be pinned at 950 on the way back"* — but that is the user's choice being
honoured, which is what an override is for.

### The answer to "when would it then not auto-close or auto-expand?"

Exactly while a live override disagrees with the width, and only then:

- **rail forced on at ≥1000** → stays rail as the window widens; no auto-expand.
- **sidebar forced on at <1000** → stays sidebar as the window narrows; no auto-collapse.

Both end the moment the user toggles to the state the width would have chosen. Under today's code
that window instead ends at the first breakpoint crossing where override and auto happen to agree —
which is the bug, not a feature.

### Before implementing

- Check whether `setRailOverride` has any caller left once the effect is gone; if not, remove it from
  `ViewStore` and `viewStore.ts:29`, and check `viewStore.test.ts` for cases asserting it.
- `RepoWindow.tsx` may then no longer need `useEffect` imported.
- Update the doc comment at `viewStore.ts:16` ("Hands the decision back to the width once an override
  has become redundant") — that sentence describes the deleted effect.
- Behaviour change, so it wants its own commit and its own walk (the breakpoint is 1000px; drive it
  with `Browser.setWindowBounds`, never `browser_resize`).
- `docs/plans/open-items.md:374` already parks a related follow-up (**Per-view sidebar state** — one
  `railOverride` per view). Worth reading before touching this, but it is a separate idea.

## Open item 2 — review leftovers whose text did not survive

**Read this section carefully: the detail is gone and must not be invented.**

During the session I labelled the review output `A`, `B3`–`B7`, `C8`–`C12`, `D13`–`D15`. `A`, `D13`
(squash), `D14` (delete backup branches) and `D15` (above) are resolved or specified. The full text
of **`B3`–`B7` and `C8`–`C12` was lost when the conversation was compacted** and could not be
recovered from the session transcript — those labels appear only in thinking/tool blocks that the
extraction could not reach.

Do not confuse them with the `B3`–`B7` in `docs/archive/plans/2026-09-12-consolidated-findings.md`,
which is an **unrelated, older scheme** about `cli/rebase.rs`, `cli/ops.rs` and `log/graph.rs`, and is
mostly already ticked.

What is reliably remembered about the lost set, as gist only:

- **`B3`–`B7` were verification gaps, not defects** — five places where something was asserted but not
  actually proven. The subjects were, approximately: a row-menu separator assertion; the dock's
  double-click arming; the TabStrip heal trigger; smoke group AU step 7; and the update-badge path.
  The last of these is genuinely open and is recorded properly in the walk record: `UpdateBadge`
  renders nothing until a check finds a version, which cannot be forced from the harness, so the
  badge case rests on the CSS's stated intent plus the earlier AU walk rather than a fresh
  measurement.
- **`C8`–`C12` were notes/nits, not action items.** Only one is remembered with confidence, and it
  was re-verified while writing this file:

  **The toast auto-dismiss timer is never cleared.** `src/store/toastStore.ts:74`:

  ```ts
  if (toast.kind !== "error") setTimeout(() => set(without(id)), TOAST_MS);
  ```

  The handle is not stored, so `dismiss(id)` cannot cancel it. Dismissing a non-error toast early
  leaves a timer that fires up to 5 s later and calls `without(id)` on an id that is already gone — a
  no-op filter that still notifies subscribers. Harmless; worth a `clearTimeout` only if the stack
  ever gets busy.

**Recommendation:** do not try to reconstruct `B3`–`B7` / `C8`–`C12` from memory. If that coverage
matters, re-run the review over the four unpushed commits — it is a bounded diff and the second pass
will be cheaper than archaeology. The full session transcript is at
`C:\Users\toper\.claude\projects\F--src---pet-projects-t4-git-ui\21524aa8-14d5-42ca-8f70-b8824dbab9b3.jsonl`
if someone wants to dig further, but an extraction pass over its assistant text blocks already came
back empty for these labels.

## Not started, explicitly unauthorised

- **Pushing.** Four commits are unpushed and must stay that way until the user says push. A "go" on a
  task is not a go on a push.
- Anything in `docs/plans/open-items.md` beyond what is named above.

## Environment gotchas learned this session

Cheap to re-learn the hard way, so they are written down:

- **`git cherry-pick` rejects `-q`.** It prints usage and does nothing. Worse, `set -e` did *not* halt
  the surrounding compound command when this happened, so a squash script ran on past three failed
  picks and force-moved `main` to a tip missing three commits. Recovered from the WIP sha. Use an
  explicit `|| { echo FAIL; exit 1; }` after every git step in a rewrite script rather than trusting
  `set -e`.
- **Heredocs do not survive being passed to `bash -c`** in this setup — a squash attempt died with
  `unexpected EOF while looking for matching '`. Write commit messages to a file and use
  `git commit --amend -F <file>`. This also dodges the standing hazard that backticks inside a
  double-quoted `git commit -m` get executed and silently vanish.
- **Squashing without `git rebase -i`** (which is unsupported here): detach at the target commit →
  `git checkout <WIP> -- <paths>` → `git commit --amend -F <msg file>` → `git cherry-pick` the rest →
  `git branch -f main HEAD`. The proof it worked is an **empty** `git diff <WIP> main`.
- **jsdom has no layout and no selection model**, so pane sizing and focus-on-mousedown are not
  unit-testable. The check is a CDP walk. Precedent:
  `docs/archive/walks/2026-09-06-group-k-walk.md:37`.
- **CDP driving**: resize with `Browser.setWindowBounds`; `browser_resize` installs a device-metrics
  override that pins the viewport. Use real `Input.dispatchMouseEvent` with `clickCount` 1 then 2 for
  a true double-click — synthetic events never reach library handlers. Recipe:
  `docs/smoke/smoke-cdp.md`.
- **The toast stack sits top-centre over the first grid rows**, so a right-click aimed at row 2 or 3
  hits a toast if one is up. Dismiss first or aim lower.
- **Changed files repopulates asynchronously** after selecting a commit; 500 ms is too short to
  right-click the first row, 1500 ms works.
- **The CDP harness is now in the repo** (it used to live only in a session-scoped temp directory
  that a fresh session does not get): `docs/smoke/cdp.mjs` is the driver, with `--inner`, `--eval`,
  `--drag`, `--key`, `--type`, `--click`, `--rclick`, `--dblclick`, `--seltext`, `--wait` and
  `--reload`; `docs/smoke/fixtures/smoke-launch.ps1` starts a local build on the debugging port in
  its own WebView2 profile so a walk cannot disturb the installed app. Both are described in
  `docs/smoke/smoke-cdp.md`. Anything else from that scratchpad (the commit-message files, the
  per-walk scripts) was throwaway and is gone.

## Standing constraints (carry into the next session)

- Never push unless told to, in that message.
- Commit trailer: `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- Never put `cd` in a compound Bash command that also writes — use `git -C`, `npm --prefix`, absolute
  paths. Create files with the Write tool, not `> file`.
- Never run `prettier --write` on this repo.
- No emoji in UI text.
- `git rebase -i` and `git add -i` are not supported here.
- Wait for an explicit go before executing a plan.
