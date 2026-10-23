import type { Virtualizer } from "@tanstack/react-virtual";
import { afterEach, describe, expect, it, vi } from "vitest";
import { observeVisibleRect } from "./observeVisibleRect";

// jsdom lays nothing out: the scroller's client box is whatever the test says it is.
const scroller = (box: { width: number; height: number }) => {
  const el = document.createElement("div");
  Object.defineProperty(el, "clientWidth", { get: () => box.width });
  Object.defineProperty(el, "clientHeight", { get: () => box.height });
  return { el, instance: { scrollElement: el } as unknown as Virtualizer<HTMLDivElement, Element> };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("observeVisibleRect", () => {
  it("reports the client box at once and on every callback, watching the content box", () => {
    const observed: [Element, ResizeObserverOptions | undefined][] = [];
    const disconnect = vi.fn();
    let fire = () => {};
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          fire = cb;
        }
        observe(el: Element, o?: ResizeObserverOptions) {
          observed.push([el, o]);
        }
        disconnect = disconnect;
      },
    );
    const box = { width: 800, height: 643 };
    const { el, instance } = scroller(box);
    const cb = vi.fn();
    const stop = observeVisibleRect(instance, cb);
    expect(cb.mock.calls).toEqual([[{ width: 800, height: 643 }]]);
    expect(observed).toEqual([[el, { box: "content-box" }]]);
    box.height = 633; // a horizontal scrollbar came: the border box didn't change
    fire();
    expect(cb.mock.calls[1]).toEqual([{ width: 800, height: 633 }]);
    stop?.();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("without a ResizeObserver reports once and its cleanup does nothing", () => {
    vi.stubGlobal("ResizeObserver", undefined);
    const cb = vi.fn();
    const stop = observeVisibleRect(scroller({ width: 800, height: 400 }).instance, cb);
    expect(cb.mock.calls).toEqual([[{ width: 800, height: 400 }]]);
    expect(stop).toBeTypeOf("function");
    expect(() => stop?.()).not.toThrow();
  });
});
