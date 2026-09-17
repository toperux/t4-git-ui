import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// No Tauri runtime: the store plugin fails to load and lib/kv falls back to localStorage.
vi.mock("@tauri-apps/plugin-store", () => ({ load: vi.fn(() => Promise.reject(new Error("not in tauri"))) }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("../../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../api/ipc")>();
  const pending = () => new Promise<never>(() => {});
  return { ...actual, setGitPath: vi.fn(), getFileDiff: vi.fn(pending), getChangedFiles: vi.fn(pending), getSigning: vi.fn(), setSigning: vi.fn() };
});
vi.mock("../../theme/theme", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../theme/theme")>();
  return { ...actual, setTheme: vi.fn() };
});

import { open as openFile } from "@tauri-apps/plugin-dialog";
import * as ipc from "../../api/ipc";
import { SIGNING_KEYS, type SigningConfig } from "../../api/types";
import { DEFAULT_CONTEXT, DEFAULT_FOLDERS_MAX, useSettingsStore } from "../../store/settingsStore";
import { useUpdateStore } from "../../store/updateStore";
import * as theme from "../../theme/theme";
import { SettingsDialog } from "./SettingsDialog";

const mocked = ipc as unknown as Record<"setGitPath" | "getSigning" | "setSigning", ReturnType<typeof vi.fn>>;
const picker = openFile as unknown as ReturnType<typeof vi.fn>;
const setThemeMock = theme.setTheme as unknown as ReturnType<typeof vi.fn>;

/** The sections sit on three tabs, and a hidden panel's controls are out of the a11y tree. */
const goTo = (r: ReturnType<typeof render>, name: string) => fireEvent.click(r.getByRole("tab", { name }));

/** Every signing key unset, with the named ones overridden. */
const signing = (over: Partial<SigningConfig> = {}): SigningConfig =>
  ({ ...Object.fromEntries(SIGNING_KEYS.map((k) => [k, { value: null, local: false }])), ...over }) as SigningConfig;

beforeEach(() => {
  vi.clearAllMocks();
  // `clearAllMocks` keeps implementations: put the defaults back so one test's config is not the next one's.
  mocked.getSigning.mockResolvedValue(signing());
  mocked.setSigning.mockResolvedValue(undefined);
  localStorage.clear();
  useSettingsStore.setState({
    diffContext: DEFAULT_CONTEXT,
    ignoreWhitespace: false,
    gitPath: "",
    gitVersion: null,
    gitError: null,
    sidebarFolders: "expanded",
    sidebarFoldersMax: DEFAULT_FOLDERS_MAX,
  });
  // Shared with the dialog through `busy`, so a test that sets it must not leak into the next one.
  useUpdateStore.setState({ info: null, checked: false, checking: false, installing: false, progress: null, error: null });
});
afterEach(cleanup);

