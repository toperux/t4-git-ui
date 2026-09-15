# Self-healing layout: the dock's height and the rail override

**Goal:** Two latches that survive until restart, both found on 2026-09-15. The output dock can end
up open-but-empty after a window resize with no way back except a toggle; the sidebar's rail
override, once set, takes the window width out of the decision for the rest of the session.

**Status:** draft, reviewed 2026-09-15. Task 2 ships **option B plus R1's normalisation**, agreed
the same day. Every review finding below is resolved. Nothing is implemented yet.

**Tech stack facts that bind both tasks:** React 19 + TS 5.8, zustand 5 (no persist middleware, so
every store is per-window-per-session), `react-resizable-panels` 4 (`Group` / `Panel` / `Separator`,
per-Panel `groupResizeBehavior`), vitest 4 + `@testing-library/react` 16 in jsdom. **No
`@testing-library/jest-dom`** — assert with `getAttribute` / `hasAttribute` / `textContent`. jsdom
reports `offsetWidth`/`offsetHeight` of 0, so nothing that depends on real layout is unit-testable;
that is why both tasks below end in a CDP walk rather than a test.

---

## Task 1 — The dock heals itself when the window grows

### What happens today

`DockPanel` (`src/screens/RepoWindow/RepoWindow.tsx`) remembers the height to reopen at in a
`lastOpenH` ref, written from `onResize`. `182f2b4` narrowed that write to `isDraggedHeight(px)`
(`px >= DOCK_MIN_H && px <= DOCK_MAX_H`, i.e. 160–320), which stopped a squeeze below 160 from
poisoning the remembered height. What it did **not** fix: the panel itself keeps whatever size the
squeeze left it at, because `groupResizeBehavior="preserve-pixel-size"` keeps a pane's pixels
through a window resize — including pixels the pane never chose.

Measured on the built app:

| Step | Dock height |
|---|---|
| fresh open | 200 |
| window 700×500 | 198 |
| inner height 467 | 165 |
| restored to 1280×800 | **165** — does not grow back |
| window 700×360 (below the 700×500 minimum, CDP only) | 32 → 27 |
| restored to 1280×800 | **28** — open by state, nothing but its header on screen |
| collapse → expand (after `182f2b4`) | 200 ✓ |

So after the fix a toggle recovers it, but the user still sees a dock that says it is open and
shows nothing until they think to toggle it. **This task makes the recovery automatic.**

### The rule

When the dock is open and shorter than the height the user chose, and the window has just grown, put
it back to `lastOpenH`.

**Revised after the first walk** — see "What the walk changed". The rule originally read "below
`DOCK_MIN_H` means the layout squeezed it", which is both too weak and self-defeating: a grow that
makes room for 160 of a chosen 200 satisfies it and then stops.

### The one thing to verify first — answered: no

**`onResize` does not fire for the dock when the window grows.** Answered from the library source
rather than by instrumenting a build. `react-resizable-panels.js:1491` observes each panel's own
element with a ResizeObserver (`f.onResize && s.observe(f.element)`), and the callback at 1366-1372
fires whenever that element's box changes — with no equality check, but also with nothing else to
trigger it. A taller window changes neither the dock's height (a pixel-size pane keeps what it has)
nor its width, so the observer stays silent and there is no event to hang the recovery on.

The `resize` subscription is therefore required, not a fallback. `layout.ts` already had a
`subscribe(cb)` helper doing exactly this but module-private; it is now exported rather than
duplicated.

### Sketch (the listener shape, the more likely of the two)

```tsx
// Tracked from every onResize, squeezes included — the size the panel actually has right now,
// as against `lastOpenH`, which is only ever a size the user chose.
const currentH = useRef(DOCK_DEFAULT_H);

useEffect(() => {
  if (!open) return;
  return subscribe(() => {
    // Below its own minimum means the layout squeezed it to fit, not that anyone asked for this.
    // `resize` clamps to whatever room there is, so a window still too short lands back here and
    // the next event tries again — bounded by the event, never recursive. See R2.
    if (currentH.current < DOCK_MIN_H) panel.current?.resize(lastOpenH.current);
  });
}, [open, panel]);
```

