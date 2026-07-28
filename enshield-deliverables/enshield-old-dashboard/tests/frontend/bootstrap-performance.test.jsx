import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("application bootstrap performance", () => {
  it("does not double-mount the live development app", () => {
    const source = fs.readFileSync(path.resolve("web/main.jsx"), "utf8");
    expect(source).not.toContain("<React.StrictMode>");
  });
});
