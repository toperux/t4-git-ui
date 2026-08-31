import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_OPS, useOpsStore } from "./opsStore";

vi.mock("../api/ipc", () => ({ cancelOp: vi.fn() }));

beforeEach(() => useOpsStore.setState({ ops: [], open: false }));

describe("opsStore", () => {
  it("records started → lines (progress redraws) → exit", () => {
    const st = useOpsStore.getState();
    st.onEvent({ repoId: "r", opId: "1", event: { kind: "started", opId: "1", cmd: "git commit -F msg" } });
    st.onEvent({ repoId: "r", opId: "1", event: { kind: "stdout", line: "hook: ok" } });
    st.onEvent({ repoId: "r", opId: "1", event: { kind: "progress", line: "50%" } });
    st.onEvent({ repoId: "r", opId: "1", event: { kind: "progress", line: "100%" } });
    st.onEvent({ repoId: "r", opId: "1", event: { kind: "stderr", line: "warn" } });
    st.onEvent({ repoId: "r", opId: "unknown", event: { kind: "stdout", line: "ignored" } });
    let op = useOpsStore.getState().ops[0];
    expect(op.running).toBe(true);
    expect(op.lines).toEqual([
      { kind: "stdout", text: "hook: ok" },
      { kind: "progress", text: "100%" },
      { kind: "stderr", text: "warn" },
    ]);
    st.onEvent({ repoId: "r", opId: "1", event: { kind: "exit", code: 1, elapsedMs: 1234 } });
    op = useOpsStore.getState().ops[0];
    expect(op).toMatchObject({ running: false, code: 1, elapsedMs: 1234, cmd: "git commit -F msg" });
    expect(useOpsStore.getState().ops).toHaveLength(1);
  });

  it("keeps at most MAX_OPS records", () => {
    const st = useOpsStore.getState();
    for (let i = 0; i < MAX_OPS + 5; i++) st.onEvent({ repoId: "r", opId: `${i}`, event: { kind: "started", opId: `${i}`, cmd: `c${i}` } });
    const ops = useOpsStore.getState().ops;
    expect(ops).toHaveLength(MAX_OPS);
    expect(ops[0].opId).toBe("5");
  });
});