Three things this must not do, each worth a test or a walk step:

- **Fight a drag.** A drag cannot land below 160 (`minSize` clamps it), so the `< DOCK_MIN_H`
  condition can never be true mid-drag. Confirm on the walk anyway by dragging to the 160 floor and
  holding.
- **Thrash while the window shrinks.** The condition is true on the way *down* as well. See **R2**.
- **Fire while collapsed.** `collapsedSize` is 28, below `DOCK_MIN_H`, so the effect must be inert
  while `open` is false. The `if (!open) return;` is load-bearing, not tidying.

### What the walk changed

The sketch above shipped and **failed its own verification step 1**, twice over. Recorded here
because both failures were in this plan's reasoning, not in the coding of it.

Walked at 1280×900 with the dock opened to 200:

| window | dock | |
|---|---|---|
| 1280×900 | 200 | the chosen height |
| 1280×400 | 132 | squeezed |
| 1280×500 | **160** | healed, but only to what a 500px window had room for |
| 1280×650 | **160** | never resumed |
| 1280×900 | **160** | the chosen 200 is gone |

1. **The guard stopped at the minimum.** `currentH >= DOCK_MIN_H` is satisfied by a partial heal, so
   the dock stalled at 160 and the remaining 40px were stranded. Fixed by measuring against
   `lastOpenH` instead, which continues over as many grow events as it takes.
2. **The heal recorded its own result as a drag.** 160 is inside `isDraggedHeight`'s 160–320 range,
   so `onResize` wrote it to `lastOpenH`: the recovery overwrote the height it was recovering.

The second failure is the residual below, arriving a section early. `isDraggedHeight` reads the
*cause* of a resize off its *value*, and it cannot — a 165px squeeze and a 165px drag are the same
number. Every bug in this family is that one guess: the original 27px reopen, the 165 loss, and now
the heal sabotaging itself. So the heuristic is **deleted** rather than patched, and replaced with
the signal that actually means the user chose this height — a `pointerdown` on the output separator
sets a ref that `onResize` reads. `RepoWindow` owns the ref, since the separator is its child;
`DockPanel` takes it as a prop.

**The second walk failed too, and instrumenting it found the real cause.** The rewritten heal still
restored 160 rather than 200, and a grow from 360 to 800 restored nothing at all. Collapsing and
re-expanding the dock at that same window size returned exactly 200, which proved `lastOpenH` was
intact and the fault lay in the heal's own call. A temporary `window.__dockLog` recording every
attempt settled it in one run:

```json
{"winH":800,"want":200,"before":86,"wasCollapsed":true,"afterExpand":28,"after":200}
```

- A squeeze does leave the panel **collapsed** in the library's sense (`wasCollapsed: true`).
- `expand()` achieves nothing here (`afterExpand: 28`). `react-resizable-panels.js:989` acts only
  when the size *equals* `collapsedSize`, and it restores `expandToSize ?? minSize` — and
  `expandToSize` is written only by `collapse()`. After a squeeze it is unset, so `expand()` aims at
  `minSize`: the 160 the earlier walks kept landing on was the library's, not ours.
- `resize()` moves a collapsed panel on its own (`after: 200`), so no `expand()` is needed. It was
  removed; keeping it only put `minSize` back in the way.

What actually fixes it is **two frames, not one**. The library lays this same resize event out in
the first frame, and a `resize()` issued inside that frame is overwritten — which is why the first
walk's single-rAF heal landed on `minSize`. A nested `requestAnimationFrame` puts the call after the
library's pass. R3 was real after all; see the correction recorded there.

### Files

- `src/screens/RepoWindow/RepoWindow.tsx` — `DockPanel`, plus `currentH` written from the existing
  `onResize`, the drag ref, and the separator's `onPointerDown`.
- `src/screens/RepoWindow/layout.ts` — export `subscribe` (only if the listener shape wins).
- `src/screens/RepoWindow/OutputDock.test.tsx` — the dock's tests already live here and already mount
  `DockPanel` inside a real `Group` with a stubbed `ResizeObserver`.

