import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppShell, FooterLinks } from "@/components/AppShell";
import { BackButton } from "@/components/BackButton";
import { FollowList } from "@/components/FollowList";
import { api, ApiError } from "@/lib/api";
import { getAccessToken, getViewer } from "@/lib/auth";
import { pageNumber } from "@/lib/feed";
import { profilePath } from "@/lib/paths";
import type { FollowProfileDto, PagedResult } from "@/lib/types";

type Props = {
  params: Promise<{ handle: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = { robots: { index: false } };

/** Someone's followers, most recent first (UI step 6). Anyone can see these. */
export default async function FollowersPage({ params, searchParams }: Props) {
  const handle = decodeURIComponent((await params).handle).replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{1,30}$/.test(handle)) {
    notFound();
  }
  const page = pageNumber((await searchParams).page);
  const viewer = await getViewer();
  const token = await getAccessToken();
  let list: PagedResult<FollowProfileDto>;
  try {
    list = await api().profiles.followers(token, handle, page);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error;
  }
  const here = `${profilePath(handle)}/followers`;

  return (
    <AppShell viewer={viewer} section="home" returnTo={here} bottomNav aside={<FooterLinks />}>
      <header className="c-head">
        <BackButton fallback={profilePath(handle)} arrow />
        <div className="c-sub">
          <span>@{handle}</span>
          <small>Followers</small>
        </div>
      </header>
      <FollowList
        page={list}
        basePath={here}
        signedIn={viewer.signedIn}
        viewerId={viewer.userId}
        empty={`Nobody follows @${handle} yet.`}
      />
    </AppShell>
  );
}
