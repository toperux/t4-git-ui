import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateInfo } from "../api/types";

const ask = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-dialog", () => ({ ask }));
vi.mock("../api/ipc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/ipc")>();
  return { ...actual, checkForUpdate: vi.fn(), installUpdate: vi.fn(), commitDrafts: vi.fn() };
});
vi.mock("../api/events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/events")>();
  return { ...actual, onUpdateProgressReady: vi.fn() };
});

import * as events from "../api/events";
import * as ipc from "../api/ipc";
import { useUpdateStore } from "./updateStore";

const mocked = ipc as unknown as Record<"checkForUpdate" | "installUpdate" | "commitDrafts", ReturnType<typeof vi.fn>>;
const onProgress = events.onUpdateProgressReady as unknown as ReturnType<typeof vi.fn>;

const release: UpdateInfo = { version: "0.2.0", installable: true, releaseUrl: "https://example.test/v0.2.0" };
const unlisten = vi.fn();
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  onProgress.mockResolvedValue(unlisten);
  mocked.commitDrafts.mockResolvedValue([]);
  ask.mockResolvedValue(true);
  useUpdateStore.setState({ info: null, checked: false, checking: false, installing: false, progress: null, error: null });
});

describe("updateStore.check", () => {
  it("finding nothing leaves no version and no error, and records that it asked", async () => {
    mocked.checkForUpdate.mockResolvedValue(null);
    await useUpdateStore.getState().check();
    expect(useUpdateStore.getState()).toMatchObject({ info: null, checked: true, checking: false, error: null });
  });

  // `info === null` reads the same before the first check and after one that found nothing, and the
  // dialog says "up to date" only for the second. A failed check has still answered nothing.
  it("only a check that came back counts as having asked", async () => {
    expect(useUpdateStore.getState().checked).toBe(false);
    mocked.checkForUpdate.mockRejectedValue({ kind: "network", message: "could not reach github.com" });
    await useUpdateStore.getState().check();
    expect(useUpdateStore.getState()).toMatchObject({ checked: false, error: "could not reach github.com" });
  });

  it("keeps the release a check found", async () => {
    mocked.checkForUpdate.mockResolvedValue(release);
    await useUpdateStore.getState().check();
    expect(useUpdateStore.getState()).toMatchObject({ info: release, checking: false, error: null });
  });

  it("surfaces a failed check's message and drops it when the next one starts", async () => {
    mocked.checkForUpdate.mockRejectedValue({ kind: "network", message: "could not reach github.com" });
    await useUpdateStore.getState().check();
    expect(useUpdateStore.getState()).toMatchObject({ checking: false, error: "could not reach github.com" });

    let answer: (v: UpdateInfo | null) => void = () => {};
    mocked.checkForUpdate.mockReturnValueOnce(new Promise<UpdateInfo | null>((res) => (answer = res)));
    const done = useUpdateStore.getState().check();
    // The message describes the check that failed, not the one running now.
    expect(useUpdateStore.getState()).toMatchObject({ checking: true, error: null });
    answer(release);
    await done;
    expect(useUpdateStore.getState()).toMatchObject({ info: release, checking: false });
  });
});

