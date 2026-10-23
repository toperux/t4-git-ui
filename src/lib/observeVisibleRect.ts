import type { Rect, Virtualizer } from "@tanstack/react-virtual";

/**
 * A virtualizer's `observeElementRect` that reports the scroller's visible box (`clientWidth` /
 * `clientHeight`) instead of virtual-core's border box: a horizontal scrollbar comes off it, so
 * `scrollToIndex` brings a line in flush above the bar, not behind it. The observer watches the
 * content box, which changes when a scrollbar comes or goes and the border box doesn't. Without a
 * ResizeObserver (jsdom) it reads once, as virtual-core does.
 */
export const observeVisibleRect = <T extends Element>(instance: Virtualizer<T, Element>, cb: (rect: Rect) => void) => {
  const el = instance.scrollElement;
  if (!el) return;
  const report = () => cb({ width: el.clientWidth, height: el.clientHeight });
  report();
  if (typeof ResizeObserver === "undefined") return () => {};
  const ro = new ResizeObserver(report);
  ro.observe(el, { box: "content-box" });
  return () => ro.disconnect();
};
