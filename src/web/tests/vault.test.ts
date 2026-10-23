import { describe, expect, it } from "vitest";

import {
  collectionHref,
  collectionName,
  expiresSoon,
  fileSize,
  keptFor,
  parseCollection,
  previewable,
  sourceOf,
  usedShare,
} from "@/lib/vault";

describe("the vault", () => {
  it("describes sizes", () => {
    expect(fileSize(2 * 1024 ** 3)).toBe("2 GB");
    expect(fileSize(1.4 * 1024 ** 3)).toBe("1.4 GB");
    expect(fileSize(340 * 1024 ** 2)).toBe("340 MB");
    expect(fileSize(12_000)).toBe("12 KB");
  });

  it("says how long each plan keeps clips", () => {
    expect(keptFor(30)).toBe("30 days");
    expect(keptFor(365)).toBe("12 months");
    expect(keptFor(1095)).toBe("3 years");
  });

  it("warns about clips going within a week", () => {
    const now = Date.parse("2026-10-23T12:00:00Z");
    expect(expiresSoon("2026-10-29T12:00:00Z", now)).toBe(true);
    expect(expiresSoon("2026-11-23T12:00:00Z", now)).toBe(false);
  });

  it("works out the space used", () => {
    expect(usedShare(1, 4)).toBe(0.25);
    expect(usedShare(5, 4)).toBe(1);
  });
});

describe("the vault's collections", () => {
  it("reads the collection from the page's query, ignoring anything else", () => {
    expect(parseCollection("posts")).toBe("posts");
    expect(parseCollection(["uploads", "all"])).toBe("uploads");
    expect(parseCollection("everything")).toBeNull();
    expect(parseCollection(undefined)).toBeNull();
  });

  it("maps collections to the API's source filter, names and links", () => {
    expect(sourceOf("all")).toBeUndefined();
    expect(sourceOf("posts")).toBe("Post");
    expect(sourceOf("uploads")).toBe("Upload");
    expect(collectionName("posts")).toBe("From your posts");
    expect(collectionHref("uploads")).toBe("/account/vault?c=uploads");
  });

  it("only previews formats a browser can show", () => {
    expect(previewable("image/png")).toBe("image");
    expect(previewable("VIDEO/MP4")).toBe("video");
    expect(previewable("video/quicktime")).toBe("video");
    expect(previewable("image/heic")).toBeNull();
    expect(previewable("video/x-matroska")).toBeNull();
  });
});
