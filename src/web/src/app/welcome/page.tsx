import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Avatar } from "@/components/Avatar";
import { FollowButton } from "@/components/FollowButton";
import { HomeAreaStep } from "@/components/HomeAreaStep";
import { LogoMark } from "@/components/icons";
import { api } from "@/lib/api";
import { getAccessToken, getViewer } from "@/lib/auth";
import { profilePath, safeReturnTo, signInPath } from "@/lib/paths";
import type { WhoToFollowDto } from "@/lib/types";

export const metadata: Metadata = { title: "Welcome", robots: { index: false } };

const STEPS = 3;

/**
 * Three quick steps after making a profile (engagement plan, Oct 2026): your home area (for local posts and people
 * near you), people near you to follow, and tips for posting. Every step can be skipped.
 */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnTo(typeof params.returnTo === "string" ? params.returnTo : "/");
  const step = Math.min(STEPS, Math.max(1, Number(params.step) || 1));
  const viewer = await getViewer();
  if (!viewer.signedIn) {
    redirect(signInPath("/welcome"));
  }
  if (!viewer.hasProfile) {
    redirect(`/profile/new?returnTo=${encodeURIComponent(returnTo)}`);
  }
  const stepHref = (n: number) => `/welcome?step=${n}&returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <main id="main" className="auth-card welcome">
      <LogoMark size={40} />
      <p className="small muted" aria-live="polite">
        Step {step} of {STEPS}
      </p>
      {step === 1 ? (
        <>
          <div className="col">
            <h1 className="h1">Where&apos;s home?</h1>
            <p className="muted">
              We&apos;ll show you bad driving near you first, and people nearby to follow. Your home area is
              private: only its name can show on your profile, and its position is kept to about 1 km.
            </p>
          </div>
          <HomeAreaStep next={stepHref(2)} />
          <Link href={stepHref(2)} className="link">
            Skip for now
          </Link>
        </>
      ) : null}
      {step === 2 ? (
        <>
          <div className="col">
            <h1 className="h1">People near you</h1>
            <p className="muted">Follow a few people to see their posts in your Following timeline.</p>
          </div>
          <Suggestions changeAreaHref={stepHref(1)} />
          <Link href={stepHref(3)} className="btn btn-primary btn-block">
            Next
          </Link>
        </>
      ) : null}
      {step === 3 ? (
        <>
          <div className="col">
            <h1 className="h1">Posting a clip</h1>
            <p className="muted">Whenever you catch something on camera, here&apos;s how to post it well.</p>
          </div>
          <ul className="welcome-tips">
            <li>
              <strong>Faces and number plates are blurred for you.</strong> We do it automatically before
              anyone sees it.
            </li>
            <li>
              <strong>Say where and when.</strong> The map pin and time help people nearby recognise the spot.
            </li>
            <li>
              <strong>Stick to what happened.</strong> Describe the driving, not the person: no names, no
              guesses about who they are.
            </li>
            <li>
              <strong>Short is best.</strong> Trim the clip to the moment it happens.
            </li>
          </ul>
          <div className="col" style={{ gap: 8 }}>
            <Link href={returnTo} className="btn btn-primary btn-block">
              Start browsing
            </Link>
            <Link href="/post/new" className="btn btn-block">
              Post a clip
            </Link>
          </div>
        </>
      ) : null}
    </main>
  );
}

async function Suggestions({ changeAreaHref }: { changeAreaHref: string }) {
  const who = await load();
  if (!who || !who.hasHomeArea) {
    return (
      <p className="small muted">
        <Link href={changeAreaHref}>Choose your home area</Link> to see people near you.
      </p>
    );
  }
  if (who.people.length === 0) {
    return <p className="small muted">Nobody near you to suggest yet. You can find people later.</p>;
  }
  return (
    <ul className="who-list">
      {who.people.map((p) => (
        <li key={p.id} className="who">
          <Link href={profilePath(p.handle)} className="who-person">
            <Avatar name={p.displayName} url={p.avatarUrl} size="sm" />
            <span className="c-sub">
              <strong>{p.displayName}</strong>
              <small>@{p.handle}</small>
            </span>
          </Link>
          <FollowButton handle={p.handle} following={p.isFollowing === true} signedIn small />
        </li>
      ))}
    </ul>
  );
}

async function load(): Promise<WhoToFollowDto | null> {
  const token = await getAccessToken();
  if (!token) {
    return null;
  }
  try {
    return await api().profiles.suggestions(token, 6);
  } catch {
    return null;
  }
}
