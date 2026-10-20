import Link from "next/link";

import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { profilePath } from "@/lib/paths";
import type { WhoToFollowDto } from "@/lib/types";

import { Avatar } from "./Avatar";
import { FollowButton } from "./FollowButton";

/**
 * The desktop right panel's "Who to follow" card (UI step 6), for members: adults whose home area is near yours. Asks
 * for a home area if there isn't one; hidden when there's nobody to suggest. Contact-book suggestions come with the
 * mobile app.
 */
export async function WhoToFollowPanel() {
  const token = await getAccessToken();
  if (!token) {
    return null;
  }
  let who: WhoToFollowDto | null = null;
  try {
    who = await api().profiles.suggestions(token, 3);
  } catch {
    who = null;
  }
  if (!who || (who.hasHomeArea && who.people.length === 0)) {
    return null;
  }

  return (
    <div className="card">
      <h2 className="card-h">Who to follow</h2>
      {!who.hasHomeArea ? (
        <p className="small muted trends-pad">
          <Link href="/account/notifications">Choose your home area</Link> to see people near you.
        </p>
      ) : (
        who.people.map((p) => (
          <div key={p.id} className="who">
            <Link href={profilePath(p.handle)} className="who-person">
              <Avatar name={p.displayName} url={p.avatarUrl} size="sm" />
              <span className="c-sub">
                <strong>{p.displayName}</strong>
                <small>@{p.handle}</small>
              </span>
            </Link>
            <FollowButton handle={p.handle} following={p.isFollowing === true} signedIn small />
          </div>
        ))
      )}
    </div>
  );
}