### Residual — closed by the redesign above

At the 700×500 window minimum the dock squeezes to **165**, inside the legal 160–320 range and so
indistinguishable from a deliberate drag by value alone — `onResize` never says what caused a
resize. `lastOpenH` becomes 165 and the user's 200 is gone. This was deliberately left, with the fix
named: write to `lastOpenH` **only during a drag**. The walk then forced exactly that change for its
own reasons, so the residual closes with it rather than outliving the task. Verification step 8 is
its check.

---

## Task 2 — The rail override stops latching (option B)

### What happens today

```ts
// src/store/viewStore.ts:21
toggleRail: (auto) => set({ railOverride: !(get().railOverride ?? auto) }),
```

`railOverride` is `boolean | null`; `null` means "follow the width". Both consumers read
`rail = railOverride ?? railAuto` (`RepoWindow.tsx:55`, `Toolbar.tsx:70`). But `toggleRail` only ever
writes `true` or `false` — **never back to `null`** — so the first toggle from any entry point takes
the width out of the decision permanently. The sidebar then stops auto-folding at 1000px and there
is no way to restore that short of restarting.

Confirmed live on 2026-09-15: with the override set, the sidebar stayed expanded at 950 and 850; a
reload (which resets the store) folded it at 950 correctly.

Three entry points, all calling the same action, each passing the width's current answer as `auto`:

- `src/screens/RepoWindow/Toolbar.tsx:193` — the toolbar's `Toggle sidebar` IconButton
- `src/screens/RepoWindow/useShortcuts.ts:90` — `` Ctrl+Shift+` ``
- `src/screens/RepoWindow/CommandPalette/CommandPalette.tsx:68` — the palette's `Toggle sidebar`

### The change

```ts
/** `auto` is what the width would do right now; the toggle flips the effective state. An override
 *  that agrees with the width is not an override — storing `null` there keeps the width in charge,
 *  and is what gives the user a way back to automatic. */
toggleRail: (auto) => {
  const next = !(get().railOverride ?? auto);
  set({ railOverride: next === auto ? null : next });
},
```

The override persists only while it *contradicts* the width. Toggling to the state the width already
wanted restores automatic behaviour instead of pinning the same value.

**It is invisible to the user at the moment of the toggle.** Both consumers compute
`railOverride ?? railAuto`, so storing `null` when `next === auto` yields exactly `next` — the
sidebar does what they asked, and `aria-pressed` on the toolbar button tracks the effective state
either way. No consumer changes.

**This does fix the reported path.** Two presses of `` Ctrl+Shift+` `` at 1280 are what pinned
`railOverride = false` during the 2026-09-15 walk. Under B the second press stores `null` instead,
and the sidebar folds at 950 again.

---

## Review findings

### R1 — B alone still leaves the symptom reachable · **decided: B + the normalisation**

B normalises *at the moment of toggling*. It does nothing about an override that becomes redundant
later, because the width changed underneath it:

1. At 900 (rail is automatic) the user toggles the sidebar on → `auto = true`, `next = false`,
   `false !== true`, so `railOverride = false`. Correct and intended.
2. They widen to 1400. Now `auto = false` too. The override agrees with the width and is invisible —
   but it is still stored.
3. They narrow to 950. `auto = true`, but `railOverride = false` still wins, so **the sidebar does
   not fold** — the exact symptom reported, from one legitimate toggle and no further input.

So B fixes the double-toggle path (the one actually hit on the walk) but not the width-changed-
underneath path. Both produce the same complaint.

**Suggested resolution — normalise when redundant.** Clear the override whenever it agrees with the
width, not only when toggling. Three lines in `RepoWindow`, next to where `railAuto` is already read:

```tsx
// An override that matches what the width wants is indistinguishable from no override, and keeping
// it means a later width change silently re-pins the sidebar. Hand control back at the moment they agree.
useEffect(() => {
  if (railOverride === railAuto) useViewStore.getState().setRailOverride(null);
}, [railOverride, railAuto]);
```

