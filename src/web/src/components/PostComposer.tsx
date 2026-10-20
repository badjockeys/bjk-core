"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { discardMedia, getMedia } from "@/actions/media";
import { findPassenger } from "@/actions/passengers";
import { getVehicleCatalogue } from "@/actions/vehicles";
import { createPost } from "@/actions/posts";
import { followBlocker } from "@/lib/blockers";
import { categoryLabel, CATEGORY_CHOICES, DESCRIPTION_MAX } from "@/lib/categories";
import { duration, plural, ukLocalToIso, whenLabel } from "@/lib/format";
import { shrinkPhoto } from "@/lib/image-resize";
import type { AuthorDto, IncidentCategory, VehicleCatalogue, VehicleDto } from "@/lib/types";
import { COLOUR_SWATCHES, describeVehicle, vehicleTypeLabel } from "@/lib/vehicles";
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

import { Avatar } from "./Avatar";
import {
  ArrowBackIcon,
  ClockIcon,
  CloseIcon,
  PhotoIcon,
  PinIcon,
  PlayIcon,
  PlusIcon,
  ShieldIcon,
  TagIcon,
  VideoIcon,
} from "./icons";
import type { Pin } from "./MapPicker";
import { PlaceSearch } from "./PlaceSearch";
import { TrimVideo, type TrimmedClip } from "./TrimVideo";

const MapPicker = dynamic(() => import("./MapPicker"), {
  ssr: false,
  loading: () => <div className="map ph" aria-hidden="true" />,
});

/** The composer, or one of the panels it opens in place (trimming a video, choosing types, when, where). */
type View = "compose" | "trim" | "types" | "when" | "where" | "vehicle";

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
  /** In the order chosen: the first is the main type. */
  types: IncidentCategory[];
  placeName: string;
  pin: Pin | null;
  date: string;
  time: string;
  description: string;
  sensitive: boolean;
  owned: boolean;
  /** People in the author's vehicle (driving incidents only, up to 4). */
  passengers: AuthorDto[];
  /** The vehicle driven badly, from lists (never the registration). */
  vehicle: VehicleDto | null;
  /** Reported to the police: yes, no, or not said. */
  reportedToPolice: boolean | null;
}

const MAX_PASSENGERS = 4;

const PARALLEL_UPLOADS = 3;
let nextKey = 0;

interface UploadQueue {
  add: (job: () => Promise<void>) => void;
}

/** Runs uploads a few at a time. */
function createQueue(limit: number): UploadQueue {
  const jobs: (() => Promise<void>)[] = [];
  let running = 0;
  const pump = () => {
    while (running < limit && jobs.length > 0) {
      const job = jobs.shift()!;
      running++;
      void job().finally(() => {
        running--;
        pump();
      });
    }
  };
  return {
    add(job) {
      jobs.push(job);
      pump();
    },
  };
}

export interface PostComposerProps {
  /** "modal": a pop-up over the page it was opened from (full screen on phones); "page": the /post/new page. */
  mode: "modal" | "page";
  defaultDate: string;
  defaultTime: string;
  tileUrl: string;
  attribution: string;
  emailVerified: boolean;
  author: { name: string; avatarUrl: string | null };
}

/**
 * The new post composer (approved mock-ups, 20 Oct 2026): like Facebook or X, everything on one screen. Title, what
 * happened (up to 500 characters), photos or a video, then the details as chips: the types of bad driving (several),
 * when and where, each opening a panel in place. Post is enabled once nothing required is missing, and the footer
 * says what still is. On desktop it's a pop-up over the feed; on phones it fills the screen.
 */
