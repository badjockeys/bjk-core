"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { deleteDraft, listDrafts, saveDraft } from "@/actions/drafts";
import { discardMedia, getMedia } from "@/actions/media";
import { getVaultDownload } from "@/actions/vault";
import { findPassenger } from "@/actions/passengers";
import { getMyCars, getVehicleCatalogue } from "@/actions/vehicles";
import { shareToCommunities } from "@/actions/communities";
import { createPost } from "@/actions/posts";
import { followBlocker } from "@/lib/blockers";
import { categoryLabel, CATEGORY_CHOICES, DESCRIPTION_MAX } from "@/lib/categories";
import { duration, plural, timeAgo, ukDateAndTime, ukLocalToIso, whenLabel } from "@/lib/format";
import { shrinkPhoto } from "@/lib/image-resize";
import type {
  AuthorDto,
  DraftDto,
  HouseholdCarDto,
  IncidentCategory,
  SaveDraftRequest,
  VehicleCatalogue,
  VehicleDto,
} from "@/lib/types";
import { COLOUR_SWATCHES, describeVehicle, vehicleTypeLabel } from "@/lib/vehicles";
import { containsWebAddress, LINK_MESSAGE } from "@/lib/web-addresses";
import {
  contentTypeOf,
  kindOf,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  MAX_VIDEO_SECONDS,
  PHOTO_EXTENSIONS,
  PHOTO_TYPES,
  uploadFile,
  UploadError,
  VIDEO_EXTENSIONS,
  VIDEO_TYPES,
  waitUntilReady,
} from "@/lib/upload";

import { Avatar } from "./Avatar";
import {
  ArrowBackIcon,
  ChevronIcon,
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
import { useHashtagSuggest } from "./HashtagSuggest";
import type { Pin } from "./MapPicker";
import { CommunityShareField } from "./communities/CommunityShareField";
import { PassengerPicker } from "./PassengerPicker";
import { PlaceSearch } from "./PlaceSearch";
import { TrimVideo, type TrimmedClip } from "./TrimVideo";

const MapPicker = dynamic(() => import("./MapPicker"), {
  ssr: false,
  loading: () => <div className="map ph" aria-hidden="true" />,
});

/** The composer, or one of the panels it opens in place (trimming a video, choosing types, when, where). */
type View = "compose" | "trim" | "types" | "when" | "where" | "vehicle" | "leave" | "drafts";

/** How many drafts each person can keep (the API's limit, GET /api/posts/drafts/limits). */
const MAX_DRAFTS = 5;

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
  /**
   * Reported to the police: yes, no, or not said. No longer asked (owner, 22 Oct 2026: "Report to the police" is
   * offered under the post instead); kept so older drafts keep their answer.
   */
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
  /**
   * "dialog": a pop-out "Create post" dialog over the feed on desktop, like Facebook (owner feedback, 22 Oct 2026);
   * its panels open in the same dialog. "page": the /post/new page, which fills the screen on phones.
   */
  mode: "dialog" | "page";
  /** Dialog only: what the bar under "Seen some bad driving?" asked for, so the dialog opens on it. */
  start?: ComposerStart;
  defaultDate: string;
  defaultTime: string;
  tileUrl: string;
  attribution: string;
  emailVerified: boolean;
  /** Posting a clip from your vault (`/post/new?vault=…`): it's fetched and added as if you'd chosen the file. */
  vaultClipId?: string;
  author: { name: string; avatarUrl: string | null };
  /** Dialog only: the composer was closed (cancelled, discarded or kept as a draft). */
  onClose?: () => void;
  /** Dialog only: the post went up. */
  onPosted?: (post: { id: string; kind: "Image" | "Video" }) => void;
}

/** What the composer needs from a signed-in member with a profile (app/post/new/composer-props.ts). */
export type ComposerData = Omit<PostComposerProps, "mode" | "start" | "onClose" | "onPosted">;

/** Where the dialog opens: the form, the file picker, the types of bad driving, or where it happened. */
export type ComposerStart = "compose" | "photos" | "types" | "where";

/**
 * The new post composer (approved mock-ups, 20 Oct 2026): like Facebook or X, everything on one screen. Title, what
 * happened (up to 500 characters), photos or a video, then the details as chips: the types of bad driving (several),
 * when and where, each opening a panel in place. Post is enabled once nothing required is missing, and the footer
 * says what still is. On desktop it pops out in a dialog from the top of the feed, like Facebook (owner feedback,
 * 22 Oct 2026); on phones it fills the screen.
 */
