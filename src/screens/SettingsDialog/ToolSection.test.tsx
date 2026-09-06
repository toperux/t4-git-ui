import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/ipc")>();
  return { ...actual, findTool: vi.fn(() => Promise.resolve(null)), setTool: vi.fn(() => Promise.resolve()) };
});

import { open as openFile } from "@tauri-apps/plugin-dialog";
import * as ipc from "../../api/ipc";
import { useSettingsStore } from "../../store/settingsStore";
import { useToastStore } from "../../store/toastStore";
import { ToolSection } from "./ToolSection";

const mocked = ipc as unknown as Record<"findTool" | "setTool", ReturnType<typeof vi.fn>>;
const picker = openFile as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  // `clearAllMocks` keeps implementations: put the defaults back so one test's lookup result
  // (or refusal) is not the next one's.
  mocked.findTool.mockResolvedValue(null);
  mocked.setTool.mockResolvedValue(undefined);
  useSettingsStore.setState({ tools: { diff: null, merge: null } });
  useToastStore.setState({ toasts: [] });
});
afterEach(cleanup);

/** The app's `Select` is a listbox: click the trigger, then the option. */
function pickOption(getByRole: ReturnType<typeof render>["getByRole"], select: string, option: string) {
  fireEvent.click(getByRole("combobox", { name: select }));
  fireEvent.click(getByRole("option", { name: option }));
}

