import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { BackButton } from "@/components/BackButton";
import { ChevronIcon, DownloadIcon, ExternalIcon } from "@/components/icons";
import { TagRequest } from "@/components/TagRequest";
import { api } from "@/lib/api";
import { getAccessToken, getViewer } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { postPath, profilePath, signInPath } from "@/lib/paths";
import type { PostDto } from "@/lib/types";

export const metadata: Metadata = { title: "Account", robots: { index: false } };

/** Screen 14. Sign-in and security settings live on the identity server's own pages. */
export default async function AccountPage() {
  const viewer = await getViewer();
  if (!viewer.signedIn) {
    redirect(signInPath("/account"));
  }
  const security = `${getConfig().authority}/Manage`;
  const me = viewer.handle ? profilePath(viewer.handle) : "/profile/new";
  const tagRequests = await pendingTags();

  return (
    <AppShell viewer={viewer} section="account" returnTo="/account" bottomNav>
      <header className="top">
        <div className="top-left">
          <span className="m-only">
            <BackButton />
          </span>
          <h1 className="h2">Account</h1>
        </div>
      </header>
      <Link href={me} className="row pad">
        <Avatar name={viewer.displayName ?? viewer.email} url={viewer.avatarUrl} />
        <span className="col" style={{ gap: 0 }}>
          <span>{viewer.displayName ?? "Create your profile"}</span>
          <span className="muted small">
            {viewer.handle ? `@${viewer.handle}` : "Choose a username"}
            <span className="m-only"> · view your profile</span>
            {viewer.email ? <span className="d-only"> · {viewer.email}</span> : null}
          </span>
        </span>
      </Link>
      {tagRequests.length > 0 ? (
        <section className="pad stack" style={{ gap: 10 }} aria-labelledby="tag-requests">
          <h2 id="tag-requests" className="h2">
            Approve tags
          </h2>
          {tagRequests.map((post) => (
            <div key={post.id} className="tag-item">
              <Link href={postPath(post.id)} className="tag-item-title">
                {post.title}
              </Link>
              <TagRequest postId={post.id} authorName={post.author.displayName} status="Pending" compact />
            </div>
          ))}
        </section>
      ) : null}
      <nav aria-label="Account settings">
        <Link href={viewer.handle ? "/profile/edit" : "/profile/new"} className="list-item">
          <span className="col" style={{ gap: 0 }}>
            <span>Edit profile</span>
            <span className="small muted">Name, username, photo, about you</span>
          </span>
          <ChevronIcon />
        </Link>
        <Link href={me} className="list-item m-only">
          <span className="col" style={{ gap: 0 }}>
            <span>Your posts</span>
            <span className="small muted">Edit or delete what you&apos;ve posted</span>
          </span>
          <ChevronIcon />
        </Link>
        <Link href="/bookmarks" className="list-item">
          <span className="col" style={{ gap: 0 }}>
            <span>Bookmarks</span>
            <span className="small muted">Posts you&apos;ve saved. Only you can see them</span>
          </span>
          <ChevronIcon />
        </Link>
        <Link href="/account/posts" className="list-item">
          <span className="col" style={{ gap: 0 }}>
            <span>Votes on your posts</span>
            <span className="small muted">When voting on your new posts closes</span>
          </span>
          <ChevronIcon />
        </Link>
        <Link href="/account/notifications" className="list-item">
          <span className="col" style={{ gap: 0 }}>
            <span>Notifications</span>
            <span className="small muted">
              What shows in the bell, what&apos;s emailed and push notifications
            </span>
          </span>
          <ChevronIcon />
        </Link>
        <a href={security} className="list-item">
          <span className="col" style={{ gap: 0 }}>
            <span>Sign-in and security</span>
            <span className="small muted">
              Email, password, two-step verification, linked Google, Apple or Facebook
            </span>
          </span>
          <ExternalIcon />
        </a>
        <a href={`${security}/MobileNumber`} className="list-item">
          <span className="col" style={{ gap: 0 }}>
            <span>Mobile number</span>
            <span className="small muted">
              Optional. Never shown to anyone; lets friends find you in the app
            </span>
          </span>
          <ExternalIcon />
        </a>
        <Link href="/timelines" className="list-item">
          <span className="col" style={{ gap: 0 }}>
            <span>Your timelines</span>
            <span className="small muted">
              Custom tabs on Home: the types of bad driving and places you choose
            </span>
          </span>
          <ChevronIcon />
        </Link>
        <div className="list-item">
          <span className="col" style={{ gap: 0 }}>
            <span>Download your data</span>
            <span className="small muted">Everything we hold about you, as a file</span>
          </span>
          <a href="/account/export" className="btn btn-sm d-only" download>
            Download
          </a>
          <a href="/account/export" className="icon-btn m-only" aria-label="Download your data" download>
            <DownloadIcon />
          </a>
        </div>
        <Link href="/guidelines" className="list-item">
          <span className="col" style={{ gap: 0 }}>
            <span>Community guidelines and privacy</span>
            <span className="small muted">What&apos;s allowed, and how we use your data</span>
          </span>
          <ChevronIcon />
        </Link>
      </nav>
      <div className="row row-wrap pad" style={{ gap: 16 }}>
        <form action="/auth/sign-out" method="post">
          <button type="submit" className="btn">
            Sign out
          </button>
        </form>
        <Link href="/account/deactivate" className="link">
          Deactivate my account
        </Link>
      </div>
    </AppShell>
  );
}

/** Posts you've been tagged on as a passenger and haven't answered. Empty if the API is older or unreachable. */
async function pendingTags(): Promise<PostDto[]> {
  const token = await getAccessToken();
  if (!token) {
    return [];
  }
  try {
    return (await api().posts.tagged(token, "Pending")).items;
  } catch {
    return [];
  }
}
