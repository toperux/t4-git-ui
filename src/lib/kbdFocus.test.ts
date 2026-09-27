import { fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import "./kbdFocus";

afterEach(() => document.body.replaceChildren());

/** Focuses a fresh button, the way a script moving focus would. */
function focusNew() {
  const b = document.createElement("button");
  document.body.append(b);
  b.focus();
  return b;
}

describe("kbdFocus", () => {
  it("marks what takes focus after a key", () => {
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(focusNew().hasAttribute("data-kbd")).toBe(true);
  });

  it("leaves it unmarked after the pointer, and clears an old mark", () => {
    fireEvent.keyDown(document, { key: "ArrowDown" });
    const b = focusNew();
    fireEvent.pointerDown(document);
    focusNew();
    b.focus();
    expect(b.hasAttribute("data-kbd")).toBe(false);
  });

  it("a modifier alone after the pointer is not a key", () => {
    fireEvent.pointerDown(document);
    fireEvent.keyDown(document, { key: "Shift" });
    fireEvent.keyDown(document, { key: "Alt" });
    expect(focusNew().hasAttribute("data-kbd")).toBe(false);
  });

  it("a Ctrl or ⌘ shortcut after the pointer is not a key", () => {
    fireEvent.pointerDown(document);
    fireEvent.keyDown(document, { key: ",", ctrlKey: true });
    expect(focusNew().hasAttribute("data-kbd")).toBe(false);
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(focusNew().hasAttribute("data-kbd")).toBe(false);
  });

  it("a shortcut after a key leaves it a key, and Shift still counts", () => {
    fireEvent.keyDown(document, { key: "ArrowDown" });
    fireEvent.keyDown(document, { key: ",", ctrlKey: true });
    expect(focusNew().hasAttribute("data-kbd")).toBe(true);
    fireEvent.pointerDown(document);
    fireEvent.keyDown(document, { key: "F10", shiftKey: true });
    expect(focusNew().hasAttribute("data-kbd")).toBe(true);
  });
});