This is gentler than option A: A cleared on *every* breakpoint crossing, discarding a choice the user
could still see the effect of. This clears only when the choice has become a no-op, so nothing
observable is ever thrown away. It needs a new `setRailOverride` on the store (the current API only
exposes the toggle).

**Decided 2026-09-15:** B ships with this normalisation. B alone leaves a one-toggle route to the
reported bug, which is a thin fix for a bug report.

**Reversed 2026-09-16:** the normalisation effect is removed. It threw away something observable after
all: a rail forced on at 1400 was cleared when the window passed 900 and did not come back at 1400
(see "Accepted, not fixed" below). Step 3 above is the override doing its job: the user asked for the
sidebar and the window never overrode that. Toggling to what the width would pick is still the way
back to automatic (B). Walk: `docs/archive/walks/2026-09-16-review-fix-walk.md`.

### R2 — the recovery also fires while the window shrinks · Task 1

`currentH.current < DOCK_MIN_H` is true on the way *down*, not just on the way back up. Dragging the
window edge smaller fires a `resize` event per step, and each one calls `panel.resize(lastOpenH)`
against a group with no room for it. `resize()` clamps, so this is self-limiting rather than a loop,
but it means a `resize` call on every event during a shrink and possible visible jitter.

Two mitigations, in order of preference:

- **Only attempt when there is room to grow into.** The condition becomes "squeezed *and* the group
  is taller than it was", which needs the previous window height in a ref — cheap and exact.
- **Defer to `requestAnimationFrame`** and coalesce, so at most one attempt per frame and the call
  lands after the library's own layout pass for that event. Also settles R3.

**Decided:** both. The grow check is what makes the shrink case impossible rather than merely
harmless, and the rAF coalesce settles R3 at the same time; each is a line or two. Walk step 2
confirms it.

### R3 — ordering against the library's own layout pass · Task 1

Calling `panel.resize()` from inside a `resize` handler races the library's handling of the same
event: it may apply its group resize *after* our call and overwrite it. Unproven either way — worth
one deliberate test during implementation, and `requestAnimationFrame` (R2) is the fix if it bites.

**Settled by the walk: it does bite, and one `requestAnimationFrame` is not enough.** An earlier
revision of this note claimed the opposite, reading the first walk's 132 → 160 as the rAF'd
`resize()` taking effect. The instrumentation showed that 160 was the library's own `minSize` and
not a value this code ever asked for. A single rAF still runs inside the library's layout pass for
that event and is overwritten; the heal nests a second frame. The rAF also coalesces a burst of
resize events into one call, which is why it stays either way.

### R4 — `currentH`'s initial value is a lie · Task 1, minor

`useRef(DOCK_DEFAULT_H)` starts at 200 even when the dock mounts collapsed at 28. Harmless only
because the effect early-returns while `!open`, and `onResize` corrects it before the dock can be
open. Worth a comment rather than a change — but if the early return is ever relaxed, this becomes a
bug.

### R5 — the store test asserts the current latching behaviour · Task 2

`src/store/viewStore.test.ts` walks the toggle twice from a wide window and expects `false`:

```ts
st().toggleRail(false); expect(st().railOverride).toBe(true);
st().toggleRail(false); expect(st().railOverride).toBe(false);   // → becomes null under B
```

That second assertion is the one that proves the fix; it must flip to `toBeNull()`. The third case
(`__resetForTests()` then `toggleRail(true)` → `false`) is **unchanged** under B: `next = false`,
`auto = true`, they differ, so `false` is still stored. Verified by tracing, not assumed.

`src/screens/RepoWindow/useShortcuts.test.ts:62` and `src/screens/RepoWindow/Toolbar.test.tsx:51`
both assert `railOverride === true` after one toggle from a wide window. Unchanged under B — the
first toggle always contradicts the width. Re-run them rather than trusting this paragraph.

---

## Verification (CDP, both tasks)

Drive with `Browser.getWindowForTarget` → `Browser.setWindowBounds`. **Never `browser_resize`** — it
installs a device-metrics emulation override that pins the viewport and leaves the window unable to
reflow; only a `0×0` `setDeviceMetricsOverride` lifts it.

