import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell, FooterLinks } from "@/components/AppShell";
import { JoinButton } from "@/components/communities/JoinButton";
import { api } from "@/lib/api";
import { getAccessToken, getViewer } from "@/lib/auth";
import { COMMUNITY_TABS, communityFacts, communityInitials, communityPath } from "@/lib/communities";
import { pageNumber } from "@/lib/feed";
import { signInPath } from "@/lib/paths";
import type { CommunitySummaryDto, PagedResult } from "@/lib/types";

export const metadata: Metadata = { title: "Communities", robots: { index: false } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Communities (owner, 23 Oct 2026): near you, yours, topics, or a search. Signed-in members. */
export default async function CommunitiesPage({ searchParams }: Props) {
  const viewer = await getViewer();
  if (!viewer.signedIn) {
    redirect(signInPath("/communities"));
  }
  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q.trim().slice(0, 60) : "";
  const tab = COMMUNITY_TABS.find((t) => t.tab === query.tab) ?? COMMUNITY_TABS[0]!;
  const page = pageNumber(query.page);
  const token = await getAccessToken();
  const list: PagedResult<CommunitySummaryDto> | null = token
    ? await api()
        .communities.list(token, search ? "Search" : tab.kind, search || null, page)
        .catch(() => null)
    : null;

  return (
    <AppShell
      viewer={viewer}
      section="communities"
      returnTo="/communities"
      bottomNav
      aside={
        <>
          <section className="card stack community-start-card" aria-labelledby="start-title">
            <h2 id="start-title" className="h2">
              Start a community
            </h2>
            <p className="small">Bring people together around a place or a topic. You&apos;ll be its admin.</p>
            <span className="badge-premium">Premium</span>
            <Link href="/communities/new" className="btn btn-primary">
              Create a community
            </Link>
          </section>
          <FooterLinks />
        </>
      }
    >
      <header className="c-head spread">
        <h1>Communities</h1>
        <Link href="/communities/new" className="btn btn-primary btn-sm">
          + Create
        </Link>
      </header>
      <form className="pad" role="search" action="/communities">
        <label className="sr-only" htmlFor="community-search">
          Search communities
        </label>
        <input
          id="community-search"
          name="q"
          type="search"
          className="input community-search"
          placeholder="Search communities by name or place"
          defaultValue={search}
          maxLength={60}
        />
      </form>
      {search ? null : (
        <nav className="tabs tabs-fill" aria-label="Communities">
          {COMMUNITY_TABS.map((t) => (
            <Link
              key={t.tab}
              href={`/communities?tab=${t.tab}`}
              className={`tab${t === tab ? " tab-on" : ""}`}
              aria-current={t === tab ? "page" : undefined}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      )}
      {!list ? (
        <p className="error pad" role="alert">
          We couldn&apos;t load communities. Please try again.
        </p>
      ) : list.items.length === 0 ? (
        <section className="centre" style={{ padding: "48px 24px" }}>
          <p className="muted">
            {search
              ? `No communities match "${search}".`
              : tab.kind === "Near"
                ? "No communities cover your home area yet. Set your home area on your account page, or start one."
                : tab.kind === "Mine"
                  ? "You haven't joined any communities yet."
                  : "No topic communities yet."}
          </p>
        </section>
      ) : (
        <ul className="community-list" aria-label={search ? "Search results" : tab.label}>
          {list.items.map((c) => (
            <li key={c.id} className="community-item">
              <Link href={communityPath(c.slug)} className="community-badge" aria-hidden="true" tabIndex={-1}>
                {communityInitials(c.name)}
              </Link>
              <div className="community-item-text">
                <Link href={communityPath(c.slug)} className="community-item-name">
                  {c.name}
                </Link>
                <span className="small muted">{communityFacts(c)}</span>
                {c.description ? <span className="small community-item-desc">{c.description}</span> : null}
              </div>
              <JoinButton
                slug={c.slug}
                name={c.name}
                standing={c.standing}
                visibility={c.visibility}
                canJoin={c.standing === "None"}
              />
            </li>
          ))}
        </ul>
      )}
      {list && list.page * list.pageSize < list.totalCount ? (
        <p className="centre pad">
          <Link href={`/communities?${search ? `q=${encodeURIComponent(search)}` : `tab=${tab.tab}`}&page=${page + 1}`}>
            More communities
          </Link>
        </p>
      ) : null}
    </AppShell>
  );
}
