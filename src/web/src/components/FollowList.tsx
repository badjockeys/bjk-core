import Link from "next/link";

import { plural } from "@/lib/format";
import { profilePath } from "@/lib/paths";
import type { FollowProfileDto, PagedResult } from "@/lib/types";

import { Avatar } from "./Avatar";
import { FollowButton } from "./FollowButton";

/** A page of people (followers or following), each with a Follow button, and next/previous links. */
export function FollowList({
  page,
  basePath,
  signedIn,
  viewerId,
  empty,
}: {
  page: PagedResult<FollowProfileDto>;
  basePath: string;
  signedIn: boolean;
  viewerId: string | null;
  empty: string;
}) {
  if (page.items.length === 0 && page.page === 1) {
    return <p className="pad muted">{empty}</p>;
  }
  const hasMore = page.page * page.pageSize < page.totalCount;
  return (
    <>
      <p className="pad small muted" style={{ paddingBottom: 0 }}>
        {plural(page.totalCount, "person", "people")}
      </p>
      <ul className="follow-list">
        {page.items.map((p) => (
          <li key={p.id} className="who who-row">
            <Link href={profilePath(p.handle)} className="who-person">
              <Avatar name={p.displayName} url={p.avatarUrl} />
              <span className="c-sub">
                <strong>{p.displayName}</strong>
                <small>@{p.handle}</small>
                {p.bio ? <span className="small who-bio">{p.bio}</span> : null}
              </span>
            </Link>
            {p.id === viewerId ? null : (
              <FollowButton handle={p.handle} following={p.isFollowing === true} signedIn={signedIn} small />
            )}
          </li>
        ))}
      </ul>
      <div className="row pad" style={{ gap: 12 }}>
        {page.page > 1 ? <Link href={`${basePath}?page=${page.page - 1}`}>Previous</Link> : null}
        {hasMore ? <Link href={`${basePath}?page=${page.page + 1}`}>Next</Link> : null}
      </div>
    </>
  );
}
