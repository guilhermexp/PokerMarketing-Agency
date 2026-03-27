import { describe, expect, it } from "vitest";

import { formatPrettyOutput } from "../output.js";

describe("output", () => {
  it("renders arrays of objects as aligned tables", () => {
    const result = formatPrettyOutput([
      { id: "1", status: "ok" },
      { id: "22", status: "processing" },
    ]);

    expect(result).toContain("id");
    expect(result).toContain("status");
    expect(result).toContain("22");
    expect(result).toContain("processing");
  });

  it("falls back to pretty JSON for non-tabular payloads", () => {
    const result = formatPrettyOutput({
      nested: {
        ok: true,
      },
    });

    expect(result).toBe('{\n  "nested": {\n    "ok": true\n  }\n}');
  });
});
