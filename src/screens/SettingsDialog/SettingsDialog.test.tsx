import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// No Tauri runtime: the store plugin fails to load and lib/kv falls back to localStorage.
vi.mock("@tauri-apps/plugin-store", () => ({ load: vi.fn(() => Promise.reject(new Error("not in tauri"))) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/ipc")>();
  const pending = () => new Promise<never>(() => {});
  return { ...actual, setGitPath: vi.fn(), getFileDiff: vi.fn(pending), getChangedFiles: vi.fn(pending) };
});
vi.mock("../../theme/theme", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../theme/theme")>();
  return { ...actual, setTheme: vi.fn() };
});

import { open as openFile } from "@tauri-apps/plugin-dialog";
import * as ipc from "../../api/ipc";
import { DEFAULT_CONTEXT, useSettingsStore } from "../../store/settingsStore";
import * as theme from "../../theme/theme";
import { SettingsDialog } from "./SettingsDialog";

const mocked = ipc as unknown as Record<"setGitPath", ReturnType<typeof vi.fn>>;
const picker = openFile as unknown as ReturnType<typeof vi.fn>;
const setThemeMock = theme.setTheme as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useSettingsStore.setState({ diffContext: DEFAULT_CONTEXT, ignoreWhitespace: false, gitPath: "", gitVersion: null, gitError: null });
});
afterEach(cleanup);

