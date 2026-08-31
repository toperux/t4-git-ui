// Window-level shortcuts of the repo window (style guide §Keyboard hints). Ignored while the focus
// is in a text field or a dialog is open — those own their own keys.
import { useEffect } from "react";
import { useDialogStore } from "../../store/dialogStore";
import { selectRunning, useOpsStore } from "../../store/opsStore";
import { fetchDefault, refreshAll } from "./actions";

function inTextField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function useShortcuts() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || inTextField(e.target)) return;
      if (useDialogStore.getState().dialog) return;
      const open = useDialogStore.getState().open;
      const ctrl = e.ctrlKey || e.metaKey;
      const busy = selectRunning(useOpsStore.getState());
      const key = e.key.toLowerCase();

      if (e.key === "F5" && !ctrl) {
        e.preventDefault();
        refreshAll();
      } else if (ctrl && e.key === "F5") {
        e.preventDefault();
        if (!busy) void fetchDefault();
      } else if (ctrl && e.shiftKey && key === "u") {
        e.preventDefault();
        if (!busy) open({ kind: "push" });
      } else if (ctrl && e.shiftKey && key === "l") {
        e.preventDefault();
        if (!busy) open({ kind: "pull" });
      } else if (ctrl && !e.shiftKey && key === "b") {
        e.preventDefault();
        if (!busy) open({ kind: "createBranch" });
      } else if (ctrl && !e.shiftKey && e.key === "`") {
        e.preventDefault();
        useOpsStore.getState().setOpen(!useOpsStore.getState().open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
