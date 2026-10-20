"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { removeMyTag, respondToTag } from "@/actions/passengers";
import type { PassengerTagStatus } from "@/lib/types";

/**
 * Your passenger tag on a post: accept or decline while it's waiting, or remove yourself once accepted. Your name
 * only shows on the post after you accept.
 */
export function TagRequest({
  postId,
  authorName,
  status,
  compact = false,
}: {
  postId: string;
  authorName: string;
  status: PassengerTagStatus;
  compact?: boolean;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(status);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const act = (call: () => ReturnType<typeof removeMyTag>, next: PassengerTagStatus | "Removed") =>
    startTransition(async () => {
      setError(null);
      const result = await call();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCurrent(next === "Removed" ? "Declined" : next);
      router.refresh();
    });

  if (current === "Declined") {
    return compact ? null : <p className="help">You&apos;re not shown on this post.</p>;
  }

  return (
    <div
      className={`tag-request${compact ? " tag-request-compact" : ""}`}
      role="group"
      aria-label="Passenger tag"
    >
      {current === "Pending" ? (
        <>
          <span>
            <strong>{authorName}</strong> tagged you as a passenger. Your name shows on the post only if you
            accept.
          </span>
          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={pending}
              onClick={() => act(() => respondToTag(postId, true), "Accepted")}
            >
              Accept
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={pending}
              onClick={() => act(() => respondToTag(postId, false), "Declined")}
            >
              Decline
            </button>
          </div>
        </>
      ) : (
        <>
          <span>You&apos;re shown on this post as a passenger.</span>
          <button
            type="button"
            className="link"
            disabled={pending}
            onClick={() => act(() => removeMyTag(postId), "Removed")}
          >
            Remove me
          </button>
        </>
      )}
      {error ? (
        <span className="error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
