import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Toast as ToastModel } from "../../../store/toastStore";
import { Toast } from "./Toast";

afterEach(cleanup);

const toast = (t: Partial<ToastModel> = {}): ToastModel => ({ id: 1, kind: "error", title: "Stage failed", ...t });

describe("Toast", () => {
  it("an error is an alert, anything else a status", () => {
    const { getByRole, unmount } = render(<Toast toast={toast()} onClose={() => {}} />);
    expect(getByRole("alert").textContent).toContain("Stage failed");
    unmount();
    for (const kind of ["success", "info"] as const) {
      const { getByRole, unmount } = render(<Toast toast={toast({ kind, title: kind })} onClose={() => {}} />);
      expect(getByRole("status").textContent).toContain(kind);
      unmount();
    }
  });

  it("the action replaces the toast: it closes first, then runs", () => {
    // The order matters: a Retry that runs first would toast its own failure, then be dismissed.
    const calls: string[] = [];
    const onClick = vi.fn(() => calls.push("click"));
    const onClose = vi.fn(() => calls.push("close"));
    const { getByRole } = render(<Toast toast={toast({ detail: "Index is locked", action: { label: "Retry", onClick } })} onClose={onClose} />);
    fireEvent.click(getByRole("button", { name: "Retry" }));
    expect(calls).toEqual(["close", "click"]);
  });

  it("Dismiss closes without running the action", () => {
    const onClick = vi.fn();
    const onClose = vi.fn();
    const { getByRole } = render(<Toast toast={toast({ action: { label: "Retry", onClick } })} onClose={onClose} />);
    fireEvent.click(getByRole("button", { name: "Dismiss" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });
});
