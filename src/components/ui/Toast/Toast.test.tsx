import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDialogStore } from "../../../store/dialogStore";
import { useToastStore, type Toast as ToastModel } from "../../../store/toastStore";
import { Dialog } from "../Dialog/Dialog";
import { Toast, ToastStack } from "./Toast";

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

// Both buttons close through the store's `dismiss`, which is what hands the focus back.
describe("ToastStack focus", () => {
  afterEach(() => {
    useToastStore.setState({ toasts: [] });
    useDialogStore.setState({ dialog: null, returnFocus: null });
  });

  const push = (t: Omit<ToastModel, "id">) => act(() => void useToastStore.getState().push(t));

  function stackWithButton() {
    const r = render(
      <>
        <button type="button">Stage</button>
        <ToastStack />
      </>,
    );
    return { ...r, stage: r.getByRole("button", { name: "Stage" }) };
  }

  it("Retry gives the focus back to the control that failed", () => {
    const { getByRole, stage } = stackWithButton();
    const onClick = vi.fn();
    push({ kind: "error", title: "Stage failed", detail: "Index is locked", action: { label: "Retry", onClick }, origin: stage });
    fireEvent.click(getByRole("button", { name: "Retry" }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(stage);
  });

  it("Dismiss does the same", () => {
    const { getByRole, stage } = stackWithButton();
    push({ kind: "error", title: "Stage failed", origin: stage });
    fireEvent.click(getByRole("button", { name: "Dismiss" }));
    expect(document.activeElement).toBe(stage);
  });

  it("an origin that has left the document falls back to the open dialog's first field", () => {
    useDialogStore.setState({ dialog: { kind: "createTag" } });
    // The row the action came from was unmounted while the op ran.
    const gone = document.createElement("button");
    const { getByRole, getByLabelText } = render(
      <>
        <Dialog title="Create tag" onClose={() => {}}>
          <input aria-label="Name" />
        </Dialog>
        <ToastStack />
      </>,
    );
    push({ kind: "error", title: "Create tag failed", origin: gone });
    fireEvent.click(getByRole("button", { name: "Dismiss" }));
    // The body's field, not the title bar's Close.
    expect(document.activeElement).toBe(getByLabelText("Name"));
  });
});