1. Dock, the reported bug: open it, note the height, shrink until it squeezes under 160, restore.
   The dock must come back to its own height with **no toggle**.
2. Dock, still too short: shrink so 160 does not fit; confirm it settles rather than oscillating and
   that `scrollWidth - innerWidth` stays 0. Watch for jitter during the drag itself (R2).
3. Dock, drag: drag to the 160 floor and hold — the recovery must not fight it.
4. Dock, collapsed: collapse, resize both ways, confirm it stays exactly **28** and never self-expands.
5. Rail, the walked path: two presses of `` Ctrl+Shift+` `` at 1280, then narrow to 950 — the sidebar
   must fold. This is the exact sequence that pinned the override on 2026-09-15.
6. Rail, R1's path: toggle the sidebar on at 900, widen to 1400 (where the override turns
   redundant), narrow to 950. The sidebar must fold — that is the normalisation working.
7. Rail, the three entry points: toolbar button, `` Ctrl+Shift+` ``, palette — all three must agree,
   and `aria-pressed` must track the effective state, not the override.
8. The residual, now in scope: drag the dock to 300, narrow to the 700×500 minimum (which squeezes it
   to ~165), then restore. It must come back to **300** — 165 is the value the deleted heuristic
   could not tell from a drag.

Note for whoever walks this: the dock's toggle is `disabled={!last}` (`OutputDock.tsx:38`) until an
op has run, so a dock walk must run something first — `Ctrl+Shift+R` → `status` is read-only and
enough. Three clicks on a disabled button look exactly like a broken panel. `Ctrl+Shift+R` only
*opens* the Run command dialog; the walk has to type `status` into it and press Enter, and running
it auto-opens the dock at 200, so a toggle click straight afterwards closes it again.

### Walk results — 2026-09-15, built app over CDP

| Step | Result |
|---|---|
| 1 dock squeeze/restore | 200 → 32 at 700×360 → **200** ✓ |
| 2 still too short | 146 at 1280×430, stable across two reads, `ov` 0, and no heal fired while shrinking ✓ |
| 2b progressive | 146 → **200** at 1280×520; no further heal once satisfied ✓ |
| 3 drag to the floor | dragged to 160, then grew to 900 and it stayed **160** — the heal does not fight a drag ✓ |
| 4 collapsed | 28 held across 700×360 and 1280×800, never self-expanded ✓ |
| 5 rail, the walked path | two presses at 1280, narrow to 950 → folds ✓ |
| 6 rail, R1's path | on at 900, widen to 1400, narrow to 950 → folds ✓ |
| 7 three entry points | keyboard, toolbar button and palette agree; `aria-pressed` tracks the effective state ✓ |
| 8 the residual | drag to 300 → **198** at 700×500, inside the drag range → back to **300** ✓ |

---

## Post-commit review — four regressions in `918329b`, fixed in the follow-up

The commit was reviewed the same day, by this session and by an independent reviewer that did not
share its assumptions. Four regressions, each confirmed by walking it on a built app, and all one
mistake: the fix replaced *guess the cause from the value* with *guess the cause from one input
device*. Narrower, still a proxy.

**The rule that comes out of it: the gate is a conjunction.** A height is the user's only when a
gesture on the separator asked for the resize **and** the value is one a gesture could have produced.
Each half alone has now been walked failing, in opposite directions.

| # | Regression | Walked |
|---|---|---|
| R6 | A drag below the 94px midpoint snaps to the 28px bar *while the pointer is still down*, so 28 was recorded as the chosen height | open at 200 → drag down → toggle off/on → **28**, for the session |
| R7 | A drag in a group too short for 160 records the squeezed box — `onResize` reports `offsetHeight`, not the clamped layout | 1280×430, drag → 160 recorded → restore → **160**, the chosen 200 gone |
| R8 | Keyboard resize was never recorded, and the heal then actively reverted it | ArrowUp ×6 → 320 → squeeze/restore → **207** |
| R9 | A `pointerdown` with no matching `pointerup` left the flag set, so every later squeeze was recorded | pointerdown, squeeze, restore → **28** |

