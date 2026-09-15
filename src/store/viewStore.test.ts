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
    // Back to what the width already wanted. That is not an override, so it stores null and the width
    // takes the decision again — storing false here is what used to latch the sidebar for the session.
    st().toggleRail(false);
    expect(st().railOverride).toBeNull();
    st().__resetForTests();
    st().toggleRail(true); // narrow window, rail by default → expand
    expect(st().railOverride).toBe(false);
  });
});
