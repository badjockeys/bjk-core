import { categoryLabel } from "./categories";
import type { PostDto } from "./types";

/** How often the dialog checks whether the video is made, and for how long before giving up. */
export const SHARE_POLL_MS = 3_000;
export const SHARE_POLL_LIMIT_MS = 4 * 60_000;

/**
 * The video that can be downloaded for sharing, if any: a published, processed post with one video that isn't marked
 * sensitive (owner, 23 Oct 2026: only the poster downloads it; the API checks that too).
 */
export function shareableVideoId(
  post: Pick<PostDto, "media" | "isSensitive" | "status"> & { mediaState?: PostDto["mediaState"] },
): string | null {
  const video = post.media.length === 1 && post.media[0]!.mediaType === "Video" ? post.media[0]! : null;
  const ready = (post.mediaState ?? "Ready") === "Ready";
  return video && !post.isSensitive && post.status === "Published" && ready ? video.mediaId : null;
}

/** A tag for the main type of bad driving: "Tailgating" → "#tailgating", "Bad parking" → "#badparking". */
function typeTag(label: string): string {
  return `#${label.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
}

/** What a share caption is made from. */
export type ShareCaptionPost = Pick<PostDto, "title" | "category"> & {
  location: { placeName: string | null };
};

/** The caption to paste with the video: title, place, the link back, and a few tags. */
export function shareCaption(post: ShareCaptionPost, url: string): string {
  const where = post.location.placeName ? ` (${post.location.placeName})` : "";
  const tags = ["#dashcam", "#baddriving", typeTag(categoryLabel(post.category)), "#badjockeys"];
  return `${post.title}${where}\n\nMore on Bad Jockeys: ${url}\n\n${[...new Set(tags)].join(" ")}`;
}

/** The `shareVideo` prop for a post's ⋯ menu: its video and caption details, or null if it can't be shared. */
export function shareVideoFor(post: PostDto): { mediaId: string; post: ShareCaptionPost } | null {
  const mediaId = shareableVideoId(post);
  return mediaId
    ? {
        mediaId,
        // Only what the caption needs, as this goes to the browser.
        post: {
          title: post.title,
          category: post.category,
          location: { placeName: post.location.placeName },
        },
      }
    : null;
}