R6 and R9 both reproduce the original reported symptom: open by state, nothing under the header.
`isDraggedHeight` rejected 28 explicitly and had a test for it — deleting it is what opened R6 and R7.

Also fixed, lower severity:

- The heal observes the **group element** rather than `window`. The group is the height actually
  being shared out, and the tab strip sits outside it, so closing the second tab gives room back with
  no window `resize` to hear.
- Double-click resets the panel to `defaultSize` and arrives after the release, so the gesture is
  armed explicitly for the two frames that resize takes.
- A non-primary button, or a press while the dock is collapsed, no longer arms anything — `disabled`
  on a `Separator` is only `aria-disabled` on a plain div, so it never stopped the event reaching us.
- The clear listeners are registered once for the component instead of one per press.

Two claims in `918329b` were wrong and are corrected here: its message says it closes the 165 case
(it closed the *passive* squeeze path only — the drag path still lost it, R7), and its comment
claimed "a drag is clamped to min/max", which is false for a `collapsible` panel.

**Walked after the fix**, on a build of the follow-up:

| Case | Result |
|---|---|
| R6, drag to the bar | drag down → 28 on screen → toggle off and on → **160**, the lowest legal height the drag crossed, never 28 |
| R7, drag in a group too short for 160 | 1280×400 with the dock reporting 147 → drag → restore → **260**, the chosen height intact |
| R8, keyboard | 6× ArrowUp → 320 → squeeze to 36 → restore → **320** |
| R9, a gesture with no release | pointerdown and no pointerup, squeeze to 36 → restore → **200**: the flag stuck, and the value half held the line |
| The residual, again | drag to 260 → 231 at 700×500, *in range* and correctly ignored because no gesture was in flight → restore → **260** |

The keyboard case needed one fix more than the review predicted. `onResize` arrives from a
ResizeObserver a frame after the key that caused it, so clearing the flag on `keyup` gated off the
very resize it existed to authorise — walked as 320 by keyboard, then healed straight back to 160.
The release is deferred two frames, which the pointer path wants as well: the last `onResize` of a
drag also lands after `pointerup`.

**Unverified by walk.** Synthetic `dblclick` and `Enter` events do not reach the library's own
handlers, though `ArrowUp` dispatched at the same element does, so neither the double-click reset nor
the `Enter` collapse could be driven from the harness: the double-click arming is written but
unproven. The tab-strip trigger is unwalked too — it needs a second repo tab, and `Ctrl+W` closed the
repo instead — but the group observer that replaces the window listener is exercised by every row
above.

**Not reproduced.** The reviewer also reported that `Enter` on the separator collapses the panel
behind the store's back, leaving the heal armed. Sent twice at a focused separator (`role=separator`,
`tabIndex=0`), the dock did not move, while ArrowUp on that same element did. Recorded as unverified
rather than acted on.

~~**Accepted, not fixed.** Rail intent does not survive a width round-trip: force the rail on at 1400,
narrow to 900 where the override turns redundant and is cleared, widen again and the sidebar expands.
That is the cost of option B plus the normalisation, chosen knowingly in R1 — named here rather than
left under the plan's earlier claim that nothing observable is ever thrown away.~~ **Fixed 2026-09-16**
by removing the normalisation (R1's reversal). The override holds through the round trip in both
directions.

**Dock drag onto the bar — fixed 2026-09-16.** A drag that snapped the dock to its bar left the store
open, so the heal reopened it. Also, the 160 the drag crossed on the way down was recorded as the
chosen height. A gesture is now judged once, where it ends: on the bar it closes the store, and inside
160–320 it records the height.

---

## Out of scope

- ~~**The 200 → 165 loss** at the window minimum (Task 1's residual) — needs drag detection.~~
  Closed: the walk forced the drag detection it was waiting on.
- **Persistence.** Both latches are per-session by design; neither task changes that.
- **The drag-lag report**, parked 2026-09-15 at the user's request: never reproduced, every profile
  showed JS idle.