describe("ToolSection", () => {
  it("loads a stored template tool with its path and command", () => {
    useSettingsStore.setState({
      tools: { diff: null, merge: { name: "kdiff3", path: "C:\\KDiff3\\kdiff3.exe", cmd: '"C:\\KDiff3\\kdiff3.exe" "$BASE"' } },
    });
    const { getByRole } = render(<ToolSection kind="merge" />);
    expect(getByRole("combobox", { name: "Merge tool" }).textContent).toBe("KDiff3");
    expect((getByRole("textbox", { name: "Merge tool path" }) as HTMLInputElement).value).toBe("C:\\KDiff3\\kdiff3.exe");
    expect((getByRole("textbox", { name: "Merge tool command" }) as HTMLInputElement).value).toBe('"C:\\KDiff3\\kdiff3.exe" "$BASE"');
    // A template's name is git's own: no name field to edit.
    expect(() => getByRole("textbox", { name: "Merge tool name" })).toThrow();
    // Nothing is looked up for a tool that is already configured.
    expect(mocked.findTool).not.toHaveBeenCalled();
  });

  it("a name that is not one of the templates lands in Custom, with its own name field", () => {
    // What GitExtensions leaves behind (`BeyondCompare4`); there is no alias table.
    useSettingsStore.setState({ tools: { diff: { name: "BeyondCompare4", path: "C:\\BC\\BComp.exe", cmd: '"C:\\BC\\BComp.exe" x' }, merge: null } });
    const { getByRole } = render(<ToolSection kind="diff" />);
    expect(getByRole("combobox", { name: "Diff tool" }).textContent).toBe("Custom");
    expect((getByRole("textbox", { name: "Diff tool name" }) as HTMLInputElement).value).toBe("BeyondCompare4");
    expect((getByRole("textbox", { name: "Diff tool command" }) as HTMLInputElement).value).toBe('"C:\\BC\\BComp.exe" x');
  });

  it("picking a template looks the tool up and fills path and command", async () => {
    mocked.findTool.mockResolvedValue("C:\\Program Files\\Beyond Compare 5\\BComp.exe");
    const { getByRole } = render(<ToolSection kind="diff" />);
    pickOption(getByRole, "Diff tool", "Beyond Compare");

    await waitFor(() =>
      expect(mocked.findTool).toHaveBeenCalledWith(
        ["bcomp", "bcompare"],
        ["Beyond Compare 5/BComp.exe", "Beyond Compare 4/BComp.exe", "Beyond Compare.app/Contents/MacOS/bcomp"],
      ),
    );
    expect((getByRole("textbox", { name: "Diff tool path" }) as HTMLInputElement).value).toBe("C:\\Program Files\\Beyond Compare 5\\BComp.exe");
    expect((getByRole("textbox", { name: "Diff tool command" }) as HTMLInputElement).value).toBe('"C:\\Program Files\\Beyond Compare 5\\BComp.exe" "$LOCAL" "$REMOTE"');
  });

  it("a tool that is not installed says so, and Suggest tries again", async () => {
    const { getByRole, findByText } = render(<ToolSection kind="merge" />);
    pickOption(getByRole, "Merge tool", "KDiff3");
    expect(await findByText("Not found — Locate it")).toBeTruthy();

    mocked.findTool.mockResolvedValue("C:\\KDiff3\\kdiff3.exe");
    fireEvent.click(getByRole("button", { name: "Suggest" }));
    await waitFor(() => expect((getByRole("textbox", { name: "Merge tool path" }) as HTMLInputElement).value).toBe("C:\\KDiff3\\kdiff3.exe"));
    // The merge line, not the diff one.
    expect((getByRole("textbox", { name: "Merge tool command" }) as HTMLInputElement).value).toBe('"C:\\KDiff3\\kdiff3.exe" "$BASE" "$LOCAL" "$REMOTE" -o "$MERGED"');
  });

  it("Locate… fills the path and re-derives the command", async () => {
    picker.mockResolvedValue("D:\\tools\\kdiff3.exe");
    const { getByRole } = render(<ToolSection kind="merge" />);
    pickOption(getByRole, "Merge tool", "KDiff3");
    await waitFor(() => expect(mocked.findTool).toHaveBeenCalled());

    fireEvent.click(getByRole("button", { name: "Locate the merge tool" }));
    await waitFor(() => expect((getByRole("textbox", { name: "Merge tool path" }) as HTMLInputElement).value).toBe("D:\\tools\\kdiff3.exe"));
    expect((getByRole("textbox", { name: "Merge tool command" }) as HTMLInputElement).value).toBe('"D:\\tools\\kdiff3.exe" "$BASE" "$LOCAL" "$REMOTE" -o "$MERGED"');
  });

  it("a command the user wrote is kept when the path changes", async () => {
    mocked.findTool.mockResolvedValue("C:\\KDiff3\\kdiff3.exe");
    const { getByRole } = render(<ToolSection kind="merge" />);
    pickOption(getByRole, "Merge tool", "KDiff3");
    await waitFor(() => expect(mocked.findTool).toHaveBeenCalled());

    const cmd = getByRole("textbox", { name: "Merge tool command" }) as HTMLInputElement;
    fireEvent.change(cmd, { target: { value: '"C:\\mine.exe" "$MERGED"' } });
    fireEvent.change(getByRole("textbox", { name: "Merge tool path" }), { target: { value: "C:\\other.exe" } });
    expect(cmd.value).toBe('"C:\\mine.exe" "$MERGED"');
  });

  it("a command written under one template does not stop the next template's from deriving", async () => {
    mocked.findTool.mockResolvedValue("C:\\KDiff3\\kdiff3.exe");
    const { getByRole } = render(<ToolSection kind="diff" />);
    pickOption(getByRole, "Diff tool", "Custom");
    fireEvent.change(getByRole("textbox", { name: "Diff tool command" }), { target: { value: "x" } });
    pickOption(getByRole, "Diff tool", "KDiff3");
    const cmd = getByRole("textbox", { name: "Diff tool command" }) as HTMLInputElement;
    await waitFor(() => expect(cmd.value).toBe('"C:\\KDiff3\\kdiff3.exe" "$LOCAL" "$REMOTE"'));
  });

  it("Apply saves the tool and toasts it; Enter in the command does the same", async () => {
    mocked.findTool.mockResolvedValue("C:\\KDiff3\\kdiff3.exe");
    const { getByRole } = render(<ToolSection kind="merge" />);
    pickOption(getByRole, "Merge tool", "KDiff3");
    await waitFor(() => expect(mocked.findTool).toHaveBeenCalled());

    fireEvent.click(getByRole("button", { name: "Apply merge tool" }));
    await waitFor(() =>
      expect(mocked.setTool).toHaveBeenCalledWith("merge", {
        name: "kdiff3",
        path: "C:\\KDiff3\\kdiff3.exe",
        cmd: '"C:\\KDiff3\\kdiff3.exe" "$BASE" "$LOCAL" "$REMOTE" -o "$MERGED"',
      }),
    );
    expect(useToastStore.getState().toasts.map((t) => t.title)).toEqual(["Merge tool: KDiff3"]);

    fireEvent.keyDown(getByRole("textbox", { name: "Merge tool command" }), { key: "Enter" });
    await waitFor(() => expect(mocked.setTool).toHaveBeenCalledTimes(2));
  });

  it("None clears the selector", async () => {
    useSettingsStore.setState({ tools: { diff: { name: "bc", path: "p", cmd: "c" }, merge: null } });
    const { getByRole } = render(<ToolSection kind="diff" />);
    pickOption(getByRole, "Diff tool", "None");
    fireEvent.click(getByRole("button", { name: "Apply diff tool" }));
    await waitFor(() => expect(mocked.setTool).toHaveBeenCalledWith("diff", null));
    expect(useToastStore.getState().toasts.map((t) => t.title)).toEqual(["Diff tool cleared"]);
  });

  it("a custom tool needs a name git can use", async () => {
    const { getByRole, findByText } = render(<ToolSection kind="diff" />);
    pickOption(getByRole, "Diff tool", "Custom");
    fireEvent.click(getByRole("button", { name: "Apply diff tool" }));
    expect(await findByText("Enter a name")).toBeTruthy();
    expect(mocked.setTool).not.toHaveBeenCalled();

    // Ref-name rules: a space is what a config key cannot carry.
    fireEvent.change(getByRole("textbox", { name: "Diff tool name" }), { target: { value: "my tool" } });
    fireEvent.click(getByRole("button", { name: "Apply diff tool" }));
    expect(await findByText("No spaces")).toBeTruthy();

    fireEvent.change(getByRole("textbox", { name: "Diff tool name" }), { target: { value: "my-tool" } });
    // And a command: without one the tool would only fail at the launch.
    fireEvent.click(getByRole("button", { name: "Apply diff tool" }));
    expect(await findByText("Enter a command")).toBeTruthy();
    expect(mocked.setTool).not.toHaveBeenCalled();

    fireEvent.change(getByRole("textbox", { name: "Diff tool command" }), { target: { value: '"C:\\x.exe" "$LOCAL" "$REMOTE"' } });
    fireEvent.click(getByRole("button", { name: "Apply diff tool" }));
    await waitFor(() => expect(mocked.setTool).toHaveBeenCalledWith("diff", { name: "my-tool", path: "", cmd: '"C:\\x.exe" "$LOCAL" "$REMOTE"' }));
  });

  it("offers the Windows-only templates on Windows only", async () => {
    // The list is read once, at import: the user agent has to be in place before it.
    const ua = vi.spyOn(navigator, "userAgent", "get");
    const templates = async (agent: string) => {
      ua.mockReturnValue(agent);
      vi.resetModules();
      const m = await import("../../lib/externalTools");
      return m.TEMPLATES.map((t) => t.id);
    };

    const linux = await templates("Mozilla/5.0 (X11; Linux x86_64)");
    expect(linux).not.toContain("winmerge");
    expect(linux).not.toContain("tortoisemerge");
    expect(linux).toContain("kdiff3");

    const windows = await templates("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    expect(windows).toContain("winmerge");
    expect(windows).toContain("tortoisemerge");

    ua.mockRestore();
    vi.resetModules();
  });

  it("a refused write is reported and the fields stay as they were", async () => {
    mocked.findTool.mockResolvedValue("C:\\KDiff3\\kdiff3.exe");
    mocked.setTool.mockRejectedValue({ kind: "io", message: "could not write ~/.gitconfig" });
    const { getByRole } = render(<ToolSection kind="merge" />);
    pickOption(getByRole, "Merge tool", "KDiff3");
    await waitFor(() => expect(mocked.findTool).toHaveBeenCalled());

    fireEvent.click(getByRole("button", { name: "Apply merge tool" }));
    await waitFor(() => expect(useToastStore.getState().toasts[0]?.title).toBe("Couldn't save the merge tool"));
    expect(useSettingsStore.getState().tools.merge).toBe(null);
    expect((getByRole("textbox", { name: "Merge tool path" }) as HTMLInputElement).value).toBe("C:\\KDiff3\\kdiff3.exe");
  });
});
