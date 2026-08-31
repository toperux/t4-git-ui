import { beforeEach, describe, expect, it } from "vitest";
import { HISTORY_MAX, joinMessage, loadHistory, pushHistory, splitMessage } from "./msgHistory";

beforeEach(() => localStorage.clear());

describe("msgHistory", () => {
  it("persists newest first, dedupes and caps at 20", () => {
    pushHistory("r", "one\n");
    pushHistory("r", "two\n");
    expect(loadHistory("r")).toEqual(["two\n", "one\n"]);
    pushHistory("r", "one\n");
    expect(loadHistory("r")).toEqual(["one\n", "two\n"]);
    for (let i = 0; i < 30; i++) pushHistory("r", `m${i}\n`);
    const h = loadHistory("r");
    expect(h).toHaveLength(HISTORY_MAX);
    expect(h[0]).toBe("m29\n");
    expect(loadHistory("other")).toEqual([]);
    expect(JSON.parse(localStorage.getItem("msgHistory:r")!)).toHaveLength(HISTORY_MAX);
  });

  it("tolerates garbage in storage", () => {
    localStorage.setItem("msgHistory:r", "{not json");
    expect(loadHistory("r")).toEqual([]);
    localStorage.setItem("msgHistory:r", JSON.stringify([1, "ok"]));
    expect(loadHistory("r")).toEqual(["ok"]);
  });

  it("splits and joins summary / body", () => {
    expect(splitMessage("Summary\n\nBody line 1\nline 2\n")).toEqual({ summary: "Summary", body: "Body line 1\nline 2" });
    expect(splitMessage("Only summary")).toEqual({ summary: "Only summary", body: "" });
    // CRLF messages must not leave the separator in the body.
    expect(splitMessage("Summary\r\n\r\nBody\r\n")).toEqual({ summary: "Summary", body: "Body" });
    expect(splitMessage("Summary\r\nBody")).toEqual({ summary: "Summary", body: "Body" });
    expect(joinMessage(" Summary ", "")).toBe("Summary\n");
    expect(joinMessage("Summary", "Body\n")).toBe("Summary\n\nBody\n");
  });
});
