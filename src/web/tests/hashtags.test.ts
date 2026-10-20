import { describe, expect, it } from "vitest";

import { insertTag, postsToday, splitHashtags, tagAtCaret, tagFromPath, tagPath } from "@/lib/hashtags";

describe("hashtags", () => {
  it("splits post text into plain parts and tags, by the API's rules", () => {
    expect(splitHashtags("Lorry on the #M62, again #Leeds_Ring_Road.")).toEqual([
      { text: "Lorry on the " },
      { tag: "M62" },
      { text: ", again " },
      { tag: "Leeds_Ring_Road" },
      { text: "." },
    ]);
    expect(splitHashtags("C# and page#part and #1st and ##two and #a")).toEqual([
      { text: "C# and page#part and #1st and ##two and #a" },
    ]);
  });

  it("links tags by their lower-case key and reads them back from the URL", () => {
    expect(tagPath("M62")).toBe("/tag/m62");
    expect(tagFromPath("M62")).toBe("m62");
    expect(tagFromPath("%23Leeds")).toBe("leeds");
    expect(tagFromPath("not a tag")).toBeNull();
  });

  it("finds the tag being typed and swaps in the chosen one", () => {
    expect(tagAtCaret("Queue on the #m6", 16)).toEqual({ start: 13, prefix: "m6" });
    expect(tagAtCaret("#M", 2)).toEqual({ start: 0, prefix: "M" });
    expect(tagAtCaret("Queue on the #m6 today", 22)).toBeNull();
    expect(tagAtCaret("email a#b", 9)).toBeNull();
    expect(tagAtCaret("just #", 6)).toBeNull();
    expect(insertTag("Queue on the #m6", 13, 16, "M62")).toEqual({ value: "Queue on the #M62 ", caret: 18 });
    expect(insertTag("on the #m6 today", 7, 10, "M62")).toEqual({ value: "on the #M62 today", caret: 11 });
  });

  it("says how many posts today", () => {
    expect(postsToday(1)).toBe("1 post today");
    expect(postsToday(1200)).toBe("1,200 posts today");
  });
});
