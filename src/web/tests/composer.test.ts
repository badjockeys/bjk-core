import { describe, expect, it } from "vitest";

import { composerPrompt } from "@/lib/composer";

describe("the composer bar", () => {
  it("asks by first name", () => {
    expect(composerPrompt("Aaron Greenhalgh")).toBe("Seen some bad driving, Aaron?");
    expect(composerPrompt("  Road   Hog ")).toBe("Seen some bad driving, Road?");
  });

  it("just asks when there's no name, or only an email address", () => {
    expect(composerPrompt(null)).toBe("Seen some bad driving?");
    expect(composerPrompt("")).toBe("Seen some bad driving?");
    expect(composerPrompt("aaron@example.com")).toBe("Seen some bad driving?");
  });
});
