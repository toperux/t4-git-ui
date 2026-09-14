# Direction B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task is written for a `coder` agent that sees only that task: every name it needs from another task is restated in its **Interfaces** block, and every existing-code fact it relies on is in its **Facts** block (verified against the tree at `c8f56c9`).

**Goal:** Make the repository window usable at 700–1100px wide: one content view at a time (History | Changes), a sidebar rail below 1000px, a toolbar and details pane that adapt to the width, and a Ctrl+K command palette.

**Architecture:** Two small zustand stores hold the new UI state (`viewStore`: which view + the rail override; `paletteStore`: open + recents). A pure `layoutFor(width)` maps the window width to tiers and `useLayout()` subscribes to `resize`. `RepoWindow` picks the view and the sidebar variant; `Toolbar`, `DetailsPane` and `CommitPanel` read the tier and rearrange their existing child components inside `react-resizable-panels` groups. The palette is a portalled listbox fed by pure `buildCommands(ctx)` + `rankCommands(query, commands, recent)`.

**Tech Stack:** React 19 + TypeScript 5.8, zustand 5 (no persist middleware), `react-resizable-panels` 4 (`Group` / `Panel` / `Separator`), CSS modules over `src/theme/tokens.css`, `lucide-react`, vitest 4 + `@testing-library/react` 16 in jsdom. **No `@testing-library/jest-dom`** — assert with `getAttribute` / `hasAttribute` / `textContent`. No `setupFiles`; each test file mocks `../../api/ipc` itself.

