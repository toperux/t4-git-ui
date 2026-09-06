import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RepoSummary } from "../api/types";

const setTitle = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ setTitle }) }));

import { useRepoStore } from "../store/repoStore";
import { useWindowTitle } from "./windowTitle";

const REPO: RepoSummary = { id: "c:\\work", name: "work", path: "c:\\work", head: { oid: "a", branch: "main", detached: false } };

function Probe() {
  useWindowTitle();
  return null;
}

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  useRepoStore.setState({ repo: null });
});

describe("useWindowTitle", () => {
  it("names the app alone with no repository open", () => {
    render(<Probe />);
    expect(setTitle).toHaveBeenLastCalledWith("T4 Git");
    expect(document.title).toBe("T4 Git");
  });

  it("follows the open repository, and back when it closes", () => {
    render(<Probe />);
    act(() => useRepoStore.setState({ repo: REPO }));
    expect(setTitle).toHaveBeenLastCalledWith("T4 Git - work");
    expect(document.title).toBe("T4 Git - work");

    act(() => useRepoStore.setState({ repo: null }));
    expect(setTitle).toHaveBeenLastCalledWith("T4 Git");
    expect(document.title).toBe("T4 Git");
  });
});
