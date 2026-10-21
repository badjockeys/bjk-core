"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { setHomeArea } from "@/actions/places";
import { checkHandle, createProfile, setAvatar, updateProfile } from "@/actions/profiles";
import { followBlocker } from "@/lib/blockers";
import { shrinkPhoto } from "@/lib/image-resize";
import type { PlaceDto, ProfileDto, RoadUser } from "@/lib/types";
import {
  contentTypeOf,
  MAX_PHOTO_BYTES,
  PHOTO_EXTENSIONS,
  PHOTO_TYPES,
  uploadFile,
  waitUntilReady,
} from "@/lib/upload";

import { Avatar } from "./Avatar";
import { TickIcon } from "./icons";
import { PlaceSearch } from "./PlaceSearch";

const BIO_MAX = 500;
const HANDLE_RULE = /^[a-z][a-z0-9_]{2,29}$/;

type HandleState = { kind: "idle" | "checking" | "ok" | "error"; message: string };

const ROAD_USER_CHOICES: readonly { value: RoadUser | null; label: string }[] = [
  { value: "Driver", label: "Driver" },
  { value: "Cyclist", label: "Cyclist" },
  { value: "Both", label: "Both" },
  { value: null, label: "Prefer not to say" },
];

/** Screens 12 and 13: create or edit your public profile. */
export function ProfileForm({
  mode,
  profile,
  suggestedName,
  returnTo,
  formId,
}: {
  mode: "create" | "edit";
  profile?: ProfileDto | null;
  suggestedName?: string | null;
  returnTo: string;
  formId: string;
}) {
  const router = useRouter();
  const [handle, setHandle] = useState(profile?.handle ?? "");
  const [displayName, setDisplayName] = useState(profile?.displayName ?? suggestedName ?? "");
  const [location, setLocation] = useState(profile?.location ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [roadUser, setRoadUser] = useState<RoadUser | null>(profile?.roadUser ?? null);
  const [showRoadUser, setShowRoadUser] = useState(profile?.showRoadUser ?? false);
  const [homePlace, setHomePlace] = useState<PlaceDto | null>(null);
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [handleState, setHandleState] = useState<HandleState>({ kind: "idle", message: "" });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  const normalised = handle.trim().replace(/^@/, "").toLowerCase();
  const unchangedHandle = mode === "edit" && normalised === profile?.handle.toLowerCase();

  // Check the username as it's typed (after a short pause).
  useEffect(() => {
    if (!normalised || unchangedHandle) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!HANDLE_RULE.test(normalised)) {
        if (!cancelled) {
          setHandleState({
            kind: "error",
            message: "Use 3 to 30 lower-case letters, numbers and underscores, starting with a letter.",
          });
        }
        return;
      }
      setHandleState({ kind: "checking", message: "Checking…" });
      const result = await checkHandle(normalised);
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        setHandleState({ kind: "error", message: result.error });
      } else if (result.data.available) {
        setHandleState({ kind: "ok", message: `@${result.data.handle} is available.` });
      } else {
        setHandleState({
          kind: "error",
          message: result.data.reason ?? "That username isn't available. Try another.",
        });
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalised, unchangedHandle]);

  useEffect(() => {
    return () => {
      if (photo) {
        URL.revokeObjectURL(photo.preview);
      }
    };
  }, [photo]);

  const choosePhoto = (file: File | undefined) => {
    if (!file) {
      return;
    }
    const type = contentTypeOf(file);
    if (!PHOTO_TYPES.includes(type)) {
      setFormError("Choose a JPEG, PNG, WebP or HEIC photo.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setFormError("Photos can be up to 25 MB.");
      return;
    }
    setFormError(null);
    setRemovePhoto(false);
    setPhoto({ file, preview: URL.createObjectURL(file) });
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const form = { handle: normalised, displayName, bio, location, roadUser, showRoadUser };
      const saved =
        mode === "create"
          ? await createProfile(form)
          : await updateProfile(form, profile?.handle ?? normalised);
      if (!saved.ok) {
        if (!followBlocker(saved.blocker)) {
          setErrors(saved.fieldErrors ?? {});
          setFormError(saved.error);
        }
        return;
      }

      if (homePlace) {
        // Best effort: the profile is saved either way, and the area can be chosen again.
        await setHomeArea(homePlace);
      }

      try {
        if (photo) {
          setStatus("Uploading your photo…");
          const shrunk = await shrinkPhoto(photo.file);
          const uploaded = await uploadFile(
            shrunk.blob,
            shrunk.name,
            shrunk.type || contentTypeOf(photo.file),
            () => {},
          );
          setStatus("Processing your photo…");
          await waitUntilReady(uploaded.mediaId);
          const result = await setAvatar(uploaded.mediaId);
          if (!result.ok) {
            throw new Error(result.error);
          }
        } else if (removePhoto) {
          await setAvatar(null);
        }
      } catch (error) {
        setStatus(null);
        setFormError(
          `Your profile is saved, but the photo didn't work: ${error instanceof Error ? error.message : "please try again."}`,
        );
        router.refresh();
        return;
      }

      setStatus(null);
      router.push(
        mode === "create" ? `/welcome?returnTo=${encodeURIComponent(returnTo)}` : `/@${saved.data.handle}`,
      );
      router.refresh();
    });
  };

  const fieldError = (name: string) => errors[name]?.[0];
  const avatarUrl = removePhoto ? null : (photo?.preview ?? profile?.avatarUrl ?? null);
  const handleMessage = fieldError("handle") ?? (handleState.kind === "error" ? handleState.message : null);

  return (
    <form id={formId} className="stack" style={{ gap: 18 }} onSubmit={submit} noValidate>
      <div className="row">
        <Avatar name={displayName || handle} url={avatarUrl} size="lg" />
        <button type="button" className="btn btn-sm" onClick={() => fileInput.current?.click()}>
          {avatarUrl ? "Change photo" : "Add a photo"}
        </button>
        {avatarUrl ? (
          <button
            type="button"
            className="link small"
            onClick={() => {
              setPhoto(null);
              setRemovePhoto(true);
            }}
          >
            Remove photo
          </button>
        ) : null}
        <input
          ref={fileInput}
          type="file"
          accept={[...PHOTO_TYPES, ...PHOTO_EXTENSIONS].join(",")}
          hidden
          onChange={(e) => {
            choosePhoto(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="handle">
          Username
        </label>
        <div className={`input input-affix${handleMessage ? " input-error" : ""}`}>
          <span className="muted">@</span>
          <input
            id="handle"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={30}
            required
            value={handle}
            aria-invalid={handleMessage ? true : undefined}
            aria-describedby="handle-help"
            onChange={(e) => {
              setHandle(e.target.value);
              setHandleState({ kind: "idle", message: "" });
            }}
          />
          {handleState.kind === "ok" ? <TickIcon /> : null}
        </div>
        <span id="handle-help" className={handleMessage ? "error" : "help"} aria-live="polite">
          {handleMessage ??
            (handleState.kind === "ok" || handleState.kind === "checking" ? `${handleState.message} ` : "") +
              "Letters, numbers and underscores, 3 to 30 characters."}
        </span>
      </div>

      <div className={mode === "edit" ? "facts" : "stack"} style={mode === "edit" ? undefined : { gap: 18 }}>
        <label className="field">
          <span className="label">Display name</span>
          <input
            className={`input${fieldError("displayName") ? " input-error" : ""}`}
            type="text"
            autoComplete="name"
            maxLength={50}
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          {fieldError("displayName") ? <span className="error">{fieldError("displayName")}</span> : null}
        </label>
        <div className="field">
          <label className="label" htmlFor="profile-area">
            Town or area <span className="muted">(optional)</span>
          </label>
          <PlaceSearch
            id="profile-area"
            value={location}
            invalid={Boolean(fieldError("location"))}
            placeholder="Start typing a town or postcode"
            onText={(text) => {
              setLocation(text);
              setHomePlace(null);
            }}
            onPick={(place) => {
              setLocation(place.name);
              setHomePlace(place);
            }}
          />
          <span className={fieldError("location") ? "error" : "help"}>
            {fieldError("location") ??
              (homePlace
                ? "Your home area, for area alerts. Only the name shows on your profile."
                : "Choose from the list to use it as your home area for alerts.")}
          </span>
        </div>
      </div>

      <label className="field">
        <span className="label">
          About you <span className="muted">(optional)</span>
        </span>
        <textarea
          className={`textarea${fieldError("bio") ? " input-error" : ""}`}
          rows={3}
          maxLength={BIO_MAX}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
        <span className={fieldError("bio") ? "error" : "help"}>
          {fieldError("bio") ?? `${bio.length} / ${BIO_MAX}`}
        </span>
      </label>

      <fieldset className="field road-user">
        <legend className="label">
          How do you use the road? <span className="muted">(optional)</span>
        </legend>
        <div className="row row-wrap" style={{ gap: 8 }}>
          {ROAD_USER_CHOICES.map((choice) => (
            <label key={choice.label} className={`pill-choice${roadUser === choice.value ? " pill-on" : ""}`}>
              <input
                type="radio"
                name="road-user"
                checked={roadUser === choice.value}
                onChange={() => {
                  setRoadUser(choice.value);
                  if (choice.value === null) setShowRoadUser(false);
                }}
              />
              {choice.label}
            </label>
          ))}
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={showRoadUser}
            disabled={roadUser === null}
            onChange={(e) => setShowRoadUser(e.target.checked)}
          />
          <span>Show this on my profile and posts</span>
        </label>
        <span className="help">
          Private unless you show it. We use it to put the types of bad driving you&apos;ll see most first,
          and in totals on the incident map.
        </span>
      </fieldset>

      {formError ? (
        <p className="error" role="alert">
          {formError}
        </p>
      ) : null}
      {status ? (
        <p className="help" role="status">
          {status}
        </p>
      ) : null}

      {mode === "create" ? (
        <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
          {pending ? "Saving…" : "Continue"}
        </button>
      ) : (
        <button type="submit" className="btn btn-primary btn-block m-only" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      )}
    </form>
  );
}
