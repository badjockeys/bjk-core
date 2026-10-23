import Link from "next/link";

import { CommunityMenu } from "@/components/communities/CommunityMenu";
import { JoinButton } from "@/components/communities/JoinButton";
import { communityFacts, communityInitials, communityPath, roleLabel } from "@/lib/communities";
import type { CommunityDto } from "@/lib/types";

/** The top of a community's pages: badge, name, facts, description, join and the ⋯ menu, then its tabs. */
export function CommunityHeader({
  community,
  tab,
}: {
  community: CommunityDto;
  tab?: "posts" | "discussions" | "about";
}) {
  const here = communityPath(community.slug);
  const role = roleLabel(community.role);
  return (
    <>
      <div className="community-cover" aria-hidden="true" />
      <section className="pad stack community-head" aria-labelledby="community-name">
        <div className="spread" style={{ alignItems: "flex-end" }}>
          <span className="community-badge community-badge-lg" aria-hidden="true">
            {communityInitials(community.name)}
          </span>
          <span className="row" style={{ gap: 8 }}>
            <JoinButton
              slug={community.slug}
              name={community.name}
              standing={community.standing}
              visibility={community.visibility}
              canJoin={community.canJoin}
            />
            <CommunityMenu
              slug={community.slug}
              name={community.name}
              isMember={community.standing === "Member" || community.standing === "Requested"}
              canModerate={community.canModerate}
            />
          </span>
        </div>
        <h1 id="community-name" className="h1">
          {community.name}
        </h1>
        <span className="small muted">
          {communityFacts(community)}
          {role ? ` · you're ${role === "Admin" ? "an admin" : "a moderator"}` : ""}
        </span>
        {community.description ? <p className="post-text">{community.description}</p> : null}
        {community.canModerate ? (
          <Link href={`${here}/manage`} className="btn btn-sm" style={{ alignSelf: "flex-start" }}>
            Manage community
          </Link>
        ) : null}
      </section>
      {tab && community.canSeeInside ? (
        <nav className="tabs tabs-fill" aria-label="Community">
          {(
            [
              ["posts", "Posts", here],
              ["discussions", "Discussions", `${here}?tab=discussions`],
              ["about", "About", `${here}?tab=about`],
            ] as const
          ).map(([key, label, href]) => (
            <Link
              key={key}
              href={href}
              className={`tab${tab === key ? " tab-on" : ""}`}
              aria-current={tab === key ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      ) : null}
    </>
  );
}
