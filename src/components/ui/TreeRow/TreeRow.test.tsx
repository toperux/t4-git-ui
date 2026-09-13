import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TreeRow } from "./TreeRow";

afterEach(cleanup);

describe("TreeRow folders", () => {
  it("draws its own folder icon, open or closed, and marks the row", () => {
    const { container, rerender } = render(<TreeRow folder expanded={false} label="feature" />);
    const row = container.querySelector("button")!;
    expect(row.className).toMatch(/_folder_/);
    expect(row.querySelector("svg.lucide-folder")).not.toBeNull();

    rerender(<TreeRow folder expanded label="feature" />);
    expect(row.querySelector("svg.lucide-folder-open")).not.toBeNull();
  });

  it("leaves an ordinary row's own icon alone", () => {
    const { container } = render(<TreeRow icon={<svg className="kind" />} label="main" />);
    const row = container.querySelector("button")!;
    expect(row.className).not.toMatch(/_folder_/);
    expect(row.querySelector("svg.kind")).not.toBeNull();
  });
});
