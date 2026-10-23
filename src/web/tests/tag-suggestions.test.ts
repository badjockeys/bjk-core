import { describe, expect, it } from "vitest";

import { connectionLabel, tagQuery } from "@/lib/tag-suggestions";

describe("tag suggestions", () => {
  it("says how each person is connected to you", () => {
    expect(connectionLabel("Mutual")).toBe("You follow each other");
    expect(connectionLabel("FollowsYou")).toBe("Follows you");
    expect(connectionLabel("YouFollow")).toBe("Following");
    expect(connectionLabel("None")).toBeNull();
  });

  it("searches from the first letter, without the @", () => {
    expect(tagQuery("Aa")).toBe("Aa");
    expect(tagQuery(" @aa")).toBe("aa");
    expect(tagQuery("@")).toBe("");
    expect(tagQuery("")).toBe("");
  });
});
