import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("./lib/kv", () => ({ kvGet: vi.fn(() => Promise.resolve(null)), kvSet: vi.fn(() => Promise.resolve()) }));
vi.mock("./api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api/ipc")>();
  return { ...actual, probeGit: vi.fn(), setGitPath: vi.fn() };
});
vi.mock("./api/events", () => ({
  onLogProgress: vi.fn(() => () => {}),
  onRepoChanged: vi.fn(() => () => {}),
  onOpEvent: vi.fn(() => () => {}),
}));

import * as ipc from "./api/ipc";
import App from "./App";

const mocked = ipc as unknown as Record<"probeGit", ReturnType<typeof vi.fn>>;

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
});

describe("App", () => {
  it("sends a git below the 2.24 floor to the missing screen, naming the version", async () => {
    mocked.probeGit.mockResolvedValue({ version: "git version 2.23.0", tooOld: true });
    const { findByText, getByText } = render(<App />);
    expect(await findByText(/Found git version 2\.23\.0, which is older than the required git 2\.24\./)).toBeTruthy();
    expect(getByText("Git not found")).toBeTruthy();
  });
});