export function PostComposer({
  mode,
  start = "compose",
  defaultDate,
  defaultTime,
  tileUrl,
  attribution,
  emailVerified,
  vaultClipId,
  author,
  onClose,
  onPosted,
}: PostComposerProps) {
  const router = useRouter();
  const [view, setView] = useState<View>(
    mode === "dialog" && (start === "types" || start === "where") ? start : "compose",
  );
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
  /** Communities to share the post into once it's up (owner, 23 Oct 2026). */
  const [shareTo, setShareTo] = useState<string[]>([]);
  /** Your household cars, and the one this was filmed from (owner, 22 Oct 2026). */
  const [cars, setCars] = useState<HouseholdCarDto[] | null>(null);
  const [carId, setCarId] = useState<string>("");
  useEffect(() => {
    let live = true;
    void getMyCars().then((result) => {
      if (live && result.ok) setCars(result.data);
    });
    return () => {
      live = false;
    };
  }, []);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Drafts: the one being edited (if any), the media already saved in it, and the list to open one from.
  const [draftId, setDraftId] = useState<string | null>(null);
  const [savedMedia, setSavedMedia] = useState<ReadonlySet<string>>(new Set());
  const [drafts, setDrafts] = useState<DraftDto[] | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [savingDraft, startSavingDraft] = useTransition();
  const photoInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const sheet = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLInputElement>(null);
  const text = useRef<HTMLTextAreaElement>(null);
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
          const uploaded = await uploadFile(
            file.blob,
            file.name,
            file.type,
            (p) => patch(key, { progress: p }),
            vaultClipId ?? null,
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
    [patch, vaultClipId],
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

  const onFiles = (list: FileList | File[] | null) => {
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

  // Posting a clip from your vault: fetch the original once and add it as if it had been chosen (videos are trimmed
  // as usual). The upload says which clip it is, so it isn't kept in the vault twice.
  const addFiles = useRef(onFiles);
  useEffect(() => {
    addFiles.current = onFiles;
  });
  const [vaultLoading, setVaultLoading] = useState(false);
  const vaultFetched = useRef(false);
  useEffect(() => {
    if (!vaultClipId || vaultFetched.current) {
      return;
    }
    vaultFetched.current = true;
    const timer = setTimeout(async () => {
      setVaultLoading(true);
      try {
        const link = await getVaultDownload(vaultClipId);
        if (!link.ok) {
          setMediaError(link.error);
          return;
        }
        const response = await fetch(link.data.url);
        if (!response.ok) {
          setMediaError("We couldn't get that clip from your vault. Please try again.");
          return;
        }
        const blob = await response.blob();
        const type = blob.type || "video/mp4";
        const extension = type.split("/")[1]?.replace("quicktime", "mov") ?? "mp4";
        addFiles.current([new File([blob], `vault-clip.${extension}`, { type })]);
      } catch {
        setMediaError("We couldn't get that clip from your vault. Please try again.");
      } finally {
        setVaultLoading(false);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [vaultClipId]);

  const remove = (item: Item) => {
    setItems((current) => current.filter((i) => i.key !== item.key));
    if (item.preview) {
      URL.revokeObjectURL(item.preview);
    }
    if (item.mediaId) {
      void discardMedia(item.mediaId);
    }
  };

  const started =
    draftId !== null ||
    items.length > 0 ||
    fields.title.trim() !== "" ||
    fields.description.trim() !== "" ||
    fields.types.length > 0 ||
    fields.placeName.trim() !== "" ||
    fields.pin !== null ||
    fields.passengers.length > 0 ||
    fields.vehicle !== null;

  useEffect(() => {
    let live = true;
    void listDrafts().then((result) => {
      if (live && result.ok) setDrafts(result.data);
    });
    return () => {
      live = false;
    };
  }, []);

  const close = () => {
    if (mode === "dialog") {
      leaveGuard.current = false;
      onClose?.();
    } else if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  /** Closing with something in the composer asks whether to keep it as a draft. */
  const cancel = () => {
    if (!started) {
      close();
      return;
    }
    setDraftError(null);
    setView("leave");
  };

  /** Throw it away: uploads not already saved in a draft are deleted. */
  const discard = () => {
    for (const item of items) {
      if (item.mediaId && !savedMedia.has(item.mediaId)) {
        void discardMedia(item.mediaId);
      }
    }
    close();
  };

  const draftRequest = (): SaveDraftRequest => ({
    title: fields.title,
    description: fields.description || null,
    types: fields.types,
    incidentAt: ukLocalToIso(fields.date, fields.time),
    latitude: fields.pin ? round6(fields.pin.lat) : null,
    longitude: fields.pin ? round6(fields.pin.lng) : null,
    placeName: fields.placeName || null,
    isSensitive: fields.sensitive,
    passengers: fields.passengers.map((p) => p.handle!).filter(Boolean),
    vehicleType: fields.vehicle?.type ?? null,
    vehicleMake: fields.vehicle?.make ?? null,
    vehicleModel: fields.vehicle?.model ?? null,
    vehicleColour: fields.vehicle?.colour ?? null,
    reportedToPolice: fields.reportedToPolice,
    mediaIds: items.filter((i) => i.mediaId && i.status !== "failed").map((i) => i.mediaId!),
  });

  const keepAsDraft = () =>
    startSavingDraft(async () => {
      setDraftError(null);
      const result = await saveDraft(draftId, draftRequest());
      if (!result.ok) {
        setDraftError(result.error);
        return;
      }
      // Files that didn't work aren't in the draft, so they aren't kept either.
      for (const item of items) {
        if (item.mediaId && item.status === "failed") void discardMedia(item.mediaId);
      }
      close();
    });

  /** Put a saved draft into the composer to carry on with it. */
  const openDraft = (draft: DraftDto) => {
    const when = draft.incidentAt ? ukDateAndTime(Date.parse(draft.incidentAt)) : null;
    setFields((current) => ({
      ...current,
      title: draft.title ?? "",
      description: draft.description ?? "",
      types: draft.types,
      placeName: draft.placeName ?? "",
      pin:
        draft.latitude !== null && draft.longitude !== null
          ? { lat: draft.latitude, lng: draft.longitude }
          : null,
      date: when?.date ?? current.date,
      time: when?.time ?? current.time,
      sensitive: draft.isSensitive,
      // Checked again when the post goes; the names show as typed until then.
      passengers: draft.passengers.map((handle) => ({
        id: `draft:${handle.toLowerCase()}`,
        handle,
        displayName: `@${handle}`,
        avatarUrl: null,
      })),
      vehicle: draft.vehicleType
        ? {
            type: draft.vehicleType,
            make: draft.vehicleMake,
            model: draft.vehicleModel,
            colour: draft.vehicleColour,
          }
        : null,
      reportedToPolice: draft.reportedToPolice,
    }));
    setItems(
      draft.media.map((m) => ({
        key: `draft-${m.mediaId}`,
        kind: m.mediaType,
        name: "",
        preview: m.thumbnailUrl,
        seconds: m.durationSeconds ?? undefined,
        progress: 100,
        status:
          m.status === "Ready"
            ? "ready"
            : m.status === "Failed"
              ? "failed"
              : m.status === "Uploading"
                ? "failed"
                : "processing",
        mediaId: m.mediaId,
        error: m.status === "Failed" ? friendlyFailure(m.failureReason) : undefined,
      })),
    );
    setDraftId(draft.id);
    setSavedMedia(new Set(draft.media.map((m) => m.mediaId)));
    setErrors({});
    setView("compose");
  };

  const removeDraft = async (draft: DraftDto) => {
    const result = await deleteDraft(draft.id);
    if (result.ok) {
      setDrafts((current) => (current ?? []).filter((d) => d.id !== draft.id));
    }
    return result;
  };

  // Dialog: it opens as soon as it's shown, with the title ready to type into (or the file picker, if that's what
  // was asked for: the click that opened the dialog still counts as the person's, so the browser allows it).
  const opened = useRef(false);
  useEffect(() => {
    const element = sheet.current;
    if (mode !== "dialog" || !element || opened.current) {
      return;
    }
    opened.current = true;
    if (!element.open) {
      element.showModal();
    }
    if (start === "photos") {
      photoInput.current?.click();
    } else if (start === "compose") {
      title.current?.focus();
    }
  }, [mode, start]);

  // Dialog: leaving the page with a post started asks first (the browser's own prompt).
  const leaveGuard = useRef(false);
  useEffect(() => {
    leaveGuard.current = started;
  }, [started]);
  useEffect(() => {
    if (mode !== "dialog") {
      return;
    }
    const warn = (event: BeforeUnloadEvent) => {
      if (leaveGuard.current) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [mode]);

  const set = <K extends keyof Fields>(key: K, value: Fields[K]) => {
    setFields((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  // Typing # in the title or description suggests hashtags (UI step 5).
  const titleTags = useHashtagSuggest({
    id: "post-title",
    value: fields.title,
    onChange: (v) => set("title", v),
    ref: title,
  });
  const textTags = useHashtagSuggest({
    id: "post-text",
    value: fields.description,
    onChange: (v) => set("description", v),
    ref: text,
  });

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
    else if (containsWebAddress(fields.title)) problems.title = LINK_MESSAGE;
    if (containsWebAddress(fields.description)) problems.description = LINK_MESSAGE;
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
        filmedFromCarId: carId || null,
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
        // Posting a draft deletes the draft (its photos stay, in the post).
        draftId,
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
      if (result.ok && shareTo.length > 0) {
        // The post is up whatever happens here; a community that refuses it is simply left out.
        await shareToCommunities(result.data.id, shareTo);
      }
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
      if (mode === "dialog") {
        leaveGuard.current = false;
        onPosted?.({ id: result.data.id, kind: kind ?? "Image" });
        router.refresh();
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
            ? [...PHOTO_TYPES, ...VIDEO_TYPES, ...PHOTO_EXTENSIONS, ...VIDEO_EXTENSIONS].join(",")
            : [...PHOTO_TYPES, ...PHOTO_EXTENSIONS].join(",")
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
        accept={[...VIDEO_TYPES, ...VIDEO_EXTENSIONS].join(",")}
        hidden
        data-testid="video-input"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );

  // The panel open over the composer (or in its place on the page), if any.
  let panel: ReactNode = null;
  if (view === "leave") {
    panel = (
      <LeavePanel
        editingDraft={draftId !== null}
        uploading={uploading > 0}
        saving={savingDraft}
        atLimit={draftId === null && (drafts?.length ?? 0) >= MAX_DRAFTS}
        error={draftError}
        onSave={keepAsDraft}
        onDiscard={discard}
        onKeepEditing={() => setView("compose")}
      />
    );
  } else if (view === "drafts") {
    panel = (
      <DraftsPanel
        drafts={drafts ?? []}
        onOpen={openDraft}
        onDelete={removeDraft}
        onBack={() => setView("compose")}
      />
    );
  } else if (view === "trim" && videoFile) {
    panel = (
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
    panel = <TypesPanel chosen={fields.types} onToggle={toggleType} onDone={() => setView("compose")} />;
  } else if (view === "when") {
    panel = (
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
    panel = (
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
    panel = (
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
  }

  const compose = (
    <>
      {mode === "dialog" ? (
        <header className="cmp-head">
          <span className="cmp-head-end" />
          <h2 id="composer-title" className="cmp-heading">
            Create post
          </h2>
          <button type="button" className="icon-btn icon-btn-fill" aria-label="Close" onClick={cancel}>
            <CloseIcon />
          </button>
        </header>
      ) : (
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
      )}

      <form id="new-post" className="cmp-body cmp-scroll" onSubmit={submit} noValidate>
        {!started && drafts && drafts.length > 0 ? (
          <button type="button" className="cmp-drafts-link" onClick={() => setView("drafts")}>
            <span>
              You have {plural(drafts.length, "draft")} saved. <strong>Open drafts</strong>
            </span>
            <ChevronIcon />
          </button>
        ) : null}

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
              ref={title}
              {...titleTags.fieldProps}
              className={`cmp-title${errors.title ? " input-error" : ""}`}
              type="text"
              maxLength={120}
              required
              placeholder="Sum it up, e.g. Tailgated on the A57"
              value={fields.title}
              onChange={(e) => set("title", e.target.value)}
            />
            {titleTags.list}
            {errors.title ? <span className="error">{errors.title}</span> : null}
            <label htmlFor="post-text" className="cmp-label">
              What happened? <span className="muted">(optional)</span>
            </label>
            <textarea
              id="post-text"
              ref={text}
              {...textTags.fieldProps}
              className={`cmp-textarea${errors.description ? " input-error" : ""}`}
              rows={3}
              maxLength={DESCRIPTION_MAX}
              aria-describedby="post-text-count"
              value={fields.description}
              onChange={(e) => set("description", e.target.value)}
            />
            {textTags.list}
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
              (vaultLoading ? "Getting your clip from your vault…" : "") ||
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

          {onTheRoad ? (
            <PassengersRow
              passengers={fields.passengers}
              error={errors.passengers}
              onChange={(passengers) => set("passengers", passengers)}
            />
          ) : null}

          {cars ? (
            <div className="cmp-row">
              <label className="cmp-row-label" htmlFor="filmed-from">
                Filmed from <span className="small">(optional)</span>
              </label>
              {cars.length > 0 ? (
                <select
                  id="filmed-from"
                  className="input"
                  style={{ width: "auto" }}
                  value={carId}
                  onChange={(e) => setCarId(e.target.value)}
                >
                  <option value="">Not one of my cars</option>
                  {cars.map((car) => (
                    <option key={car.id} value={car.id}>
                      {car.nickname}
                    </option>
                  ))}
                </select>
              ) : (
                <Link href="/account/cars" className="link small">
                  Add your car
                </Link>
              )}
            </div>
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

        <CommunityShareField
          latitude={fields.pin?.lat ?? null}
          longitude={fields.pin?.lng ?? null}
          selected={shareTo}
          onChange={setShareTo}
        />

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

      {mode === "dialog" ? (
        <footer className="cmp-foot cmp-foot-dialog">
          <div className="cmp-addbar">
            <span className="cmp-addbar-label">Add to your post</span>
            <div className="cmp-addbar-icons">
              <button
                type="button"
                className="icon-btn"
                aria-label="Add photos"
                disabled={kind === "Video" || photosLeft <= 0}
                onClick={() => photoInput.current?.click()}
              >
                <PhotoIcon size={22} color="#00B5E5" strokeWidth={2} />
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
              <button
                type="button"
                className="icon-btn"
                aria-label="Type of bad driving"
                onClick={() => setView("types")}
              >
                <TagIcon size={22} />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label="When it happened"
                onClick={() => setView("when")}
              >
                <ClockIcon size={22} color="#111111" />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label="Where it happened"
                onClick={() => setView("where")}
              >
                <PinIcon size={22} color="#111111" />
              </button>
            </div>
          </div>
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
          <button type="submit" form="new-post" className="btn btn-primary btn-block" disabled={!canPost}>
            {pending ? "Posting…" : "Post"}
          </button>
        </footer>
      ) : (
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
      )}
    </>
  );

  if (mode === "dialog") {
    return (
      <dialog
        ref={sheet}
        className="composer composer-modal"
        aria-labelledby={panel ? "panel-title" : "composer-title"}
        onCancel={(event) => {
          // Escape steps back from a panel (a video being trimmed is dropped; "Save as a draft?" means keep
          // editing), or closes as Close does.
          event.preventDefault();
          if (panel) {
            setVideoFile(null);
            setView("compose");
          } else {
            cancel();
          }
        }}
      >
        {fileInputs}
        {panel ?? compose}
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
        {panel ?? compose}
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

/**
 * Tag up to four people who were in your vehicle, picked from the list that drops down as you type
 * (PassengerPicker). Each is asked to accept before their name shows.
 */
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
  const [problem, setProblem] = useState<string | null>(null);
  const [looking, startLooking] = useTransition();

  // Enter or Add without picking from the list: look up exactly what was typed.
  const add = (handle: string) =>
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
          <PassengerPicker
            taken={passengers.map((p) => p.id)}
            busy={looking}
            onPick={(person) => {
              setProblem(null);
              onChange([...passengers, person]);
              setAdding(false);
            }}
            onExact={add}
            onCancel={() => setAdding(false)}
          />
        ) : null}
        <span className={problem || error ? "error" : "help"}>
          {problem || error || "They'll be asked to confirm before their name shows on the post."}
        </span>
      </div>
    </div>
  );
}

/** Leaving with something in the composer: keep it as a draft, throw it away, or go back to it. */
function LeavePanel({
  editingDraft,
  uploading,
  saving,
  atLimit,
  error,
  onSave,
  onDiscard,
  onKeepEditing,
}: {
  editingDraft: boolean;
  uploading: boolean;
  saving: boolean;
  atLimit: boolean;
  error: string | null;
  onSave: () => void;
  onDiscard: () => void;
  onKeepEditing: () => void;
}) {
  return (
    <div className="cmp-panel">
      <PanelHead
        title={editingDraft ? "Save your changes?" : "Save this post as a draft?"}
        onBack={onKeepEditing}
      />
      <div className="cmp-scroll cmp-panel-body">
        <p>
          {editingDraft
            ? "Your draft is kept as it was unless you save these changes."
            : "Keep it to finish later, on any device. Your photos or video stay with it."}
        </p>
        <p className="small muted">
          You can keep up to {MAX_DRAFTS} drafts. Each one is kept for 30 days after you last save it.
        </p>
        {atLimit ? (
          <p className="notice notice-warn" role="note">
            You already have {MAX_DRAFTS} drafts. Delete one from Drafts to save this one.
          </p>
        ) : null}
        {uploading ? <p className="small">Waiting for your uploads to finish before saving…</p> : null}
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="cmp-panel-foot cmp-leave-foot">
        <button
          type="button"
          className="btn btn-primary btn-block"
          disabled={uploading || saving || atLimit}
          onClick={onSave}
        >
          {saving ? "Saving…" : editingDraft ? "Save changes" : "Save draft"}
        </button>
        <button type="button" className="btn btn-danger btn-block" disabled={saving} onClick={onDiscard}>
          {editingDraft ? "Discard changes" : "Discard post"}
        </button>
        <button type="button" className="btn btn-block" disabled={saving} onClick={onKeepEditing}>
          Keep editing
        </button>
      </div>
    </div>
  );
}

/** Your saved drafts: open one to carry on, or delete it. */
function DraftsPanel({
  drafts,
  onOpen,
  onDelete,
  onBack,
}: {
  drafts: DraftDto[];
  onOpen: (draft: DraftDto) => void;
  onDelete: (draft: DraftDto) => Promise<{ ok: boolean; error?: string }>;
  onBack: () => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [deleting, startDeleting] = useTransition();

  return (
    <div className="cmp-panel">
      <PanelHead title="Drafts" onBack={onBack} />
      <div className="cmp-scroll cmp-panel-body">
        <p className="small muted">
          {drafts.length} of {MAX_DRAFTS} drafts. Each is kept for 30 days after you last save it.
        </p>
        {problem ? (
          <p className="error" role="alert">
            {problem}
          </p>
        ) : null}
        {drafts.length === 0 ? <p>No drafts. Close a post you&apos;ve started to save it here.</p> : null}
        <ul className="cmp-draft-list" aria-label="Your drafts">
          {drafts.map((draft) => {
            const thumb = draft.media[0]?.thumbnailUrl ?? null;
            const label = draft.title?.trim() || "Untitled draft";
            return (
              <li key={draft.id} className="cmp-draft">
                <button
                  type="button"
                  className="cmp-draft-open"
                  onClick={() => onOpen(draft)}
                  aria-label={`Open ${label}`}
                >
                  {thumb ? (
                    <img src={thumb} alt="" width={56} height={56} className="cmp-draft-thumb" />
                  ) : (
                    <span className="cmp-draft-thumb cmp-draft-thumb-empty" aria-hidden="true">
                      <PhotoIcon size={20} />
                    </span>
                  )}
                  <span className="col" style={{ gap: 2, minWidth: 0 }}>
                    <strong className="cmp-draft-title">{label}</strong>
                    <span className="small muted">
                      Saved {timeAgo(draft.updatedAt)}
                      {draft.media.length > 0 ? ` · ${plural(draft.media.length, "file")}` : ""}
                    </span>
                  </span>
                </button>
                {confirming === draft.id ? (
                  <span className="row" style={{ gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={deleting}
                      onClick={() =>
                        startDeleting(async () => {
                          setProblem(null);
                          const result = await onDelete(draft);
                          if (!result.ok) setProblem(result.error ?? "That draft couldn't be deleted.");
                          setConfirming(null);
                        })
                      }
                    >
                      Delete
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => setConfirming(null)}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="link small"
                    aria-label={`Delete ${label}`}
                    onClick={() => setConfirming(draft.id)}
                  >
                    Delete
                  </button>
                )}
              </li>
            );
          })}
        </ul>
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
