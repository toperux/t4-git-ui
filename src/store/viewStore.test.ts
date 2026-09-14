import { beforeEach, describe, expect, it } from "vitest";
import { useViewStore } from "./viewStore";

beforeEach(() => useViewStore.getState().__resetForTests());

describe("viewStore", () => {
  it("starts on History and switches", () => {
    expect(useViewStore.getState().view).toBe("history");
    useViewStore.getState().setView("changes");
    expect(useViewStore.getState().view).toBe("changes");
  });

  it("toggleRail flips the effective rail state relative to the width's default", () => {
    const st = () => useViewStore.getState();
    expect(st().railOverride).toBeNull();
    st().toggleRail(false); // wide window, sidebar full → collapse
    expect(st().railOverride).toBe(true);
    st().toggleRail(false);
    expect(st().railOverride).toBe(false);
    st().__resetForTests();
    st().toggleRail(true); // narrow window, rail by default → expand
    expect(st().railOverride).toBe(false);
  });
});
