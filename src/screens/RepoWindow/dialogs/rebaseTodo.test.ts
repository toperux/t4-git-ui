import { describe, expect, it } from "vitest";
import type { TodoCommit, TodoLine } from "../../../api/types";
import {
  buildItems,
  canMoveDown,
  canMoveUp,
  canSquash,
  defaultMessage,
  groupOf,
  moveRow,
  needsMessage,
  toSteps,
  updateRefsSupported,
  validate,
  type Action,
  type Item,
  type Row,
} from "./rebaseTodo";

const commit = (oid: string, summary: string, message?: string): TodoCommit => ({ oid, short: oid.slice(0, 7), summary, message: message ?? summary });
const pick = (oid: string, summary: string, action: Action = "pick", message?: string): TodoLine => ({
  kind: "pick",
  action,
  text: `${action} ${oid} ${summary}`,
  commit: commit(oid, summary, message),
  amend: false,
});
/** What `git commit --fixup=amend:<sha>` gives the todo: a fixup that replaces the message too. */
const amendFixup = (oid: string, summary: string): TodoLine => ({
  kind: "pick",
  action: "fixup",
  text: `fixup -C ${oid} ${summary}`,
  commit: commit(oid, summary),
  amend: true,
});
const merge = (text: string): TodoLine => ({ kind: "merge", text, commit: null });
const uref = (name: string): TodoLine => ({ kind: "updateRef", text: `update-ref refs/heads/${name}` });
const other = (text: string): TodoLine => ({ kind: "other", text });

const texts = (items: Item[]) => items.map((it) => (it.kind === "hidden" ? `#${it.line.text}` : it.line.text));

describe("buildItems", () => {
  it("makes a row per pick and merge, hides the rest, and hangs update-ref lines off the pick above", () => {
    const items = buildItems([pick("a1", "One"), uref("feat"), uref("wip"), other("label onto"), merge("merge -C m1 side"), other("reset onto")]);
    expect(items.map((it) => it.kind)).toEqual(["row", "hidden", "row", "hidden"]);
    expect((items[0] as Row).refs.map((l) => l.text)).toEqual(["update-ref refs/heads/feat", "update-ref refs/heads/wip"]);
    // The merge row is read-only; its action is never used.
    expect((items[2] as Row).line.kind).toBe("merge");
    expect(texts(items)).toEqual(["pick a1 One", "#label onto", "merge -C m1 side", "#reset onto"]);
  });

  it("drops blank and comment lines: git writes a blank after every update-ref, and it must not be a barrier", () => {
    const items = buildItems([pick("a1", "One"), uref("mid"), other(""), pick("b2", "Two"), other("# Branch side"), other("  ")]);
    expect(items.map((it) => it.kind)).toEqual(["row", "row"]);
    expect(canMoveDown(items, 0)).toBe(true);
  });

  it("an update-ref before any pick stays a hidden line of its own", () => {
    expect(buildItems([uref("feat"), pick("a1", "One")]).map((it) => it.kind)).toEqual(["hidden", "row"]);
  });
});

describe("moving rows", () => {
  it("a pick swaps only with an adjacent pick — a merge or a label line is a barrier", () => {
    const items = buildItems([pick("a1", "One"), other("label onto"), pick("b2", "Two"), merge("merge -C m1 side"), pick("c3", "Three")]);
    expect(canMoveDown(items, 0)).toBe(false);
    expect(canMoveUp(items, 2)).toBe(false);
    expect(canMoveDown(items, 2)).toBe(false);
    expect(canMoveUp(items, 4)).toBe(false);
    // The merge row itself never moves.
    expect(canMoveUp(items, 3)).toBe(false);
    expect(moveRow(items, 2, -1)).toBe(items);
  });

  it("swaps two adjacent picks and takes their update-ref lines along", () => {
    const items = buildItems([pick("a1", "One"), uref("feat"), pick("b2", "Two")]);
    const moved = moveRow(items, 0, 1);
    expect(texts(moved)).toEqual(["pick b2 Two", "pick a1 One"]);
    expect((moved[1] as Row).refs.map((l) => l.text)).toEqual(["update-ref refs/heads/feat"]);
    expect(moveRow(items, 0, -1)).toBe(items);
  });
});

