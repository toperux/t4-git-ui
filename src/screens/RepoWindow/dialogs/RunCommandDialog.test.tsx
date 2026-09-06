// The dialog's own wiring of `CommandInput`. Whether the list actually fits above the field is
// geometry (jsdom rects are all zero) and stays a CDP step; that it asks for `up` is pinned here.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CommandInputProps } from "../../../components/ui/CommandInput/CommandInput";
import { RunCommandDialog } from "./RunCommandDialog";

const seen = vi.hoisted(() => ({ props: null as CommandInputProps | null }));
vi.mock("../../../components/ui/CommandInput/CommandInput", () => ({
  CommandInput: (props: CommandInputProps) => {
    seen.props = props;
    return <input aria-label={props["aria-label"]} />;
  },
}));

afterEach(() => {
  cleanup();
  seen.props = null;
});

describe("RunCommandDialog", () => {
  it("opens the completion list upwards: below the field it would cover the dialog's Cancel / Run", () => {
    render(<RunCommandDialog onClose={() => {}} />);
    expect(seen.props?.placement).toBe("up");
    expect(seen.props?.["aria-label"]).toBe("Git command");
  });
});
