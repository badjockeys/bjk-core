import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell, FooterLinks } from "@/components/AppShell";
import { BackButton } from "@/components/BackButton";
import { CommunityForm } from "@/components/communities/CommunityForm";
import { ManageRow } from "@/components/communities/ManageRow";
import { api } from "@/lib/api";
import { getAccessToken, getViewer } from "@/lib/auth";
import { communityPath } from "@/lib/communities";
import { pageNumber } from "@/lib/feed";
import { signInPath } from "@/lib/paths";
import type { CommunityMemberDto, CommunityMembershipStatus, PagedResult } from "@/lib/types";

import { loadCommunity } from "../data";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = { title: "Manage community", robots: { index: false } };

const TABS = [
  { tab: "requests", label: "Requests", status: "Requested" },
  { tab: "members", label: "Members", status: "Member" },
  { tab: "banned", label: "Banned", status: "Banned" },
  { tab: "settings", label: "Settings", status: null },
] as const;

/** Running a community: requests, members (roles, remove, ban), bans, and settings (admins). */
export default async function ManageCommunityPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const viewer = await getViewer();
  if (!viewer.signedIn) {
    redirect(signInPath(`${communityPath(slug)}/manage`));
  }
  const community = await loadCommunity(slug);
  if (!community) {
    notFound();
  }
  if (!community.canModerate) {
    redirect(communityPath(community.slug));
  }
  const query = await searchParams;
  const available = TABS.filter((t) => t.tab !== "settings" || community.isAdmin);
  const tab = available.find((t) => t.tab === query.tab) ?? available[0]!;
  const page = pageNumber(query.page);
  const here = `${communityPath(community.slug)}/manage`;
  const token = await getAccessToken();
  const people: PagedResult<CommunityMemberDto> | null =
    tab.status && token
      ? await api()
          .communities.members(token, community.slug, tab.status as CommunityMembershipStatus, page)
          .catch(() => null)
      : null;

  return (
    <AppShell viewer={viewer} section="communities" returnTo={here} bottomNav aside={<FooterLinks />}>
      <header className="c-head">
        <BackButton arrow />
        <div className="c-sub">
          <span>Manage community</span>
          <small>
            <Link href={communityPath(community.slug)}>{community.name}</Link>
          </small>
        </div>
      </header>
      <nav className="tabs tabs-fill" aria-label="Manage">
        {available.map((t) => (
          <Link
            key={t.tab}
            href={`${here}?tab=${t.tab}`}
            className={`tab${t === tab ? " tab-on" : ""}`}
            aria-current={t === tab ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab.tab === "settings" ? (
        <div className="pad">
          <CommunityForm existing={community} />
        </div>
      ) : !people ? (
        <p className="error pad" role="alert">
          We couldn&apos;t load this list. Please try again.
        </p>
      ) : people.items.length === 0 ? (
        <p className="centre muted pad">
          {tab.tab === "requests"
            ? "No one is asking to join."
            : tab.tab === "banned"
              ? "No one is banned."
              : "No members."}
        </p>
      ) : (
        <>
          <ul className="community-people pad" aria-label={tab.label}>
            {people.items.map((p) => (
              <ManageRow
                key={p.person.id}
                slug={community.slug}
                person={p}
                mode={tab.tab}
                isAdmin={community.isAdmin}
                isMe={p.person.id === viewer.userId}
              />
            ))}
          </ul>
          {tab.tab === "requests" ? (
            <p className="small muted pad">Under-18s can&apos;t ask to join private communities.</p>
          ) : null}
          {people.page * people.pageSize < people.totalCount ? (
            <p className="centre pad">
              <Link href={`${here}?tab=${tab.tab}&page=${page + 1}`}>More</Link>
            </p>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
