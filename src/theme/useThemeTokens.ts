// Canvas drawing can't use CSS vars, so the graph reads its metrics/colors from the
// computed root style once, and again whenever `data-theme` flips.
import { useSyncExternalStore } from "react";

export interface ThemeTokens {
  /** `--graph-0..7` */
  graph: string[];
  /** `--bg-panel` */
  panel: string;
  laneW: number;
  nodeR: number;
  laneStroke: number;
  rowH: number;
}

const FALLBACK: ThemeTokens = { graph: [], panel: "", laneW: 13, nodeR: 3.5, laneStroke: 2, rowH: 26 };

let cache: ThemeTokens | null = null;
const listeners = new Set<() => void>();
let observer: MutationObserver | null = null;

function read(): ThemeTokens {
  if (typeof document === "undefined") return FALLBACK;
  const cs = getComputedStyle(document.documentElement);
  const str = (name: string) => cs.getPropertyValue(name).trim();
  const px = (name: string, fallback: number) => parseFloat(str(name)) || fallback;
  return {
    graph: Array.from({ length: 8 }, (_, i) => str(`--graph-${i}`)),
    panel: str("--bg-panel"),
    laneW: px("--lane-w", FALLBACK.laneW),
    nodeR: px("--node-r", FALLBACK.nodeR),
    laneStroke: px("--lane-stroke", FALLBACK.laneStroke),
    rowH: px("--row-h", FALLBACK.rowH),
  };
}

export function getThemeTokens(): ThemeTokens {
  return (cache ??= read());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!observer && typeof MutationObserver !== "undefined") {
    observer = new MutationObserver(() => {
      cache = read();
      listeners.forEach((l) => l());
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && observer) {
      observer.disconnect();
      observer = null;
    }
  };
}

export function useThemeTokens(): ThemeTokens {
  return useSyncExternalStore(subscribe, getThemeTokens, getThemeTokens);
}