describe("groups", () => {
  const items = buildItems([pick("a1", "One"), pick("b2", "Two"), pick("c3", "Three", "fixup"), pick("d4", "Four", "squash")]);

  it("a group is a head pick plus the squash / fixup picks after it", () => {
    expect(groupOf(items, 1)).toEqual([1, 2, 3]);
    expect(groupOf(items, 2)).toEqual([1, 2, 3]);
    expect(groupOf(items, 0)).toEqual([0]);
  });

  it("canSquash looks past a dropped row for the head — git folds the fixup into the pick above the drop", () => {
    expect(canSquash(items, 0)).toBe(false);
    expect(canSquash(items, 1)).toBe(true);
    expect(canSquash(items, 3)).toBe(true);
    const dropped = items.map((it, i) => (i === 1 ? { ...(it as Row), action: "drop" as Action } : it));
    expect(canSquash(dropped, 2)).toBe(true);
    // And the dropped row stays inside the group: head through last member, with no gap.
    expect(groupOf(dropped, 2)).toEqual([0, 1, 2, 3]);
  });

  it("a drop belongs to the group it sits inside, unless it trails past the last member", () => {
    // Nothing is folded into it, so it is a group of its own — `toSteps` advances by group length.
    const trailing = buildItems([pick("a1", "One"), pick("b2", "Two", "drop")]);
    expect(groupOf(trailing, 1)).toEqual([1]);
    expect(groupOf(trailing, 0)).toEqual([0]);
    // Inside a group it is one of the group's rows: selecting it keeps the squash's message box up.
    const inside = buildItems([pick("a1", "One"), pick("b2", "Two", "drop"), pick("c3", "Three", "squash")]);
    expect(groupOf(inside, 1)).toEqual([0, 1, 2]);
    expect(groupOf(inside, 0)).toEqual([0, 1, 2]);
    expect(groupOf(inside, 2)).toEqual([0, 1, 2]);
    expect(needsMessage(inside, groupOf(inside, 1))).toBe(true);
  });

  it("nothing but drops above means no group at all, and every index agrees on that", () => {
    // `canSquash` refuses b2 here because git has no commit left to fold it into. `groupOf` has to
    // say the same, or the two encode different ideas of a group and whichever runs first wins.
    const topDrop = buildItems([pick("a1", "One", "drop"), pick("b2", "Two", "fixup")]);
    expect(canSquash(topDrop, 1)).toBe(false);
    expect(groupOf(topDrop, 0)).toEqual([0]);
    expect(groupOf(topDrop, 1)).toEqual([1]);
    // Each row is its own group, so the todo still goes out in order and nothing is emitted twice.
    expect(toSteps(topDrop, {}, true)).toEqual([
      { kind: "line", text: "drop a1 One" },
      { kind: "line", text: "fixup b2 Two" },
    ]);
  });

  it("the default message is the head's plus each squash member's; fixups contribute nothing", () => {
    const g = buildItems([pick("a1", "One", "pick", "One\n\nbody\n"), pick("b2", "Two", "fixup"), pick("c3", "Three", "squash", "Three\n\nwhy")]);
    expect(needsMessage(g, [0, 1, 2])).toBe(true);
    expect(defaultMessage(g, [0, 1, 2])).toBe("One\n\nbody\n\nThree\n\nwhy");
    // A lone fixup keeps the head's message: no textarea, no amend.
    expect(needsMessage(g, [0, 1])).toBe(false);
    const reword = buildItems([pick("a1", "One", "reword")]);
    expect(needsMessage(reword, [0])).toBe(true);
  });
});

describe("validate", () => {
  it("names the first squash with nothing above it, then an empty list", () => {
    expect(validate(buildItems([pick("a1", "One"), pick("b2", "Two", "squash")]))).toBeNull();
    expect(validate(buildItems([pick("a1", "One", "squash")]))).toBe("a1 has no commit above it to squash into");
    const dropped = buildItems([pick("a1", "One", "drop"), pick("b2", "Two", "fixup")]);
    expect(validate(dropped)).toBe("b2 has no commit above it to squash into");
    expect(validate(buildItems([]))).toBe("Nothing to rebase");
    // A `noop` todo (HEAD already on the base) has no picks at all.
    expect(validate(buildItems([other("noop")]))).toBe("Nothing to rebase");
  });

  it("refuses a reword or squash whose message was cleared — git would reject the empty amend", () => {
    const reword = buildItems([pick("a1", "One", "reword")]);
    expect(validate(reword)).toBeNull();
    expect(validate(reword, { a1: "  \n" })).toBe("a1 needs a message");
    const squash = buildItems([pick("a1", "One"), pick("b2", "Two", "squash")]);
    expect(validate(squash, { a1: "" })).toBe("a1 needs a message");
    // A plain pick or fixup never needs one.
    expect(validate(buildItems([pick("a1", "One"), pick("b2", "Two", "fixup")]), { a1: "" })).toBeNull();
  });
});

