import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { listen } from "@tauri-apps/api/event";
import { onOpEvent, onOpEventReady } from "./events";

const mockedListen = listen as unknown as ReturnType<typeof vi.fn>;
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  mockedListen.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("subscribe", () => {
  it("names the event it could not listen to", async () => {
    mockedListen.mockRejectedValue(new Error("no event bus"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    onOpEvent(() => {});
    await flush();
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain("op://event");
  });

  it("op events are listened to as this window, so another window's op never lands in this dock", async () => {
    mockedListen.mockResolvedValue(() => {});
    onOpEvent(() => {});
    await onOpEventReady(() => {});
    const target = { target: { kind: "Window", label: "main" } };
    expect(mockedListen).toHaveBeenNthCalledWith(1, "op://event", expect.any(Function), target);
    expect(mockedListen).toHaveBeenNthCalledWith(2, "op://event", expect.any(Function), target);
  });
});