export function PostComposer({
  mode,
  defaultDate,
  defaultTime,
  tileUrl,
  attribution,
  emailVerified,
  author,
}: PostComposerProps) {
  const router = useRouter();
  const [view, setView] = useState<View>("compose");
  const [items, setItems] = useState<Item[]>([]);
  const [videoFile, setVideoFile] = useState<{ file: File; type: string } | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [fields, setFields] = useState<Fields>({
    title: "",
    types: [],
    placeName: "",
    pin: null,
    date: defaultDate,
    time: defaultTime,
    description: "",
    sensitive: false,
    owned: false,
    passengers: [],
    vehicle: null,
    reportedToPolice: null,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const uploads = useRef<UploadQueue | null>(null);

  const kind: "Image" | "Video" | null = items[0]?.kind ?? null;
  const photosLeft = MAX_PHOTOS - items.filter((i) => i.kind === "Image").length;
  const uploading = items.filter((i) => i.status === "uploading").length;
  const failed = items.filter((i) => i.status === "failed").length;

  const patch = useCallback((key: string, change: Partial<Item>) => {
    setItems((current) => current.map((i) => (i.key === key ? { ...i, ...change } : i)));
  }, []);

  const startUpload = useCallback(
    (key: string, prepare: () => Promise<{ blob: Blob; name: string; type: string }>) => {
      uploads.current ??= createQueue(PARALLEL_UPLOADS);
      uploads.current.add(async () => {
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
      });
    },
    [patch],
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
    setView("trim");
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
    setView("compose");
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
  };

  const started = items.length > 0 || fields.title.trim() !== "" || fields.description.trim() !== "";

  const cancel = () => {
    if (started && !window.confirm("Discard this post? Your photos or video won't be kept.")) {
      return;
    }
    for (const item of items) {
      if (item.mediaId) {
        void discardMedia(item.mediaId);
      }
    }
    if (mode === "modal") {
      router.back();
    } else {
      router.push("/");
    }
  };

  // The pop-up opens as a modal dialog: the page behind can't be reached, and Escape asks before discarding.
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) {
      element.showModal();
    }
  }, []);

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    setFields((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  const toggleType = (type: IncidentCategory, on: boolean) => {
    set(
      "types",
      on ? [...fields.types.filter((t) => t !== type), type] : fields.types.filter((t) => t !== type),
    );
  };

  const validate = (): Record<string, string> => {
    const problems: Record<string, string> = {};
    if (items.length === 0) problems.media = "Add photos or a video.";
    else if (failed > 0) problems.media = "Remove the files that didn't work.";
    if (!fields.title.trim()) problems.title = "Give your post a title.";
    if (fields.types.length === 0) problems.types = "Choose at least one type of bad driving.";
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
        // The main type is the first of `types`; `category` is only for older callers.
        category: null,
        types: fields.types,
        passengers: onTheRoad ? fields.passengers.map((p) => p.handle!) : [],
        vehicleType: fields.vehicle?.type ?? null,
        vehicleMake: fields.vehicle?.make ?? null,
        vehicleModel: fields.vehicle?.model ?? null,
        vehicleColour: fields.vehicle?.colour ?? null,
        reportedToPolice: fields.reportedToPolice,
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
          types: (fieldErrors.types ?? fieldErrors.category)?.[0] ?? "",
          passengers: fieldErrors.passengers?.[0] ?? "",
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

  const onTheRoad = fields.types.some((t) => t !== "BadParking");
  const needed = stillNeeded(fields, items.length, failed > 0);
  const canPost = needed.length === 0 && uploading === 0 && !pending;
  const when = whenLabel(fields.date, fields.time, defaultDate);

  const fileInputs = (
    <>
      <input
        ref={photoInput}
        type="file"
        accept={
          // Before anything is chosen the first tile takes photos or a video; after that, more photos.
          items.length === 0
            ? [...PHOTO_TYPES, ...VIDEO_TYPES].join(",") + ",.heic,.heif,.mov"
            : PHOTO_TYPES.join(",") + ",.heic,.heif"
        }
        multiple
        hidden
        data-testid="photo-input"
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
        data-testid="video-input"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );

  let body: ReactNode;
  if (view === "trim" && videoFile) {
    body = (
      <div className="cmp-panel cmp-scroll">
        <TrimVideo
          file={videoFile.file}
          contentType={videoFile.type}
          onBack={() => {
            setVideoFile(null);
            setView("compose");
          }}
          onDone={acceptClip}
        />
      </div>
    );
  } else if (view === "types") {
    body = <TypesPanel chosen={fields.types} onToggle={toggleType} onDone={() => setView("compose")} />;
  } else if (view === "when") {
    body = (
      <WhenPanel
        date={fields.date}
        time={fields.time}
        maxDate={defaultDate}
        onDone={(date, time) => {
          setFields((current) => ({ ...current, date, time }));
          setErrors((current) => ({ ...current, when: "" }));
          setView("compose");
        }}
        onBack={() => setView("compose")}
      />
    );
  } else if (view === "vehicle") {
    body = (
      <VehiclePanel
        vehicle={fields.vehicle}
        onDone={(vehicle) => {
          setFields((current) => ({ ...current, vehicle }));
          setView("compose");
        }}
        onBack={() => setView("compose")}
      />
    );
  } else if (view === "where") {
    body = (
      <WherePanel
        placeName={fields.placeName}
        pin={fields.pin}
        tileUrl={tileUrl}
        attribution={attribution}
        onDone={(placeName, pin) => {
          setFields((current) => ({ ...current, placeName, pin }));
          setErrors((current) => ({ ...current, placeName: "", pin: "" }));
          setView("compose");
        }}
        onBack={() => setView("compose")}
      />
    );
  } else {
    body = (
      <>
        <header className="cmp-head">
          <button type="button" className="link m-only" onClick={cancel}>
            Cancel
          </button>
          <button type="button" className="icon-btn d-only" aria-label="Close" onClick={cancel}>
            <CloseIcon />
          </button>
          <h2 id="composer-title" className="cmp-heading">
            <span className="d-only">Create post</span>
            <span className="m-only">New post</span>
          </h2>
          <button type="submit" form="new-post" className="btn btn-primary btn-sm m-only" disabled={!canPost}>
            Post
          </button>
          <span className="cmp-head-end d-only" />
        </header>

        <form id="new-post" className="cmp-body cmp-scroll" onSubmit={submit} noValidate>
          {!emailVerified ? (
            <p className="notice notice-warn" role="note">
              Confirm your email address before you post: use the link we emailed you when you joined.
            </p>
          ) : null}

          <div className="cmp-text">
            <Avatar name={author.name} url={author.avatarUrl} />
            <div className="cmp-fields">
              <label htmlFor="post-title" className="cmp-label">
                Title
              </label>
              <input
                id="post-title"
                className={`cmp-title${errors.title ? " input-error" : ""}`}
                type="text"
                maxLength={120}
                required
                placeholder="Sum it up, e.g. Tailgated on the A57"
                value={fields.title}
                onChange={(e) => set("title", e.target.value)}
              />
              {errors.title ? <span className="error">{errors.title}</span> : null}
              <label htmlFor="post-text" className="cmp-label">
                What happened? <span className="muted">(optional)</span>
              </label>
              <textarea
                id="post-text"
                className={`cmp-textarea${errors.description ? " input-error" : ""}`}
                rows={3}
                maxLength={DESCRIPTION_MAX}
                aria-describedby="post-text-count"
                value={fields.description}
                onChange={(e) => set("description", e.target.value)}
              />
              <span id="post-text-count" className="cmp-count">
                {fields.description.length} / {DESCRIPTION_MAX}
              </span>
              {errors.description ? <span className="error">{errors.description}</span> : null}
            </div>
          </div>

          <div className="field">
            <span className="cmp-label">
              Photos or a video <span className="cmp-req">· required</span>
              <span className="d-only-inline"> · up to {MAX_PHOTOS} photos or 1 video</span>
            </span>
            <div className="cmp-thumbs">
              {items.map((item, index) => (
                <Thumb key={item.key} item={item} index={index} onRemove={() => remove(item)} />
              ))}
              {items.length === 0 ? (
                <DropTile onPhotos={() => photoInput.current?.click()} onDrop={onFiles} />
              ) : null}
              {kind === "Image" && photosLeft > 0 ? (
                <button
                  type="button"
                  className="cmp-add"
                  aria-label="Add more photos"
                  onClick={() => photoInput.current?.click()}
                >
                  <PlusIcon size={22} />
                  Add more
                  <span className="small">
                    {items.length} of {MAX_PHOTOS}
                  </span>
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

          <div className="cmp-details">
            <div className="cmp-row">
              <span className="cmp-row-label" id="types-label">
                Bad driving
              </span>
              <div className="cmp-chips" role="group" aria-labelledby="types-label">
                {fields.types.map((type) => (
                  <span key={type} className="cmp-chip cmp-chip-on">
                    {categoryLabel(type)}
                    <button
                      type="button"
                      className="cmp-chip-x"
                      aria-label={`Remove ${categoryLabel(type)}`}
                      onClick={() => toggleType(type, false)}
                    >
                      <CloseIcon size={12} color="#FFFFFF" />
                    </button>
                  </span>
                ))}
                {fields.types.length === 0 ? (
                  <button type="button" className="cmp-chip cmp-chip-todo" onClick={() => setView("types")}>
                    <TagIcon />
                    What kind of bad driving?
                  </button>
                ) : (
                  <button
                    type="button"
                    className="cmp-chip"
                    aria-label="Add a type of bad driving"
                    onClick={() => setView("types")}
                  >
                    <PlusIcon size={14} />
                    Add
                  </button>
                )}
              </div>
            </div>
            {errors.types ? <span className="error">{errors.types}</span> : null}

            <div className="cmp-row">
              <span className="cmp-row-label">When</span>
              <button
                type="button"
                className="cmp-chip cmp-chip-on"
                aria-label={`When: ${when}. Change`}
                onClick={() => setView("when")}
              >
                <ClockIcon size={16} color="#FFFFFF" />
                {when}
              </button>
            </div>
            {errors.when ? <span className="error">{errors.when}</span> : null}

            <div className="cmp-row">
              <span className="cmp-row-label">Where</span>
              {fields.pin && fields.placeName.trim() ? (
                <button
                  type="button"
                  className="cmp-chip cmp-chip-on"
                  aria-label={`Where: ${fields.placeName}. Change`}
                  onClick={() => setView("where")}
                >
                  <PinIcon size={16} color="#FFFFFF" />
                  {fields.placeName}
                </button>
              ) : (
                <button type="button" className="cmp-chip cmp-chip-todo" onClick={() => setView("where")}>
                  <PinIcon size={16} color="#00607F" />
                  Add where it happened
                </button>
              )}
            </div>
            {errors.placeName || errors.pin ? (
              <span className="error">{errors.placeName || errors.pin}</span>
            ) : null}

            <div className="cmp-row">
              <span className="cmp-row-label">
                Vehicle <span className="small">(optional)</span>
              </span>
              {fields.vehicle ? (
                <button
                  type="button"
                  className="cmp-chip cmp-chip-on"
                  aria-label={`Vehicle: ${describeVehicle(fields.vehicle)}. Change`}
                  onClick={() => setView("vehicle")}
                >
                  {describeVehicle(fields.vehicle)}
                </button>
              ) : (
                <button type="button" className="cmp-chip" onClick={() => setView("vehicle")}>
                  <PlusIcon size={14} />
                  Add the vehicle
                </button>
              )}
            </div>

            <div className="cmp-row">
              <span className="cmp-row-label" id="police-label">
                Reported to police?
              </span>
              <div className="cmp-chips" role="radiogroup" aria-labelledby="police-label">
                {(
                  [
                    [true, "Yes"],
                    [false, "No"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={label}
                    type="button"
                    role="radio"
                    aria-checked={fields.reportedToPolice === value}
                    className={`cmp-chip${fields.reportedToPolice === value ? " cmp-chip-on" : ""}`}
                    onClick={() => set("reportedToPolice", fields.reportedToPolice === value ? null : value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {onTheRoad ? (
              <PassengersRow
                passengers={fields.passengers}
                error={errors.passengers}
                onChange={(passengers) => set("passengers", passengers)}
              />
            ) : null}

            <div className="cmp-row">
              <span className="cmp-row-label">Sensitive</span>
              <label className="check">
                <input
                  type="checkbox"
                  checked={fields.sensitive}
                  onChange={(e) => set("sensitive", e.target.checked)}
                />
                <span>Shows serious injuries or a crash</span>
              </label>
            </div>
          </div>

          <div className="notice">
            <ShieldIcon />
            <span>
              Faces and number plates are blurred automatically, and video sound is removed. Please don&apos;t
              type number plates, names or contact details.
            </span>
          </div>

          <label className="check">
            <input type="checkbox" checked={fields.owned} onChange={(e) => set("owned", e.target.checked)} />
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
        </form>

        <footer className="cmp-foot">
          <button
            type="button"
            className="icon-btn"
            aria-label="Add photos"
            disabled={kind === "Video" || photosLeft <= 0}
            onClick={() => photoInput.current?.click()}
          >
            <PhotoIcon size={24} color="#00B5E5" strokeWidth={2} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Add a video"
            disabled={items.length > 0}
            onClick={() => videoInput.current?.click()}
          >
            <VideoIcon color="#00B5E5" />
          </button>
          <span className="cmp-needed" aria-live="polite">
            {needed.length > 0 ? (
              <>
                Still needed: <strong>{needed.join(", ")}</strong>
              </>
            ) : uploading > 0 ? (
              "Uploading…"
            ) : (
              "Ready to post"
            )}
          </span>
          <button type="submit" form="new-post" className="btn btn-primary d-only" disabled={!canPost}>
            {pending ? "Posting…" : "Post"}
          </button>
        </footer>
      </>
    );
  }

  if (mode === "modal") {
    return (
      <dialog
        ref={dialog}
        className="composer composer-dialog"
        aria-labelledby={view === "compose" ? "composer-title" : "panel-title"}
        onCancel={(event) => {
          // Escape: step back from a panel, or ask before discarding the post.
          event.preventDefault();
          if (view !== "compose" && view !== "trim") {
            setView("compose");
          } else {
            cancel();
          }
        }}
      >
        {fileInputs}
        {body}
      </dialog>
    );
  }

  return (
    <main id="main" className="composer-page">
      <div
        className="composer"
        role="region"
        aria-labelledby={view === "compose" ? "composer-title" : "panel-title"}
      >
        {fileInputs}
        {body}
      </div>
    </main>
  );
}

/** What's still missing before the post can go, in the order the composer shows them. */
function stillNeeded(fields: Fields, media: number, failed: boolean): string[] {
  const needed: string[] = [];
  if (media === 0) needed.push("photos or a video");
  else if (failed) needed.push("remove the files that didn't work");
  if (!fields.title.trim()) needed.push("title");
  if (fields.types.length === 0) needed.push("type of bad driving");
  if (!fields.placeName.trim() || !fields.pin) needed.push("where it happened");
  if (!fields.owned) needed.push("confirm you took them");
  return needed;
}

/**
 * What was driven badly: type (needed once anything else is chosen), make, model and colour, all from lists. Never
 * the registration: number plates are blurred and must never be typed.
 */
function VehiclePanel({
  vehicle,
  onDone,
  onBack,
}: {
  vehicle: VehicleDto | null;
  onDone: (vehicle: VehicleDto | null) => void;
  onBack: () => void;
}) {
  const [catalogue, setCatalogue] = useState<VehicleCatalogue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<VehicleDto>>(vehicle ?? {});

  useEffect(() => {
    let cancelled = false;
    void getVehicleCatalogue().then((result) => {
      if (cancelled) return;
      if (result.ok) setCatalogue(result.data);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const models = catalogue?.makes.find((m) => m.name === draft.make)?.models ?? [];
  const needsType = !draft.type && Boolean(draft.make || draft.model || draft.colour);

  return (
    <div className="cmp-panel">
      <PanelHead title="What was being driven?" onBack={onBack} />
      <div className="cmp-scroll cmp-panel-body">
        <p className="small muted">
          All optional. Choose from the lists: never type a number plate, it&apos;s blurred for a reason.
        </p>
        {error ? <span className="error">{error}</span> : null}
        {!catalogue && !error ? <span className="help">Loading the lists…</span> : null}
        {catalogue ? (
          <>
            <fieldset className="field road-user">
              <legend className="label">Type</legend>
              <div className="row row-wrap" style={{ gap: 8 }}>
                {catalogue.types.map((type) => (
                  <label key={type} className={`pill-choice${draft.type === type ? " pill-on" : ""}`}>
                    <input
                      type="radio"
                      name="vehicle-type"
                      checked={draft.type === type}
                      onChange={() => setDraft((d) => ({ ...d, type }))}
                    />
                    {vehicleTypeLabel(type)}
                  </label>
                ))}
              </div>
              {needsType ? <span className="error">Choose the type of vehicle.</span> : null}
            </fieldset>
            <div className="facts">
              <label className="field">
                <span className="label">Make</span>
                <select
                  className="input"
                  value={draft.make ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, make: e.target.value || null, model: null }))}
                >
                  <option value="">Not sure</option>
                  {catalogue.makes.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="label">Model</span>
                <select
                  className="input"
                  value={draft.model ?? ""}
                  disabled={!draft.make}
                  onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value || null }))}
                >
                  <option value="">Not sure</option>
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <fieldset className="field road-user">
              <legend className="label">Colour</legend>
              <div className="row row-wrap" style={{ gap: 8 }}>
                {catalogue.colours.map((colour) => (
                  <label key={colour} className={`pill-choice${draft.colour === colour ? " pill-on" : ""}`}>
                    <input
                      type="radio"
                      name="vehicle-colour"
                      checked={draft.colour === colour}
                      onChange={() => setDraft((d) => ({ ...d, colour }))}
                    />
                    <span
                      className="swatch"
                      style={{ background: COLOUR_SWATCHES[colour] }}
                      aria-hidden="true"
                    />
                    {colour}
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        ) : null}
      </div>
      <div className="cmp-panel-foot row">
        <button type="button" className="btn" onClick={() => onDone(null)}>
          {vehicle ? "Remove" : "Skip"}
        </button>
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={!draft.type}
          onClick={() =>
            onDone({
              type: draft.type!,
              make: draft.make ?? null,
              model: draft.model ?? null,
              colour: draft.colour ?? null,
            })
          }
        >
          Done
        </button>
      </div>
    </div>
  );
}

/** Tag up to four people who were in your vehicle. Each is asked to accept before their name shows. */
function PassengersRow({
  passengers,
  error,
  onChange,
}: {
  passengers: AuthorDto[];
  error: string | undefined;
  onChange: (passengers: AuthorDto[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [handle, setHandle] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [looking, startLooking] = useTransition();

  const add = () =>
    startLooking(async () => {
      setProblem(null);
      const found = await findPassenger(handle);
      if (!found.ok) {
        setProblem(found.error);
        return;
      }
      if (passengers.some((p) => p.id === found.data.id)) {
        setProblem(`@${found.data.handle} is already tagged.`);
        return;
      }
      onChange([...passengers, found.data]);
      setHandle("");
      setAdding(false);
    });

  return (
    <div className="cmp-row cmp-row-top">
      <span className="cmp-row-label" id="passengers-label">
        Passengers <span className="small">(optional)</span>
      </span>
      <div className="cmp-passengers">
        <div className="cmp-chips" role="group" aria-labelledby="passengers-label">
          {passengers.map((p) => (
            <span key={p.id} className="cmp-chip">
              <span className="cmp-chip-avatar" aria-hidden="true">
                {(p.displayName || p.handle || "?").slice(0, 1).toUpperCase()}
              </span>
              @{p.handle}
              <button
                type="button"
                className="cmp-chip-x cmp-chip-x-dark"
                aria-label={`Remove @${p.handle}`}
                onClick={() => onChange(passengers.filter((x) => x.id !== p.id))}
              >
                <CloseIcon size={12} />
              </button>
            </span>
          ))}
          {!adding && passengers.length < MAX_PASSENGERS ? (
            <button type="button" className="cmp-chip" onClick={() => setAdding(true)}>
              <PlusIcon size={14} />
              Tag a passenger
            </button>
          ) : null}
        </div>
        {adding ? (
          <div className="row" style={{ gap: 8 }}>
            <label className="sr-only" htmlFor="passenger-handle">
              Passenger&apos;s username
            </label>
            <input
              id="passenger-handle"
              className="input"
              type="text"
              placeholder="@username"
              autoComplete="off"
              autoCapitalize="none"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
            />
            <button type="button" className="btn btn-sm" disabled={looking || !handle.trim()} onClick={add}>
              Add
            </button>
            <button type="button" className="link" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        ) : null}
        <span className={problem || error ? "error" : "help"}>
          {problem || error || "They'll be asked to confirm before their name shows on the post."}
        </span>
      </div>
    </div>
  );
}

function PanelHead({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="cmp-head">
      <button type="button" className="icon-btn" aria-label="Back to your post" onClick={onBack}>
        <ArrowBackIcon />
      </button>
      <h2 id="panel-title" className="cmp-heading">
        {title}
      </h2>
      <span className="cmp-head-end" />
    </header>
  );
}

/** Choose every type of bad driving that applies. The first one chosen is the main type. */
function TypesPanel({
  chosen,
  onToggle,
  onDone,
}: {
  chosen: IncidentCategory[];
  onToggle: (type: IncidentCategory, on: boolean) => void;
  onDone: () => void;
}) {
  return (
    <div className="cmp-panel">
      <PanelHead title="What kind of bad driving?" onBack={onDone} />
      <div className="cmp-scroll cmp-panel-body">
        <p className="small muted">Choose all that apply. Each one shows as a tag on your post.</p>
        <fieldset className="cmp-types">
          <legend className="sr-only">Types of bad driving</legend>
          {CATEGORY_CHOICES.map((type) => {
            const on = chosen.includes(type);
            return (
              <label key={type} className={`cmp-type${on ? " cmp-type-on" : ""}`}>
                <input type="checkbox" checked={on} onChange={(e) => onToggle(type, e.target.checked)} />
                {categoryLabel(type)}
              </label>
            );
          })}
        </fieldset>
      </div>
      <div className="cmp-panel-foot">
        <button type="button" className="btn btn-primary btn-block" onClick={onDone}>
          {chosen.length > 0 ? `Done · ${chosen.length} chosen` : "Done"}
        </button>
      </div>
    </div>
  );
}

function WhenPanel({
  date,
  time,
  maxDate,
  onDone,
  onBack,
}: {
  date: string;
  time: string;
  maxDate: string;
  onDone: (date: string, time: string) => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState({ date, time });
  return (
    <div className="cmp-panel">
      <PanelHead title="When did it happen?" onBack={onBack} />
      <div className="cmp-scroll cmp-panel-body">
        <div className="facts">
          <label className="field">
            <span className="label">Date</span>
            <input
              className="input"
              type="date"
              required
              max={maxDate}
              value={draft.date}
              onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
            />
          </label>
          <label className="field">
            <span className="label">Time</span>
            <input
              className="input"
              type="time"
              required
              value={draft.time}
              onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))}
            />
          </label>
        </div>
        <p className="help">UK time. Roughly is fine if you&apos;re not sure.</p>
      </div>
      <div className="cmp-panel-foot row">
        <button type="button" className="btn" onClick={onBack}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={!draft.date || !draft.time}
          onClick={() => onDone(draft.date, draft.time)}
        >
          Done
        </button>
      </div>
    </div>
  );
}

function WherePanel({
  placeName,
  pin,
  tileUrl,
  attribution,
  onDone,
  onBack,
}: {
  placeName: string;
  pin: Pin | null;
  tileUrl: string;
  attribution: string;
  onDone: (placeName: string, pin: Pin) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState(placeName);
  const [spot, setSpot] = useState<Pin | null>(pin);
  const [error, setError] = useState<string | null>(null);

  const locateMe = () => {
    if (!navigator.geolocation) {
      setError("Your browser can't share its location. Tap the map instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setError(null);
        setSpot({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => setError("We couldn't get your location. Tap the map instead."),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div className="cmp-panel">
      <PanelHead title="Where did it happen?" onBack={onBack} />
      <div className="cmp-scroll cmp-panel-body">
        <div className="field">
          <label className="label" htmlFor="where-name">
            Road and town
          </label>
          <PlaceSearch
            id="where-name"
            maxLength={200}
            placeholder="e.g. A57 Warrington Road, Rainhill"
            value={name}
            onText={setName}
            onPick={(place) => {
              // A town or postcode area puts the pin near; move it to the exact spot on the map.
              setName(place.detail ? `${place.name}, ${place.detail.split(",")[0]}` : place.name);
              setSpot({ lat: place.latitude, lng: place.longitude });
            }}
          />
          <span className="help">Pick a town to move the map there, then tap the exact spot.</span>
        </div>
        <button type="button" className="btn" style={{ alignSelf: "flex-start" }} onClick={locateMe}>
          <PinIcon size={16} color="#111111" />
          Use my location
        </button>
        <MapPicker value={spot} onChange={setSpot} tileUrl={tileUrl} attribution={attribution} />
        {error ? <span className="error">{error}</span> : null}
        <div className="notice">
          <PinIcon size={18} color="#00607F" />
          <span className="col" style={{ gap: 2 }}>
            <strong>
              {name.trim() ||
                (spot ? "Pin placed: now add the road and town above" : "Tap the map to drop a pin")}
            </strong>
            <span className="small">
              Only this place name is shown on your post. We keep the spot to within about 500 m, never the
              exact pin.
            </span>
          </span>
        </div>
      </div>
      <div className="cmp-panel-foot row">
        <button type="button" className="btn" onClick={onBack}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={!spot || !name.trim()}
          title={
            !spot ? "Drop a pin on the map first" : !name.trim() ? "Add the road and town first" : undefined
          }
          onClick={() => spot && onDone(name.trim(), spot)}
        >
          Use this place
        </button>
      </div>
    </div>
  );
}

/** The first tile before anything is added: tap to choose photos, or drop photos or a video on it. */
function DropTile({ onPhotos, onDrop }: { onPhotos: () => void; onDrop: (files: FileList | null) => void }) {
  const [over, setOver] = useState(false);
  return (
    <button
      type="button"
      className={`cmp-add cmp-drop${over ? " drop-over" : ""}`}
      onClick={onPhotos}
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
      <PhotoIcon size={28} color="#111111" />
      Add photos or a video
      <span className="small d-only">or drag them here</span>
    </button>
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
