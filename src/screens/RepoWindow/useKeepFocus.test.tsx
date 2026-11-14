import { cleanup, render } from "@testing-library/react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useKeepFocus } from "./useKeepFocus";

interface PaneProps {
  layout: "a" | "b";
  a: ReactNode;
  b: ReactNode;
  /** Inside the root in both layouts, at the same place: it survives the switch. */
  kept?: ReactNode;
  /** Outside the root, in layout `a` only. */
  outsideA?: ReactNode;
}

/** Two layouts whose controls are new nodes in each: `a` sits in a `<section>`, `b` in an `<article>`. */
function Pane({ layout, a, b, kept, outsideA }: PaneProps) {
  const root = useRef<HTMLDivElement>(null);
  useKeepFocus(layout, root);
  return (
    <>
      <div ref={root}>
        {kept}
        {layout === "a" ? <section>{a}</section> : <article>{b}</article>}
      </div>
      {layout === "a" && outsideA}
    </>
  );
}

/** Renders layout `a`; `toB` switches to `b`. */
function layouts(props: Omit<PaneProps, "layout">) {
  const view = render(<Pane layout="a" {...props} />);
  return { ...view, toB: () => view.rerender(<Pane layout="b" {...props} />) };
}

const list = (rows: ReactNode) => (
  <div role="listbox" aria-label="Changed files" tabIndex={0}>
    {rows}
  </div>
);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useKeepFocus", () => {
  it("gives the focus back to the labelled button in the new layout", () => {
    const { getByRole, toB } = layouts({ a: <button aria-label="Unified view">U</button>, b: <button aria-label="Unified view">U</button> });
    const old = getByRole("button", { name: "Unified view" });
    old.focus();
    toB();
    expect(document.activeElement).not.toBe(old);
    expect(document.activeElement).toBe(getByRole("button", { name: "Unified view" }));
  });

  it("finds a checkbox by the text of its label", () => {
    const box = (name: string) => (
      <label>
        <input type="checkbox" />
        {name}
      </label>
    );
    const { getByRole, toB } = layouts({
      a: box("Amend last commit"),
      b: (
        <>
          {box("Add Signed-off-by")}
          {box("Amend last commit")}
        </>
      ),
    });
    const old = getByRole("checkbox", { name: "Amend last commit" });
    old.focus();
    toB();
    expect(document.activeElement).not.toBe(old);
    expect(document.activeElement).toBe(getByRole("checkbox", { name: "Amend last commit" }));
  });

  it("gives a field the focus back with its selection", () => {
    const field = <input aria-label="Summary" defaultValue="Fix lanes" />;
    const { getByRole, toB } = layouts({ a: field, b: field });
    const old = getByRole("textbox", { name: "Summary" }) as HTMLInputElement;
    old.focus();
    old.setSelectionRange(1, 4, "backward");
    toB();
    const now = getByRole("textbox", { name: "Summary" }) as HTMLInputElement;
    expect(now).not.toBe(old);
    expect(document.activeElement).toBe(now);
    expect([now.selectionStart, now.selectionEnd, now.selectionDirection]).toEqual([1, 4, "backward"]);
  });

  it("hands a row's button that has no twin to its list", () => {
    const { getByRole, toB } = layouts({ a: list(<button aria-label="Stage">+</button>), b: list(null) });
    const oldList = getByRole("listbox");
    getByRole("button", { name: "Stage" }).focus();
    toB();
    expect(document.activeElement).not.toBe(oldList);
    expect(document.activeElement).toBe(getByRole("listbox"));
  });

  it("hands it to the list when two buttons fit, not to either of them", () => {
    const two = (
      <>
        <button aria-label="Stage">+</button>
        <button aria-label="Stage">+</button>
      </>
    );
    const { getByRole, toB } = layouts({ a: list(<button aria-label="Stage">+</button>), b: list(two) });
    const oldList = getByRole("listbox");
    getByRole("button", { name: "Stage" }).focus();
    toB();
    expect(document.activeElement).not.toBe(oldList);
    expect(document.activeElement).toBe(getByRole("listbox"));
  });

  it("hands it to the list when the one twin is disabled", () => {
    const { getByRole, toB } = layouts({
      a: list(<button aria-label="Stage">+</button>),
      b: list(
        <button aria-label="Stage" disabled>
          +
        </button>,
      ),
    });
    const oldList = getByRole("listbox");
    getByRole("button", { name: "Stage" }).focus();
    toB();
    expect(document.activeElement).not.toBe(oldList);
    expect(document.activeElement).toBe(getByRole("listbox"));
  });

  it("hands it to the list when two twins fit and one of them is disabled", () => {
    const { getByRole, toB } = layouts({
      a: list(<button aria-label="Stage">+</button>),
      b: list(
        <>
          <button aria-label="Stage" disabled>
            +
          </button>
          <button aria-label="Stage">+</button>
        </>,
      ),
    });
    const oldList = getByRole("listbox");
    getByRole("button", { name: "Stage" }).focus();
    toB();
    expect(document.activeElement).not.toBe(oldList);
    expect(document.activeElement).toBe(getByRole("listbox"));
  });

  it("hands it to the list when the one twin cannot take the focus", () => {
    const { getByRole, toB } = layouts({
      a: list(
        <div role="button" aria-label="Stage" tabIndex={-1}>
          +
        </div>,
      ),
      // No `tabindex`, as a separator the library has disabled.
      b: list(
        <div role="button" aria-label="Stage">
          +
        </div>,
      ),
    });
    const oldList = getByRole("listbox");
    getByRole("button", { name: "Stage" }).focus();
    toB();
    expect(document.activeElement).not.toBe(oldList);
    expect(document.activeElement).toBe(getByRole("listbox"));
  });

  it("focuses a field's twin of another type without putting a selection on it", () => {
    const { getByRole, toB } = layouts({ a: <input aria-label="Amend" defaultValue="abc" />, b: <input type="checkbox" aria-label="Amend" /> });
    const old = getByRole("textbox", { name: "Amend" }) as HTMLInputElement;
    old.focus();
    old.setSelectionRange(1, 2);
    toB();
    expect(document.activeElement).toBe(getByRole("checkbox", { name: "Amend" }));
  });

  it("leaves the focus on a control of the new layout that took it in its own layout effect", () => {
    function TakesFocus() {
      const el = useRef<HTMLInputElement>(null);
      useLayoutEffect(() => el.current?.focus(), []);
      return <input ref={el} aria-label="Filter files" />;
    }
    const { getByRole, toB } = layouts({
      a: <button aria-label="Unified view">U</button>,
      b: (
        <>
          <button aria-label="Unified view">U</button>
          <TakesFocus />
        </>
      ),
    });
    getByRole("button", { name: "Unified view" }).focus();
    toB();
    expect(document.activeElement).toBe(getByRole("textbox", { name: "Filter files" }));
  });

  it("leaves the focus lost when the control has no twin and sits in no list", () => {
    const { getByRole, toB } = layouts({ a: <button aria-label="Copy SHA">C</button>, b: <button aria-label="Show commit details">S</button> });
    getByRole("button", { name: "Copy SHA" }).focus();
    toB();
    expect(document.activeElement).toBe(document.body);
  });

  it("leaves a focus outside the root alone", () => {
    const { getByRole, toB } = layouts({
      a: null,
      b: <button aria-label="Refresh">R</button>,
      outsideA: <button aria-label="Refresh">R</button>,
    });
    getByRole("button", { name: "Refresh" }).focus();
    toB();
    expect(document.activeElement).toBe(document.body);
  });

  it("leaves an element that survived the switch alone", () => {
    const { getByRole, toB } = layouts({ a: null, b: null, kept: <button aria-label="Resize commit details">|</button> });
    const kept = getByRole("button", { name: "Resize commit details" });
    kept.focus();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    toB();
    expect(getByRole("button", { name: "Resize commit details" })).toBe(kept);
    expect(document.activeElement).toBe(kept);
    expect(focus).not.toHaveBeenCalled();
  });
});
