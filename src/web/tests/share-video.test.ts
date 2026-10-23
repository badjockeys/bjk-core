import { describe, expect, it } from "vitest";

import { shareableVideoId, shareCaption } from "@/lib/share-video";

const video = { mediaId: "v1", mediaType: "Video" } as const;
const photo = { mediaId: "p1", mediaType: "Image" } as const;
const post = (media: { mediaId: string; mediaType: "Video" | "Image" }[], extra: object = {}) =>
  ({
    media,
    isSensitive: false,
    status: "Published",
    mediaState: "Ready",
    ...extra,
  }) as unknown as Parameters<typeof shareableVideoId>[0];

describe("sharing videos to other apps", () => {
  it("offers a published post's single video", () => {
    expect(shareableVideoId(post([video]))).toBe("v1");
  });

  it("not photos, sensitive posts, or posts still processing", () => {
    expect(shareableVideoId(post([photo]))).toBeNull();
    expect(shareableVideoId(post([video], { isSensitive: true }))).toBeNull();
    expect(shareableVideoId(post([video], { mediaState: "Processing" }))).toBeNull();
    expect(shareableVideoId(post([video], { status: "Hidden" }))).toBeNull();
  });

  it("writes a caption with the place, the link back and tags", () => {
    expect(
      shareCaption(
        { title: "Tailgated on the A57", category: "Tailgating", location: { placeName: "Rainhill" } },
        "https://badjockeys.com/p/1",
      ),
    ).toBe(
      "Tailgated on the A57 (Rainhill)\n\nMore on Bad Jockeys: https://badjockeys.com/p/1\n\n#dashcam #baddriving #tailgating #badjockeys",
    );
    expect(
      shareCaption({ title: "Parked badly", category: "BadParking", location: { placeName: null } }, "u"),
    ).toContain("#badparking");
  });
});
