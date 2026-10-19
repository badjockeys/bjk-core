import Link from "next/link";

import { duration, plural } from "@/lib/format";
import { postPath } from "@/lib/paths";
import type { PostDto } from "@/lib/types";

import { PhotoIcon, PlayIcon, SpinnerIcon } from "./icons";
import { SensitiveCover } from "./SensitiveCover";

/** True if the viewer gets this post's media blurred (sensitive, and they haven't verified their age). */
export function isBlurred(post: PostDto): boolean {
  return Boolean(post.requiresAgeVerification) || post.media.some((m) => m.isBlurred);
}

/**
 * The photos or video in a feed card: one photo, a grid of up to four with "+N", or a video poster. Photos use the
 * 1080 px feed copy (`feedUrl`); the full image opens on the post page. Sensitive posts the viewer may not see yet
 * show the blurred preview with an age check (or sign-in) button.
 */
export function PostMedia({ post, signedIn = false }: { post: PostDto; signedIn?: boolean }) {
  const href = postPath(post.id);
  const media = post.media;
  const processing = post.mediaState === "Pending";

  if (media.length > 0 && isBlurred(post)) {
    return (
      <SensitiveCover
        previewUrl={media[0]!.previewUrl}
        signedIn={signedIn}
        returnTo={href}
        className="tw-media"
      />
    );
  }

  if (media.length === 0) {
    if (processing) {
      return (
        <Link href={href} className="tw-media tw-processing ph" aria-label="Your post is still processing">
          <SpinnerIcon />
          <span className="small muted">Processing…</span>
        </Link>
      );
    }
    return null;
  }

  const video = media.find((m) => m.mediaType === "Video");
  if (video) {
    return (
      <Link
        href={href}
        className="tw-media tw-video"
        aria-label={`Video, ${duration(video.durationSeconds)}`}
      >
        {video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" loading="lazy" /> : null}
        <span className="play">
          <PlayIcon />
        </span>
        {video.durationSeconds ? (
          <span className="badge badge-bl">{duration(video.durationSeconds)}</span>
        ) : null}
      </Link>
    );
  }

  const photos = media.filter((m) => m.mediaType === "Image");
  if (photos.length === 1) {
    const photo = photos[0]!;
    return (
      <Link href={href} className="tw-media tw-single" aria-label="1 photo">
        <img
          src={photo.feedUrl ?? photo.thumbnailUrl ?? photo.playbackUrl ?? undefined}
          srcSet={feedSrcSet(photo)}
          sizes="(min-width: 1024px) 520px, 100vw"
          width={photo.width ?? undefined}
          height={photo.height ?? undefined}
          alt=""
          loading="lazy"
        />
      </Link>
    );
  }

  const shown = photos.slice(0, 4);
  const extra = photos.length - shown.length;
  const layout = shown.length === 2 ? "" : shown.length === 3 ? " tw-g3" : " tw-g4";
  return (
    <Link href={href} className={`tw-media tw-grid${layout}`} aria-label={plural(photos.length, "photo")}>
      {shown.map((photo, index) => (
        <div key={photo.mediaId}>
          <img
            src={photo.feedUrl ?? photo.thumbnailUrl ?? photo.playbackUrl ?? undefined}
            alt=""
            loading="lazy"
          />
          {index === shown.length - 1 && extra > 0 ? <span className="more">+{extra}</span> : null}
        </div>
      ))}
    </Link>
  );
}

/** The thumbnail (640 px) and feed copy (1080 px) as a srcset; never the full 2048 px image, which opens on tap. */
function feedSrcSet(photo: PostDto["media"][number]): string | undefined {
  const sources = [
    photo.thumbnailUrl ? `${photo.thumbnailUrl} 640w` : null,
    photo.feedUrl ? `${photo.feedUrl} 1080w` : null,
  ].filter(Boolean);
  return sources.length > 1 ? sources.join(", ") : undefined;
}

/** A grey placeholder, as in the wireframes, while there's nothing to show yet. */
export function MediaPlaceholder({ label }: { label: string }) {
  return (
    <div className="media ph tw-processing" role="img" aria-label={label}>
      <PhotoIcon size={34} />
    </div>
  );
}
