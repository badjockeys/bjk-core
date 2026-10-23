import { describe, expect, it } from "vitest";

import {
  CATEGORIES,
  categoryLabel,
  compactTypes,
  describeTypes,
  GROUPS,
  categoryBySlug,
  groupBySlug,
  searchCategories,
} from "@/lib/categories";

describe("categories", () => {
  it("lists 13 groups, each with subcategories and an Other last, with unique links", () => {
    expect(GROUPS).toHaveLength(13);
    for (const group of GROUPS) {
      const inGroup = CATEGORIES.filter((c) => c.group === group.value);
      expect(inGroup.length).toBeGreaterThan(1);
      expect(inGroup.at(-1)?.label).toBe("Other");
    }
    const slugs = [...GROUPS.map((g) => g.slug), ...CATEGORIES.map((c) => c.slug)];
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(groupBySlug("parking")?.value).toBe("Parking");
    expect(categoryBySlug("parked-on-the-pavement")?.value).toBe("PavementParking");
  });

  it("names an Other with its group", () => {
    expect(categoryLabel("ParkingOther")).toBe("Parking: other");
    expect(categoryLabel("Tailgating")).toBe("Tailgating");
  });

  it("finds subcategories by the start of a word, then anywhere, then by group", () => {
    expect(searchCategories("pave")[0]?.value).toBe("PavementParking");
    expect(searchCategories("phone").map((c) => c.value)).toContain("PhoneInHand");
    expect(searchCategories("motorway")[0]?.group).toBe("Motorways");
    expect(searchCategories("  ")).toEqual([]);
  });

  it("sends and describes whole groups by name", () => {
    const parking = CATEGORIES.filter((c) => c.group === "Parking").map((c) => c.value);
    expect(compactTypes([...parking, "Tailgating"])).toBe("Parking,Tailgating");
    expect(compactTypes(["Tailgating", "DoubleYellows"])).toBe("DoubleYellows,Tailgating");
    expect(describeTypes([])).toBe("All types");
    expect(describeTypes(parking)).toBe("Parking");
    expect(describeTypes([...parking, "Tailgating", "PhoneInHand"])).toBe("Parking and 2 more");
  });
});
