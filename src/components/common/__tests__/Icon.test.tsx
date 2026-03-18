import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon } from "../Icon";

describe("Icon", () => {
  it("applies the provided size to lucide icons", () => {
    const { container } = render(<Icon name="camera" size={20} className="text-white" />);
    const svg = container.querySelector("svg");

    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("width")).toBe("20");
    expect(svg?.getAttribute("height")).toBe("20");
    expect(svg?.classList.contains("text-white")).toBe(true);
  });

  it("supports legacy icon aliases without breaking callers", () => {
    const { container } = render(<Icon name="arrow-left" size={16} />);
    const svg = container.querySelector("svg");

    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("width")).toBe("16");
    expect(svg?.getAttribute("height")).toBe("16");
  });
});
