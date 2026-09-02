import { beforeEach, describe, expect, it } from "vitest";
import { CMD_HISTORY_MAX, pushCmd, useCmdHistoryStore } from "./cmdHistoryStore";

beforeEach(() => {
  localStorage.clear();
  useCmdHistoryStore.setState({ history: [] });
});

describe("pushCmd", () => {
  it("prepends, moves a repeat to the front, and caps", () => {
    expect(pushCmd(["b", "a"], "c")).toEqual(["c", "b", "a"]);
    expect(pushCmd(["c", "b", "a"], "a")).toEqual(["a", "c", "b"]);
    const full = Array.from({ length: CMD_HISTORY_MAX }, (_, i) => `l${i}`);
    expect(pushCmd(full, "new")).toHaveLength(CMD_HISTORY_MAX);
    expect(pushCmd(full, "new")[0]).toBe("new");
  });
});

describe("cmdHistoryStore", () => {
  it("push persists through kv, and load reads it back", async () => {
    useCmdHistoryStore.getState().push("status");
    useCmdHistoryStore.getState().push("log --oneline");
    expect(useCmdHistoryStore.getState().history).toEqual(["log --oneline", "status"]);
    await new Promise((r) => setTimeout(r, 0));
    useCmdHistoryStore.setState({ history: [] });
    await useCmdHistoryStore.getState().load();
    expect(useCmdHistoryStore.getState().history).toEqual(["log --oneline", "status"]);
  });

  it("load tolerates garbage in the store", async () => {
    localStorage.setItem("kv:cmdHistory", JSON.stringify([1, "ok", null]));
    await useCmdHistoryStore.getState().load();
    expect(useCmdHistoryStore.getState().history).toEqual(["ok"]);
    localStorage.setItem("kv:cmdHistory", "{not json");
    await useCmdHistoryStore.getState().load();
    expect(useCmdHistoryStore.getState().history).toEqual([]);
  });
});
