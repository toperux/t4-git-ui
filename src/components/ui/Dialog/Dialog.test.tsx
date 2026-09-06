import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "../Button/Button";
import { Dialog, DialogReturnFocus, Field } from "./Dialog";

afterEach(cleanup);

function Harness({ onClose, onSubmit, busy }: { onClose: () => void; onSubmit?: () => void; busy?: boolean }) {
  return (
    <Dialog
      title="Create branch"
      onClose={onClose}
      busy={busy}
      onSubmit={onSubmit}
      preview="git checkout -b x HEAD"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit">
            Create
          </Button>
        </>
      }
    >
      <Field label="Name" help="No spaces">
        <input aria-label="Name" autoFocus />
      </Field>
    </Dialog>
  );
}

describe("Dialog", () => {
  it("is modal, focuses the autoFocus control, Esc closes and focus returns to the opener", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const onClose = vi.fn();
    const { getByRole, unmount } = render(<Harness onClose={onClose} />);
    const dialog = getByRole("dialog", { name: "Create branch" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(getByRole("textbox", { name: "Name" }));
    expect(dialog.textContent).toContain("Runs git checkout -b x HEAD");
    fireEvent.keyDown(getByRole("textbox", { name: "Name" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("a dialog replaced by another in the same commit leaves the focus on the new one's control", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { getByRole, rerender } = render(<Harness onClose={() => {}} />);
    expect(document.activeElement).toBe(getByRole("textbox", { name: "Name" }));
    rerender(
      <Dialog title="Push" onClose={() => {}}>
        <select aria-label="Remote" autoFocus>
          <option>origin</option>
        </select>
      </Dialog>,
    );
    // The closing dialog's focus-return must not pull it back to the opener (→ Close fallback).
    expect(document.activeElement).toBe(getByRole("combobox", { name: "Remote" }));
    opener.remove();
  });

  it("busy makes Esc and the close button inert", () => {
    const onClose = vi.fn();
    const { getByRole } = render(<Harness onClose={onClose} busy />);
    fireEvent.keyDown(getByRole("textbox", { name: "Name" }), { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(getByRole("button", { name: "Close" }).hasAttribute("disabled")).toBe(true);
  });

  it("a failed action takes the focus back: busy had dropped it out of the dialog", () => {
    // The submit button is disabled while busy, so the browser hands the focus to <body>; with
    // nothing focused inside, Esc never reaches the form and the Tab trap has nothing to trap.
    const onClose = vi.fn();
    const { getByRole, rerender } = render(<Harness onClose={onClose} busy />);
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    rerender(<Harness onClose={onClose} busy={false} />);
    // Into the body, not onto the title bar's Close: Enter there would throw the fields away.
    expect(document.activeElement).toBe(getByRole("textbox", { name: "Name" }));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("focus returns to the element the host names, not to whatever had focus at mount", () => {
    // A dialog opened from a menu item: the item unmounts in the same commit, so the store names the anchor.
    const anchor = document.createElement("button");
    document.body.appendChild(anchor);
    const { unmount } = render(
      <DialogReturnFocus.Provider value={anchor}>
        <Harness onClose={() => {}} />
      </DialogReturnFocus.Provider>,
    );
    unmount();
    expect(document.activeElement).toBe(anchor);
    anchor.remove();
  });

  it("the primary button submits and Tab wraps inside the dialog", () => {
    const onSubmit = vi.fn();
    const { getByRole } = render(<Harness onClose={() => {}} onSubmit={onSubmit} />);
    const create = getByRole("button", { name: "Create" });
    fireEvent.click(create);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    create.focus();
    fireEvent.keyDown(create, { key: "Tab" });
    expect(document.activeElement).toBe(getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(create);
  });
});
