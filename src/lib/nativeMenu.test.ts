import { afterEach, describe, expect, it } from "vitest";
import { keepsNativeMenu } from "./nativeMenu";

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body.firstElementChild as HTMLElement;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("keepsNativeMenu", () => {
  it("keeps it in editable fields, where it is the only mouse route to paste", () => {
    const wrap = mount('<label class="input"><input /><textarea></textarea></label>');
    expect(keepsNativeMenu(wrap.querySelector("input"), false)).toBe(true);
    expect(keepsNativeMenu(wrap.querySelector("textarea"), false)).toBe(true);
    // Only the field itself: `.input` is a class on the label, not a tag match.
    expect(keepsNativeMenu(wrap, false)).toBe(false);
  });

  it("keeps it on selected `.selectable` text, not on unselected text", () => {
    const wrap = mount('<div class="selectable"><span>a diff line</span></div>');
    const span = wrap.querySelector("span");
    expect(keepsNativeMenu(span, true)).toBe(true);
    expect(keepsNativeMenu(span, false)).toBe(false);
  });

  it("suppresses it everywhere else, including a selection outside `.selectable`", () => {
    const wrap = mount('<div class="row"><span>a grid row</span></div>');
    expect(keepsNativeMenu(wrap.querySelector("span"), true)).toBe(false);
    expect(keepsNativeMenu(wrap, false)).toBe(false);
    expect(keepsNativeMenu(document, true)).toBe(false);
    expect(keepsNativeMenu(null, true)).toBe(false);
  });
});