describe("updateStore.install", () => {
  it("listens for progress before the install starts, and reports it", async () => {
    useUpdateStore.setState({ info: release });
    let percent: (p: number | null) => void = () => {};
    onProgress.mockImplementation((cb: (p: number | null) => void) => {
      percent = cb;
      return Promise.resolve(unlisten);
    });
    let finish: () => void = () => {};
    mocked.installUpdate.mockReturnValueOnce(new Promise<void>((res) => (finish = res)));

    const done = useUpdateStore.getState().install();
    await flush();
    // The subscription is made before `install_update` is invoked, so no early percentage is lost.
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress.mock.invocationCallOrder[0]).toBeLessThan(mocked.installUpdate.mock.invocationCallOrder[0]);
    expect(mocked.installUpdate).toHaveBeenCalledTimes(1);
    expect(useUpdateStore.getState().installing).toBe(true);
    percent(42);
    expect(useUpdateStore.getState().progress).toBe(42);
    finish();
    await done;
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  // The subscription is awaited inside the try for this: `installing` disables the dialog's Close
  // and its Esc, so leaving it stuck true strands Settings — tab row and all — until a restart.
  it("a progress subscription that never attaches unsticks the UI too", async () => {
    useUpdateStore.setState({ info: release });
    onProgress.mockRejectedValue({ kind: "io", message: "could not subscribe to progress" });
    await useUpdateStore.getState().install();
    expect(useUpdateStore.getState()).toMatchObject({
      installing: false,
      progress: null,
      error: "could not subscribe to progress",
      info: release,
    });
    // Nothing to unlisten, and the install was never started.
    expect(unlisten).not.toHaveBeenCalled();
    expect(mocked.installUpdate).not.toHaveBeenCalled();
  });

  it("a failed install unsticks the UI: the message shows, the progress bar goes", async () => {
    useUpdateStore.setState({ info: release });
    mocked.installUpdate.mockRejectedValue({ kind: "io", message: "signature did not verify" });
    await useUpdateStore.getState().install();
    expect(useUpdateStore.getState()).toMatchObject({
      installing: false,
      progress: null,
      error: "signature did not verify",
      // The release is still known, so the button can be pressed again.
      info: release,
    });
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it("asks first when a commit message is typed in any window, and a No installs nothing", async () => {
    useUpdateStore.setState({ info: release });
    mocked.commitDrafts.mockResolvedValue(["api", "web"]);
    ask.mockResolvedValue(false);
    await useUpdateStore.getState().install();
    expect(ask.mock.calls[0][0]).toContain("api, web");
    expect(mocked.installUpdate).not.toHaveBeenCalled();
    expect(useUpdateStore.getState()).toMatchObject({ installing: false, error: null });
  });

  it("a Yes installs; no draft installs without asking", async () => {
    useUpdateStore.setState({ info: release });
    mocked.installUpdate.mockResolvedValue(undefined);
    mocked.commitDrafts.mockResolvedValueOnce(["api"]);
    await useUpdateStore.getState().install();
    expect(mocked.installUpdate).toHaveBeenCalledTimes(1);
    await useUpdateStore.getState().install();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(mocked.installUpdate).toHaveBeenCalledTimes(2);
  });

  it("a second Install click during the confirm is refused, not a second install flow", async () => {
    useUpdateStore.setState({ info: release });
    mocked.commitDrafts.mockResolvedValue(["api"]);
    let resolveAsk!: (v: boolean) => void;
    ask.mockReturnValueOnce(new Promise<boolean>((res) => (resolveAsk = res)));
    const first = useUpdateStore.getState().install();
    await flush();
    expect(ask).toHaveBeenCalledTimes(1);

    await useUpdateStore.getState().install();
    expect(ask).toHaveBeenCalledTimes(1);
    expect(mocked.installUpdate).not.toHaveBeenCalled();

    resolveAsk(false);
    await first;
  });
});

describe("updateStore.learn", () => {
  // Another window's check came back: this one shows the same offer without a network call of its own.
  it("takes another window's answer as this window's own", () => {
    useUpdateStore.setState({ error: "couldn't reach GitHub" });
    useUpdateStore.getState().learn(release);
    // Its own failed check is answered now: the stale message would sit beside a live offer.
    expect(useUpdateStore.getState()).toMatchObject({ info: release, checked: true, error: null });
    expect(mocked.checkForUpdate).not.toHaveBeenCalled();
  });

  it("leaves a failed install's message alone while one runs", () => {
    useUpdateStore.setState({ installing: true, error: "the download was interrupted" });
    useUpdateStore.getState().learn(release);
    expect(useUpdateStore.getState().error).toBe("the download was interrupted");
  });
});
