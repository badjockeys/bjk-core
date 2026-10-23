"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { completeVaultUpload, deleteVaultClip, getVaultDownload, requestVaultUpload } from "@/actions/vault";
import { dateTime, longDate, plural } from "@/lib/format";
import { postPath } from "@/lib/paths";
import type { VaultClipDto, VaultDto } from "@/lib/types";
import { contentTypeOf, PHOTO_EXTENSIONS, PHOTO_TYPES, putFile, VIDEO_EXTENSIONS, VIDEO_TYPES } from "@/lib/upload";
import { expiresSoon, fileSize, keptFor, usedShare } from "@/lib/vault";

import { DownloadIcon, PhotoIcon, ShieldIcon, VideoIcon } from "./icons";
import { toast } from "./toast";

type Upload = { key: string; name: string; progress: number; error?: string };

/**
 * Your vault, on your own profile (owner, 23 Oct 2026): the originals of your posts and clips you upload, unblurred
 * with their sound and location, kept privately for you as evidence. How long they're kept and how much space there
 * is depend on your plan. Only you can see it.
 */
export function VaultPanel({ vault, basePath }: { vault: VaultDto; basePath: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const share = usedShare(vault.usedBytes, vault.limitBytes);
  const premium = vault.plan !== "Free";

  const patch = (key: string, change: Partial<Upload>) =>
    setUploads((current) => current.map((u) => (u.key === key ? { ...u, ...change } : u)));

  const upload = async (file: File) => {
    const key = `${file.name}-${Date.now()}-${Math.random()}`;
    setUploads((current) => [...current, { key, name: file.name, progress: 0 }]);
    const contentType = contentTypeOf(file);
    const ticket = await requestVaultUpload({ fileName: file.name, contentType, sizeBytes: file.size });
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

  const download = async (clip: VaultClipDto) => {
    setBusy(clip.id);
    const link = await getVaultDownload(clip.id);
    setBusy(null);
    if (!link.ok) {
      toast(link.error);
      return;
    }
    window.location.assign(link.data.url);
  };

  const remove = async (clip: VaultClipDto) => {
    if (!window.confirm(`Delete ${clip.fileName} from your vault? This can't be undone.`)) {
      return;
    }
    setBusy(clip.id);
    const result = await deleteVaultClip(clip.id);
    setBusy(null);
    if (!result.ok) {
      toast(result.error);
      return;
    }
    toast("Deleted from your vault");
    router.refresh();
  };

  return (
    <section className="vault pad" aria-labelledby="vault-title">
      <div className="vault-head">
        <h2 id="vault-title" className="h2">
          Your vault
        </h2>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => input.current?.click()}>
          Add clips
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
      </div>

      <p className="notice">
        <ShieldIcon />
        <span>
          Only you can see your vault. These are your originals, so faces and number plates aren&apos;t blurred and
          they keep their sound and location. Use them as evidence for the police or your insurer.
        </span>
      </p>

      <div className="vault-space">
        <div className="vault-meter" role="meter" aria-label="Space used" aria-valuenow={Math.round(share * 100)} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${Math.round(share * 100)}%` }} className={share >= 0.9 ? "vault-meter-full" : undefined} />
        </div>
        <span className="small">
          {fileSize(vault.usedBytes)} of {fileSize(vault.limitBytes)} used · clips are kept for {keptFor(vault.retentionDays)}
        </span>
        {premium ? null : (
          <span className="small muted">
            Premium keeps clips for 12 months in 25 GB, and Premium + for 3 years in 100 GB.{" "}
            <Link href="/premium">See Premium</Link>
          </span>
        )}
      </div>

      {uploads.length > 0 ? (
        <ul className="vault-list" aria-label="Uploading">
          {uploads.map((u) => (
            <li key={u.key} className="vault-row">
              <div className="vault-info">
                <strong>{u.name}</strong>
                {u.error ? (
                  <span className="error">{u.error}</span>
                ) : (
                  <span className="small muted" role="status">
                    Uploading… {Math.round(u.progress * 100)}%
                  </span>
                )}
              </div>
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

      {vault.clips.items.length === 0 ? (
        <div className="centre vault-empty">
          <p className="muted">
            Nothing here yet. The originals of your posts are kept here automatically, and you can add clips you
            haven&apos;t posted.
          </p>
        </div>
      ) : (
        <ul className="vault-list" aria-label="Clips in your vault">
          {vault.clips.items.map((clip) => (
            <li key={clip.id} className="vault-row">
              <span className="vault-kind" aria-hidden="true">
                {clip.mediaType === "Video" ? <VideoIcon color="#00607F" /> : <PhotoIcon size={22} color="#00607F" />}
              </span>
              <div className="vault-info">
                <strong className="vault-name">{clip.fileName}</strong>
                <span className="small muted">
                  {fileSize(clip.sizeBytes)} · added {dateTime(clip.createdAt)} ·{" "}
                  {clip.source === "Post" ? (
                    clip.postId ? <Link href={postPath(clip.postId)}>from your post</Link> : "from a post"
                  ) : (
                    "uploaded"
                  )}
                </span>
                <span className={`small${expiresSoon(clip.expiresAt) ? " vault-soon" : " muted"}`}>
                  Kept until {longDate(clip.expiresAt)}
                </span>
              </div>
              <div className="vault-actions">
                <button
                  type="button"
                  className="btn btn-sm"
                  aria-label={`Download ${clip.fileName}`}
                  disabled={busy === clip.id}
                  onClick={() => void download(clip)}
                >
                  <DownloadIcon />
                  Download
                </button>
                {clip.source === "Upload" ? (
                  <Link className="btn btn-sm" href={`/post/new?vault=${clip.id}`} aria-label={`Post ${clip.fileName}`}>
                    Post it
                  </Link>
                ) : null}
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  aria-label={`Delete ${clip.fileName}`}
                  disabled={busy === clip.id}
                  onClick={() => void remove(clip)}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {vault.clips.page > 1 || vault.clips.page * vault.clips.pageSize < vault.clips.totalCount ? (
        <nav className="row vault-pages" aria-label="More clips">
          <span className="small muted">{plural(vault.clips.totalCount, "clip")}</span>
          {vault.clips.page > 1 ? (
            <Link href={`${basePath}?tab=vault&page=${vault.clips.page - 1}`}>Newer clips</Link>
          ) : null}
          {vault.clips.page * vault.clips.pageSize < vault.clips.totalCount ? (
            <Link href={`${basePath}?tab=vault&page=${vault.clips.page + 1}`}>Older clips</Link>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
