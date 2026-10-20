import Link from "next/link";

import { splitHashtags, tagPath } from "@/lib/hashtags";

/** Post text with its #tags as links to the tag's page. Only for posts: comments never have tags. */
export function HashtagText({ text }: { text: string }) {
  return (
    <>
      {splitHashtags(text).map((part, i) =>
        "tag" in part ? (
          <Link key={i} href={tagPath(part.tag)} className="hashtag">
            #{part.tag}
          </Link>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}
