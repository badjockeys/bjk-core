import Link from "next/link";

import { duration, plural } from "@/lib/format";
import { postPath } from "@/lib/paths";
import type { PostDto } from "@/lib/types";

import { PhotoIcon, PlayIcon, SpinnerIcon } from "./icons";

/** The photos or video in a feed card: one photo, a grid of up to four with "+N", or a video poster. */
export function PostMedia({ post }: { post: PostDto }) {
  const href = postPath(post.id);
  const media = post.media;
  const processing = post.mediaState === "Pending";

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
          src={photo.thumbnailUrl ?? photo.playbackUrl}
          srcSet={photo.thumbnailUrl ? `${photo.thumbnailUrl} 640w, ${photo.playbackUrl} 2048w` : undefined}
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
          <img src={photo.thumbnailUrl ?? photo.playbackUrl} alt="" loading="lazy" />
          {index === shown.length - 1 && extra > 0 ? <span className="more">+{extra}</span> : null}
        </div>
      ))}
    </Link>
  );
}

/** A grey placeholder, as in the wireframes, while there's nothing to show yet. */
export function MediaPlaceholder({ label }: { label: string }) {
  return (
    <div className="media ph tw-processing" role="img" aria-label={label}>
      <PhotoIcon size={34} />
    </div>
  );
}
