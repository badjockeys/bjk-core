"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import {
  completeVaultUpload,
  deleteVaultClip,
  getVault,
  getVaultDownload,
  getVaultPreviews,
  requestVaultUpload,
  setVaultAutoSave,
} from "@/actions/vault";
import { dateTime, longDate, plural } from "@/lib/format";
import { postPath } from "@/lib/paths";
import type { VaultClipDto, VaultDto } from "@/lib/types";
import {
  contentTypeOf,
  PHOTO_EXTENSIONS,
  PHOTO_TYPES,
  putFile,
  VIDEO_EXTENSIONS,
  VIDEO_TYPES,
} from "@/lib/upload";
import {
  collectionHref,
  collectionName,
  expiresSoon,
  fileSize,
  keptFor,
  previewable,
  usedShare,
  VAULT_COLLECTIONS,
  type VaultCollection,
} from "@/lib/vault";

import { BackButton } from "./BackButton";
import { DownloadIcon, PhotoIcon, PlusIcon, ShieldIcon, VideoIcon } from "./icons";
import { Modal } from "./Modal";
import { toast } from "./toast";

type Upload = { key: string; name: string; progress: number; error?: string };

/** Links that show clips in the page, fetched as clips come into view and kept for the page's life (15 minutes). */
function usePreviews(clips: readonly VaultClipDto[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const asked = useRef(new Set<string>());
  const wanted = clips
    .filter((c) => previewable(c.contentType) && !(c.id in urls))
    .map((c) => c.id)
    .join(",");

  useEffect(() => {
    const ids = wanted ? wanted.split(",").filter((id) => !asked.current.has(id)) : [];
    if (ids.length === 0) return;
    ids.forEach((id) => asked.current.add(id));
    // Results are always kept, even if the clips shown have changed since: they're asked for once.
    void getVaultPreviews(ids).then((result) => {
      if (result.ok) {
        setUrls((current) => ({
          ...current,
          ...Object.fromEntries(result.data.map((p) => [p.clipId, p.url])),
        }));
      }
    });
  }, [wanted]);

  return urls;
}

/**
 * Your vault in Account (owner, 23 Oct 2026), laid out like Instagram's Saved screen: collections (all clips, the
 * originals of your posts, uploads) as tiles of four, each opening to a three-across grid; tap a clip to see it,
 * download it, post it or delete it. At the top, whether your posts' originals are kept automatically. These are your
 * originals, unblurred with sound and location, and only you can see them.
 */
export function VaultScreen({
  vault,
  collection,
  covers,
}: {
  /** The vault, with the open collection's first page of clips (or every clip's first few, on the collections). */
  vault: VaultDto;
  /** The open collection, or null for the collections. */
  collection: VaultCollection | null;
  /** On the collections: each collection's first few clips and count. */
  covers?: Partial<Record<VaultCollection, { clips: VaultClipDto[]; total: number }>>;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [autoSave, setAutoSave] = useState(vault.autoSave);
  const [saving, setSaving] = useState(false);
  const [more, setMore] = useState<{ clips: VaultClipDto[]; page: number; loading: boolean }>({
    clips: [],
    page: 1,
    loading: false,
  });
  const [open, setOpen] = useState<VaultClipDto | null>(null);

  const clips = [...vault.clips.items, ...more.clips];
  const coverClips = Object.values(covers ?? {}).flatMap((c) => c?.clips ?? []);
  const urls = usePreviews(collection ? clips : coverClips);
  const hasMore = clips.length < vault.clips.totalCount;
  const share = usedShare(vault.usedBytes, vault.limitBytes);

  const patch = (key: string, change: Partial<Upload>) =>
    setUploads((current) => current.map((u) => (u.key === key ? { ...u, ...change } : u)));

  const upload = async (file: File) => {
    const key = `${file.name}-${Date.now()}-${Math.random()}`;
    setUploads((current) => [...current, { key, name: file.name, progress: 0 }]);
    const ticket = await requestVaultUpload({
      fileName: file.name,
      contentType: contentTypeOf(file),
      sizeBytes: file.size,
    });
    if (!ticket.ok) {
      patch(key, { error: ticket.error });
      return;
    }
    try {
      await putFile(ticket.data.upload, file, (p) => patch(key, { progress: p }));
    } catch (error) {
      patch(key, { error: error instanceof Error ? error.message : "The upload failed." });
      return;
    }
    const done = await completeVaultUpload(ticket.data.clipId);
    if (!done.ok) {
      patch(key, { error: done.error });
      return;
    }
    setUploads((current) => current.filter((u) => u.key !== key));
    toast(`${file.name} is in your vault`);
    router.refresh();
  };

  const toggleAutoSave = async (on: boolean) => {
    setAutoSave(on);
    setSaving(true);
    const result = await setVaultAutoSave(on);
    setSaving(false);
    if (!result.ok) {
      setAutoSave(!on);
      toast(result.error);
      return;
    }
    setAutoSave(result.data.autoSave);
    toast(
      result.data.autoSave
        ? "Your posts' originals will be kept in your vault"
        : "Your posts' originals won't be kept from now on",
    );
  };

  const loadMore = async () => {
    if (!collection) return;
    setMore((m) => ({ ...m, loading: true }));
    const result = await getVault(more.page + 1, collection);
    if (!result.ok) {
      setMore((m) => ({ ...m, loading: false }));
      toast(result.error);
      return;
    }
    setMore((m) => ({ clips: [...m.clips, ...result.data.clips.items], page: m.page + 1, loading: false }));
  };

  return (
    <section className="vault-screen" aria-labelledby="vault-title">
      <header className="top">
        <div className="top-left">
          <BackButton fallback={collection ? "/account/vault" : "/account"} />
          <h1 id="vault-title" className="h2">
            {collection ? collectionName(collection) : "Vault"}
          </h1>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Add clips"
          onClick={() => input.current?.click()}
        >
          <PlusIcon />
        </button>
        <input
          ref={input}
          type="file"
          hidden
          multiple
          data-testid="vault-input"
          accept={[...VIDEO_TYPES, ...PHOTO_TYPES, ...VIDEO_EXTENSIONS, ...PHOTO_EXTENSIONS].join(",")}
          onChange={(e) => {
            Array.from(e.target.files ?? []).forEach((f) => void upload(f));
            e.target.value = "";
          }}
        />
      </header>

      {collection === null ? (
        <>
          <div className="vault-settings pad stack" style={{ gap: 12 }}>
            <label className="check vault-auto">
              <input
                type="checkbox"
                className="switch"
                checked={autoSave}
                disabled={saving}
                onChange={(e) => void toggleAutoSave(e.target.checked)}
              />
              <span className="col" style={{ gap: 0 }}>
                <span>Save my posts&apos; originals automatically</span>
                <span className="small muted">
                  {autoSave
                    ? "When a post is published, its unblurred original goes into your vault."
                    : "Off: your posts' originals are deleted once they're published. Clips already here stay."}
                </span>
              </span>
            </label>
            <p className="notice">
              <ShieldIcon />
              <span>
                Only you can see your vault. These are your originals, so faces and number plates aren&apos;t
                blurred and they keep their sound and location. Use them as evidence for the police or your
                insurer.
              </span>
            </p>
            <div className="vault-space">
              <div
                className="vault-meter"
                role="meter"
                aria-label="Space used"
                aria-valuenow={Math.round(share * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span
                  style={{ width: `${Math.round(share * 100)}%` }}
                  className={share >= 0.9 ? "vault-meter-full" : undefined}
                />
              </div>
              <span className="small">
                {fileSize(vault.usedBytes)} of {fileSize(vault.limitBytes)} used · clips are kept for{" "}
                {keptFor(vault.retentionDays)}
              </span>
              {vault.plan === "Free" ? (
                <span className="small muted">
                  Premium keeps clips for 12 months in 25 GB, and Premium + for 3 years in 100 GB.{" "}
                  <Link href="/premium">See Premium</Link>
                </span>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {uploads.length > 0 ? (
        <ul className="vault-uploads pad" aria-label="Uploading">
          {uploads.map((u) => (
            <li key={u.key} className="spread">
              <span className="col" style={{ gap: 0, minWidth: 0 }}>
                <strong className="vault-name">{u.name}</strong>
                {u.error ? (
                  <span className="error">{u.error}</span>
                ) : (
                  <span className="small muted" role="status">
                    Uploading… {Math.round(u.progress * 100)}%
                  </span>
                )}
              </span>
              {u.error ? (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => setUploads((current) => current.filter((x) => x.key !== u.key))}
                >
                  Dismiss
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {collection === null ? (
        <ul className="vault-collections" aria-label="Collections">
          {VAULT_COLLECTIONS.filter((c) => c.id === "all" || (covers?.[c.id]?.total ?? 0) > 0).map((c) => {
            const cover = covers?.[c.id];
            return (
              <li key={c.id}>
                <Link href={collectionHref(c.id)} className="vault-collection">
                  <span className="vault-mosaic" aria-hidden="true">
                    {[0, 1, 2, 3].map((i) => {
                      const clip = cover?.clips[i];
                      return (
                        <span key={i} className="vault-mosaic-cell">
                          {clip ? <Thumb clip={clip} url={urls[clip.id]} /> : null}
                        </span>
                      );
                    })}
                  </span>
                  <span className="vault-collection-name">{c.name}</span>
                  <span className="small muted">{plural(cover?.total ?? 0, "clip")}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : clips.length === 0 ? (
        <p className="centre muted pad vault-empty">
          {VAULT_COLLECTIONS.find((c) => c.id === collection)!.empty}{" "}
          {collection !== "posts" ? "Tap + to add clips you haven't posted." : null}
        </p>
      ) : (
        <>
          <ul className="vault-grid" aria-label={`Clips in ${collectionName(collection)}`}>
            {clips.map((clip) => (
              <li key={clip.id}>
                <button
                  type="button"
                  className="vault-tile"
                  aria-label={`Open ${clip.fileName}`}
                  onClick={() => setOpen(clip)}
                >
                  <Thumb clip={clip} url={urls[clip.id]} />
                  {clip.mediaType === "Video" ? (
                    <span className="vault-tile-kind" aria-hidden="true">
                      <VideoIcon color="#FFFFFF" />
                    </span>
                  ) : null}
                  {expiresSoon(clip.expiresAt) ? <span className="vault-tile-soon">Expires soon</span> : null}
                </button>
              </li>
            ))}
          </ul>
          {hasMore ? (
            <div className="centre pad">
              <button
                type="button"
                className="btn btn-sm"
                disabled={more.loading}
                onClick={() => void loadMore()}
              >
                {more.loading ? "Loading…" : "Show more"}
              </button>
            </div>
          ) : null}
        </>
      )}

      {open ? (
        <ClipViewer
          clip={open}
          url={urls[open.id]}
          onClose={() => setOpen(null)}
          onDeleted={() => {
            setOpen(null);
            setMore((m) => ({ ...m, clips: m.clips.filter((c) => c.id !== open.id) }));
            router.refresh();
          }}
        />
      ) : null}
    </section>
  );
}

/** A square preview: the clip itself where the browser can show it, otherwise an icon. */
function Thumb({ clip, url }: { clip: VaultClipDto; url: string | undefined }) {
  const [failed, setFailed] = useState(false);
  const kind = previewable(clip.contentType);
  if (url && kind === "image" && !failed) {
    // A signed link to the owner's own original: next/image can't optimise it.
     
    return <img src={url} alt="" className="vault-thumb" loading="lazy" onError={() => setFailed(true)} />;
  }
  if (url && kind === "video" && !failed) {
    return (
      <video
        src={`${url}#t=0.5`}
        className="vault-thumb"
        preload="metadata"
        muted
        playsInline
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span className="vault-thumb vault-thumb-icon">
      {clip.mediaType === "Video" ? <VideoIcon color="#00607F" /> : <PhotoIcon size={22} color="#00607F" />}
    </span>
  );
}

/** One clip, opened from the grid: see it, download it, post it (uploads) or delete it. */
function ClipViewer({
  clip,
  url,
  onClose,
  onDeleted,
}: {
  clip: VaultClipDto;
  url: string | undefined;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const kind = previewable(clip.contentType);

  const download = async () => {
    setBusy(true);
    const link = await getVaultDownload(clip.id);
    setBusy(false);
    if (!link.ok) {
      toast(link.error);
      return;
    }
    window.location.assign(link.data.url);
  };

  const remove = async () => {
    if (!window.confirm(`Delete ${clip.fileName} from your vault? This can't be undone.`)) {
      return;
    }
    setBusy(true);
    const result = await deleteVaultClip(clip.id);
    setBusy(false);
    if (!result.ok) {
      toast(result.error);
      return;
    }
    toast("Deleted from your vault");
    onDeleted();
  };

  return (
    <Modal open onClose={onClose} title={clip.fileName} titleId={titleId}>
      <div className="vault-view">
        {url && kind === "video" ? (
          <video src={url} controls playsInline className="vault-view-media" />
        ) : url && kind === "image" ? (
           
          <img src={url} alt={clip.fileName} className="vault-view-media" />
        ) : (
          <span className="vault-view-media vault-thumb-icon">
            {clip.mediaType === "Video" ? (
              <VideoIcon color="#00607F" />
            ) : (
              <PhotoIcon size={28} color="#00607F" />
            )}
          </span>
        )}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {fileSize(clip.sizeBytes)} · added {dateTime(clip.createdAt)} ·{" "}
        {clip.source === "Post" ? (
          clip.postId ? (
            <Link href={postPath(clip.postId)}>from your post</Link>
          ) : (
            "from a post"
          )
        ) : (
          "uploaded"
        )}
      </p>
      <p className={`small${expiresSoon(clip.expiresAt) ? " vault-soon" : " muted"}`} style={{ margin: 0 }}>
        Kept until {longDate(clip.expiresAt)}
      </p>
      <div className="row row-wrap" style={{ gap: 8 }}>
        <button
          type="button"
          className="btn btn-sm"
          aria-label={`Download ${clip.fileName}`}
          disabled={busy}
          onClick={() => void download()}
        >
          <DownloadIcon />
          Download
        </button>
        {clip.source === "Upload" ? (
          <Link
            className="btn btn-sm"
            href={`/post/new?vault=${clip.id}`}
            aria-label={`Post ${clip.fileName}`}
          >
            Post it
          </Link>
        ) : null}
        <button
          type="button"
          className="btn btn-sm btn-danger"
          aria-label={`Delete ${clip.fileName}`}
          disabled={busy}
          onClick={() => void remove()}
        >
          Delete
        </button>
      </div>
    </Modal>
  );
}
