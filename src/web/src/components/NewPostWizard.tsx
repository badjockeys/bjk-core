"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { discardMedia, getMedia } from "@/actions/media";
import { createPost } from "@/actions/posts";
import { followBlocker } from "@/lib/blockers";
import { categoryLabel, CATEGORY_CHOICES } from "@/lib/categories";
import { duration, plural, ukLocalToIso } from "@/lib/format";
import { shrinkPhoto } from "@/lib/image-resize";
import type { IncidentCategory } from "@/lib/types";
import {
  contentTypeOf,
  kindOf,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  MAX_VIDEO_SECONDS,
  PHOTO_TYPES,
  uploadFile,
  UploadError,
  VIDEO_TYPES,
  waitUntilReady,
} from "@/lib/upload";

import { CloseIcon, LogoMark, PhotoIcon, PlayIcon, PlusIcon, ShieldIcon, TickIcon } from "./icons";
import type { Pin } from "./MapPicker";
import { TrimVideo, type TrimmedClip } from "./TrimVideo";

const MapPicker = dynamic(() => import("./MapPicker"), {
  ssr: false,
  loading: () => <div className="map ph" aria-hidden="true" />,
});

type Step = "media" | "trim" | "details";

interface Item {
  key: string;
  kind: "Image" | "Video";
  name: string;
  preview: string | null;
  seconds?: number;
  progress: number;
  status: "uploading" | "processing" | "ready" | "failed";
  mediaId?: string;
  error?: string;
}

interface Fields {
  title: string;
  category: IncidentCategory | "";
  placeName: string;
  pin: Pin | null;
  date: string;
  time: string;
  description: string;
  sensitive: boolean;
  owned: boolean;
}

const PARALLEL_UPLOADS = 3;
let nextKey = 0;

