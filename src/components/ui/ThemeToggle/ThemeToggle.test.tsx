import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTheme } from "../../../theme/theme";
import { ThemeToggle } from "./ThemeToggle";

afterEach(cleanup);
beforeEach(() => setTheme("system"));

describe("ThemeToggle", () => {
  it("flips the theme, persists it, and offers the other one next", () => {
    const { getByRole } = render(<ThemeToggle />);
    expect(document.documentElement.dataset.theme).toBe("light");

    fireEvent.click(getByRole("button", { name: "Switch to dark theme" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");

    fireEvent.click(getByRole("button", { name: "Switch to light theme" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("theme")).toBe("light");
  });
});
