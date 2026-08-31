import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "../Button/Button";
import { Dialog, Field } from "./Dialog";

afterEach(cleanup);

function Harness({ onClose, onSubmit }: { onClose: () => void; onSubmit?: () => void }) {
  return (
    <Dialog
      title="Create branch"
      onClose={onClose}
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

  it("Enter submits and Tab wraps inside the dialog", () => {
    const onSubmit = vi.fn();
    const { getByRole } = render(<Harness onClose={() => {}} onSubmit={onSubmit} />);
    fireEvent.submit(getByRole("dialog"));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const create = getByRole("button", { name: "Create" });
    create.focus();
    fireEvent.keyDown(create, { key: "Tab" });
    expect(document.activeElement).toBe(getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(create);
  });
});