**Spec:** `docs/plans/2026-09-14-direction-b-spec.md` (canvas: https://claude.ai/code/artifact/e747c922-c0fa-4143-804b-2d5e09dc7c05)

## Global Constraints

- **Breakpoints** (window `innerWidth`, CSS px): rail below **1000**; toolbar `tight` below **1100**, `icons` below **800**; details `2col` below **1100**, `narrow` below **800**; commit panel `2col` below **800**. Window minimum **700 × 500**.
- **Shortcuts:** `Alt+1` History · `Alt+2` Changes · `Ctrl+K` palette (toggle) · `Alt+0` sidebar toggle. Alt+digit is the layout family (`Alt+3` is reserved for the output dock); Ctrl+digit stays the tabs. Ctrl = ⌘ on macOS (`e.ctrlKey || e.metaKey`, as `useShortcuts.ts` already does). Alt = Option on macOS, where Option+digit types a symbol — match the view keys on `e.code === "Digit1"` / `"Digit2"`, never on `e.key`. Alt combos are otherwise unused in the app. Taken, never reuse: `` Ctrl+` ``, `Ctrl+Tab`, `Ctrl+W`, `Ctrl+T`, `Ctrl+Q`, `Ctrl+1..9`, `Ctrl+B`, `F5`, `Ctrl+F5`, `Ctrl+Shift+{U,L,S,R,N}`.
- **Copy, verbatim:** view labels `History` / `Changes`; changes bar `Changes on <branch> · N unstaged · M staged` + ` · K conflicted` only when K > 0, or `Changes on <branch> · nothing to commit`; empty state `Working tree clean` / `Edit files, or amend the last commit.`; palette placeholder `Type a command, branch, or repository`; palette footer `↑↓ navigate · ↵ run · Esc close`; palette empty `No matching commands`; overflow item `Command palette` kbd `Ctrl+K`; rail buttons `Collapse sidebar` / `Expand sidebar`; disabled reason `Operation in progress` (the toolbar's `BUSY`).
- No emoji in UI text. Every icon button has a `label`. Disabled controls carry the reason in `title`.
- Visual values come from `src/theme/tokens.css` only (names used below all exist there: `--bg-app --bg-panel --bg-elevated --bg-inset --bg-hover --bg-active --scrim --fg --fg-muted --fg-faint --fg-on-accent --accent --border --shadow-1 --shadow-2 --focus-ring --radius-sm/md/lg/pill --space-1..9 --text-xs/sm/lg --weight-regular/medium/semibold --font-mono --control-h --control-h-sm --section-h`). No literal colours.
- **Gates before every commit:** `npm test` (vitest run) and `npx tsc --noEmit` (the build script is `tsc && vite build`; there is no lint script). Rust touched → `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`.
- **Tests:** jsdom's default `window.innerWidth` is 1024 — every test that renders `Toolbar`, `DetailsPane`, `CommitPanel` or `ChangesView` sets `window.innerWidth = 1280` in `beforeEach` unless it is testing a narrower tier. Components that render `Group`/`Panel`/`Separator` need the file-level mock existing tests use (jsdom has no ResizeObserver):
  ```ts
  vi.mock("react-resizable-panels", () => ({
    Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Separator: ({ "aria-label": label }: { "aria-label"?: string }) => <div role="separator" aria-label={label} />,
  }));
  ```
  (The existing files render `Separator` as `null`; the variant above keeps the label so tier tests can find separators. Use it in the new/extended files named below.)
- **Commits:** imperative subject; end the message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Use `git -C "F:/src/_ pet projects/t4-git-ui" …`, never `cd … &&` (the hook refuses it). Never push.

---

## File structure

New:
- `src/screens/RepoWindow/layout.ts` — `layoutFor`, `useWindowWidth`, `useLayout`, breakpoint constants.
- `src/store/viewStore.ts` — `view`, `railOverride`, `setView`, `toggleRail`.
- `src/screens/RepoWindow/ViewSwitch.tsx` + `.module.css`.
- `src/screens/RepoWindow/ChangesView.tsx` + `.module.css`.
- `src/screens/RepoWindow/SidebarRail.tsx` + `.module.css`.
- `src/screens/RepoWindow/SearchPopover.tsx`.
- `src/screens/RepoWindow/CommandPalette/{commands.tsx, rank.ts, paletteStore.ts, CommandPalette.tsx, CommandPalette.module.css}`.

Modified:
- `RepoWindow.tsx`, `Toolbar.tsx` + `.module.css`, `DetailsPane.tsx` + `.module.css`, `CommitPanel/CommitPanel.tsx`, `Sidebar.tsx` + `.module.css`, `useShortcuts.ts`, `actions.ts`, `RevisionGrid/RevisionGrid.tsx`, `RevisionGrid/WorkingTreeRow.tsx`.
- `src/components/ui/ToolbarButton/ToolbarButton.tsx`, `src/components/ui/IconButton/IconButton.tsx`.
- `src-tauri/tauri.conf.json`, `src-tauri/src/commands/window.rs`.
- Docs: `docs/design/style-guide.md`, `src/README.md`, `README.md`, `docs/smoke/smoke-test-post-v1.md`, `docs/plans/open-items.md`.

---

### Task 1: Layout tiers from the window width

**Files:**
- Create: `src/screens/RepoWindow/layout.ts`
- Test: `src/screens/RepoWindow/layout.test.ts`

**Interfaces:**
- Produces: `RAIL_BELOW = 1000`, `TIGHT_BELOW = 1100`, `ICONS_BELOW = 800`; `type ToolbarTier = "full" | "tight" | "icons"`; `type DetailsTier = "3col" | "2col" | "narrow"`; `type CommitTier = "3col" | "2col"`; `interface Layout { toolbar: ToolbarTier; details: DetailsTier; commit: CommitTier; railAuto: boolean }`; `layoutFor(width: number): Layout`; `useWindowWidth(): number`; `useLayout(): Layout` (same object for the same width, safe in effect deps).

- [ ] **Step 1: Write the failing test**

```ts
// src/screens/RepoWindow/layout.test.ts
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { layoutFor, useLayout } from "./layout";

describe("layoutFor", () => {
  it("maps widths to tiers at the documented breakpoints", () => {
    expect(layoutFor(1280)).toEqual({ toolbar: "full", details: "3col", commit: "3col", railAuto: false });
    expect(layoutFor(1100)).toEqual({ toolbar: "full", details: "3col", commit: "3col", railAuto: false });
    expect(layoutFor(1099)).toEqual({ toolbar: "tight", details: "2col", commit: "3col", railAuto: false });
    expect(layoutFor(1000)).toEqual({ toolbar: "tight", details: "2col", commit: "3col", railAuto: false });
    expect(layoutFor(999)).toEqual({ toolbar: "tight", details: "2col", commit: "3col", railAuto: true });
    expect(layoutFor(800)).toEqual({ toolbar: "tight", details: "2col", commit: "3col", railAuto: true });
    expect(layoutFor(799)).toEqual({ toolbar: "icons", details: "narrow", commit: "2col", railAuto: true });
    expect(layoutFor(700)).toEqual({ toolbar: "icons", details: "narrow", commit: "2col", railAuto: true });
  });
});

describe("useLayout", () => {
  it("follows window resizes and returns a stable object per width", () => {
    window.innerWidth = 1280;
    const { result } = renderHook(() => useLayout());
    const first = result.current;
    expect(first.toolbar).toBe("full");
    act(() => {
      window.innerWidth = 720;
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current.toolbar).toBe("icons");
    expect(result.current.railAuto).toBe(true);
    act(() => {
      window.innerWidth = 1280;
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current).toEqual(first);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/screens/RepoWindow/layout.test.ts`
Expected: FAIL — `Failed to resolve import "./layout"`.

- [ ] **Step 3: Implement**

```ts
// src/screens/RepoWindow/layout.ts
// The window width decides how the repository window lays itself out (spec §2, §3, §5, §6). One
// pure function holds the breakpoints; the hook is a plain `resize` subscription.
import { useMemo, useSyncExternalStore } from "react";

/** Below this the sidebar collapses to the rail unless the user overrode it (`viewStore.railOverride`). */
export const RAIL_BELOW = 1000;
/** Below this the operation buttons drop their labels and the details pane goes to two columns. */
export const TIGHT_BELOW = 1100;
/** Below this the toolbar is icons + overflow, the details pane files | diff, the commit panel two columns. */
export const ICONS_BELOW = 800;

export type ToolbarTier = "full" | "tight" | "icons";
export type DetailsTier = "3col" | "2col" | "narrow";
export type CommitTier = "3col" | "2col";

export interface Layout {
  toolbar: ToolbarTier;
  details: DetailsTier;
  commit: CommitTier;
  /** What the width alone says about the sidebar; the user's toggle wins over it. */
  railAuto: boolean;
}

export function layoutFor(width: number): Layout {
  const icons = width < ICONS_BELOW;
  const tight = width < TIGHT_BELOW;
  return {
    toolbar: icons ? "icons" : tight ? "tight" : "full",
    details: icons ? "narrow" : tight ? "2col" : "3col",
    commit: icons ? "2col" : "3col",
    railAuto: width < RAIL_BELOW,
  };
}

const subscribe = (cb: () => void) => {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
};
const read = () => window.innerWidth;

export const useWindowWidth = () => useSyncExternalStore(subscribe, read, read);

export function useLayout(): Layout {
  const w = useWindowWidth();
  return useMemo(() => layoutFor(w), [w]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/screens/RepoWindow/layout.test.ts` → PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git -C "F:/src/_ pet projects/t4-git-ui" add src/screens/RepoWindow/layout.ts src/screens/RepoWindow/layout.test.ts
git -C "F:/src/_ pet projects/t4-git-ui" commit -F - <<'EOF'
feat: Layout tiers from the window width

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 2: View store

**Files:**
- Create: `src/store/viewStore.ts`
- Test: `src/store/viewStore.test.ts`

**Interfaces:**
- Produces: `type View = "history" | "changes"`; `useViewStore` with `{ view: View; railOverride: boolean | null; setView(v: View): void; toggleRail(auto: boolean): void; __resetForTests(): void }`. `toggleRail(auto)` flips the *effective* rail state: effective = `railOverride ?? auto`; after the call `railOverride = !effective`. Session-only (spec §2) — nothing persisted.

**Facts:** stores in this repo are `create<X>()((set, get) => ({...}))` from `zustand` and expose `__resetForTests` (see `src/store/statusStore.ts:239`).

- [ ] **Step 1: Write the failing test**

```ts
// src/store/viewStore.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { useViewStore } from "./viewStore";

beforeEach(() => useViewStore.getState().__resetForTests());

describe("viewStore", () => {
  it("starts on History and switches", () => {
    expect(useViewStore.getState().view).toBe("history");
    useViewStore.getState().setView("changes");
    expect(useViewStore.getState().view).toBe("changes");
  });

  it("toggleRail flips the effective rail state relative to the width's default", () => {
    const st = () => useViewStore.getState();
    expect(st().railOverride).toBeNull();
    st().toggleRail(false); // wide window, sidebar full → collapse
    expect(st().railOverride).toBe(true);
    st().toggleRail(false);
    expect(st().railOverride).toBe(false);
    st().__resetForTests();
    st().toggleRail(true); // narrow window, rail by default → expand
    expect(st().railOverride).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/store/viewStore.test.ts` → FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// src/store/viewStore.ts
// Which content view the repository window shows (spec §1) and the user's sidebar override (§2).
// Per window, per session: a new window starts on History with the width deciding the sidebar.
import { create } from "zustand";

export type View = "history" | "changes";

export interface ViewStore {
  view: View;
  /** `null` = follow the width (`layout.railAuto`); `true` / `false` = the user said so (Alt+0). */
  railOverride: boolean | null;
  setView(view: View): void;
  /** `auto` is what the width would do right now; the toggle flips the effective state. */
  toggleRail(auto: boolean): void;
  __resetForTests(): void;
}

export const useViewStore = create<ViewStore>()((set, get) => ({
  view: "history",
  railOverride: null,
  setView: (view) => set({ view }),
  toggleRail: (auto) => set({ railOverride: !(get().railOverride ?? auto) }),
  __resetForTests: () => set({ view: "history", railOverride: null }),
}));
```

- [ ] **Step 4: Run test** → PASS.

- [ ] **Step 5: Commit** — `feat: View store for the History | Changes switch and the sidebar rail override` (same `git -C … commit -F -` form as Task 1).

---

### Task 3: Window minimum 700 × 500

**Files:**
- Modify: `src-tauri/tauri.conf.json:17-18` (`"minWidth": 900,` / `"minHeight": 600,`)
- Modify: `src-tauri/src/commands/window.rs:29-30` (`const MIN_W: f64 = 900.0;` / `const MIN_H: f64 = 600.0;` — used at line 74 `.min_inner_size(MIN_W, MIN_H)` for spawned windows)

- [ ] **Step 1: Change the four numbers** to `700` / `500` and `700.0` / `500.0`.

- [ ] **Step 2: Verify**

Run: `cargo clippy --manifest-path "F:/src/_ pet projects/t4-git-ui/src-tauri/Cargo.toml" --all-targets -- -D warnings` → clean. `npm run tauri dev`, drag the window down: it stops at 700 × 500 (the layout is still the old one until the later tasks land — expected).

- [ ] **Step 3: Commit** — `feat: Window minimum 700 x 500`.

---

### Task 4: History | Changes view switch

**Files:**
- Create: `src/screens/RepoWindow/ViewSwitch.tsx`, `ViewSwitch.module.css`, `ViewSwitch.test.tsx`
- Create: `src/screens/RepoWindow/ChangesView.tsx`, `ChangesView.module.css`, `ChangesView.test.tsx`
- Modify: `src/screens/RepoWindow/RepoWindow.tsx:45-96`
- Modify: `src/screens/RepoWindow/Toolbar.tsx:311-319` (the Commit `ToolbarButton`), `Toolbar.test.tsx:62-88` (the `Toolbar Commit` describe) and `:108-120` (`Commit clears the path filter too`, inside `Toolbar history chip`)
- Modify: `src/screens/RepoWindow/actions.ts:206-210` (`openCommitPanel`)
- Modify: `src/screens/RepoWindow/RevisionGrid/WorkingTreeRow.tsx:36,48`, `RevisionGrid/RevisionGrid.module.css`, `RevisionGrid/RevisionGrid.tsx:129,193`, `RevisionGrid/RevisionGrid.test.tsx:253,484`
- Modify: `src/screens/RepoWindow/useShortcuts.ts` (+ test)

**Interfaces:**
- Consumes: `useViewStore` (`view`, `setView`, `__resetForTests`) from `src/store/viewStore.ts`.
- Produces: `ViewSwitch({ compact?: boolean })` (compact = icons only; used by Task 6). `ChangesView()` and `ChangesBar()` exported from `ChangesView.tsx`. `openCommitPanel()` in `actions.ts` now also calls `setView("changes")` — the one route into Changes for the grid, the banners, the palette (Task 9).

**Facts:**
- `Toolbar.tsx` reads `changes = useStatusStore(selectChangeCount)`, `merging = useMerging()`, imports `openCommitPanel` and `GitCommitHorizontal`; the Commit button is lines 311–319. `changes` is also used by the Stash menu (`disabled={changes === 0}`) — keep it; `merging` becomes unused.
- `actions.ts:206`:
  ```ts
  export function openCommitPanel() {
    const st = useRepoStore.getState();
    if (st.log.flat) void st.startLog(st.spec, { ...st.filter, text: null, path: null });
    st.selectWorkingTree();
  }
  ```
  Keep that body (a filtered walk hides the working-tree row; clearing the filter is what makes the selection visible) and append the view switch.
- `WorkingTreeRow.tsx:36` is `onMouseDown={() => selectWorkingTree()}`; its author / date / sha cells (lines 48–50) are empty `<div role="gridcell" className={cx(s.meta, s.author)} />` etc. (`.author` is 110px, `.meta` is muted `--text-sm`, `.wt` is the italic muted subject style). `RevisionGrid.test.tsx:253` and `:484` assert the row's exact `textContent` (`Working tree · 3 changes`, `Working tree · merge to commit`). `RevisionGrid.tsx:129` is `if (next === 0 && hasWt) selectWorkingTree();` (keyboard nav — **stays**: switching views there would unmount the grid under the keyboard focus on every ArrowUp/Home onto the row; the row selected in History just shows `No commit selected` in the details); `RevisionGrid.tsx:193` is the empty-repo `Open commit panel` button `onClick={() => selectWorkingTree()}`. A pointer click on the row, `Enter` on it, and that button go through `openCommitPanel` — a plain `selectWorkingTree()` would not switch when the row is already selected (History → click the still-selected row). `onKeyDown` (`:88`) computes `cur` (0 = the working-tree row when `hasWt`) before its `switch`.
- `RepoWindow.tsx` currently: `wtSelected = selectedWt && showWt`, `preview`, `useCommitSync(wtSelected || commitOpen)`, and renders `{wtSelected && !preview ? <CommitPanel /> : <DetailsPane />}` in the lower panel of a vertical `Group` (`s.rows`) under `<StateBanners />`. `useCommitSync` is exported from `./CommitPanel/CommitPanel`.
- `RefsSnapshot.head: HeadInfo { oid: string | null; branch: string | null; detached: boolean }` lives on `useRepoStore((st) => st.refs)`.
- `WorkdirStatus` on `useStatusStore((st) => st.status)`: `{ entries, staged, unstaged, untracked, conflicted, state, ... }`; `selectChangeCount` = staged + unstaged + untracked + conflicted; `useMerging()` from `repoStore`.
- `EmptyState({ icon?, title, hint?, action?, className? })`; `Button({ variant?: "primary"|"secondary"|"ghost"|"danger", size?: "md"|"sm", icon?, ...button props })` — both wrap in `DisabledHint` so `disabled` + `title` show the reason.
- `MessageColumn({ onExpand?, onCommitted?, autoFocus? })` from `./CommitPanel/MessageColumn`; its fields are `aria-label="Summary"` and `aria-label="Body"`.
- `DialogSpec` includes `{ kind: "stashPush" }` and `{ kind: "commit" }`; `useDialogStore((st) => st.open)(spec, { returnFocusTo }?)`.
- `useShortcuts.ts`: one `keydown` listener; bails first on `e.defaultPrevented || dialog open`; a group that works in text fields (`` Ctrl+` ``, Ctrl+Tab, Ctrl+W, Ctrl+T, Ctrl+Shift+N, Ctrl+Q, Ctrl+1..9); then `if (inTextField(e.target)) return;` then `const key = e.key.toLowerCase();` and an `if / else if` chain (F5, Ctrl+F5, Ctrl+Shift+U/L/S/R, Ctrl+B).
- `Toolbar.test.tsx` `beforeEach` sets `useRepoStore` (`repo` + `refs: null`), `useOpsStore`, `useDialogStore`, `useRecentsStore`, `useTabsStore`; it mocks `../../api/ipc`. Three tests click `getByRole("button", { name: "Commit" })`: `Toolbar Commit` (lines 62–88: disabled/enabled, and `clears the search filter first`) and `Commit clears the path filter too` (108–120, inside `Toolbar history chip`) — that button is going away, and once the view is Changes the search box is gone from the toolbar, so the filter tests move to the action itself.
- `cx` is `src/lib/cx.ts`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/screens/RepoWindow/ViewSwitch.test.tsx
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorkdirStatus } from "../../api/types";
import { useStatusStore } from "../../store/statusStore";
import { useViewStore } from "../../store/viewStore";
import { ViewSwitch } from "./ViewSwitch";

const status = (n: Partial<WorkdirStatus>): WorkdirStatus => ({ entries: [], staged: 0, unstaged: 0, untracked: 0, conflicted: 0, state: "clean", ...n }) as WorkdirStatus;

beforeEach(() => {
  useViewStore.getState().__resetForTests();
  useStatusStore.setState({ status: status({ staged: 2, unstaged: 3, untracked: 1 }) });
});
afterEach(cleanup);

describe("ViewSwitch", () => {
  it("is a two-button group: the pressed one is the current view, Changes carries the change count", () => {
    const { getByRole } = render(<ViewSwitch />);
    const history = getByRole("button", { name: "History" });
    const changes = getByRole("button", { name: "Changes, 6 changes" });
    expect(history.getAttribute("aria-pressed")).toBe("true");
    expect(changes.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(changes);
    expect(useViewStore.getState().view).toBe("changes");
    expect(getByRole("button", { name: "Changes, 6 changes" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("compact keeps the names for assistive tech and drops the visible labels", () => {
    const { getByRole, queryByText } = render(<ViewSwitch compact />);
    expect(getByRole("button", { name: "History" })).toBeTruthy();
    expect(queryByText("History")).toBeNull();
  });
});
```

If `WorkdirStatus` has required fields the `status()` helper above misses, add them (read `src/api/types.ts:539`).

```tsx
// src/screens/RepoWindow/ChangesView.test.tsx
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefsSnapshot, WorkdirStatus } from "../../api/types";
import { useDialogStore } from "../../store/dialogStore";
import { useOpsStore } from "../../store/opsStore";
import { useRepoStore } from "../../store/repoStore";
import { useStatusStore } from "../../store/statusStore";
import { useViewStore } from "../../store/viewStore";
import { ChangesBar, ChangesView } from "./ChangesView";

vi.mock("../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/ipc")>();
  return {
    ...actual,
    getStatus: vi.fn(() => new Promise(() => {})),
    getChangedFiles: vi.fn(() => Promise.resolve([])),
    getFileDiff: vi.fn(() => new Promise(() => {})),
    getAuthor: vi.fn(() => Promise.resolve({ name: "Ada", email: "ada@x" })),
    getRefs: vi.fn(() => new Promise(() => {})),
    getLinked: vi.fn(() => Promise.resolve(null)),
  };
});
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(), open: vi.fn() }));
vi.mock("react-resizable-panels", () => ({
  Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Separator: ({ "aria-label": label }: { "aria-label"?: string }) => <div role="separator" aria-label={label} />,
}));

const REFS: RefsSnapshot = { head: { oid: "a", branch: "main", detached: false }, state: "clean", local: [], remotes: [], tags: [], stashes: [] };
const status = (n: Partial<WorkdirStatus>): WorkdirStatus => ({ entries: [], staged: 0, unstaged: 0, untracked: 0, conflicted: 0, state: "clean", ...n }) as WorkdirStatus;

beforeEach(() => {
  window.innerWidth = 1280;
  useViewStore.getState().__resetForTests();
  useRepoStore.setState({ repo: { id: "r", name: "r", path: "/r", head: REFS.head }, refs: REFS });
  useOpsStore.setState({ ops: [], open: false, busy: null });
  useDialogStore.setState({ dialog: null });
});
afterEach(cleanup);

describe("ChangesBar", () => {
  it("names the branch and the counts; conflicts only when there are any", () => {
    useStatusStore.setState({ status: status({ staged: 2, unstaged: 3, untracked: 1, conflicted: 1 }) });
    const { getByText } = render(<ChangesBar />);
    expect(getByText("main")).toBeTruthy();
    expect(getByText("· 4 unstaged · 2 staged · 1 conflicted")).toBeTruthy();
  });
  it("says nothing to commit on a clean tree and disables Stash…", () => {
    useStatusStore.setState({ status: status({}) });
    const { getByText, getByRole } = render(<ChangesBar />);
    expect(getByText("· nothing to commit")).toBeTruthy();
    expect(getByRole("button", { name: "Stash…" }).hasAttribute("disabled")).toBe(true);
  });
  it("Stash… opens the stash dialog, History switches the view", () => {
    useStatusStore.setState({ status: status({ unstaged: 1 }) });
    useViewStore.getState().setView("changes");
    const { getByRole } = render(<ChangesBar />);
    fireEvent.click(getByRole("button", { name: "Stash…" }));
    expect(useDialogStore.getState().dialog).toEqual({ kind: "stashPush" });
    fireEvent.click(getByRole("button", { name: "History" }));
    expect(useViewStore.getState().view).toBe("history");
  });
});

describe("ChangesView", () => {
  it("shows the empty state beside the message column on a clean tree", () => {
    useStatusStore.setState({ status: status({}) });
    const { getByText, getByLabelText } = render(<ChangesView />);
    expect(getByText("Working tree clean")).toBeTruthy();
    expect(getByLabelText("Summary")).toBeTruthy();
  });
});
```

Replace the `Toolbar Commit` describe (lines 62–88) with the two blocks below and delete `Commit clears the path filter too` (108–120):

```tsx
describe("openCommitPanel", () => {
  it("clears the search and path filters first — a filtered walk has no working-tree row to select — and switches to Changes", () => {
    useRepoStore.setState({
      refs: { head: { oid: "a", branch: "main", detached: false }, state: "merge", local: [], remotes: [], tags: [], stashes: [] },
      filter: { text: "lane", path: "a.txt" },
      log: { generation: 1, total: 1, complete: true, error: null, flat: true },
      wtSelected: false,
    });
    act(() => openCommitPanel());
    expect(useRepoStore.getState().filter.text).toBeNull();
    expect(useRepoStore.getState().filter.path).toBeNull();
    expect(useRepoStore.getState().wtSelected).toBe(true);
    expect(useViewStore.getState().view).toBe("changes");
  });
});

describe("Toolbar view switch", () => {
  it("replaces the Commit button: Changes switches the view and is never disabled", () => {
    const { getByRole } = render(<Toolbar />);
    fireEvent.click(getByRole("button", { name: /^Changes/ }));
    expect(useViewStore.getState().view).toBe("changes");
    expect(getByRole("button", { name: /^Changes/ }).hasAttribute("disabled")).toBe(false);
  });
});
```
(import `useViewStore` and `openCommitPanel` from `./actions`; `act` is already imported. Add `useViewStore.getState().__resetForTests();` and `window.innerWidth = 1280;` to that file's `beforeEach`.)

Append to `useShortcuts.test.ts` (and add `useViewStore.getState().__resetForTests()` to its `beforeEach`):

```ts
it("Alt+1 / Alt+2 switch the view; Ctrl+2 still means the second tab", () => {
  renderHook(() => useShortcuts());
  fireEvent.keyDown(window, { key: "2", code: "Digit2", altKey: true });
  expect(useViewStore.getState().view).toBe("changes");
  fireEvent.keyDown(window, { key: "¡", code: "Digit1", altKey: true }); // Option+1 on a Mac keyboard
  expect(useViewStore.getState().view).toBe("history");
  fireEvent.keyDown(window, { key: "2", code: "Digit2", ctrlKey: true });
  expect(useViewStore.getState().view).toBe("history");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/screens/RepoWindow/ViewSwitch.test.tsx src/screens/RepoWindow/ChangesView.test.tsx src/screens/RepoWindow/Toolbar.test.tsx src/screens/RepoWindow/useShortcuts.test.ts` → FAIL (modules missing / view unchanged).

- [ ] **Step 3: ViewSwitch**

```tsx
// src/screens/RepoWindow/ViewSwitch.tsx
import { GitCommitHorizontal, History } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "../../lib/cx";
import { selectChangeCount, useStatusStore } from "../../store/statusStore";
import { useViewStore, type View } from "../../store/viewStore";
import s from "./ViewSwitch.module.css";

/** The History | Changes segmented switch (spec §1). `compact` = icons only (toolbar `icons` tier). */
export function ViewSwitch({ compact = false }: { compact?: boolean }) {
  const view = useViewStore((st) => st.view);
  const setView = useViewStore((st) => st.setView);
  const changes = useStatusStore(selectChangeCount);
  const seg = (v: View, icon: ReactNode, label: string, name: string, kbd: string, count?: number) => (
    <button
      type="button"
      className={cx(s.seg, view === v && s.on)}
      aria-pressed={view === v}
      aria-label={name}
      title={`${label} (${kbd})`}
      onClick={() => setView(v)}
    >
      <span className={s.icon}>{icon}</span>
      {!compact && <span>{label}</span>}
      {count ? <span className={s.cnt}>{count}</span> : null}
    </button>
  );
  const changesName = changes ? `Changes, ${changes} change${changes === 1 ? "" : "s"}` : "Changes";
  return (
    <div className={s.switch} role="group" aria-label="View">
      {seg("history", <History size={14} aria-hidden />, "History", "History", "Alt+1")}
      {seg("changes", <GitCommitHorizontal size={14} aria-hidden />, "Changes", changesName, "Alt+2", changes)}
    </div>
  );
}
```

```css
/* src/screens/RepoWindow/ViewSwitch.module.css — the `.seg` control from the Direction B canvas */
.switch {
  display: inline-flex;
  height: var(--control-h);
  padding: 2px;
  gap: 2px;
  background: var(--bg-inset);
  border-radius: var(--radius-md);
  flex: none;
}
.seg {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 0 var(--space-4);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--fg-muted);
  font: inherit;
  font-weight: var(--weight-medium);
  white-space: nowrap;
  cursor: default;
}
.seg:hover {
  color: var(--fg);
}
.seg:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
.on {
  background: var(--bg-panel);
  color: var(--fg);
  box-shadow: var(--shadow-1);
}
.icon {
  display: inline-flex;
}
.cnt {
  font-size: var(--text-xs);
  color: var(--fg-muted);
  font-variant-numeric: tabular-nums;
}
.on .cnt {
  color: var(--fg);
  opacity: 0.7;
}
```

- [ ] **Step 4: ChangesView**

```tsx
// src/screens/RepoWindow/ChangesView.tsx
import { Archive, CircleCheck, GitCommitHorizontal, History } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { Button } from "../../components/ui/Button/Button";
import { EmptyState } from "../../components/ui/EmptyState/EmptyState";
import { useDialogStore } from "../../store/dialogStore";
import { selectRunning, useOpsStore } from "../../store/opsStore";
import { useMerging, useRepoStore } from "../../store/repoStore";
import { selectChangeCount, useStatusStore } from "../../store/statusStore";
import { useViewStore } from "../../store/viewStore";
import s from "./ChangesView.module.css";
import { CommitPanel } from "./CommitPanel/CommitPanel";
import { MessageColumn } from "./CommitPanel/MessageColumn";
import w from "./RepoWindow.module.css";

/** `Changes on <branch> · N unstaged · M staged [· K conflicted]`, with Stash… and History at the right. */
export function ChangesBar() {
  const head = useRepoStore((st) => st.refs?.head ?? null);
  const status = useStatusStore((st) => st.status);
  const running = useOpsStore(selectRunning);
  const openDialog = useDialogStore((st) => st.open);
  const setView = useViewStore((st) => st.setView);
  const unstaged = status ? status.unstaged + status.untracked : 0;
  const staged = status?.staged ?? 0;
  const conflicted = status?.conflicted ?? 0;
  const total = unstaged + staged + conflicted;
  const counts = total === 0 ? "· nothing to commit" : `· ${unstaged} unstaged · ${staged} staged${conflicted ? ` · ${conflicted} conflicted` : ""}`;
  // No refs yet (still loading) is not a detached head.
  const branch = !head ? "HEAD" : head.detached || !head.branch ? "detached HEAD" : head.branch;
  return (
    <div className={s.bar}>
      <GitCommitHorizontal size={14} aria-hidden />
      <span className={s.title}>
        Changes on <span className={s.branch}>{branch}</span> <span className={s.counts}>{counts}</span>
      </span>
      <Button
        variant="ghost"
        size="sm"
        icon={<Archive size={14} aria-hidden />}
        disabled={running || total === 0}
        title={running ? "Operation in progress" : total === 0 ? "Nothing to stash" : undefined}
        onClick={() => openDialog({ kind: "stashPush" })}
      >
        Stash…
      </Button>
      <Button variant="ghost" size="sm" icon={<History size={14} aria-hidden />} title="History (Alt+1)" onClick={() => setView("history")}>
        History
      </Button>
    </div>
  );
}

/** The Changes view (spec §1): the bar over the commit panel — or, on a clean tree, the empty state beside the message column. */
export function ChangesView() {
  const changes = useStatusStore(selectChangeCount);
  const merging = useMerging();
  const clean = changes === 0 && !merging;
  return (
    <div className={s.view}>
      <ChangesBar />
      {clean ? (
        <Group orientation="horizontal" className={s.pane}>
          <Panel minSize={200} className={w.panel}>
            <EmptyState className={s.empty} icon={<CircleCheck size={24} aria-hidden />} title="Working tree clean" hint="Edit files, or amend the last commit." />
          </Panel>
          <Separator className={w.splitH} aria-label="Resize commit message" />
          <Panel defaultSize={340} minSize={260} maxSize={560} className={w.panel}>
            <MessageColumn />
          </Panel>
        </Group>
      ) : (
        <CommitPanel />
      )}
    </div>
  );
}
```

```css
/* src/screens/RepoWindow/ChangesView.module.css */
.view {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}
/* A PanelHeader-shaped band: the view's one title line. */
.bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: 32px;
  padding: 0 var(--space-4);
  background: var(--bg-app);
  border-bottom: 1px solid var(--border);
  color: var(--fg-muted);
  font-size: var(--text-sm);
  flex: none;
}
.title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--fg);
  font-weight: var(--weight-medium);
}
.branch {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}
.counts {
  color: var(--fg-muted);
  font-weight: var(--weight-regular);
}
.pane {
  flex: 1;
  min-height: 0;
  background: var(--bg-panel);
}
.empty {
  flex: 1;
  align-self: stretch;
  justify-content: center;
}
```

- [ ] **Step 5: `openCommitPanel`, the grid, the toolbar, RepoWindow, the shortcuts**

`actions.ts` — `openCommitPanel` (import `useViewStore` from `../../store/viewStore`):
```ts
/**
 * Into the Changes view with the working-tree row selected: the grid's row and its keyboard nav,
 * the empty-repo button, the banners, the palette. A filtered walk has no working-tree row to
 * select, so the filter is cleared first (the search box follows the store).
 */
export function openCommitPanel() {
  const st = useRepoStore.getState();
  if (st.log.flat) void st.startLog(st.spec, { ...st.filter, text: null, path: null });
  st.selectWorkingTree();
  useViewStore.getState().setView("changes");
}
```

`RevisionGrid/WorkingTreeRow.tsx`: `onMouseDown={openCommitPanel}` (import from `../actions`; drop the `selectWorkingTree` store read if nothing else uses it). The row also says where a click takes you — always visible, plain text, so it works without hover, on every platform, and reads to a screen reader as part of the row: replace the empty author cell (line 48) with
```tsx
      <div role="gridcell" className={cx(s.meta, s.author, s.wtHint)}>
        Open changes →
      </div>
```
and add to `RevisionGrid.module.css` after `.wt`:
```css
/* The working-tree row's right-hand hint: where a click goes (spec §1). Muted like the subject; the selected row lifts it. */
.wtHint {
  font-style: italic;
  white-space: nowrap;
}
.selected .wtHint {
  color: var(--fg);
}
```
`RevisionGrid.test.tsx:253` becomes `expect(rows[0].textContent?.trim()).toBe("Working tree · 3 changesOpen changes →");` and `:484` `…toBe("Working tree · merge to commitOpen changes →");` (cells have no separator in `textContent`; the assertion stays exact). `RevisionGrid/RevisionGrid.tsx`: line 129 stays (`selectWorkingTree()` — keyboard nav only selects). In `onKeyDown`, right before the `switch (e.key)`, add
```ts
    // Enter on the working-tree row is the keyboard's click: into Changes.
    if (e.key === "Enter" && cur === 0 && hasWt) {
      e.preventDefault();
      openCommitPanel();
      return;
    }
```
Line 193: `onClick={openCommitPanel}`; keep the `selectWorkingTree` store read (line 129 still uses it); import `openCommitPanel` from `../actions`. Confirm `actions.ts` does not import from `RevisionGrid/` (it does not at `c8f56c9`) so no cycle appears.

`Toolbar.tsx`: replace lines 311–319 (the Commit `ToolbarButton`) with `<ViewSwitch />` (import from `./ViewSwitch`). Remove `openCommitPanel` from the `./actions` import and the `merging` read + `useMerging` import. Keep `GitCommitHorizontal` (the Repository menu's Commit… item uses it) and `changes` (Stash menu).

`RepoWindow.tsx` — replace the body of `RepoWindow()`:
```tsx
export function RepoWindow() {
  const view = useViewStore((st) => st.view);
  // One status sync serves the panel and the commit dialog (which can open from the toolbar with the panel hidden).
  const commitOpen = useDialogStore((st) => st.dialog?.kind === "commit");
  useCommitSync(view === "changes" || commitOpen);
  const dockOpen = useOpsStore((st) => st.open);
  // With one tab there is nothing to switch to, and the toolbar already names the repository — but a
  // tab dragged here from another window needs somewhere to show its drop caret.
  const stripped = useTabsStore((st) => st.tabs.length > 1 || st.caret !== null);
  useShortcuts();

  return (
    <div className={s.window}>
      {stripped && <TabStrip />}
      <Toolbar />
      <Group orientation="vertical" className={s.main}>
        <Panel minSize={200} className={s.panel}>
          <Group orientation="horizontal" className={s.main}>
            {/* 260 is the design width; the range is wide enough that dragging visibly does something. */}
            <Panel defaultSize={260} minSize={180} maxSize={560} className={s.panel}>
              <Sidebar />
            </Panel>
            <Separator className={s.splitH} aria-label="Resize sidebar" />
            <Panel className={s.content}>
              <StateBanners />
              {/* One view at a time (spec §1). History unmounts while Changes shows: the selection and
                  the reveal request live in the store, and the grid scrolls to them when it comes back. */}
              {view === "changes" ? (
                <ChangesView />
              ) : (
                <Group orientation="vertical" className={s.rows}>
                  <Panel defaultSize="60%" minSize={120} className={s.panel}>
                    <RevisionGrid />
                  </Panel>
                  <Separator className={s.splitV} aria-label="Resize details" />
                  <Panel minSize={120} className={s.panel}>
                    <DetailsPane />
                  </Panel>
                </Group>
              )}
            </Panel>
          </Group>
        </Panel>
        {/* Nothing to resize while the dock is collapsed to its header bar. */}
        <Separator className={s.splitV} aria-label="Resize output" disabled={!dockOpen} />
        <DockPanel open={dockOpen} />
      </Group>
      <RepoStatusBar />
      <DialogHost />
      <ToastStack />
    </div>
  );
}
```
Imports: add `useViewStore` (`../../store/viewStore`) and `ChangesView` (`./ChangesView`); change `import { CommitPanel, useCommitSync }` to `import { useCommitSync }`; drop `useShowWorkingTree` from the statusStore import (`useStatusStore` is still used by `StateBanners` / `RepoStatusBar`). With the working-tree row selected in History, `DetailsPane` renders `CommitDetails`' existing `No commit selected` empty state — nothing to add.

`useShortcuts.ts` — in the `if / else if` chain after `inTextField`, before the `F5` branch:
```ts
      // `code`, not `key`: Option+1 on a Mac keyboard types `¡`.
      const alt = e.altKey && !ctrl && !e.shiftKey;
      if (alt && e.code === "Digit1") {
        e.preventDefault();
        useViewStore.getState().setView("history");
      } else if (alt && e.code === "Digit2") {
        e.preventDefault();
        useViewStore.getState().setView("changes");
      } else if (e.key === "F5" && !ctrl) {
```
(import `useViewStore`; extend the header comment with the two keys).

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run src/screens/RepoWindow && npx tsc --noEmit` → PASS / clean (the `RevisionGrid.test.tsx` rows now carry the hint text).

- [ ] **Step 7: Try it**

`npm run tauri dev`: the switch sits where Commit was; the working-tree row shows `Open changes →` at its right, muted, lit on selection; click Changes → bar + commit panel fill the content area; click a branch in the sidebar while in Changes → still Changes; Alt+1 → grid with that commit selected; click the working-tree row → Changes; Alt+1, click the row again → Changes again; Alt+1, ArrowUp/Home onto the row → still History with `No commit selected`, Enter → Changes; double-click the row → commit dialog. Stash everything → `Working tree clean` beside the message column.

- [ ] **Step 8: Commit** — `feat: History | Changes view switch replaces the always-visible commit panel`.

---

### Task 5: Two-column commit panel below 800

**Files:**
- Modify: `src/screens/RepoWindow/CommitPanel/CommitPanel.tsx:33-51`
- Test: `src/screens/RepoWindow/CommitPanel/CommitPanel.test.tsx` (extend; change its `react-resizable-panels` mock's `Separator` to the labelled variant from Global Constraints)

**Interfaces:**
- Consumes: `useLayout().commit: "3col" | "2col"` from `../layout`.

**Facts:** `CommitPanel()` is a horizontal `Group` (`s.pane`): `Panel 320/220–560 <FilesColumn/>` | `Separator "Resize file lists"` | `Panel min200 <DiffColumn/>` | `Separator "Resize commit message"` | `Panel 340/260–560 <MessageColumn onExpand=…/>`. `w` is `../RepoWindow.module.css` (`w.panel`, `w.splitH`, `w.splitV`). The commit dialog (`dialogs/CommitDialog.tsx`) already stacks files over the message on the left with the diff on the right — that is the arrangement to copy.

- [ ] **Step 1: Write the failing test** (append; `act`, `render`, `getByRole` etc. are imported at the top of the file)

```tsx
describe("CommitPanel columns", () => {
  it("is three columns wide and two below 800", () => {
    window.innerWidth = 1280;
    const { getByRole, queryByRole, rerender } = render(<CommitPanel />);
    expect(getByRole("separator", { name: "Resize commit message" })).toBeTruthy();
    expect(queryByRole("separator", { name: "Resize message row" })).toBeNull();
    act(() => {
      window.innerWidth = 720;
      window.dispatchEvent(new Event("resize"));
    });
    rerender(<CommitPanel />);
    expect(getByRole("separator", { name: "Resize message row" })).toBeTruthy();
    expect(queryByRole("separator", { name: "Resize commit message" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/screens/RepoWindow/CommitPanel/CommitPanel.test.tsx` → FAIL on "Resize message row".

- [ ] **Step 3: Implement**

```tsx
/**
 * The Changes view's panel: Unstaged/Staged 320 | Diff | Message 340 (Commit.mjs) — or, below
 * 800px, the commit dialog's arrangement: files over the message on the left, the diff taking the rest.
 */
export function CommitPanel() {
  const open = useDialogStore((st) => st.open);
  const tier = useLayout().commit;
  const message = <MessageColumn onExpand={(opener) => open({ kind: "commit" }, { returnFocusTo: opener })} />;
  if (tier === "2col")
    return (
      <Group orientation="horizontal" className={s.pane}>
        <Panel defaultSize={280} minSize={220} maxSize={560} className={w.panel}>
          <Group orientation="vertical" className={s.pane}>
            <Panel minSize={120} className={w.panel}>
              <FilesColumn />
            </Panel>
            <Separator className={w.splitV} aria-label="Resize message row" />
            <Panel defaultSize={220} minSize={160} className={w.panel}>
              {message}
            </Panel>
          </Group>
        </Panel>
        <Separator className={w.splitH} aria-label="Resize file lists" />
        <Panel minSize={200} className={w.panel}>
          <DiffColumn />
        </Panel>
      </Group>
    );
  return (
    <Group orientation="horizontal" className={s.pane}>
      <Panel defaultSize={320} minSize={220} maxSize={560} className={w.panel}>
        <FilesColumn />
      </Panel>
      <Separator className={w.splitH} aria-label="Resize file lists" />
      <Panel minSize={200} className={w.panel}>
        <DiffColumn />
      </Panel>
      <Separator className={w.splitH} aria-label="Resize commit message" />
      <Panel defaultSize={340} minSize={260} maxSize={560} className={w.panel}>
        {message}
      </Panel>
    </Group>
  );
}
```
Import `useLayout` from `../layout`. Check the message column's root class in `CommitPanel.module.css` (there is no `MessageColumn.module.css`) scrolls (`overflow: auto`) so a 160px-tall message column still reaches its buttons; add it if missing.

- [ ] **Step 4: Run tests + typecheck, commit** — `feat: Two-column commit panel below 800px`.

---

### Task 6: Adaptive toolbar (labels → icons → overflow) and the palette button

**Files:**
- Modify: `src/components/ui/ToolbarButton/ToolbarButton.tsx:20-24`
- Modify: `src/components/ui/IconButton/IconButton.tsx:6-11` (add `ref` to the props)
- Create: `src/screens/RepoWindow/SearchPopover.tsx`
- Modify: `src/screens/RepoWindow/Toolbar.tsx`, `Toolbar.module.css`
- Test: `src/screens/RepoWindow/Toolbar.test.tsx` (extend)

**Interfaces:**
- Consumes: `useLayout().toolbar` (`./layout`), `ViewSwitch({ compact })` (`./ViewSwitch`), `useTheme()` / `toggleTheme()` from `src/theme/theme.ts`.
- Produces: `ToolbarButton` renders its children inside `<span data-label>`; `IconButtonProps.ref?: Ref<HTMLButtonElement>`; `SearchPopover({ text, onText, spec, onSpec, children? })`. The palette button and the overflow's `Command palette` item are wired by Task 9 — here both `onClick`s are `() => {}` with a `// Task 9: usePaletteStore.getState().setOpen(true)` comment (if Task 9 has already landed, import `usePaletteStore` from `./CommandPalette/paletteStore` and call it directly).

**Facts:**
- `ToolbarButtonProps` already has `ref?: Ref<HTMLButtonElement>` (React 19 passes `ref` as a prop; `IconButtonProps` lacks it, so `<IconButton ref={…}>` is a type error today).
- `Toolbar.tsx` order: repo `Menu` (anchor `ToolbarButton` `s.repo` with `<span className={s.repoName}>` as children) · `ToolbarSeparator` · Fetch split (`tb.split` / `tb.splitMain` / `tb.splitMore`) · Pull (`count={head?.behind}`) · Push (`count={head?.ahead}`) · sep · Branch `Menu` (4 items: Create branch… `Ctrl+B` → `{kind:"createBranch"}`, Checkout… → `{kind:"checkout"}`, Merge… → `{kind:"merge"}`, Rebase… → `{kind:"rebase"}`) · Stash `Menu` · sep · `<ViewSwitch />` (Task 4) · `s.grow` · history chip (`historyPath && <span className={s.history}>…`) · `Input s.search` · `Select s.filter` · sep · Refresh `IconButton` · `<ThemeToggle />` · `<UpdateBadge onClick=…/>` · Settings `IconButton`. Helpers: `opTitle`, `pick(open, close)`, `pickDialog(spec, close, triggerRef)`; refs `repoBtn`, `branchBtn`, `stashBtn`; `BUSY`.
- `Toolbar.module.css`: `.toolbar` (flex, `--toolbar-h`), `.grow`, `.repo`, `.repoName { max-width: 160px; ellipsis }`, `.search { width: 240px }`, `.filter { min-width: 150px }`, `.history { max-width: 220px }`.
- `MenuItem` props: `icon?, danger?, kbd?, submenu?: ReactNode` + button props; `Menu({ open, onClose, anchor, label, children, align?, className? })`; `MenuSeparator`.
- `Input({ icon?, invalid?, className?, ...input props })`; `Select({ value, onChange, children, disabled?, autoFocus?, className?, "aria-label" })`.
- `theme.ts` exports `useTheme(): "light" | "dark"` and `toggleTheme()`; `ThemeToggle` labels are `Switch to light theme` / `Switch to dark theme`.
- Vitest does not apply CSS, so accessible names are unaffected by `display: none` rules; tier tests assert on classes / rendered roles.

- [ ] **Step 1: Write the failing tests** (append to `Toolbar.test.tsx`; its `beforeEach` sets `window.innerWidth = 1280` since Task 4)

```tsx
function setWidth(w: number) {
  act(() => {
    window.innerWidth = w;
    window.dispatchEvent(new Event("resize"));
  });
}

describe("Toolbar tiers", () => {
  it("full: search and filter inline, no overflow menu", () => {
    const { getByRole, queryByRole } = render(<Toolbar />);
    expect(getByRole("searchbox", { name: "Search commits" })).toBeTruthy();
    expect(getByRole("combobox", { name: "Branch filter" })).toBeTruthy();
    expect(queryByRole("button", { name: "More" })).toBeNull();
    expect(getByRole("toolbar").className).not.toMatch(/tight|icons/);
  });
  it("tight: the toolbar carries the tier class and the buttons keep their names", () => {
    window.innerWidth = 1000;
    const { getByRole } = render(<Toolbar />);
    expect(getByRole("toolbar").className).toMatch(/tight/);
    expect(getByRole("button", { name: "Pull" }).querySelector("[data-label]")).toBeTruthy();
    expect(getByRole("button", { name: "Branch" })).toBeTruthy();
  });
  it("icons: search is a button opening a popover; Branch, Stash, Refresh, theme, Settings and the palette fold into More", () => {
    window.innerWidth = 720;
    const { getByRole, queryByRole } = render(<Toolbar />);
    expect(getByRole("toolbar").className).toMatch(/icons/);
    expect(queryByRole("searchbox")).toBeNull();
    expect(queryByRole("button", { name: "Branch" })).toBeNull();
    expect(queryByRole("button", { name: "Settings" })).toBeNull();
    fireEvent.click(getByRole("button", { name: "Search commits" }));
    expect(getByRole("searchbox", { name: "Search commits" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(queryByRole("searchbox")).toBeNull();
    fireEvent.click(getByRole("button", { name: "More" }));
    for (const name of ["Branch", "Stash…", "Refresh", "Switch to dark theme", "Settings", "Command palette"]) {
      expect(getByRole("menuitem", { name: new RegExp(`^${name.replace("…", "\\…")}`) })).toBeTruthy();
    }
    fireEvent.click(getByRole("menuitem", { name: /^Settings/ }));
    expect(useDialogStore.getState().dialog).toEqual({ kind: "settings" });
  });
  it("re-lays out on resize", () => {
    const { getByRole, queryByRole } = render(<Toolbar />);
    expect(queryByRole("button", { name: "More" })).toBeNull();
    setWidth(720);
    expect(getByRole("button", { name: "More" })).toBeTruthy();
  });
  it("Changes view: no search box or filter in the toolbar", () => {
    useViewStore.getState().setView("changes");
    const { queryByRole } = render(<Toolbar />);
    expect(queryByRole("searchbox")).toBeNull();
    expect(queryByRole("combobox", { name: "Branch filter" })).toBeNull();
  });
});
```
The theme item's name depends on the resolved theme (`Switch to dark theme` in jsdom, where the OS counts as light and nothing is stored) — if the test environment has `localStorage.theme` set from another test, clear it in `beforeEach`.

- [ ] **Step 2: Run** `npx vitest run src/screens/RepoWindow/Toolbar.test.tsx` → FAIL on the tier tests.

- [ ] **Step 3: ToolbarButton + IconButton**

`ToolbarButton.tsx:22`: `{children}` → `{children != null && <span data-label>{children}</span>}`.
`IconButton.tsx`: `import type { ButtonHTMLAttributes, Ref } from "react";` and add to `IconButtonProps`:
```ts
  /** The `<button>` itself — a `DisabledHint` wrapper makes it unfindable from the DOM around it. */
  ref?: Ref<HTMLButtonElement>;
```
(`...rest` already spreads it onto the `<button>`.)

- [ ] **Step 4: SearchPopover**

```tsx
// src/screens/RepoWindow/SearchPopover.tsx
import { Search } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "../../components/ui/IconButton/IconButton";
import { Input, Select } from "../../components/ui/Input/Input";
import s from "./Toolbar.module.css";

export interface SearchPopoverProps {
  text: string;
  onText: (text: string) => void;
  spec: "all" | "head";
  onSpec: (spec: string) => void;
  /** The file-history chip, when there is one — it belongs beside the search box. */
  children?: ReactNode;
}

/** The `icons` tier's search: an icon button, and the search box + branch filter in a panel under it. */
export function SearchPopover({ text, onText, spec, onSpec, children }: SearchPopoverProps) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (!open) return;
    const r = btn.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 4, right: window.innerWidth - r.right });
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btn.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <IconButton ref={btn} label="Search commits" on={open || text.trim() !== ""} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Search size={16} aria-hidden />
      </IconButton>
      {open &&
        createPortal(
          <div ref={panel} className={s.searchPopover} style={{ top: at.top, right: at.right }} role="group" aria-label="Search commits">
            {children}
            <Input autoFocus icon={<Search size={14} aria-hidden />} type="search" placeholder="Search commits" aria-label="Search commits" value={text} onChange={(e) => onText(e.target.value)} spellCheck={false} />
            <Select aria-label="Branch filter" value={spec} onChange={(e) => onSpec(e.target.value)}>
              <option value="all">All branches</option>
              <option value="head">HEAD</option>
            </Select>
          </div>,
          document.body,
        )}
    </>
  );
}
```

- [ ] **Step 5: Toolbar tiers**

In `Toolbar.tsx`:
1. Imports: `Command`, `Ellipsis`, `Moon`, `Sun` from `lucide-react`; `cx` from `../../lib/cx`; `useLayout` from `./layout`; `useViewStore` from `../../store/viewStore`; `SearchPopover` from `./SearchPopover`; `toggleTheme, useTheme` from `../../theme/theme`.
2. State: `const tier = useLayout().toolbar; const view = useViewStore((st) => st.view); const theme = useTheme(); const [more, setMore] = useState(false); const moreBtn = useRef<HTMLButtonElement>(null);`
3. Root: `<div className={cx(s.toolbar, tier === "tight" && s.tight, tier === "icons" && s.icons)} role="toolbar" aria-label="Repository">`.
4. Repository button: add `aria-label={repo?.name ?? "Repository"}` so it keeps its name when the CSS hides the text in `icons`.
5. Fetch / Pull / Push / Branch / Stash `ToolbarButton`s: add `s.op` to their `className` (`className={cx(tb.splitMain, s.op)}` on Fetch; `className={s.op}` on the others) — the tight rule hides labels on these only, not the repo name.
6. Branch items become a function so the menu and the overflow submenu render the same rows:
   ```tsx
   const branchItems = (close: () => void, trigger: RefObject<HTMLButtonElement | null>) => (
     <>
       <MenuItem icon={<Plus size={16} aria-hidden />} kbd="Ctrl+B" onClick={pickDialog({ kind: "createBranch" }, close, trigger)}>Create branch…</MenuItem>
       <MenuItem icon={<GitBranch size={16} aria-hidden />} onClick={pickDialog({ kind: "checkout" }, close, trigger)}>Checkout…</MenuItem>
       <MenuItem icon={<GitMerge size={16} aria-hidden />} onClick={pickDialog({ kind: "merge" }, close, trigger)}>Merge…</MenuItem>
       <MenuItem icon={<GitMerge size={16} aria-hidden />} onClick={pickDialog({ kind: "rebase" }, close, trigger)}>Rebase…</MenuItem>
     </>
   );
   ```
   The Branch `Menu`'s children become `{branchItems(() => setBranchMenu(false), branchBtn)}`.
7. Wrap the Branch `Menu` and the Stash `Menu` in `{tier !== "icons" && (…)}`.
8. `<ViewSwitch compact={tier === "icons"} />`.
9. Search block, wrapped in `{view === "history" && (…)}`: lift the history chip into `const historyChip = historyPath ? (<span className={s.history} …>…</span>) : null;` above the return. Then:
   ```tsx
   {view === "history" &&
     (tier === "icons" ? (
       <SearchPopover text={text} onText={setText} spec={specKind === "head" ? "head" : "all"} onSpec={onSpecChange}>
         {historyChip}
       </SearchPopover>
     ) : (
       <>
         {historyChip}
         <Input className={s.search} … />
         <Select className={s.filter} … />
       </>
     ))}
   ```
10. After the trailing `ToolbarSeparator`, first the palette button (every tier):
    ```tsx
    <IconButton label="Command palette" title="Command palette (Ctrl+K)" onClick={() => {}}>
      {/* Task 9: usePaletteStore.getState().setOpen(true) */}
      <Command size={16} aria-hidden />
    </IconButton>
    ```
    then, for `tier !== "icons"`: Refresh · `<ThemeToggle />` · `<UpdateBadge …/>` · Settings (as today). For `icons`: `<UpdateBadge …/>` then:
    ```tsx
    <Menu
      open={more}
      onClose={() => setMore(false)}
      label="More"
      anchor={
        <IconButton ref={moreBtn} label="More" on={more} aria-haspopup="menu" aria-expanded={more} onClick={() => setMore((o) => !o)}>
          <Ellipsis size={16} aria-hidden />
        </IconButton>
      }
    >
      <MenuItem icon={<GitBranch size={16} aria-hidden />} disabled={running} title={running ? BUSY : undefined} submenu={branchItems(() => setMore(false), moreBtn)}>
        Branch
      </MenuItem>
      <MenuItem icon={<Archive size={16} aria-hidden />} kbd="Ctrl+Shift+S" onClick={pickDialog({ kind: "stashes" }, () => setMore(false), moreBtn)}>
        Stash…
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={<RefreshCw size={16} aria-hidden />} kbd="F5" onClick={pick(refreshAll, () => setMore(false))}>
        Refresh
      </MenuItem>
      <MenuItem icon={theme === "dark" ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />} onClick={pick(toggleTheme, () => setMore(false))}>
        {theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      </MenuItem>
      <MenuItem icon={<Settings size={16} aria-hidden />} onClick={pickDialog({ kind: "settings" }, () => setMore(false), moreBtn)}>
        Settings
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={<Command size={16} aria-hidden />} kbd="Ctrl+K" onClick={pick(() => {}, () => setMore(false))}>
        {/* Task 9 wires the palette here too */}
        Command palette
      </MenuItem>
    </Menu>
    ```
    The per-stash rows and Pop/Apply latest stay reachable through the Manage stashes dialog and the palette (Task 9) in the icons tier — the overflow keeps one Stash… entry.

CSS additions to `Toolbar.module.css`:
```css
/* Tight (< 1100): the operation buttons keep icon + count; the search gives way first. */
.tight .op [data-label] {
  display: none;
}
.tight .search {
  width: 140px;
}
.tight .filter {
  min-width: 110px;
}
/* Icons (< 800): repo icon only, no inline search; the rest is in the More menu. */
.icons .op [data-label],
.icons .repoName {
  display: none;
}
.searchPopover {
  position: fixed;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 320px;
  padding: var(--space-3);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-1);
}
.searchPopover .history {
  max-width: none;
}
```
(z-index 20 is the `.menu` layer in `Menu.module.css`; dialogs' scrim is 40.)

- [ ] **Step 6: Run** `npx vitest run src/screens/RepoWindow && npx tsc --noEmit` → PASS / clean. In the app, resize across 1100 and 800: labels go, then the overflow appears; nothing wraps at 700; the Update badge (Settings › Updates, or fake it) does not push the repo name into wrapping.

- [ ] **Step 7: Commit** — `feat: Toolbar drops labels below 1100px and folds into an overflow menu below 800px`.

---

### Task 7: Sidebar rail and flyout

**Files:**
- Create: `src/screens/RepoWindow/SidebarRail.tsx`, `SidebarRail.module.css`, `SidebarRail.test.tsx`
- Modify: `src/screens/RepoWindow/Sidebar.tsx` (`only` + `onCollapse` props, section guards, collapse button), `Sidebar.module.css`, `Sidebar.test.tsx` (extend)
- Modify: `src/screens/RepoWindow/RepoWindow.tsx` (rail vs panel), `RepoWindow.module.css` (`.row`)
- Modify: `src/screens/RepoWindow/useShortcuts.ts` (`Alt+0`) + test

**Interfaces:**
- Consumes: `useViewStore` (`railOverride`, `toggleRail(auto)`), `useLayout().railAuto` and `layoutFor(width).railAuto` from `./layout`, `IconButtonProps.ref` (Task 6).
- Produces: `export type Section = "local" | "remotes" | "tags" | "stashes" | "worktrees" | "submodules"` from `Sidebar.tsx`; `Sidebar({ only?: Section; onCollapse?: () => void })` — `only` renders that one section, open, without the sidebar's own background/border (flyout styling); `SidebarRail()`.

**Facts:**
- `Sidebar.tsx:36` `type Section = …` (not exported); `:151` `export function Sidebar()` with no props; `:164` `const [open, setOpen] = useState<Record<Section, boolean>>({ local: true, remotes: true, tags: false, stashes: false, worktrees: true, submodules: true })`; refs fall back to `[]` at `:195-201` (`local`, `remotes`, `tags`, `stashes`, `worktrees = linked?.worktrees ?? []`, `submodules`); root is `<nav className={cx(s.sidebar, TREE_PANE_CLASS)} aria-label="References">` (`:392`; the `Loading branches…` variant at `:386`); sections are `SectionHeader title="Local" …` + `{open.local && …}` etc., Worktrees guarded by `worktrees.length > 1`, Submodules by `submodules.length > 0`; trees are `<Tree label="Local branches">`, `"Remote branches"`, `"Tags"`, `"Stashes"`, `"Worktrees"`, `"Submodules"` (`role="tree"` with that `aria-label`).
- `Sidebar.test.tsx` has a `REFS: RefsSnapshot` fixture (`main` HEAD + `feature/panels`, remotes `origin` / `fork`, one tag, no stashes) and a `beforeEach` setting `useRepoStore.setState({ refs: REFS, linked: null, remoteTags: {} })` and `useSettingsStore`.
- `Sidebar.module.css` has `.sidebar` (flex column, `--bg-app`, `border-right`).
- `RepoWindow.tsx` (after Task 4) renders `<Panel defaultSize={260} minSize={180} maxSize={560} className={s.panel}><Sidebar /></Panel><Separator className={s.splitH} aria-label="Resize sidebar" />` inside the horizontal `Group`.
- `useShortcuts.ts`: the "works in text fields" group is the block between `const ctrl = …` and `if (inTextField(e.target)) return;`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/screens/RepoWindow/SidebarRail.test.tsx
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefsSnapshot } from "../../api/types";
import { useDialogStore } from "../../store/dialogStore";
import { useRepoStore } from "../../store/repoStore";
import { DEFAULT_FOLDERS_MAX, useSettingsStore } from "../../store/settingsStore";
import { useViewStore } from "../../store/viewStore";
import { SidebarRail } from "./SidebarRail";

vi.mock("../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/ipc")>();
  return { ...actual, getRefs: vi.fn(() => new Promise(() => {})), getLinked: vi.fn(() => Promise.resolve(null)), getStatus: vi.fn(() => new Promise(() => {})) };
});
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(), open: vi.fn() }));

const branch = (name: string, isHead = false) => ({ name, oid: name, upstream: null, gone: false, mergedInto: null, ahead: 0, behind: 0, isHead });
const REFS: RefsSnapshot = {
  head: { oid: "main", branch: "main", detached: false },
  state: "clean",
  local: [branch("main", true), branch("feature/panels")],
  remotes: [{ name: "origin", url: null, branches: [{ name: "origin/main", oid: "main", mergedInto: null }] }],
  tags: [],
  stashes: [{ index: 0, oid: "s0", message: "WIP", baseOid: "main", time: 0, hasUntracked: false }],
};

beforeEach(() => {
  window.innerWidth = 720;
  useViewStore.getState().__resetForTests();
  useRepoStore.setState({ refs: REFS, linked: null, remoteTags: {} });
  useDialogStore.setState({ dialog: null });
  useSettingsStore.setState({ sidebarFolders: "expanded", sidebarFoldersMax: DEFAULT_FOLDERS_MAX });
});
afterEach(cleanup);

describe("SidebarRail", () => {
  it("one button per section with its count; a click opens that section alone as a flyout; Escape closes it", () => {
    const { getByRole, queryByRole } = render(<SidebarRail />);
    expect(getByRole("button", { name: "Local, 2" })).toBeTruthy();
    expect(getByRole("button", { name: "Remotes, 1" })).toBeTruthy();
    expect(getByRole("button", { name: "Stashes, 1" })).toBeTruthy();
    expect(queryByRole("button", { name: /^Worktrees/ })).toBeNull();
    expect(queryByRole("tree")).toBeNull();
    fireEvent.click(getByRole("button", { name: "Local, 2" }));
    expect(getByRole("tree", { name: "Local branches" })).toBeTruthy();
    expect(queryByRole("tree", { name: "Remote branches" })).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(queryByRole("tree")).toBeNull();
  });
  it("the bottom button expands the sidebar", () => {
    const { getByRole } = render(<SidebarRail />);
    fireEvent.click(getByRole("button", { name: "Expand sidebar" }));
    expect(useViewStore.getState().railOverride).toBe(false);
  });
});
```

Append to `Sidebar.test.tsx`:
```tsx
describe("Sidebar only", () => {
  it("renders that one section, open, and a collapse button when asked", () => {
    const onCollapse = vi.fn();
    const { getByRole, queryByRole } = render(<Sidebar only="remotes" onCollapse={onCollapse} />);
    expect(getByRole("tree", { name: "Remote branches" })).toBeTruthy();
    expect(queryByRole("tree", { name: "Local branches" })).toBeNull();
    expect(queryByRole("button", { name: /^Tags/ })).toBeNull();
    fireEvent.click(getByRole("button", { name: "Collapse sidebar" }));
    expect(onCollapse).toHaveBeenCalled();
  });
});
```

Append to `useShortcuts.test.ts`:
```ts
it("Alt+0 toggles the sidebar rail, even from a text field", () => {
  window.innerWidth = 1280;
  renderHook(() => useShortcuts());
  const input = document.body.appendChild(document.createElement("input"));
  fireEvent.keyDown(input, { key: "0", code: "Digit0", altKey: true });
  expect(useViewStore.getState().railOverride).toBe(true);
  input.remove();
});
```

- [ ] **Step 2: Run** the three files → FAIL.

- [ ] **Step 3: `Sidebar` gains `only` and `onCollapse`**

- `export type Section = …`.
- Signature: `export function Sidebar({ only, onCollapse }: { only?: Section; onCollapse?: () => void } = {})`.
- `open` initialiser: `useState<Record<Section, boolean>>(() => ({ local: true, remotes: true, tags: false, stashes: false, worktrees: true, submodules: true, ...(only ? { [only]: true } : {}) }))`.
- `const show = (k: Section) => !only || only === k;` and guard each section: `{show("local") && (<> <SectionHeader title="Local" …/> {open.local && …} </>)}` — six guards; for Worktrees / Submodules combine with the existing length guards (`show("worktrees") && worktrees.length > 1 && …`).
- Root class on both `<nav>`s: `cx(s.sidebar, only && s.flyout, TREE_PANE_CLASS)`.
- Collapse button, first child of the loaded `<nav>` when `onCollapse` is given:
  ```tsx
  {onCollapse && (
    <div className={s.collapseRow}>
      <IconButton label="Collapse sidebar" title="Collapse sidebar (Alt+0)" onClick={onCollapse}>
        <PanelLeft size={14} aria-hidden />
      </IconButton>
    </div>
  )}
  ```
  (`PanelLeft` from lucide.)
- `Sidebar.module.css`:
  ```css
  /* Inside the rail's flyout the panel around it draws the surface. */
  .flyout {
    background: transparent;
    border-right: 0;
  }
  .collapseRow {
    display: flex;
    justify-content: flex-end;
    padding: var(--space-1) var(--space-3) 0;
  }
  ```

- [ ] **Step 4: SidebarRail**

```tsx
// src/screens/RepoWindow/SidebarRail.tsx
import { Archive, Cloud, FolderGit2, GitBranch, Package, PanelLeft, Tag } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../../lib/cx";
import { useRepoStore } from "../../store/repoStore";
import { useViewStore } from "../../store/viewStore";
import { useLayout } from "./layout";
import { Sidebar, type Section } from "./Sidebar";
import s from "./SidebarRail.module.css";

/** The sidebar collapsed to one button per section (spec §2); a click opens that section as a flyout. */
export function SidebarRail() {
  const refs = useRepoStore((st) => st.refs);
  const linked = useRepoStore((st) => st.linked);
  const toggleRail = useViewStore((st) => st.toggleRail);
  const railAuto = useLayout().railAuto;
  const [open, setOpen] = useState<Section | null>(null);
  const rail = useRef<HTMLElement>(null);
  const flyout = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!flyout.current?.contains(t) && !rail.current?.contains(t)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const worktrees = linked?.worktrees ?? [];
  const submodules = linked?.submodules ?? [];
  const btn = (section: Section, icon: ReactNode, title: string, count: number) => (
    <button
      type="button"
      className={cx(s.btn, open === section && s.on)}
      aria-label={`${title}, ${count}`}
      aria-expanded={open === section}
      title={title}
      onClick={() => setOpen((o) => (o === section ? null : section))}
    >
      {icon}
      {count > 0 && <span className={s.n}>{count}</span>}
    </button>
  );

  return (
    <div className={s.wrap}>
      {/* A nav, not a `toolbar`: that role promises arrow-key movement between the buttons. */}
      <nav ref={rail} className={s.rail} aria-label="Sidebar sections">
        {btn("local", <GitBranch size={16} aria-hidden />, "Local", refs?.local.length ?? 0)}
        {btn("remotes", <Cloud size={16} aria-hidden />, "Remotes", (refs?.remotes ?? []).reduce((n, r) => n + r.branches.length, 0))}
        {btn("tags", <Tag size={16} aria-hidden />, "Tags", refs?.tags.length ?? 0)}
        {btn("stashes", <Archive size={16} aria-hidden />, "Stashes", refs?.stashes.length ?? 0)}
        {worktrees.length > 1 && btn("worktrees", <FolderGit2 size={16} aria-hidden />, "Worktrees", worktrees.length)}
        {submodules.length > 0 && btn("submodules", <Package size={16} aria-hidden />, "Submodules", submodules.length)}
        <div className={s.grow} />
        <button type="button" className={s.btn} aria-label="Expand sidebar" title="Expand sidebar (Alt+0)" onClick={() => toggleRail(railAuto)}>
          <PanelLeft size={16} aria-hidden />
        </button>
      </nav>
      {open && (
        <div ref={flyout} className={s.flyout}>
          <Sidebar only={open} />
        </div>
      )}
    </div>
  );
}
```

```css
/* src/screens/RepoWindow/SidebarRail.module.css — 36px rail, the `.rail-btn` from the canvas */
.wrap {
  position: relative;
  display: flex;
  flex: none;
  height: 100%;
}
.rail {
  width: 36px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-2) 0;
  background: var(--bg-app);
  border-right: 1px solid var(--border);
}
.btn {
  position: relative;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--fg-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: default;
}
.btn:hover {
  background: var(--bg-hover);
  color: var(--fg);
}
.btn:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
.on {
  background: var(--bg-active);
  color: var(--fg);
}
.n {
  position: absolute;
  top: -2px;
  right: -3px;
  height: 13px;
  min-width: 13px;
  padding: 0 3px;
  border-radius: var(--radius-pill);
  background: var(--bg-inset);
  color: var(--fg-muted);
  font-size: 9px;
  line-height: 13px;
  font-weight: var(--weight-semibold);
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.grow {
  flex: 1;
}
/* Elevated over the content; the Sidebar inside draws its own tree on this surface. */
.flyout {
  position: absolute;
  left: 40px;
  top: var(--space-2);
  width: 260px;
  max-height: calc(100% - var(--space-2) * 2);
  display: flex;
  z-index: 20;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-1);
  overflow: hidden;
}
```

- [ ] **Step 5: RepoWindow picks rail or panel; `Alt+0`**

`RepoWindow.tsx`: read `const railAuto = useLayout().railAuto; const railOverride = useViewStore((st) => st.railOverride); const toggleRail = useViewStore((st) => st.toggleRail); const rail = railOverride ?? railAuto;`. Wrap the horizontal `Group` in a flex row with the rail before it, and make the sidebar `Panel` + `Separator` conditional *inside the live group* — `react-resizable-panels` 4 supports conditionally rendered panels (its `.d.ts` says so on the `Group` layout props). **No `key` on the group**: a remount would throw away the grid's scroll position and the details pane every time Alt+0 is pressed or the width crosses 1000.
```tsx
<div className={s.row}>
  {rail && <SidebarRail />}
  <Group orientation="horizontal" className={s.main}>
    {!rail && (
      <>
        <Panel defaultSize={260} minSize={180} maxSize={560} className={s.panel}>
          <Sidebar onCollapse={() => toggleRail(railAuto)} />
        </Panel>
        <Separator className={s.splitH} aria-label="Resize sidebar" />
      </>
    )}
    <Panel className={s.content}>…unchanged…</Panel>
  </Group>
</div>
```
`RepoWindow.module.css`: add `.row { display: flex; flex: 1; min-width: 0; min-height: 0; }` and `min-width: 0;` to `.main` (it is now a flex-row child too). The sidebar's dragged width resets when it comes back, which is fine. Imports: `SidebarRail`, `useLayout`.

`useShortcuts.ts`, in the "works in text fields" group (Alt+digit types nothing into a field). Match `e.code`, not `e.key`, like Alt+1/2 in Task 4:
```ts
      if (e.altKey && !ctrl && !e.shiftKey && e.code === "Digit0") {
        e.preventDefault();
        useViewStore.getState().toggleRail(layoutFor(window.innerWidth).railAuto);
        return;
      }
```
(import `layoutFor` from `./layout`.)

- [ ] **Step 6: Run** `npx vitest run src/screens/RepoWindow && npx tsc --noEmit`. In the app: below 1000 → rail with counts; Local → flyout; double-click a branch → checkout, flyout stays until Esc / outside click; `Alt+0` at 1280 → rail, again → full; the override survives resizing across 1000.

- [ ] **Step 7: Commit** — `feat: Sidebar rail below 1000px with per-section flyouts, Alt+0 toggle`.

---

### Task 8: Details pane tiers

**Files:**
- Modify: `src/screens/RepoWindow/DetailsPane.tsx:23-69` (`DetailsPane()`), `DetailsPane.module.css`
- Test: `src/screens/RepoWindow/DetailsPane.test.tsx` (extend; switch its `react-resizable-panels` mock's `Separator` to the labelled variant)

**Interfaces:**
- Consumes: `useLayout().details: "3col" | "2col" | "narrow"`.

**Facts:**
- `DetailsPane()` computes `target` / `rowPath`, runs `load`, and returns a horizontal `Group` (`s.pane`): `Panel 340/240–560 {preview ? <StashDetails stash={preview}/> : compare ? <CompareDetails compare={compare}/> : <CommitDetails/>}` | `Separator "Resize commit details"` | `Panel 320/200–640 <ChangedFileList/>` (its header needs 199px) | `Separator "Resize file list"` | `Panel min200 <CommitDiff onExpand={target ? (opener) => open({kind:"diff"}, {returnFocusTo: opener}) : undefined}/>`.
- `CommitDetails` shows the summary in `.summary` and an `Author` row `Ada <ada@x>` from the test fixture (`DETAIL`); the test file selects `ROW` (`summary: "Ship it"`) through `useRepoStore.setState` — reuse its existing arrangement (read the file's first `describe` for the exact `setState`).
- `useRepoStore`: `rows: (LogRow | undefined)[]`, `selectedIndex`, `preview: Stash | null` (`message`, `index`), `compare` via `selectCompare` → `{ from: CommitInfo; to: CommitInfo } | null`; `CommitInfo` has `summary`, `short`.
- `w.mono` exists in `RepoWindow.module.css`.

- [ ] **Step 1: Write the failing test** (append; `act`, `fireEvent`, `render` are imported at the top)

```tsx
describe("DetailsPane tiers", () => {
  it("three columns wide, details over files at 1000, files beside the diff with a collapsed header at 720", async () => {
    // Use the same store setup the first test in this file uses to select ROW.
    window.innerWidth = 1280;
    const { getByRole, queryByRole, findByText, queryByText, rerender } = render(<DetailsPane />);
    await findByText("Ship it");
    expect(getByRole("separator", { name: "Resize commit details" })).toBeTruthy();
    expect(getByRole("separator", { name: "Resize file list" })).toBeTruthy();

    act(() => { window.innerWidth = 1000; window.dispatchEvent(new Event("resize")); });
    rerender(<DetailsPane />);
    expect(getByRole("separator", { name: "Resize commit details" })).toBeTruthy();
    expect(getByRole("separator", { name: "Resize side column" })).toBeTruthy();
    expect(queryByRole("separator", { name: "Resize file list" })).toBeNull();

    act(() => { window.innerWidth = 720; window.dispatchEvent(new Event("resize")); });
    rerender(<DetailsPane />);
    expect(queryByRole("separator", { name: "Resize commit details" })).toBeNull();
    expect(queryByText(/Ada <ada@x>/)).toBeNull();
    fireEvent.click(getByRole("button", { name: "Show commit details: Ship it" }));
    await findByText(/Ada <ada@x>/);
    expect(getByRole("button", { name: "Hide commit details: Ship it" })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement**

Replace the `return` of `DetailsPane()` with:
```tsx
  const tier = useLayout().details;
  const [expanded, setExpanded] = useState(false);
  const details = preview ? <StashDetails stash={preview} /> : compare ? <CompareDetails compare={compare} /> : <CommitDetails />;
  const diff = <CommitDiff onExpand={target ? (opener) => open({ kind: "diff" }, { returnFocusTo: opener }) : undefined} />;

  if (tier === "3col")
    return (
      <Group orientation="horizontal" className={s.pane}>
        <Panel defaultSize={340} minSize={240} maxSize={560} className={w.panel}>
          {details}
        </Panel>
        <Separator className={w.splitH} aria-label="Resize commit details" />
        {/* 200: the list header (icon, Changes | Files, two toggles) needs 199px before the title gets any. */}
        <Panel defaultSize={320} minSize={200} maxSize={640} className={w.panel}>
          <ChangedFileList />
        </Panel>
        <Separator className={w.splitH} aria-label="Resize file list" />
        <Panel minSize={200} className={w.panel}>
          {diff}
        </Panel>
      </Group>
    );
  if (tier === "2col")
    return (
      <Group orientation="horizontal" className={s.pane}>
        <Panel defaultSize={300} minSize={240} maxSize={560} className={w.panel}>
          <Group orientation="vertical" className={s.pane}>
            <Panel defaultSize="50%" minSize={80} className={w.panel}>
              {details}
            </Panel>
            <Separator className={w.splitV} aria-label="Resize commit details" />
            <Panel minSize={80} className={w.panel}>
              <ChangedFileList />
            </Panel>
          </Group>
        </Panel>
        <Separator className={w.splitH} aria-label="Resize side column" />
        <Panel minSize={200} className={w.panel}>
          {diff}
        </Panel>
      </Group>
    );
  // narrow (spec §5): the file list beside the diff, the details folded to one line above it.
  return (
    <Group orientation="horizontal" className={s.pane}>
      <Panel defaultSize={220} minSize={200} maxSize={480} className={w.panel}>
        <div className={s.narrowCol}>
          <DetailsHeaderCollapsed expanded={expanded} onToggle={() => setExpanded((e) => !e)} />
          {expanded && <div className={s.narrowDetails}>{details}</div>}
          <ChangedFileList />
        </div>
      </Panel>
      <Separator className={w.splitH} aria-label="Resize side column" />
      <Panel minSize={200} className={w.panel}>
        {diff}
      </Panel>
    </Group>
  );
```
Add `useState` to the react import and `useLayout` from `./layout`. The header, in the same file:
```tsx
/** `> <subject> <sha>` — the commit details folded to one line; a click shows them over the file list. */
function DetailsHeaderCollapsed({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  // `selectWorkingTree` keeps `selectedIndex`, so the working-tree row must blank this like `selectSelectedOid` does.
  const commit = useRepoStore((st) => (st.wtSelected || st.selectedIndex === null ? null : (st.rows[st.selectedIndex]?.row.commit ?? null)));
  const preview = useRepoStore((st) => st.preview);
  const compare = useRepoStore(selectCompare);
  const subject = preview ? preview.message : compare ? "Compare" : (commit?.summary ?? "No commit selected");
  const sha = preview ? `stash@{${preview.index}}` : compare ? `${compare.from.short}..${compare.to.short}` : (commit?.short ?? "");
  return (
    <button type="button" className={s.collapsedHead} aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "Show"} commit details: ${subject}`} onClick={onToggle}>
      {expanded ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
      <span className={s.collapsedSubject}>{subject}</span>
      <span className={w.mono}>{sha}</span>
    </button>
  );
}
```
(`ChevronDown`, `ChevronRight` from lucide.)

`DetailsPane.module.css` additions:
```css
.narrowCol {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.collapsedHead {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: var(--section-h);
  padding: 0 var(--space-3);
  border: 0;
  border-bottom: 1px solid var(--border);
  background: var(--bg-app);
  color: var(--fg);
  font: inherit;
  font-size: var(--text-sm);
  font-weight: var(--weight-medium);
  text-align: left;
  cursor: default;
  flex: none;
}
.collapsedHead:hover {
  background: var(--bg-hover);
}
.collapsedHead:focus-visible {
  outline: none;
  box-shadow: inset var(--focus-ring);
}
.collapsedSubject {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.narrowDetails {
  display: flex;
  max-height: 50%;
  border-bottom: 1px solid var(--border);
  overflow: auto;
  flex: none;
}
```

- [ ] **Step 4: Run tests + typecheck; in the app at 1000 and 720** the file list stays beside the diff, the collapsed header expands the details over the list. **Commit** — `feat: Details pane goes to two columns below 1100px and files | diff below 800px`.

---

### Task 9: Command palette

**Files:**
- Create: `src/screens/RepoWindow/CommandPalette/paletteStore.ts`, `rank.ts`, `commands.tsx`, `CommandPalette.tsx`, `CommandPalette.module.css`, `rank.test.ts`, `CommandPalette.test.tsx`
- Modify: `RepoWindow.tsx` (mount), `Toolbar.tsx` (the two `() => {}` placeholders from Task 6), `useShortcuts.ts` (+ test)

**Interfaces:**
- Consumes: `useViewStore.setView/toggleRail`, `layoutFor` (`../layout`), `openCommitPanel` and the other `actions.ts` exports listed in Facts.
- Produces:
  ```ts
  export type Group = "Recent" | "Views" | "Repository" | "Branch" | "Stash" | "Network" | "Go to branch" | "Repositories" | "Window";
  export interface Command { id: string; group: Group; label: string; icon?: ReactNode; kbd?: string; disabled?: string; run(): void }
  export function buildCommands(ctx: CommandContext): Command[];
  export function score(query: string, label: string): 0 | 1 | 2 | 3;
  export function rankCommands(query: string, commands: Command[], recentIds: string[]): Command[];
  export const usePaletteStore: { open: boolean; recent: string[]; setOpen(open: boolean): void; markRun(id: string): void; __resetForTests(): void };
  export function CommandPalette(): JSX.Element | null;
  ```

**Facts:**
- `actions.ts` exports: `fetchDefault(): Promise`, `stashApply(index: number)`, `stashPop(index: number)`, `openCommitPanel()` (Task 4: selects the working tree and switches to Changes), `switchRepo(path)`, `pickAndOpenRepo(): Promise`, `closeTab()`, `detachTab()`, `refreshAll()`. There is **no** `checkoutBranch` dialog kind — the toolbar's Checkout… opens `{ kind: "checkout" }`; Merge… `{ kind: "merge" }`; Rebase… `{ kind: "rebase" }`; Create branch… `{ kind: "createBranch" }`; `{ kind: "stashPush" }`, `{ kind: "stashes" }`, `{ kind: "commit" }`, `{ kind: "addRemote" }`, `{ kind: "addWorktree" }`, `{ kind: "runCommand" }`, `{ kind: "settings" }`, `{ kind: "pull" }`, `{ kind: "push" }` all take no fields.
- `useOpsStore`: `selectRunning(s) = s.busy !== null`; tests set `useOpsStore.setState({ busy: "Fetching…" })`.
- `useRecentsStore((st) => st.recents): RecentRepo[]` with `path`, `name`, `pinned`, `lastOpened`.
- `useTabsStore((st) => st.tabs.length)` — the toolbar disables *Move to new window* with `tabCount < 2` and the title `This tab is the only one in this window`.
- `useRepoStore`: `repo?.path`, `refs?.local: Branch[]` (`name`, `oid`), `refs?.remotes: Remote[]` (`name`, `branches: RemoteBranch[]` whose `name` already includes the remote: `origin/main`), `refs?.stashes: Stash[]` (`index`, `message`), `revealOid(oid): Promise<boolean>`.
- `Kbd({ children })` from `src/components/ui/Kbd/Kbd.tsx`.
- `useShortcuts.ts` bails at the top on `useDialogStore.getState().dialog`; the "works in text fields" group precedes `inTextField`.
- Existing behaviour to keep: `Toolbar.test.tsx` and `useShortcuts.test.ts` mock `@tauri-apps/plugin-dialog` / `plugin-clipboard-manager` because `actions.ts` imports them — the palette test needs the same mocks.
- React 19 `useId()` returns ids like `«r1»`; find elements with `document.getElementById`, never a CSS selector.

- [ ] **Step 1: Write the failing tests**

```ts
// src/screens/RepoWindow/CommandPalette/rank.test.ts
import { describe, expect, it } from "vitest";
import type { Command } from "./commands";
import { rankCommands, score } from "./rank";

const cmd = (id: string, group: Command["group"], label: string): Command => ({ id, group, label, run: () => {} });
const all = [
  cmd("view.history", "Views", "History"),
  cmd("view.changes", "Views", "Changes"),
  cmd("stash.push", "Stash", "Stash changes…"),
  cmd("stash.manage", "Stash", "Manage stashes…"),
  cmd("repo.run", "Repository", "Run git command…"),
  cmd("goto.feature/lane-graph", "Go to branch", "feature/lane-graph"),
];

describe("score", () => {
  it("prefix > word start > subsequence > none", () => {
    expect(score("st", "Stash changes…")).toBe(3);
    expect(score("st", "Manage stashes…")).toBe(2);
    expect(score("st", "History")).toBe(1);
    expect(score("st", "Changes")).toBe(0);
    expect(score("lgr", "feature/lane-graph")).toBe(1);
    expect(score("graph", "feature/lane-graph")).toBe(2);
  });
});

describe("rankCommands", () => {
  it("empty query: Recent first (newest first), then every group in order", () => {
    const out = rankCommands("", all, ["repo.run", "stash.push"]);
    expect(out.slice(0, 2).map((c) => [c.group, c.id])).toEqual([["Recent", "repo.run"], ["Recent", "stash.push"]]);
    expect(out.slice(2).map((c) => c.id)).toEqual(["view.history", "view.changes", "repo.run", "stash.push", "stash.manage", "goto.feature/lane-graph"]);
  });
  it("a query: best score first, ties in group order, no Recent group, no misses", () => {
    expect(rankCommands("st", all, ["repo.run"]).map((c) => c.id)).toEqual(["stash.push", "stash.manage", "view.history"]);
    expect(rankCommands("lgr", all, []).map((c) => c.id)).toEqual(["goto.feature/lane-graph"]);
    expect(rankCommands("zzz", all, [])).toEqual([]);
  });
});
```

```tsx
// src/screens/RepoWindow/CommandPalette/CommandPalette.test.tsx
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RefsSnapshot } from "../../../api/types";
import { useDialogStore } from "../../../store/dialogStore";
import { useOpsStore } from "../../../store/opsStore";
import { useRecentsStore } from "../../../store/recentsStore";
import { useRepoStore } from "../../../store/repoStore";
import { useStatusStore } from "../../../store/statusStore";
import { useTabsStore } from "../../../store/tabsStore";
import { useViewStore } from "../../../store/viewStore";
import { CommandPalette } from "./CommandPalette";
import { usePaletteStore } from "./paletteStore";

vi.mock("../../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../api/ipc")>();
  return { ...actual, getRefs: vi.fn(() => new Promise(() => {})), getStatus: vi.fn(() => new Promise(() => {})), startLog: vi.fn(() => Promise.resolve(1)) };
});
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask: vi.fn(), open: vi.fn() }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: vi.fn() }));

const REFS: RefsSnapshot = {
  head: { oid: "a", branch: "main", detached: false },
  state: "clean",
  local: [{ name: "main", oid: "a", upstream: null, gone: false, mergedInto: null, ahead: 0, behind: 0, isHead: true }],
  remotes: [{ name: "origin", url: null, branches: [{ name: "origin/main", oid: "a", mergedInto: null }] }],
  tags: [],
  stashes: [],
};

beforeEach(() => {
  usePaletteStore.getState().__resetForTests();
  useViewStore.getState().__resetForTests();
  useDialogStore.setState({ dialog: null });
  useOpsStore.setState({ ops: [], open: false, busy: null });
  useRecentsStore.setState({ recents: [] });
  useStatusStore.setState({ status: null });
  useTabsStore.setState({ tabs: [], active: null, caret: null });
  useRepoStore.setState({ repo: { id: "r", name: "r", path: "/r", head: REFS.head }, refs: REFS });
  usePaletteStore.getState().setOpen(true);
});
afterEach(cleanup);

describe("CommandPalette", () => {
  it("types to filter, Enter runs the highlighted item, closes, and the item lands in Recent", () => {
    const { getByRole, getAllByRole } = render(<CommandPalette />);
    const input = getByRole("combobox", { name: "Command palette" });
    fireEvent.change(input, { target: { value: "chan" } });
    expect(getAllByRole("option")[0].textContent).toContain("Changes");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(useViewStore.getState().view).toBe("changes");
    expect(usePaletteStore.getState().open).toBe(false);
    expect(usePaletteStore.getState().recent).toEqual(["view.changes"]);
    act(() => usePaletteStore.getState().setOpen(true)); // the mounted palette reopens with an empty query
    expect(getAllByRole("option")[0].textContent).toContain("Changes");
  });
  it("arrows move the highlight, Escape closes", () => {
    const { getByRole, getAllByRole } = render(<CommandPalette />);
    const input = getByRole("combobox", { name: "Command palette" });
    expect(input.getAttribute("aria-activedescendant")).toBe(getAllByRole("option")[0].id);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(getAllByRole("option")[1].id);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(usePaletteStore.getState().open).toBe(false);
  });
  it("branches are Go to branch rows; items an operation would disable are disabled with the reason", () => {
    useOpsStore.setState({ busy: "Fetching…" });
    const { getByRole } = render(<CommandPalette />);
    const input = getByRole("combobox", { name: "Command palette" });
    fireEvent.change(input, { target: { value: "origin/" } });
    expect(getByRole("option", { name: "origin/main" })).toBeTruthy();
    fireEvent.change(input, { target: { value: "push" } });
    const item = getByRole("option", { name: /^Push/ });
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(item.getAttribute("title")).toBe("Operation in progress");
    fireEvent.click(item);
    expect(useDialogStore.getState().dialog).toBeNull();
  });
});
```

Append to `useShortcuts.test.ts` (add `usePaletteStore.getState().__resetForTests()` to its `beforeEach`; import from `./CommandPalette/paletteStore`):
```ts
it("Ctrl+K toggles the palette, even from a text field; other shortcuts sleep while it is open", () => {
  renderHook(() => useShortcuts());
  const input = document.body.appendChild(document.createElement("input"));
  fireEvent.keyDown(input, { key: "k", ctrlKey: true });
  expect(usePaletteStore.getState().open).toBe(true);
  fireEvent.keyDown(window, { key: "2", code: "Digit2", altKey: true });
  expect(useViewStore.getState().view).toBe("history");
  fireEvent.keyDown(input, { key: "k", ctrlKey: true });
  expect(usePaletteStore.getState().open).toBe(false);
  input.remove();
});
```

- [ ] **Step 2: Run** the three files → FAIL (modules missing).

- [ ] **Step 3: paletteStore**

```ts
// src/screens/RepoWindow/CommandPalette/paletteStore.ts
import { create } from "zustand";

const RECENT_KEY = "paletteRecent";
const RECENT_MAX = 3;

/** Storage can be unavailable (locked-down WebView): then the list is per session. */
function readRecent(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export interface PaletteStore {
  open: boolean;
  /** Ids of the last commands run, newest first. */
  recent: string[];
  setOpen(open: boolean): void;
  markRun(id: string): void;
  __resetForTests(): void;
}

export const usePaletteStore = create<PaletteStore>()((set, get) => ({
  open: false,
  recent: readRecent(),
  setOpen: (open) => set({ open }),
  markRun: (id) => {
    const recent = [id, ...get().recent.filter((r) => r !== id)].slice(0, RECENT_MAX);
    set({ recent });
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch {
      /* per session then */
    }
  },
  __resetForTests: () => {
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      /* nothing stored */
    }
    set({ open: false, recent: [] });
  },
}));
```

- [ ] **Step 4: rank**

```ts
// src/screens/RepoWindow/CommandPalette/rank.ts
import type { Command, Group } from "./commands";

const GROUPS: Group[] = ["Recent", "Views", "Repository", "Branch", "Stash", "Network", "Go to branch", "Repositories", "Window"];
const byGroup = (a: Command, b: Command) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group);

/** 3 = the label starts with the query, 2 = a word in it does, 1 = the letters appear in order, 0 = no match. */
export function score(query: string, label: string): 0 | 1 | 2 | 3 {
  const q = query.toLowerCase();
  const l = label.toLowerCase();
  if (l.startsWith(q)) return 3;
  if (l.split(/[\s/_-]+/).some((w) => w.startsWith(q))) return 2;
  let i = 0;
  for (const ch of l) if (ch === q[i]) i++;
  return i === q.length ? 1 : 0;
}

/**
 * Empty query: the recent commands as a `Recent` group (newest first), then everything in group
 * order. A query: matches only, best score first, ties in group order (`sort` is stable, so the
 * build order holds within a group) — and no Recent group, since the match is what is being asked for.
 */
export function rankCommands(query: string, commands: Command[], recentIds: string[]): Command[] {
  const q = query.trim();
  if (!q) {
    const recent = recentIds.flatMap((id) => {
      const c = commands.find((x) => x.id === id);
      return c ? [{ ...c, group: "Recent" as const }] : [];
    });
    return [...recent, ...[...commands].sort(byGroup)];
  }
  return commands
    .map((c) => ({ c, s: score(q, c.label) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || byGroup(a.c, b.c))
    .map((x) => x.c);
}
```

- [ ] **Step 5: commands**

```tsx
// src/screens/RepoWindow/CommandPalette/commands.tsx  (tsx: it builds icon elements)
import { Archive, ArrowDown, ArrowDownUp, ArrowUp, Cloud, ExternalLink, FolderGit2, FolderOpen, GitBranch, GitCommitHorizontal, GitMerge, History, PanelLeft, Plus, RefreshCw, Settings, Terminal, X } from "lucide-react";
import type { ReactNode } from "react";
import type { Branch, Remote, Stash } from "../../../api/types";
import type { DialogSpec } from "../../../store/dialogStore";
import type { RecentRepo } from "../../../store/recentsStore";

export type Group = "Recent" | "Views" | "Repository" | "Branch" | "Stash" | "Network" | "Go to branch" | "Repositories" | "Window";

export interface Command {
  /** Stable across builds: what Recent remembers (`view.changes`, `goto.origin/main`). */
  id: string;
  group: Group;
  label: string;
  icon?: ReactNode;
  kbd?: string;
  /** Why it cannot run right now — the item is disabled and this is its title. */
  disabled?: string;
  run(): void;
}

/** Everything the commands read, gathered by `CommandPalette` from the stores when it opens. */
export interface CommandContext {
  running: boolean;
  repoPath: string | null;
  local: Branch[];
  remotes: Remote[];
  stashes: Stash[];
  recents: RecentRepo[];
  changes: number;
  tabCount: number;
  setView(view: "history"): void;
  openChanges(): void;
  openDialog(spec: DialogSpec): void;
  revealOid(oid: string): void;
  switchRepo(path: string): void;
  pickAndOpenRepo(): void;
  fetchDefault(): void;
  stashPop(index: number): void;
  stashApply(index: number): void;
  refreshAll(): void;
  toggleRail(): void;
  detachTab(): void;
  closeTab(): void;
}

const BUSY = "Operation in progress";

export function buildCommands(ctx: CommandContext): Command[] {
  const busy = ctx.running ? BUSY : undefined;
  const dialog = (spec: DialogSpec) => () => ctx.openDialog(spec);
  const latest = ctx.stashes[0];
  const noStash = latest ? undefined : "No stashes";
  return [
    { id: "view.history", group: "Views", label: "History", icon: <History size={16} aria-hidden />, kbd: "Alt+1", run: () => ctx.setView("history") },
    { id: "view.changes", group: "Views", label: ctx.changes ? `Changes (${ctx.changes})` : "Changes", icon: <GitCommitHorizontal size={16} aria-hidden />, kbd: "Alt+2", run: () => ctx.openChanges() },
    { id: "repo.commit", group: "Repository", label: "Commit…", icon: <GitCommitHorizontal size={16} aria-hidden />, run: dialog({ kind: "commit" }) },
    { id: "repo.addRemote", group: "Repository", label: "Add remote…", icon: <Cloud size={16} aria-hidden />, disabled: busy, run: dialog({ kind: "addRemote" }) },
    { id: "repo.addWorktree", group: "Repository", label: "Add worktree…", icon: <FolderGit2 size={16} aria-hidden />, disabled: busy, run: dialog({ kind: "addWorktree" }) },
    { id: "repo.run", group: "Repository", label: "Run git command…", icon: <Terminal size={16} aria-hidden />, kbd: "Ctrl+Shift+R", disabled: busy, run: dialog({ kind: "runCommand" }) },
    { id: "repo.open", group: "Repository", label: "Open repository…", icon: <FolderOpen size={16} aria-hidden />, kbd: "Ctrl+T", disabled: busy, run: () => ctx.pickAndOpenRepo() },
    { id: "branch.create", group: "Branch", label: "Create branch…", icon: <Plus size={16} aria-hidden />, kbd: "Ctrl+B", disabled: busy, run: dialog({ kind: "createBranch" }) },
    { id: "branch.checkout", group: "Branch", label: "Checkout…", icon: <GitBranch size={16} aria-hidden />, disabled: busy, run: dialog({ kind: "checkout" }) },
    { id: "branch.merge", group: "Branch", label: "Merge…", icon: <GitMerge size={16} aria-hidden />, disabled: busy, run: dialog({ kind: "merge" }) },
    { id: "branch.rebase", group: "Branch", label: "Rebase…", icon: <GitMerge size={16} aria-hidden />, disabled: busy, run: dialog({ kind: "rebase" }) },
    { id: "stash.push", group: "Stash", label: "Stash changes…", icon: <Archive size={16} aria-hidden />, disabled: busy ?? (ctx.changes === 0 ? "Nothing to stash" : undefined), run: dialog({ kind: "stashPush" }) },
    { id: "stash.manage", group: "Stash", label: "Manage stashes…", icon: <Archive size={16} aria-hidden />, kbd: "Ctrl+Shift+S", run: dialog({ kind: "stashes" }) },
    { id: "stash.pop", group: "Stash", label: latest ? `Pop latest: ${latest.message}` : "Pop latest", icon: <Archive size={16} aria-hidden />, disabled: busy ?? noStash, run: () => latest && ctx.stashPop(latest.index) },
    { id: "stash.apply", group: "Stash", label: latest ? `Apply latest: ${latest.message}` : "Apply latest", icon: <Archive size={16} aria-hidden />, disabled: busy ?? noStash, run: () => latest && ctx.stashApply(latest.index) },
    { id: "net.fetch", group: "Network", label: "Fetch", icon: <ArrowDown size={16} aria-hidden />, kbd: "Ctrl+F5", disabled: busy, run: () => ctx.fetchDefault() },
    { id: "net.pull", group: "Network", label: "Pull…", icon: <ArrowDownUp size={16} aria-hidden />, kbd: "Ctrl+Shift+L", disabled: busy, run: dialog({ kind: "pull" }) },
    { id: "net.push", group: "Network", label: "Push…", icon: <ArrowUp size={16} aria-hidden />, kbd: "Ctrl+Shift+U", disabled: busy, run: dialog({ kind: "push" }) },
    ...ctx.local.map<Command>((b) => ({ id: `goto.${b.name}`, group: "Go to branch", label: b.name, icon: <GitBranch size={16} aria-hidden />, run: () => ctx.revealOid(b.oid) })),
    ...ctx.remotes.flatMap((r) => r.branches.map<Command>((b) => ({ id: `goto.${b.name}`, group: "Go to branch", label: b.name, icon: <Cloud size={16} aria-hidden />, run: () => ctx.revealOid(b.oid) }))),
    ...ctx.recents.filter((r) => r.path !== ctx.repoPath).map<Command>((r) => ({ id: `repo.switch.${r.path}`, group: "Repositories", label: r.name, icon: <FolderGit2 size={16} aria-hidden />, disabled: busy, run: () => ctx.switchRepo(r.path) })),
    { id: "win.sidebar", group: "Window", label: "Toggle sidebar", icon: <PanelLeft size={16} aria-hidden />, kbd: "Alt+0", run: () => ctx.toggleRail() },
    { id: "win.refresh", group: "Window", label: "Refresh", icon: <RefreshCw size={16} aria-hidden />, kbd: "F5", run: () => ctx.refreshAll() },
    { id: "win.settings", group: "Window", label: "Settings", icon: <Settings size={16} aria-hidden />, run: dialog({ kind: "settings" }) },
    { id: "win.detach", group: "Window", label: "Move to new window", icon: <ExternalLink size={16} aria-hidden />, kbd: "Ctrl+Shift+N", disabled: busy ?? (ctx.tabCount < 2 ? "This tab is the only one in this window" : undefined), run: () => ctx.detachTab() },
    { id: "win.close", group: "Window", label: "Close tab", icon: <X size={16} aria-hidden />, kbd: "Ctrl+W", disabled: busy, run: () => ctx.closeTab() },
  ];
}
```
`rank.ts` imports its types from `./commands` — TS resolves the `.tsx` extension. The disabled reasons mirror the toolbar's own items (Commit… is never disabled by `running`).

- [ ] **Step 6: CommandPalette**

```tsx
// src/screens/RepoWindow/CommandPalette/CommandPalette.tsx
import { Search } from "lucide-react";
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Kbd } from "../../../components/ui/Kbd/Kbd";
import { cx } from "../../../lib/cx";
import { useDialogStore } from "../../../store/dialogStore";
import { selectRunning, useOpsStore } from "../../../store/opsStore";
import { useRecentsStore } from "../../../store/recentsStore";
import { useRepoStore } from "../../../store/repoStore";
import { selectChangeCount, useStatusStore } from "../../../store/statusStore";
import { useTabsStore } from "../../../store/tabsStore";
import { useViewStore } from "../../../store/viewStore";
import { closeTab, detachTab, fetchDefault, openCommitPanel, pickAndOpenRepo, refreshAll, stashApply, stashPop, switchRepo } from "../actions";
import { layoutFor } from "../layout";
import { buildCommands } from "./commands";
import s from "./CommandPalette.module.css";
import { usePaletteStore } from "./paletteStore";
import { rankCommands } from "./rank";

/** Ctrl+K: every action, view, branch and recent repository behind one search box (spec §4). */
export function CommandPalette() {
  const open = usePaletteStore((st) => st.open);
  return open ? <PalettePanel /> : null;
}

function PalettePanel() {
  const setOpen = usePaletteStore((st) => st.setOpen);
  const recent = usePaletteStore((st) => st.recent);
  const markRun = usePaletteStore((st) => st.markRun);
  const running = useOpsStore(selectRunning);
  const repoPath = useRepoStore((st) => st.repo?.path ?? null);
  const refs = useRepoStore((st) => st.refs);
  const recents = useRecentsStore((st) => st.recents);
  const changes = useStatusStore(selectChangeCount);
  const tabCount = useTabsStore((st) => st.tabs.length);
  const openDialog = useDialogStore((st) => st.open);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();

  // Give the keyboard back to where it was (the grid, a field) when the palette closes. Captured
  // during render: by the time an effect runs, the input's `autoFocus` has already taken the focus.
  // A command that opens a dialog still wins — React runs this cleanup before the dialog's mount effects.
  const [from] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => () => from?.focus(), [from]);

  const commands = useMemo(
    () =>
      buildCommands({
        running,
        repoPath,
        local: refs?.local ?? [],
        remotes: refs?.remotes ?? [],
        stashes: refs?.stashes ?? [],
        recents,
        changes,
        tabCount,
        setView: (v) => useViewStore.getState().setView(v),
        openChanges: openCommitPanel,
        openDialog: (spec) => openDialog(spec),
        revealOid: (oid) => void useRepoStore.getState().revealOid(oid),
        switchRepo,
        pickAndOpenRepo: () => void pickAndOpenRepo(),
        fetchDefault: () => void fetchDefault(),
        stashPop: (i) => void stashPop(i),
        stashApply: (i) => void stashApply(i),
        refreshAll,
        toggleRail: () => useViewStore.getState().toggleRail(layoutFor(window.innerWidth).railAuto),
        detachTab,
        closeTab,
      }),
    [running, repoPath, refs, recents, changes, tabCount, openDialog],
  );
  const items = useMemo(() => rankCommands(query, commands, recent), [query, commands, recent]);
  const cur = Math.min(active, Math.max(items.length - 1, 0));
  const optionId = (i: number) => `${listId}-${i}`;

  useEffect(() => {
    document.getElementById(optionId(cur))?.scrollIntoView({ block: "nearest" });
  });

  function run(index: number) {
    const c = items[index];
    if (!c || c.disabled) return;
    setOpen(false);
    markRun(c.id);
    c.run();
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") setActive(Math.min(cur + 1, items.length - 1));
    else if (e.key === "ArrowUp") setActive(Math.max(cur - 1, 0));
    else if (e.key === "Enter") run(cur);
    else if (e.key === "Escape") setOpen(false);
    else return;
    e.preventDefault();
  }

  let lastGroup: string | null = null;
  return createPortal(
    <div className={s.scrim} onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className={s.panel} role="dialog" aria-label="Command palette">
        <div className={s.head}>
          <Search size={16} aria-hidden />
          <input
            autoFocus
            className={s.input}
            role="combobox"
            aria-label="Command palette"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={items.length ? optionId(cur) : undefined}
            aria-autocomplete="list"
            placeholder="Type a command, branch, or repository"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
            spellCheck={false}
          />
          <Kbd>Esc</Kbd>
        </div>
        <div id={listId} role="listbox" aria-label="Commands" className={s.list}>
          {items.length === 0 && <div className={s.none}>No matching commands</div>}
          {items.map((c, i) => {
            const head = c.group !== lastGroup ? <div className={s.group}>{c.group}</div> : null;
            lastGroup = c.group;
            return (
              <div key={`${c.group}:${c.id}`}>
                {head}
                <div
                  id={optionId(i)}
                  role="option"
                  aria-selected={i === cur}
                  aria-disabled={c.disabled ? true : undefined}
                  title={c.disabled}
                  className={cx(s.item, i === cur && s.active, c.disabled && s.disabled)}
                  onMouseMove={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => run(i)}
                >
                  <span className={s.icon}>{c.icon}</span>
                  <span className={s.label}>{c.label}</span>
                  {c.kbd && <Kbd>{c.kbd}</Kbd>}
                </div>
              </div>
            );
          })}
        </div>
        <div className={s.foot}>↑↓ navigate · ↵ run · Esc close</div>
      </div>
    </div>,
    document.body,
  );
}
```
An option's accessible name is its label plus its kbd text, so `getByRole("option", { name: "origin/main" })` matches (no kbd) while `Push…` needs the `/^Push/` regex in the test.

```css
/* src/screens/RepoWindow/CommandPalette/CommandPalette.module.css — the Palette artboards */
.scrim {
  position: fixed;
  inset: 0;
  z-index: 45;
  background: var(--scrim);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 96px;
}
@media (max-width: 799px) {
  .scrim {
    padding-top: 48px;
  }
}
.panel {
  width: min(520px, calc(100vw - 32px));
  max-height: calc(100vh - 128px);
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-2);
  overflow: hidden;
}
.head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: 40px;
  padding: 0 var(--space-4);
  border-bottom: 1px solid var(--border);
  color: var(--fg-muted);
}
.input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--fg);
  font: inherit;
  font-size: var(--text-lg);
}
.input::placeholder {
  color: var(--fg-faint);
}
.list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--space-2);
}
.group {
  padding: var(--space-3) var(--space-3) var(--space-1);
  font-size: var(--text-xs);
  font-weight: var(--weight-semibold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-muted);
}
.item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: 28px;
  padding: 0 var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--fg);
}
.icon {
  display: inline-flex;
  color: var(--fg-muted);
}
.label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.active {
  background: var(--accent);
  color: var(--fg-on-accent);
}
.active .icon {
  color: inherit;
}
.disabled {
  opacity: 0.45;
}
.none {
  padding: var(--space-4);
  color: var(--fg-muted);
  font-size: var(--text-sm);
}
.foot {
  padding: var(--space-2) var(--space-4);
  border-top: 1px solid var(--border);
  background: var(--bg-app);
  color: var(--fg-muted);
  font-size: var(--text-xs);
}
```

- [ ] **Step 7: Mount, wire the button, the shortcut**

`RepoWindow.tsx`: render `<CommandPalette />` right after `<DialogHost />` (import from `./CommandPalette/CommandPalette`).
`Toolbar.tsx`: both Task 6 placeholders become `usePaletteStore.getState().setOpen(true)` (import from `./CommandPalette/paletteStore`); remove the `// Task 9` comments.
`useShortcuts.ts` — right after the `if (e.defaultPrevented || useDialogStore.getState().dialog) return;` line:
```ts
      const ctrl = e.ctrlKey || e.metaKey;
      const palette = usePaletteStore.getState();
      // The palette owns the keyboard while it is open; Ctrl+K is the way in and out.
      if (ctrl && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        palette.setOpen(!palette.open);
        return;
      }
      if (palette.open) return;
```
(the existing `const ctrl = …` line moves up here; import `usePaletteStore`; extend the header comment).

- [ ] **Step 8: Run** `npx vitest run src/screens/RepoWindow && npx tsc --noEmit`. In the app: Ctrl+K from the grid, from the commit summary field, from the dock prompt; `st` → Stash rows first; Enter runs; reopen → under Recent; `origin/` → Go to branch rows; Enter while in Changes stays in Changes, Alt+1 shows the revealed row; while a fetch runs → Push… greyed with the reason.

- [ ] **Step 9: Commit** — `feat: Ctrl+K command palette`.

---

### Task 10: Docs, smoke group, canvas sources

**Files:**
- Modify: `docs/design/style-guide.md`, `src/README.md`, `README.md`, `docs/smoke/smoke-test-post-v1.md`, `docs/plans/open-items.md`
- Create: `docs/design/canvases/build/build-b.mjs` and its output `docs/design/canvases/direction-b/`

**Facts:**
- `README.md` `## Keyboard shortcuts` table starts at line ~90 with rows like `| Repo window | \`Ctrl+B\` | Create branch… |`; the Features list is above it.
- `src/README.md` documents `src/screens/RepoWindow/` file by file (~lines 221–417).
- `docs/smoke/smoke-test-post-v1.md`: groups are `## <Letters>. <Title>` with numbered `- [ ]` steps; the last group is `## AT.`; `## Reporting` follows. Fixture repo used by recent groups: `c:/tmp/t4/irebase`.
- `docs/plans/open-items.md` has a `§J` section (added at `c8f56c9`) holding the palette-prefixes and stash-dialog items.
- The scratchpad builder lives at `C:/Users/toper/AppData/Local/Temp/claude/F--src---pet-projects-t4-git-ui/21524aa8-14d5-42ca-8f70-b8824dbab9b3/scratchpad/direction-b/build.mjs`. It already reads the repo's `docs/design/canvases/build/{screens.mjs,tokens.css,base.css}` through a hard-coded `const repo = 'F:/src/_ pet projects/t4-git-ui'` (line 8) and `const build = join(repo, 'docs/design/canvases/build')` (line 9), and writes its `*.dc.html` + `canvas.json` next to itself (`here`). `docs/design/canvases/build/build.mjs` is the existing generator for the other canvases (read its header for how it names its output directory).

- [ ] **Step 1: Style guide** — `docs/design/style-guide.md`: add the Direction B canvas to the header link list (`https://claude.ai/code/artifact/e747c922-c0fa-4143-804b-2d5e09dc7c05`, built by `node docs/design/canvases/build/build-b.mjs`); in §3 add rows for `ViewSwitch` (28px segmented control: `--bg-inset` track, `--bg-panel` + `--shadow-1` pill, 14px icon + label + count; `compact` = icons), `SidebarRail` (36px, 28px buttons, 13px count pill, 260px elevated flyout), `CommandPalette` (`min(520px, 100vw − 32px)`, 96px / 48px from the top, 40px input, 28px options, `--accent` highlight, footer hints); in §4 add **Views** (spec §1 in two sentences), **Breakpoints** (the Global Constraints numbers as a table), and a rail sentence under **Sidebar**.

- [ ] **Step 2: `src/README.md`** — rewrite the `RepoWindow` line: `RepoWindow (layout: [TabStrip] / toolbar 40 / sidebar 260 or rail 36 | StateBanners + (History: grid ÷ DetailsPane | Changes: ChangesBar + CommitPanel) / dock / statusbar 24; viewStore picks the view, layout.ts the tiers from the window width; hosts DialogHost, CommandPalette, useShortcuts)`. Add one line each for `layout.ts`, `ViewSwitch.tsx`, `ChangesView.tsx`, `SidebarRail.tsx`, `SearchPopover.tsx`, `CommandPalette/` (commands → rank → store → component). Update the `Toolbar` line (switch instead of Commit; tiers; overflow; palette button).

- [ ] **Step 3: `README.md`** — Features: `- **Two views** — History (graph + details) and Changes (staging) take turns in the content area; Alt+1 / Alt+2 switch. Below 1000px the sidebar folds to a rail, the toolbar to icons, the panes to two columns; the window goes down to 700 × 500.` and `- **Command palette** — Ctrl+K: every action, view, branch and recent repository behind one search box.` Shortcut rows: `| Repo window | \`Alt+1\` · \`Alt+2\` | History · Changes |`, `| Repo window | \`Ctrl+K\` | Command palette |`, `| Repo window | \`Alt+0\` | Collapse / expand the sidebar |`.

- [ ] **Step 4: Smoke group AU** — insert before `## Reporting`:

```markdown
## AU. Direction B: views, rail, adaptive toolbar, palette (spec docs/plans/2026-09-14-direction-b-spec.md)

Fixture: `c:/tmp/t4/irebase` with a dirty tree (touch two files, stage one), window 1280 × 800.

1. - [ ] The toolbar shows `History | Changes 2` where Commit was; History is pressed. Click Changes → `Changes on <branch> · 1 unstaged · 1 staged` over the commit panel; the search box and branch filter are gone from the toolbar; the sidebar is unchanged.
2. - [ ] Click a branch in the sidebar while in Changes → still Changes. Alt+1 → History with that branch's commit selected and scrolled into view.
3. - [ ] The working-tree row reads `Working tree · 2 changes … Open changes →` (hint muted, lit when selected; no hover needed). Click the row → Changes. Alt+1, click the (still selected) row again → Changes. Alt+1, ArrowUp / Home onto the row → still History (details: `No commit selected`); Enter → Changes. Double-click it → the commit dialog; Esc → still Changes.
4. - [ ] `git stash` in a terminal → Changes shows `Working tree clean` beside the message column; Stash… is disabled with `Nothing to stash`; Amend still works.
5. - [ ] Resize to 1000 wide: Fetch / Pull / Push / Branch / Stash are icons with their counts, the repo name stays; the sidebar is a 36px rail with counts; the details pane is details-over-files | diff. Click the Local rail button → flyout with the tree; double-click a branch → checkout, the flyout stays; Esc → closed.
6. - [ ] Resize to 720 wide: the switch is icons only; search is an icon → popover with the box and the filter (type → the grid filters; Esc closes); `⋯` holds Branch ▸, Stash…, Refresh, Switch to … theme, Settings, Command palette; the details pane is files | diff with `> <subject> <sha>` on top — click it → details expand over the list; Changes is files-over-message | diff. At 700 × 500 nothing wraps or clips.
7. - [ ] Alt+0 at 1280 → rail; again → full. Resize past 1000 either way → the override holds; a new window starts from the width again.
8. - [ ] Ctrl+K from the grid, from the commit summary field, from the dock prompt → the palette. `st` → Stash rows first; ↓ ↵ → the dialog opens, the palette closes; Ctrl+K again → that command under Recent; Ctrl+K again → closed. `origin/` → Go to branch rows; ↵ while in Changes → still Changes, Alt+1 → the row is selected and visible. Start a fetch (Ctrl+F5) → Ctrl+K → Push… greyed with `Operation in progress`. Click outside → closed.
9. - [ ] Update badge present (Settings › Updates against a newer release, or fake it): at 1280 the repo name does not wrap; the search box narrows instead.
10. - [ ] Dark theme: switch, rail, flyout, palette, changes bar, search popover, collapsed details header all use the tokens — no light patches.
```

- [ ] **Step 5: `docs/plans/open-items.md` §J** — add `- **Per-view sidebar state** (Direction B follow-up): many will hide the sidebar while staging and want it back in History. One `railOverride` per view is a ten-line change in `viewStore` if the first weeks say so.` Leave the two existing §J items as they are.

- [ ] **Step 6: Canvas sources into the repo** — copy the scratchpad `build.mjs` to `docs/design/canvases/build/build-b.mjs`; replace lines 8–9 with `const build = here;` (the file now lives in `build/`), make the output directory `join(here, "..", "direction-b")` (`mkdirSync(…, { recursive: true })`), and keep everything else. Run `node "F:/src/_ pet projects/t4-git-ui/docs/design/canvases/build/build-b.mjs"` → 36 `*.dc.html` + `canvas.json` under `docs/design/canvases/direction-b/`. Commit them like the other generated canvases (check `.gitignore` does not exclude `*.dc.html`; the `screens/` canvases are committed).

- [ ] **Step 7: Gates and commit** — `npm test && npx tsc --noEmit && node "F:/src/_ pet projects/t4-git-ui/docs/design/canvases/build/contrast.mjs"` (the last must print its all-pass line; no token changed). Commit — `docs: Direction B — style guide rules, README, smoke group AU, canvas sources`.

---

## Self-review (done 2026-09-14 against `c8f56c9`)

**Spec coverage:** §1 views → T4 (+T5 panel); §2 rail → T7; §3 toolbar → T6; §4 palette → T9; §5 details → T8; §6 commit panel → T5; §7 min size → T3; docs → T10. "The search box gives way" = T6 CSS (`.tight .search`, the icons popover).

**Names across tasks:** `useLayout` / `layoutFor` / `Layout.railAuto` (T1) ← T5 T6 T7 T8 T9; `useViewStore.{view,setView,railOverride,toggleRail,__resetForTests}` (T2) ← T4 T6 T7 T9; `ViewSwitch({compact})` (T4) ← T6; `openCommitPanel()` (T4) ← grid, banners, T9; `Sidebar({only,onCollapse})` + `Section` (T7); `IconButtonProps.ref` (T6) ← T6 T7; `usePaletteStore.{open,recent,setOpen,markRun,__resetForTests}` (T9) ← T6 wiring, `useShortcuts`; separator labels `Resize commit message` / `Resize message row` / `Resize file lists` (T5), `Resize commit details` / `Resize file list` / `Resize side column` (T8).

**Defects fixed in this revision** (found by checking the first draft against the code): `stashPop` / `stashApply` take a stash index; the checkout dialog is `{ kind: "checkout" }`, not `checkoutBranch`; the branch name is on `refs.head`, not `repo.head`; a `wtSelected` effect would not re-fire when the already-selected working-tree row is clicked from History (now every grid route goes through `openCommitPanel`, which sets the view); `toHaveAttribute` needs jest-dom, which is not installed; hiding every `[data-label]` in `tight` would also hide the repo name (now scoped to `.op`); the `rank` test expected `History` not to subsequence-match `st`; `CSS.escape` + `useId` selectors replaced with `getElementById`; global shortcuts now sleep while the palette is open (Ctrl+K toggles it); `IconButton` had no `ref` prop; there is no `lint` / `typecheck` script — the gates are `npm test` + `npx tsc --noEmit`; `useLayout` memoises with `useMemo` instead of a growing `Map`; `Move to new window` in the palette carries the toolbar's `tabCount < 2` reason.

**Review pass 2 (2026-09-14, after the Alt+0 / hint / Alt+1-2 decisions):** no `key` on the content group (v4 handles conditional panels; a remount on every rail toggle and every crossing of 1000px would drop the grid's scroll and the details); `Toolbar.test.tsx` had two more Commit-button tests (filter clearing) — now `openCommitPanel` tests; keyboard nav onto the working-tree row no longer switches views (it unmounted the grid under the focus) — `Enter` on the row does; the collapsed details header blanks on `wtSelected` like `selectSelectedOid`; the palette test reopened by mounting a second palette; the palette gives focus back on close; `ChangesBar` said `detached HEAD` while refs were still loading; `MessageColumn.module.css` does not exist; the rail is a `nav`, not a `toolbar`.

## Open questions for the reviewer (answer before execution)

1. ~~Ctrl+H / Ctrl+J~~ **Decided 2026-09-14: Alt+1 / Alt+2** (Ctrl+1..9 are the tabs). Verify in dev on Windows that a bare Alt press does not leave the native menu bar armed after Alt+1 (the app has a native menu — `lib/nativeMenu.ts`); if it does, `preventDefault` on the Alt `keyup` is the usual fix.
2. ~~No hover button~~ **Decided 2026-09-14: an always-visible `Open changes →` text hint** in the working-tree row's author cell (Task 4) — no hover dependency, reads on every platform and to screen readers; the click itself is the action.
3. ~~Ctrl+\~~ **Decided 2026-09-14: `Alt+0`** (`Ctrl+\` is AltGr+ß on a German layout; Alt+digit is the layout family — 1 History, 2 Changes, 0 sidebar, 3 reserved for the dock). Same `e.code` matching and the same Windows menu-bar check as item 1.
4. **Decided 2026-09-14: the flyout stays open** after a row click (checkout / reveal) until Esc or a click outside. Revisit if it gets annoying.
5. **Decided 2026-09-14: History unmounts** while Changes shows (the store keeps selection + reveal; the grid scrolls to a pending reveal on remount, but a plain return lands wherever the virtualizer starts unless the selected row is revealed). If that annoys, the alternative is keeping History mounted under `hidden` — then a reveal issued while hidden would need re-issuing on show.