describe("SettingsDialog", () => {
  it("shows the stored preferences", () => {
    useSettingsStore.setState({ diffContext: 8, ignoreWhitespace: true, gitPath: "C:\\git\\bin\\git.exe" });
    const { getByRole } = render(<SettingsDialog onClose={() => {}} />);
    expect((getByRole("textbox", { name: "Git executable" }) as HTMLInputElement).value).toBe("C:\\git\\bin\\git.exe");
    expect((getByRole("spinbutton", { name: "Context lines" }) as HTMLInputElement).value).toBe("8");
    expect((getByRole("checkbox", { name: "Ignore whitespace by default" }) as HTMLInputElement).checked).toBe(true);
  });

  it("applies the context lines once the field is left, not on every keystroke", () => {
    const setDiffContext = vi.spyOn(useSettingsStore.getState(), "setDiffContext");
    const { getByRole } = render(<SettingsDialog onClose={() => {}} />);
    const field = getByRole("spinbutton", { name: "Context lines" });
    // Typing "12" over "3" passes through "1": applying it would persist 1 and reload the diff at 1.
    fireEvent.change(field, { target: { value: "1" } });
    fireEvent.change(field, { target: { value: "12" } });
    expect(setDiffContext).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: "Enter" });
    expect(setDiffContext).toHaveBeenCalledTimes(1);
    expect(setDiffContext).toHaveBeenCalledWith(12);
  });

  it("an emptied field applies nothing and comes back with the stored value", () => {
    useSettingsStore.setState({ diffContext: 8 });
    const setDiffContext = vi.spyOn(useSettingsStore.getState(), "setDiffContext");
    const { getByRole } = render(<SettingsDialog onClose={() => {}} />);
    const field = getByRole("spinbutton", { name: "Context lines" }) as HTMLInputElement;
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.blur(field);
    expect(setDiffContext).not.toHaveBeenCalled();
    expect(useSettingsStore.getState().diffContext).toBe(8);
    expect(field.value).toBe("8");
  });

  it("applies the whitespace default as it is ticked", () => {
    const setIgnoreWhitespace = vi.spyOn(useSettingsStore.getState(), "setIgnoreWhitespace");
    const { getByRole } = render(<SettingsDialog onClose={() => {}} />);
    fireEvent.click(getByRole("checkbox", { name: "Ignore whitespace by default" }));
    expect(setIgnoreWhitespace).toHaveBeenCalledWith(true);
  });

  it("picking a theme applies it right away", () => {
    const { getByRole } = render(<SettingsDialog onClose={() => {}} />);
    fireEvent.click(getByRole("combobox", { name: "Theme" }));
    fireEvent.click(getByRole("option", { name: "Dark" }));
    expect(setThemeMock).toHaveBeenCalledWith("dark");
  });

  it("Apply tries the typed executable and reports the version", async () => {
    mocked.setGitPath.mockResolvedValue("git version 2.55.0");
    const { getByRole, findByText } = render(<SettingsDialog onClose={() => {}} />);
    fireEvent.change(getByRole("textbox", { name: "Git executable" }), { target: { value: "C:\\git\\bin\\git.exe" } });
    fireEvent.click(getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(mocked.setGitPath).toHaveBeenCalledWith("C:\\git\\bin\\git.exe"));
    expect(await findByText("git version 2.55.0")).toBeTruthy();
  });

  it("a rejected executable is reported and not kept", async () => {
    mocked.setGitPath.mockRejectedValue({ kind: "gitNotFound", message: "not a git executable" });
    const { getByRole, findByText } = render(<SettingsDialog onClose={() => {}} />);
    fireEvent.change(getByRole("textbox", { name: "Git executable" }), { target: { value: "C:\\nope.exe" } });
    fireEvent.click(getByRole("button", { name: "Apply" }));
    expect(await findByText("not a git executable")).toBeTruthy();
    expect(useSettingsStore.getState().gitPath).toBe("");
  });

  it("the rejection is cleared by an edit and is gone the next time the dialog opens", async () => {
    mocked.setGitPath.mockRejectedValue({ kind: "gitNotFound", message: "not a git executable" });
    const first = render(<SettingsDialog onClose={() => {}} />);
    const field = first.getByRole("textbox", { name: "Git executable" });
    fireEvent.change(field, { target: { value: "C:\\nope.exe" } });
    fireEvent.click(first.getByRole("button", { name: "Apply" }));
    expect(await first.findByText("not a git executable")).toBeTruthy();

    // The message describes the path that was probed, not the one being typed over it.
    fireEvent.change(field, { target: { value: "C:\\git\\bin\\git.exe" } });
    expect(first.queryByText("not a git executable")).toBe(null);
    cleanup();

    const second = render(<SettingsDialog onClose={() => {}} />);
    expect(second.getByText("Leave empty to use the git found on PATH.")).toBeTruthy();
  });

  it("strips the quotes Explorer's Copy as path leaves around the executable", async () => {
    mocked.setGitPath.mockResolvedValue("git version 2.55.0");
    const { getByRole } = render(<SettingsDialog onClose={() => {}} />);
    fireEvent.change(getByRole("textbox", { name: "Git executable" }), { target: { value: '"C:\\Program Files\\Git\\bin\\git.exe"' } });
    fireEvent.click(getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(mocked.setGitPath).toHaveBeenCalledWith("C:\\Program Files\\Git\\bin\\git.exe"));
  });

  it("Enter applies the git path and nothing else does", async () => {
    mocked.setGitPath.mockResolvedValue("git version 2.55.0");
    const { getByRole } = render(<SettingsDialog onClose={() => {}} />);
    // The dialog has no submit action: Enter in another field must not start a git probe.
    fireEvent.keyDown(getByRole("spinbutton", { name: "Context lines" }), { key: "Enter" });
    expect(mocked.setGitPath).not.toHaveBeenCalled();

    const field = getByRole("textbox", { name: "Git executable" });
    fireEvent.change(field, { target: { value: "C:\\git\\bin\\git.exe" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(mocked.setGitPath).toHaveBeenCalledWith("C:\\git\\bin\\git.exe"));
  });

  it("Locate… fills the field from the picker and applies it", async () => {
    picker.mockResolvedValue("D:\\PortableGit\\bin\\git.exe");
    mocked.setGitPath.mockResolvedValue("git version 2.51.0");
    const { getByRole } = render(<SettingsDialog onClose={() => {}} />);
    fireEvent.click(getByRole("button", { name: "Locate…" }));
    await waitFor(() => expect(mocked.setGitPath).toHaveBeenCalledWith("D:\\PortableGit\\bin\\git.exe"));
    expect((getByRole("textbox", { name: "Git executable" }) as HTMLInputElement).value).toBe("D:\\PortableGit\\bin\\git.exe");
  });
});