describe("SettingsDialog", () => {
  it("shows the stored preferences", () => {
    useSettingsStore.setState({ diffContext: 8, ignoreWhitespace: true, gitPath: "C:\\git\\bin\\git.exe" });
    const r = render(<SettingsDialog onClose={() => {}} />);
    const { getByRole } = r;
    goTo(r, "Git");
    expect((getByRole("textbox", { name: "Git executable" }) as HTMLInputElement).value).toBe("C:\\git\\bin\\git.exe");
    goTo(r, "Diff & merge");
    expect((getByRole("spinbutton", { name: "Context lines" }) as HTMLInputElement).value).toBe("8");
    expect((getByRole("checkbox", { name: "Ignore whitespace by default" }) as HTMLInputElement).checked).toBe(true);
  });

  it("applies the context lines once the field is left, not on every keystroke", () => {
    const setDiffContext = vi.spyOn(useSettingsStore.getState(), "setDiffContext");
    const r = render(<SettingsDialog onClose={() => {}} />);
    goTo(r, "Diff & merge");
    const field = r.getByRole("spinbutton", { name: "Context lines" });
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
    const r = render(<SettingsDialog onClose={() => {}} />);
    goTo(r, "Diff & merge");
    const field = r.getByRole("spinbutton", { name: "Context lines" }) as HTMLInputElement;
    fireEvent.change(field, { target: { value: "" } });
    fireEvent.blur(field);
    expect(setDiffContext).not.toHaveBeenCalled();
    expect(useSettingsStore.getState().diffContext).toBe(8);
    expect(field.value).toBe("8");
  });

  it("applies the whitespace default as it is ticked", () => {
    const setIgnoreWhitespace = vi.spyOn(useSettingsStore.getState(), "setIgnoreWhitespace");
    const r = render(<SettingsDialog onClose={() => {}} />);
    goTo(r, "Diff & merge");
    fireEvent.click(r.getByRole("checkbox", { name: "Ignore whitespace by default" }));
    expect(setIgnoreWhitespace).toHaveBeenCalledWith(true);
  });

  it("shows the sidebar folder rule, the threshold enabled only for the auto mode", () => {
    const { getByRole } = render(<SettingsDialog onClose={() => {}} />);
    const max = () => getByRole("spinbutton", { name: "Refs per folder" }) as HTMLInputElement;
    expect(getByRole("combobox", { name: "Sidebar folders" }).textContent).toBe("Always expanded");
    expect(max().value).toBe(String(DEFAULT_FOLDERS_MAX));
    expect(max().disabled).toBe(true);

    fireEvent.click(getByRole("combobox", { name: "Sidebar folders" }));
    fireEvent.click(getByRole("option", { name: "Collapsed when more than N refs" }));
    expect(useSettingsStore.getState().sidebarFolders).toBe("auto");
    expect(max().disabled).toBe(false);

    // Like the context lines: typed freely, applied on Enter.
    fireEvent.change(max(), { target: { value: "4" } });
    expect(useSettingsStore.getState().sidebarFoldersMax).toBe(DEFAULT_FOLDERS_MAX);
    fireEvent.keyDown(max(), { key: "Enter" });
    expect(useSettingsStore.getState().sidebarFoldersMax).toBe(4);
  });

  it("picking a theme applies it right away", () => {
    const { getByRole } = render(<SettingsDialog onClose={() => {}} />);
    fireEvent.click(getByRole("combobox", { name: "Theme" }));
    fireEvent.click(getByRole("option", { name: "Dark" }));
    expect(setThemeMock).toHaveBeenCalledWith("dark");
  });

  it("Apply tries the typed executable and reports the version", async () => {
    mocked.setGitPath.mockResolvedValue("git version 2.55.0");
    const r = render(<SettingsDialog onClose={() => {}} />);
    const { getByRole, findByText } = r;
    goTo(r, "Git");
    fireEvent.change(getByRole("textbox", { name: "Git executable" }), { target: { value: "C:\\git\\bin\\git.exe" } });
    fireEvent.click(getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(mocked.setGitPath).toHaveBeenCalledWith("C:\\git\\bin\\git.exe"));
    expect(await findByText("git version 2.55.0")).toBeTruthy();
  });

  it("a rejected executable is reported and not kept", async () => {
    mocked.setGitPath.mockRejectedValue({ kind: "gitNotFound", message: "not a git executable" });
    const r = render(<SettingsDialog onClose={() => {}} />);
    const { getByRole, findByText } = r;
    goTo(r, "Git");
    fireEvent.change(getByRole("textbox", { name: "Git executable" }), { target: { value: "C:\\nope.exe" } });
    fireEvent.click(getByRole("button", { name: "Apply" }));
    expect(await findByText("not a git executable")).toBeTruthy();
    expect(useSettingsStore.getState().gitPath).toBe("");
  });

  it("the rejection is cleared by an edit and is gone the next time the dialog opens", async () => {
    mocked.setGitPath.mockRejectedValue({ kind: "gitNotFound", message: "not a git executable" });
    const first = render(<SettingsDialog onClose={() => {}} />);
    goTo(first, "Git");
    const field = first.getByRole("textbox", { name: "Git executable" });
    fireEvent.change(field, { target: { value: "C:\\nope.exe" } });
    fireEvent.click(first.getByRole("button", { name: "Apply" }));
    expect(await first.findByText("not a git executable")).toBeTruthy();

    // The message describes the path that was probed, not the one being typed over it.
    fireEvent.change(field, { target: { value: "C:\\git\\bin\\git.exe" } });
    expect(first.queryByText("not a git executable")).toBe(null);
    cleanup();

    const second = render(<SettingsDialog onClose={() => {}} />);
    goTo(second, "Git");
    expect(second.getByText("Leave empty to use the git found on PATH.")).toBeTruthy();
  });

  it("strips the quotes Explorer's Copy as path leaves around the executable", async () => {
    mocked.setGitPath.mockResolvedValue("git version 2.55.0");
    const r = render(<SettingsDialog onClose={() => {}} />);
    const { getByRole } = r;
    goTo(r, "Git");
    fireEvent.change(getByRole("textbox", { name: "Git executable" }), { target: { value: '"C:\\Program Files\\Git\\bin\\git.exe"' } });
    fireEvent.click(getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(mocked.setGitPath).toHaveBeenCalledWith("C:\\Program Files\\Git\\bin\\git.exe"));
  });

  it("Enter applies the git path and nothing else does", async () => {
    mocked.setGitPath.mockResolvedValue("git version 2.55.0");
    const r = render(<SettingsDialog onClose={() => {}} />);
    const { getByRole } = r;
    // The dialog has no submit action: Enter in another field must not start a git probe.
    goTo(r, "Diff & merge");
    fireEvent.keyDown(getByRole("spinbutton", { name: "Context lines" }), { key: "Enter" });
    expect(mocked.setGitPath).not.toHaveBeenCalled();

    goTo(r, "Git");
    const field = getByRole("textbox", { name: "Git executable" });
    fireEvent.change(field, { target: { value: "C:\\git\\bin\\git.exe" } });
    fireEvent.keyDown(field, { key: "Enter" });
    await waitFor(() => expect(mocked.setGitPath).toHaveBeenCalledWith("C:\\git\\bin\\git.exe"));
  });

  it("Locate… fills the field from the picker and applies it", async () => {
    picker.mockResolvedValue("D:\\PortableGit\\bin\\git.exe");
    mocked.setGitPath.mockResolvedValue("git version 2.51.0");
    const r = render(<SettingsDialog onClose={() => {}} />);
    const { getByRole } = r;
    goTo(r, "Git");
    fireEvent.click(getByRole("button", { name: "Locate…" }));
    await waitFor(() => expect(mocked.setGitPath).toHaveBeenCalledWith("D:\\PortableGit\\bin\\git.exe"));
    expect((getByRole("textbox", { name: "Git executable" }) as HTMLInputElement).value).toBe("D:\\PortableGit\\bin\\git.exe");
  });

  it("opens on General and the tabs swap which sections are reachable", () => {
    const r = render(<SettingsDialog onClose={() => {}} />);
    expect(r.getByRole("tab", { name: "General" }).getAttribute("aria-selected")).toBe("true");
    expect(r.queryByRole("spinbutton", { name: "Context lines" })).toBe(null);

    goTo(r, "Diff & merge");
    expect(r.getByRole("spinbutton", { name: "Context lines" })).toBeTruthy();
    expect(r.queryByRole("textbox", { name: "Git executable" })).toBe(null);

    // ←/→ move the selection, as a tab strip is expected to.
    const diff = r.getByRole("tab", { name: "Diff & merge" });
    fireEvent.keyDown(diff, { key: "ArrowLeft" });
    expect(r.getByRole("tab", { name: "Git" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(r.getByRole("tab", { name: "Git" }), { key: "ArrowRight" });
    expect(r.getByRole("tab", { name: "Diff & merge" }).getAttribute("aria-selected")).toBe("true");
  });

  // Updates sits on General and a download disables Close, so wandering to another tab would leave
  // a dialog that won't close with nothing on screen saying why.
  it("a running download locks the tab row", () => {
    useUpdateStore.setState({ installing: true, progress: 40 });
    const r = render(<SettingsDialog onClose={() => {}} />);
    for (const name of ["General", "Git", "Diff & merge"]) {
      expect((r.getByRole("tab", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    // The progress it explains stays on screen with them.
    expect(r.getByRole("progressbar", { name: "Downloading update" })).toBeTruthy();
  });
});

describe("SettingsDialog ▸ Signing", () => {
  it("shows the effective values, and says which keys the repository sets itself", async () => {
    mocked.getSigning.mockResolvedValue(
      signing({
        "gpg.format": { value: "ssh", local: false },
        "user.signingkey": { value: "~/.ssh/id_ed25519.pub", local: true },
        "gpg.ssh.program": { value: "/usr/bin/ssh-keygen", local: false },
        "commit.gpgsign": { value: "true", local: false },
      }),
    );
    const r = render(<SettingsDialog onClose={() => {}} />);
    const { getByRole, findByText, queryByText } = r;
    goTo(r, "Git");
    await waitFor(() => expect(getByRole("combobox", { name: "Signing format" }).textContent).toBe("SSH"));
    // The two text fields are seeded from the config by an effect, so they land a commit behind the select.
    await waitFor(() => expect((getByRole("textbox", { name: "Signing key" }) as HTMLInputElement).value).toBe("~/.ssh/id_ed25519.pub"));
    // The SSH format's program key, not gpg.program.
    expect((getByRole("textbox", { name: "Signing program" }) as HTMLInputElement).value).toBe("/usr/bin/ssh-keygen");
    expect((getByRole("checkbox", { name: "Sign commits" }) as HTMLInputElement).checked).toBe(true);
    expect((getByRole("checkbox", { name: "Sign annotated tags" }) as HTMLInputElement).checked).toBe(false);
    expect(await findByText("Also set in this repository, which wins over this.")).toBeTruthy();
    expect(queryByText("gpg.ssh.program — leave empty to use the one on PATH.")).toBeTruthy();
  });

  it("writes each field to the global config", async () => {
    const r = render(<SettingsDialog onClose={() => {}} />);
    const { getByRole } = r;
    goTo(r, "Git");
    await waitFor(() => expect(mocked.getSigning).toHaveBeenCalledWith(null));
    // A save disables the section until the re-read lands; wait it out before the next one.
    const idle = () => waitFor(() => expect((getByRole("textbox", { name: "Signing key" }) as HTMLInputElement).disabled).toBe(false));

    fireEvent.click(getByRole("combobox", { name: "Signing format" }));
    fireEvent.click(getByRole("option", { name: "SSH" }));
    await waitFor(() => expect(mocked.setSigning).toHaveBeenCalledWith("gpg.format", "ssh"));
    await idle();

    const key = getByRole("textbox", { name: "Signing key" });
    fireEvent.change(key, { target: { value: "ABCD1234" } });
    // Typed, not yet saved: the write happens on Enter (or once the field is left).
    expect(mocked.setSigning).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(key, { key: "Enter" });
    await waitFor(() => expect(mocked.setSigning).toHaveBeenCalledWith("user.signingkey", "ABCD1234"));
    await idle();

    const program = getByRole("textbox", { name: "Signing program" });
    fireEvent.change(program, { target: { value: "C:\\gpg.exe" } });
    fireEvent.blur(program);
    await waitFor(() => expect(mocked.setSigning).toHaveBeenCalledWith("gpg.program", "C:\\gpg.exe"));
    await idle();

    fireEvent.click(getByRole("checkbox", { name: "Sign commits" }));
    await waitFor(() => expect(mocked.setSigning).toHaveBeenCalledWith("commit.gpgsign", "true"));
    await idle();
    fireEvent.click(getByRole("checkbox", { name: "Sign annotated tags" }));
    await waitFor(() => expect(mocked.setSigning).toHaveBeenCalledWith("tag.gpgsign", "true"));
  });

  it("an emptied field clears the key instead of writing an empty value", async () => {
    mocked.getSigning.mockResolvedValue(signing({ "user.signingkey": { value: "ABCD1234", local: false } }));
    const r = render(<SettingsDialog onClose={() => {}} />);
    const { getByRole } = r;
    goTo(r, "Git");
    const key = () => getByRole("textbox", { name: "Signing key" }) as HTMLInputElement;
    await waitFor(() => expect(key().value).toBe("ABCD1234"));
    fireEvent.change(key(), { target: { value: "  " } });
    fireEvent.blur(key());
    await waitFor(() => expect(mocked.setSigning).toHaveBeenCalledWith("user.signingkey", null));
  });
});
