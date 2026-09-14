import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorkdirStatus } from "../../api/types";
import { useStatusStore } from "../../store/statusStore";
import { useViewStore } from "../../store/viewStore";
import { ViewSwitch } from "./ViewSwitch";

const status = (n: Partial<WorkdirStatus>): WorkdirStatus => ({ entries: [], staged: 0, unstaged: 0, untracked: 0, conflicted: 0, state: "clean", ...n }) as WorkdirStatus;

beforeEach(() => {
  useViewStore.getState().__resetForTests();
  useStatusStore.setState({ status: status({ staged: 2, unstaged: 3, untracked: 1 }) });
});
afterEach(cleanup);

describe("ViewSwitch", () => {
  it("is a two-button group: the pressed one is the current view, Changes carries the change count", () => {
    const { getByRole } = render(<ViewSwitch />);
    const history = getByRole("button", { name: "History" });
    const changes = getByRole("button", { name: "Changes, 6 changes" });
    expect(history.getAttribute("aria-pressed")).toBe("true");
    expect(changes.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(changes);
    expect(useViewStore.getState().view).toBe("changes");
    expect(getByRole("button", { name: "Changes, 6 changes" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("compact keeps the names for assistive tech and drops the visible labels", () => {
    const { getByRole, queryByText } = render(<ViewSwitch compact />);
    expect(getByRole("button", { name: "History" })).toBeTruthy();
    expect(queryByText("History")).toBeNull();
  });
});
