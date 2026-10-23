import { describe, expect, it } from "vitest";

import { communityFacts, communityInitials, communityPath, joinLabel } from "@/lib/communities";

describe("communities", () => {
  it("lives under /communities, not the categories' /c", () => {
    expect(communityPath("salford-road-watch")).toBe("/communities/salford-road-watch");
  });

  it("shows initials", () => {
    expect(communityInitials("Salford Road Watch")).toBe("SR");
    expect(communityInitials("cyclists")).toBe("C");
  });

  it("sums up a community", () => {
    expect(communityFacts({ visibility: "Public", placeName: "Salford", radiusKm: 10, memberCount: 1240 })).toBe(
      "Public · Salford, 10 km · 1,240 members",
    );
    expect(communityFacts({ visibility: "Private", placeName: null, radiusKm: null, memberCount: 1 })).toBe(
      "Private · 1 member",
    );
  });

  it("labels the join button by standing", () => {
    expect(joinLabel("None", "Public")).toBe("Join");
    expect(joinLabel("None", "Private")).toBe("Ask to join");
    expect(joinLabel("Requested", "Private")).toBe("Requested");
    expect(joinLabel("Member", "Public")).toBe("Joined");
  });
});