describe("toSteps", () => {
  const lines = [
    pick("a1", "One", "reword", "One\n\nbody"),
    uref("feat"),
    other("label onto"),
    pick("b2", "Two"),
    pick("c3", "Three", "fixup"),
    pick("d4", "Four", "squash", "Four\n\nwhy"),
  ];

  it("emits the head, its members, the amend, then the update-ref lines — a ref before the amend would be orphaned", () => {
    const items = buildItems(lines);
    expect(toSteps(items, {}, true)).toEqual([
      { kind: "line", text: "pick a1 One" },
      { kind: "amend", message: "One\n\nbody" },
      { kind: "line", text: "update-ref refs/heads/feat" },
      { kind: "line", text: "label onto" },
      { kind: "line", text: "pick b2 Two" },
      { kind: "line", text: "fixup c3 Three" },
      { kind: "line", text: "fixup d4 Four" },
      { kind: "amend", message: "Two\n\nFour\n\nwhy" },
    ]);
  });

  it("drops every update-ref line when the checkbox is off, and keeps the user's edited message", () => {
    const items = buildItems(lines);
    const steps = toSteps(items, { a1: "Reworded" }, false);
    expect(steps.some((st) => st.kind === "line" && st.text.startsWith("update-ref"))).toBe(false);
    expect(steps[1]).toEqual({ kind: "amend", message: "Reworded" });
  });

  it("keeps -C on an amend! fixup left alone, and loses it when the row is given another action", () => {
    const items = buildItems([pick("a1", "One"), amendFixup("b2", "amend! One")]);
    expect(toSteps(items, {}, true)).toEqual([
      { kind: "line", text: "pick a1 One" },
      { kind: "line", text: "fixup -C b2 amend! One" },
    ]);
    for (const action of ["pick", "drop"] as Action[]) {
      const changed = items.map((it, i) => (i === 1 ? { ...(it as Row), action } : it));
      expect(toSteps(changed, {}, true)[1]).toEqual({ kind: "line", text: `${action} b2 amend! One` });
    }
  });

  it("a drop inside a group is emitted in place, and the fixup below it folds into the pick above", () => {
    const items = buildItems([pick("a1", "One"), pick("b2", "Two", "drop"), pick("c3", "Three", "fixup")]);
    expect(groupOf(items, 2)).toEqual([0, 1, 2]);
    // The dropped commit contributes no message: the fixup lands on a1 with a1's own.
    expect(defaultMessage(items, groupOf(items, 2))).toBe("One");
    expect(toSteps(items, {}, true)).toEqual([
      { kind: "line", text: "pick a1 One" },
      { kind: "line", text: "drop b2 Two" },
      { kind: "line", text: "fixup c3 Three" },
    ]);
  });

  it("writes edit / drop as themselves, a merge line verbatim, and never amends a plain pick", () => {
    const items = buildItems([pick("a1", "One", "edit"), pick("b2", "Two", "drop"), merge("merge -C m1 side"), pick("c3", "Three")]);
    expect(toSteps(items, {}, true)).toEqual([
      { kind: "line", text: "edit a1 One" },
      { kind: "line", text: "drop b2 Two" },
      { kind: "line", text: "merge -C m1 side" },
      { kind: "line", text: "pick c3 Three" },
    ]);
  });
});

describe("updateRefsSupported", () => {
  it("is git 2.38 and up; an unknown version is treated as too old", () => {
    expect(updateRefsSupported("git version 2.55.0.windows.1")).toBe(true);
    expect(updateRefsSupported("git version 2.38.0")).toBe(true);
    expect(updateRefsSupported("git version 2.37.9")).toBe(false);
    expect(updateRefsSupported("git version 3.0.0")).toBe(true);
    expect(updateRefsSupported(null)).toBe(false);
    expect(updateRefsSupported("nonsense")).toBe(false);
  });
});
