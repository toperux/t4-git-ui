import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cliDetail, MAX_TOASTS, TOAST_MS, toastError, useToastStore } from "./toastStore";

// Every test drives the auto-dismiss timer, so fake timers are the default here.
beforeEach(() => {
  vi.useFakeTimers();
  useToastStore.setState({ toasts: [] });
});
afterEach(() => vi.useRealTimers());

describe("toastStore", () => {
  it("auto-dismisses info and success but keeps errors until dismissed (style guide §3)", () => {
    const st = useToastStore.getState();
    st.push({ kind: "info", title: "Copied SHA" });
    st.push({ kind: "success", title: "Pushed" });
    const err = st.push({ kind: "error", title: "Push failed" });
    expect(useToastStore.getState().toasts).toHaveLength(3);

    vi.advanceTimersByTime(TOAST_MS + 100);
    // An error the user never saw must not vanish on its own.
    expect(useToastStore.getState().toasts.map((t) => t.title)).toEqual(["Push failed"]);

    useToastStore.getState().dismiss(err);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("dismissing an already-dismissed toast is a no-op", () => {
    const id = useToastStore.getState().push({ kind: "info", title: "Copied SHA" });
    vi.advanceTimersByTime(TOAST_MS + 100);
    expect(useToastStore.getState().toasts).toHaveLength(0);
    useToastStore.getState().dismiss(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("keeps at most MAX_TOASTS, dropping the oldest", () => {
    const st = useToastStore.getState();
    for (let i = 0; i < MAX_TOASTS + 1; i++) st.push({ kind: "error", title: `e${i}` });
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(MAX_TOASTS);
    expect(toasts[0].title).toBe("e1");
  });

  it("cliDetail keeps the first stderr line of a `cli` message", () => {
    expect(cliDetail("`git push` exited with code 1: \n error: failed to push\nhint: try pull")).toBe("error: failed to push");
    // A negative exit code (a signal) is still a prefix.
    expect(cliDetail("`git fetch` exited with code -1: boom")).toBe("boom");
    // Nothing to strip: the message is the detail.
    expect(cliDetail("plain message")).toBe("plain message");
  });
});

describe("toastError", () => {
  const toasts = () => useToastStore.getState().toasts;

  it("indexLocked explains itself and offers Retry only when one is given", () => {
    const retry = vi.fn();
    toastError({ kind: "indexLocked", message: "index.lock exists" }, "Stage failed", retry);
    expect(toasts()[0]).toMatchObject({ kind: "error", title: "Stage failed", detail: "Index is locked — another git process is running" });
    toasts()[0].action?.onClick();
    expect(retry).toHaveBeenCalledOnce();

    useToastStore.setState({ toasts: [] });
    toastError({ kind: "indexLocked", message: "index.lock exists" }, "Stage failed");
    expect(toasts()[0].action).toBeUndefined();
  });

  it("a `cli` error shows only git's first stderr line", () => {
    toastError({ kind: "cli", message: "`git push` exited with code 1: \nerror: rejected\nhint: pull first" }, "Push failed");
    expect(toasts()[0].detail).toBe("error: rejected");
  });

  it("any other kind shows the message as is, and persists", () => {
    toastError({ kind: "git", message: "not a repository" }, "Open failed");
    expect(toasts()[0]).toMatchObject({ kind: "error", detail: "not a repository" });
    vi.advanceTimersByTime(TOAST_MS * 2);
    expect(toasts()).toHaveLength(1);
  });
});
