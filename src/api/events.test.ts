import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

import { listen } from "@tauri-apps/api/event";
import { onOpEvent } from "./events";

const mockedListen = listen as unknown as ReturnType<typeof vi.fn>;
const flush = () => new Promise((r) => setTimeout(r, 0));

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
});
