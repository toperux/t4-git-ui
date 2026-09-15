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

  it("a click anywhere on the toast closes it", () => {
    const onClose = vi.fn();
    const { getByText } = render(<Toast toast={toast({ detail: "Index is locked" })} onClose={onClose} />);
    fireEvent.click(getByText("Stage failed"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a click on the detail leaves the toast alone, selection or not", () => {
    // The detail is the copyable half, and it stays put even with nothing selected yet: that first
    // click is also the opening of a double- or triple-click, and closing on it took the word away
    // before the second one landed. Walked 2026-09-15 — the toast vanished and nothing selected.
    const onClose = vi.fn();
    const { getByText } = render(<Toast toast={toast({ detail: "Index is locked" })} onClose={onClose} />);
    fireEvent.click(getByText("Index is locked"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("a drag that starts in the detail and ends on the title leaves the toast alone", () => {
    // The click of an overshooting selection lands on the element holding both ends, not on the
    // detail, so the press is what says it began as a selection.
    const onClose = vi.fn();
    const { getByText } = render(<Toast toast={toast({ detail: "Index is locked" })} onClose={onClose} />);
    fireEvent.mouseDown(getByText("Index is locked"));
    fireEvent.click(getByText("Stage failed"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(getByText("Stage failed"));
    fireEvent.click(getByText("Stage failed"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a press on the body is cancelled, so it cannot take the caret out of a field", () => {
    // jsdom does not move the focus on mousedown at all, so the cancellation itself is what is
    // asserted here; that it keeps the caret in place was walked in the running app.
    const { getByText, getByRole } = render(<Toast toast={toast({ detail: "Index is locked" })} onClose={vi.fn()} />);
    expect(fireEvent.mouseDown(getByText("Stage failed"))).toBe(false);
    // So is a press on ×: a focused × unmounts with the toast and the caret would fall elsewhere.
    expect(fireEvent.mouseDown(getByRole("button", { name: "Dismiss" }))).toBe(false);
    // The detail keeps its own press: cancelling there would be cancelling the drag that selects it.
    expect(fireEvent.mouseDown(getByText("Index is locked"))).toBe(true);
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
    // A real click focuses the button first; jsdom does not, so do it by hand.
    const dismiss = getByRole("button", { name: "Dismiss" });
    dismiss.focus();
    fireEvent.click(dismiss);
    // The body's field, not the title bar's Close.
    expect(document.activeElement).toBe(getByLabelText("Name"));
  });

  function dialogWithTwoFields() {
    useDialogStore.setState({ dialog: { kind: "createTag" } });
    return render(
      <>
        <Dialog title="Create tag" onClose={() => {}}>
          <input aria-label="Name" />
          <input aria-label="Message" />
        </Dialog>
        <ToastStack />
      </>,
    );
  }

  it("with no origin, Dismiss from the keyboard or a click still lands in the open dialog", () => {
    // The button takes the focus and unmounts with the toast; without the fallback the focus fell
    // to <body>, where the dialog's own Esc and Tab handling cannot reach it.
    const { getByRole, getByLabelText } = dialogWithTwoFields();
    push({ kind: "error", title: "Save failed" });
    const dismiss = getByRole("button", { name: "Dismiss" });
    dismiss.focus();
    fireEvent.click(dismiss);
    expect(document.activeElement).toBe(getByLabelText("Name"));
  });

  it("with no origin, swatting a toast away leaves the caret in the field being typed into", () => {
    const { getByText, getByLabelText } = dialogWithTwoFields();
    getByLabelText("Message").focus();
    push({ kind: "info", title: "Copied SHA" });
    fireEvent.mouseDown(getByText("Copied SHA"));
    fireEvent.click(getByText("Copied SHA"));
    expect(document.activeElement).toBe(getByLabelText("Message"));
  });
});
