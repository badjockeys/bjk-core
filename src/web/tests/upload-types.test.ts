import { describe, expect, it } from "vitest";

import { contentTypeOf, kindOf } from "@/lib/upload";

// The upload types widened on 21 Oct 2026 (BJK.Modules.Media MediaFormats).
describe("upload types", () => {
  it.each([
    ["clip.webm", "video/webm"],
    ["clip.mkv", "video/x-matroska"],
    ["clip.avi", "video/x-msvideo"],
    ["clip.m4v", "video/x-m4v"],
    ["clip.MOV", "video/quicktime"],
  ])("recognises %s as a video when the browser gives no type", (name, type) => {
    expect(contentTypeOf({ name, type: "" })).toBe(type);
    expect(kindOf(type)).toBe("Video");
  });

  it.each([
    ["photo.avif", "image/avif"],
    ["photo.gif", "image/gif"],
    ["photo.tif", "image/tiff"],
    ["photo.tiff", "image/tiff"],
    ["photo.bmp", "image/bmp"],
  ])("recognises %s as a photo when the browser gives no type", (name, type) => {
    expect(contentTypeOf({ name, type: "application/octet-stream" })).toBe(type);
    expect(kindOf(type)).toBe("Image");
  });

  it("accepts the other names browsers use for AVI and BMP", () => {
    expect(kindOf("video/avi")).toBe("Video");
    expect(kindOf("video/msvideo")).toBe("Video");
    expect(kindOf("image/x-ms-bmp")).toBe("Image");
  });

  it("still refuses files that aren't photos or videos", () => {
    expect(kindOf(contentTypeOf({ name: "notes.pdf", type: "application/pdf" }))).toBeNull();
    expect(kindOf(contentTypeOf({ name: "clip.flv", type: "" }))).toBeNull();
  });
});
