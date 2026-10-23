"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { replyToDiscussion } from "@/actions/communities";

/** Reply to a discussion (members). */
export function ReplyComposer({ slug, discussionId }: { slug: string; discussionId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="community-reply-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const result = await replyToDiscussion(slug, discussionId, body.trim());
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setBody("");
          router.refresh();
        });
      }}
    >
      <label className="sr-only" htmlFor={`reply-${discussionId}`}>
        Your reply
      </label>
      <textarea
        id={`reply-${discussionId}`}
        className="textarea"
        rows={2}
        maxLength={1000}
        placeholder="Reply to the discussion"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending || !body.trim()}>
        Reply
      </button>
    </form>
  );
}