/** Screens 08, 24 and 09: add photos or a video, trim a video, then the details. */
export function NewPostWizard({
  defaultDate,
  defaultTime,
  tileUrl,
  attribution,
  emailVerified,
}: {
  defaultDate: string;
  defaultTime: string;
  tileUrl: string;
  attribution: string;
  emailVerified: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("media");
  const [items, setItems] = useState<Item[]>([]);
  const [videoFile, setVideoFile] = useState<{ file: File; type: string } | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [fields, setFields] = useState<Fields>({
    title: "",
    category: "",
    placeName: "",
    pin: null,
    date: defaultDate,
    time: defaultTime,
    description: "",
    sensitive: false,
    owned: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const queue = useRef<{ key: string; run: () => Promise<void> }[]>([]);
  const running = useRef(0);

  const kind: "Image" | "Video" | null = items[0]?.kind ?? null;
  const photosLeft = MAX_PHOTOS - items.filter((i) => i.kind === "Image").length;
  const uploading = items.filter((i) => i.status === "uploading").length;
  const failed = items.filter((i) => i.status === "failed").length;

  const patch = useCallback((key: string, change: Partial<Item>) => {
    setItems((current) => current.map((i) => (i.key === key ? { ...i, ...change } : i)));
  }, []);

  // Uploads run a few at a time.
  const pump = useCallback(() => {
    while (running.current < PARALLEL_UPLOADS && queue.current.length > 0) {
      const job = queue.current.shift()!;
      running.current++;
      void job.run().finally(() => {
        running.current--;
        pump();
      });
    }
  }, []);

  const startUpload = useCallback(
    (key: string, prepare: () => Promise<{ blob: Blob; name: string; type: string }>) => {
      queue.current.push({
        key,
        run: async () => {
          try {
            const file = await prepare();
            const uploaded = await uploadFile(file.blob, file.name, file.type, (p) =>
              patch(key, { progress: p }),
            );
            patch(key, { progress: 1, status: "processing", mediaId: uploaded.mediaId });
          } catch (error) {
            if (error instanceof UploadError && followBlocker(error.blocker)) {
              return;
            }
            patch(key, {
              status: "failed",
              error: error instanceof Error ? error.message : "The upload failed. Remove it and try again.",
            });
          }
        },
      });
      pump();
    },
    [patch, pump],
  );

  // Keep an eye on processing so a file the server rejects (e.g. a video over 30 seconds) shows up straight away.
  useEffect(() => {
    const watching = items.filter((i) => i.status === "processing" && i.mediaId);
    if (watching.length === 0) {
      return;
    }
    const timer = setInterval(async () => {
      for (const item of watching) {
        const result = await getMedia(item.mediaId!);
        if (!result.ok) {
          continue;
        }
        if (result.data.status === "Ready") {
          patch(item.key, { status: "ready" });
        } else if (result.data.status === "Failed" || result.data.status === "Deleted") {
          patch(item.key, {
            status: "failed",
            error: friendlyFailure(result.data.failureReason),
          });
        }
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [items, patch]);

  const addPhotos = (files: File[]) => {
    setMediaError(null);
    if (kind === "Video") {
      setMediaError("A post can have 1 to 10 photos or one video, not both.");
      return;
    }
    const accepted: File[] = [];
    for (const file of files) {
      const type = contentTypeOf(file);
      if (!PHOTO_TYPES.includes(type)) {
        setMediaError(`${file.name} isn't a photo we can use. Choose JPEG, PNG, WebP or HEIC.`);
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        setMediaError(`${file.name} is over 25 MB.`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length > photosLeft) {
      setMediaError(`A post can have up to ${MAX_PHOTOS} photos.`);
    }
    const chosen = accepted.slice(0, Math.max(0, photosLeft));
    if (chosen.length === 0) {
      return;
    }
    const added: Item[] = chosen.map((file) => ({
      key: `m${++nextKey}`,
      kind: "Image",
      name: file.name,
      preview: ["image/jpeg", "image/png", "image/webp"].includes(file.type)
        ? URL.createObjectURL(file)
        : null,
      progress: 0,
      status: "uploading",
    }));
    setItems((current) => [...current, ...added]);
    setStep("details");
    added.forEach((item, index) => {
      const file = chosen[index]!;
      startUpload(item.key, async () => {
        const shrunk = await shrinkPhoto(file);
        return { blob: shrunk.blob, name: shrunk.name, type: shrunk.type || contentTypeOf(file) };
      });
    });
  };

  const chooseVideo = (file: File) => {
    setMediaError(null);
    if (items.length > 0) {
      setMediaError("A post can have 1 to 10 photos or one video, not both.");
      return;
    }
    const type = contentTypeOf(file);
    if (!VIDEO_TYPES.includes(type)) {
      setMediaError("Choose an MP4 or MOV video.");
      return;
    }
    setVideoFile({ file, type });
    setStep("trim");
  };

  const acceptClip = (clip: TrimmedClip) => {
    const key = `m${++nextKey}`;
    setItems([
      {
        key,
        kind: "Video",
        name: clip.fileName,
        preview: null,
        seconds: clip.seconds,
        progress: 0,
        status: "uploading",
      },
    ]);
    setVideoFile(null);
    setStep("details");
    if (!clip.converted && clip.seconds > MAX_VIDEO_SECONDS + 0.5) {
      setMediaError(
        "Your browser couldn't trim this video, so it's being uploaded as it is. Videos can be up to 30 seconds, so it may be refused.",
      );
    }
    startUpload(key, async () => ({ blob: clip.blob, name: clip.fileName, type: clip.contentType }));
  };

  const onFiles = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length === 0) {
      return;
    }
    const videos = files.filter((f) => kindOf(contentTypeOf(f)) === "Video");
    if (videos.length > 0) {
      if (files.length > 1) {
        setMediaError("A post can have 1 to 10 photos or one video, not both. Choose one video on its own.");
        return;
      }
      chooseVideo(videos[0]!);
    } else {
      addPhotos(files);
    }
  };

  const remove = (item: Item) => {
    setItems((current) => current.filter((i) => i.key !== item.key));
    if (item.preview) {
      URL.revokeObjectURL(item.preview);
    }
    if (item.mediaId) {
      void discardMedia(item.mediaId);
    }
    if (items.length === 1) {
      setStep("media");
    }
  };

  const cancel = () => {
    if (items.length > 0 && !window.confirm("Discard this post? Your photos or video won't be kept.")) {
      return;
    }
    for (const item of items) {
      if (item.mediaId) {
        void discardMedia(item.mediaId);
      }
    }
    router.push("/");
  };

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    setFields((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  const locateMe = () => {
    if (!navigator.geolocation) {
      setErrors((e) => ({ ...e, pin: "Your browser can't share its location. Tap the map instead." }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => set("pin", { lat: position.coords.latitude, lng: position.coords.longitude }),
      () => setErrors((e) => ({ ...e, pin: "We couldn't get your location. Tap the map instead." })),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const validate = (): Record<string, string> => {
    const problems: Record<string, string> = {};
    if (items.length === 0) problems.media = "Add photos or a video.";
    else if (failed > 0) problems.media = "Remove the files that didn't work.";
    if (!fields.title.trim()) problems.title = "Give your post a title.";
    if (!fields.category) problems.category = "Choose what happened.";
    if (!fields.placeName.trim()) problems.placeName = "Add a place name, such as a road and town.";
    if (!fields.pin) problems.pin = "Put a pin on the map where it happened.";
    const when = ukLocalToIso(fields.date, fields.time);
    if (!when) problems.when = "Check the date and time.";
    else if (new Date(when).getTime() > Date.now() + 5 * 60_000)
      problems.when = "The date and time can't be in the future.";
    if (!fields.owned) problems.owned = "Please confirm you took these and they follow the guidelines.";
    return problems;
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    const problems = validate();
    setErrors(problems);
    if (Object.keys(problems).length > 0) {
      setSubmitError("Check the highlighted fields.");
      return;
    }
    startTransition(async () => {
      const request = {
        title: fields.title,
        description: fields.description || null,
        category: fields.category as IncidentCategory,
        incidentAt: ukLocalToIso(fields.date, fields.time)!,
        latitude: round6(fields.pin!.lat),
        longitude: round6(fields.pin!.lng),
        placeName: fields.placeName,
        mediaIds: items.map((i) => i.mediaId!),
        isSensitive: fields.sensitive,
      };
      let result = await createPost(request);
      // An API without fast posting wants every file Ready first: wait, then try again.
      if (!result.ok && /finished processing|wait until/i.test(result.error)) {
        setStatus("Waiting for your photos or video to finish processing…");
        try {
          await Promise.all(items.map((i) => waitUntilReady(i.mediaId!)));
        } catch (error) {
          setStatus(null);
          setSubmitError(error instanceof Error ? friendlyFailure(error.message) : "Processing failed.");
          return;
        }
        result = await createPost(request);
      }
      setStatus(null);
      if (!result.ok) {
        if (followBlocker(result.blocker)) {
          return;
        }
        const fieldErrors = result.fieldErrors ?? {};
        setErrors({
          title: fieldErrors.title?.[0] ?? "",
          description: fieldErrors.description?.[0] ?? "",
          placeName: fieldErrors.placeName?.[0] ?? "",
          pin: (fieldErrors.location ?? fieldErrors.latitude ?? fieldErrors.longitude)?.[0] ?? "",
          when: fieldErrors.incidentAt?.[0] ?? "",
          media: fieldErrors.mediaIds?.[0] ?? "",
        });
        setSubmitError(result.error);
        return;
      }
      router.push(`/p/${result.data.id}?posted=${kind === "Video" ? "video" : "photos"}`);
    });
  };

  const canPost = items.length > 0 && uploading === 0 && failed === 0 && !pending;

  return (
    <>
      <header className="top m-only">
        <button type="button" className="link" onClick={cancel}>
          Cancel
        </button>
        <span className="top-title">New post</span>
        {step === "details" ? (
          <button type="submit" form="new-post" className="btn btn-primary btn-sm" disabled={!canPost}>
            Post
          </button>
        ) : (
          <span style={{ width: 52 }} />
        )}
      </header>
      <header className="d-top d-only">
        <Link href="/" className="logo" aria-label="Bad Jockeys home">
          <LogoMark size={36} />
        </Link>
        <span className="top-title">New post</span>
        <button type="button" className="btn" onClick={cancel}>
          Cancel
        </button>
      </header>

      <main id="main" className="d-form">
        {!emailVerified ? (
          <p className="notice notice-warn" role="note">
            Confirm your email address before you post: use the link we emailed you when you joined.
          </p>
        ) : null}

        <input
          ref={photoInput}
          type="file"
          accept={PHOTO_TYPES.join(",") + ",.heic,.heif"}
          multiple
          hidden
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={videoInput}
          type="file"
          accept={VIDEO_TYPES.join(",") + ",.mov"}
          hidden
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {step === "media" ? (
          <MediaStep
            error={mediaError}
            onPhotos={() => photoInput.current?.click()}
            onVideo={() => videoInput.current?.click()}
            onDrop={onFiles}
          />
        ) : null}

        {step === "trim" && videoFile ? (
          <TrimVideo
            file={videoFile.file}
            contentType={videoFile.type}
            onBack={() => {
              setVideoFile(null);
              setStep("media");
            }}
            onDone={acceptClip}
          />
        ) : null}

        {step === "details" ? (
          <form id="new-post" className="stack" style={{ gap: 18 }} onSubmit={submit} noValidate>
            <div className="field">
              <span className="label">
                {kind === "Video" ? "Video" : "Photos"}{" "}
                {kind === "Image" ? (
                  <span className="muted">
                    ({items.length} of {MAX_PHOTOS})
                  </span>
                ) : null}
              </span>
              <div className="thumbs">
                {items.map((item, index) => (
                  <Thumb key={item.key} item={item} index={index} onRemove={() => remove(item)} />
                ))}
                {kind === "Image" && photosLeft > 0 ? (
                  <button
                    type="button"
                    className="thumb"
                    style={{ border: "1px dashed #D9D9D4", background: "#FFFFFF" }}
                    aria-label="Add more photos"
                    onClick={() => photoInput.current?.click()}
                  >
                    <PlusIcon />
                  </button>
                ) : null}
              </div>
              <span className={errors.media || mediaError ? "error" : "help"} aria-live="polite">
                {errors.media ||
                  mediaError ||
                  (uploading > 0
                    ? `Uploading ${plural(uploading, kind === "Video" ? "video" : "photo")}…`
                    : items.some((i) => i.status === "processing")
                      ? "Uploaded. We'll finish processing after you post."
                      : "")}
              </span>
            </div>

            <label className="field">
              <span className="label">Title</span>
              <input
                className={`input${errors.title ? " input-error" : ""}`}
                type="text"
                maxLength={120}
                required
                value={fields.title}
                onChange={(e) => set("title", e.target.value)}
              />
              {errors.title ? <span className="error">{errors.title}</span> : null}
            </label>

            <div className="facts">
              <label className="field">
                <span className="label">What happened?</span>
                <select
                  className={`input${errors.category ? " input-error" : ""}`}
                  value={fields.category}
                  required
                  onChange={(e) => set("category", e.target.value as IncidentCategory)}
                >
                  <option value="" disabled>
                    Choose…
                  </option>
                  {CATEGORY_CHOICES.map((c) => (
                    <option key={c} value={c}>
                      {categoryLabel(c)}
                    </option>
                  ))}
                </select>
                {errors.category ? <span className="error">{errors.category}</span> : null}
              </label>
              <div className="facts">
                <label className="field">
                  <span className="label">Date</span>
                  <input
                    className={`input${errors.when ? " input-error" : ""}`}
                    type="date"
                    required
                    max={defaultDate}
                    value={fields.date}
                    onChange={(e) => set("date", e.target.value)}
                  />
                </label>
                <label className="field">
                  <span className="label">Time</span>
                  <input
                    className={`input${errors.when ? " input-error" : ""}`}
                    type="time"
                    required
                    value={fields.time}
                    onChange={(e) => set("time", e.target.value)}
                  />
                </label>
              </div>
            </div>
            {errors.when ? <span className="error">{errors.when}</span> : null}

            <div className="field">
              <label className="label" htmlFor="where">
                Where?
              </label>
              <div className="row">
                <input
                  id="where"
                  className={`input${errors.placeName ? " input-error" : ""}`}
                  type="text"
                  maxLength={200}
                  placeholder="e.g. Kirkstall Road, Leeds"
                  required
                  value={fields.placeName}
                  aria-describedby="where-help"
                  onChange={(e) => set("placeName", e.target.value)}
                />
                <button type="button" className="btn d-only" onClick={locateMe}>
                  Use my location
                </button>
              </div>
              {errors.placeName ? <span className="error">{errors.placeName}</span> : null}
              <MapPicker
                value={fields.pin}
                onChange={(pin) => set("pin", pin)}
                tileUrl={tileUrl}
                attribution={attribution}
              />
              <button
                type="button"
                className="link m-only"
                style={{ alignSelf: "flex-start" }}
                onClick={locateMe}
              >
                Use my current location
              </button>
              {errors.pin ? <span className="error">{errors.pin}</span> : null}
              <span id="where-help" className="help">
                {fields.pin ? "Pin placed. " : ""}Shown publicly as an area name, not the exact spot.
              </span>
            </div>

            <label className="field">
              <span className="label">
                Description <span className="muted">(optional)</span>
              </span>
              <textarea
                className={`textarea${errors.description ? " input-error" : ""}`}
                rows={3}
                maxLength={5000}
                value={fields.description}
                onChange={(e) => set("description", e.target.value)}
              />
              {errors.description ? <span className="error">{errors.description}</span> : null}
            </label>

            <label className="check">
              <input
                type="checkbox"
                checked={fields.sensitive}
                onChange={(e) => set("sensitive", e.target.checked)}
              />
              <span>
                <strong>Sensitive:</strong> shows injuries or a serious crash. Only signed-in, age-checked
                members will see it.
              </span>
            </label>

            <div className="notice">
              <ShieldIcon />
              <span>
                Faces and number plates are blurred automatically, and video sound is removed. Please
                don&apos;t type number plates, names or contact details.
              </span>
            </div>

            <label className="check">
              <input
                type="checkbox"
                checked={fields.owned}
                onChange={(e) => set("owned", e.target.checked)}
              />
              <span>
                I took {kind === "Video" ? "this video" : "these photos"}, and they follow the{" "}
                <a href="/guidelines" target="_blank" rel="noreferrer">
                  community guidelines
                </a>
                .
              </span>
            </label>
            {errors.owned ? <span className="error">{errors.owned}</span> : null}

            {submitError ? (
              <p className="error" role="alert">
                {submitError}
              </p>
            ) : null}
            {status ? (
              <p className="help" role="status">
                {status}
              </p>
            ) : null}

            <div className="row">
              <button type="button" className="btn d-only" onClick={cancel}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-block" disabled={!canPost}>
                {pending ? "Posting…" : "Post"}
              </button>
            </div>
          </form>
        ) : null}
      </main>
    </>
  );
}

function MediaStep({
  error,
  onPhotos,
  onVideo,
  onDrop,
}: {
  error: string | null;
  onPhotos: () => void;
  onVideo: () => void;
  onDrop: (files: FileList | null) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <div className="stack">
      <div className="col">
        <h1 className="h1">What did you catch?</h1>
        <p className="muted">Add photos or a video of the incident.</p>
      </div>
      <div
        className={`drop${over ? " drop-over" : ""}`}
        style={{ padding: "48px 24px" }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          onDrop(e.dataTransfer.files);
        }}
      >
        <PhotoIcon size={48} color="#111111" />
        <span className="m-only">Add photos or a video</span>
        <span className="d-only">Drag photos or a video here</span>
        <span className="muted small d-only">or</span>
        <div className="row row-wrap" style={{ justifyContent: "center" }}>
          <button type="button" className="btn btn-primary" onClick={onPhotos}>
            Choose photos
          </button>
          <button type="button" className="btn" onClick={onVideo}>
            Choose a video
          </button>
        </div>
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="col">
        <div className="row" style={{ alignItems: "flex-start" }}>
          <TickIcon />
          <span>Up to 10 photos, such as bad parking</span>
        </div>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <TickIcon />
          <span>Or a dashcam video up to 30 seconds (you can trim a longer one)</span>
        </div>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <TickIcon />
          <span>
            Faces and number plates are blurred, sound and location details are removed before anyone sees it
          </span>
        </div>
      </div>
      <Link href="/guidelines" className="link small" style={{ alignSelf: "flex-start" }}>
        Read the community guidelines
      </Link>
    </div>
  );
}

function Thumb({ item, index, onRemove }: { item: Item; index: number; onRemove: () => void }) {
  const label = item.kind === "Video" ? "video" : `photo ${index + 1}`;
  return (
    <div
      className={`thumb${item.status === "failed" ? " thumb-failed" : ""}`}
      title={item.error ?? item.name}
    >
      {item.preview ? <img src={item.preview} alt="" /> : null}
      {item.kind === "Video" ? (
        <span className="col" style={{ alignItems: "center", position: "relative" }}>
          <PlayIcon />
          {item.seconds ? <span className="thumb-status">{duration(item.seconds)}</span> : null}
        </span>
      ) : null}
      {item.status === "uploading" ? (
        <>
          <span className="thumb-status">{Math.round(item.progress * 100)}%</span>
          <div
            className="bar"
            role="progressbar"
            aria-label={`Uploading ${label}`}
            aria-valuenow={Math.round(item.progress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${Math.round(item.progress * 100)}%` }} />
          </div>
        </>
      ) : null}
      {item.status === "failed" ? <span className="thumb-status error">Didn&apos;t work</span> : null}
      <button type="button" className="thumb-x" aria-label={`Remove ${label}`} onClick={onRemove}>
        <CloseIcon size={12} color="#FFFFFF" />
      </button>
      {item.status === "failed" && item.error ? <span className="sr-only">{item.error}</span> : null}
    </div>
  );
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

function friendlyFailure(reason: string | null | undefined): string {
  if (!reason) {
    return "We couldn't process that file. Remove it and try another.";
  }
  if (/second|duration|too long/i.test(reason)) {
    return `${reason} Trim it to 30 seconds and try again.`;
  }
  return reason;
}
