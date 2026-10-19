import Link from "next/link";
import type { ReactNode } from "react";

import { checkAgePath, joinPath, profilePath, signInPath } from "@/lib/paths";
import type { Viewer } from "@/lib/viewer";

import { Avatar } from "./Avatar";
import {
  AccountIcon,
  HomeIcon,
  LogoMark,
  MapIcon,
  MoreIcon,
  PlusIcon,
  ProfileIcon,
  ReelsIcon,
} from "./icons";
import { SignOutMenu } from "./SignOutMenu";

export type Section = "home" | "reels" | "map" | "profile" | "account" | null;

/**
 * The page frame. Desktop (1024 px and up): X-style navigation on the left (Home, Reels, Map, then the member's
 * links), the page in the middle and a panel on the right. Phones: the page full width, with the bottom navigation
 * (Home, Reels, Map, profile, account) and the + button where the wireframes have them, or the sign-up bar for
 * visitors. `dark` is the reels page: a black page and bottom bar.
 */
export function AppShell({
  viewer,
  section,
  aside,
  children,
  returnTo,
  bottomNav = false,
  fab = false,
  dark = false,
  wide = false,
}: {
  viewer: Viewer;
  section: Section;
  aside?: ReactNode;
  children: ReactNode;
  /** Where sign in and join should come back to. */
  returnTo: string;
  bottomNav?: boolean;
  fab?: boolean;
  dark?: boolean;
  /** A wide middle column and no right-hand panel on desktop (the incident map). */
  wide?: boolean;
}) {
  const myProfile = viewer.handle ? profilePath(viewer.handle) : "/profile/new";
  const showSignup = !viewer.signedIn;
  const classes = [
    "shell",
    bottomNav && viewer.signedIn ? "has-bnav" : "",
    showSignup ? "has-signup" : "",
    dark ? "shell-dark" : "",
    wide ? "shell-wide" : "",
  ].filter(Boolean);

  return (
    <>
      <div className={classes.join(" ")}>
        <nav className="x-nav" aria-label="Main">
          <Link href="/" className="x-logo" aria-label="Bad Jockeys home">
            <LogoMark size={32} />
          </Link>
          <NavItem href="/" on={section === "home"} icon={<HomeIcon size={26} filled={section === "home"} />}>
            Home
          </NavItem>
          <NavItem
            href="/reels"
            on={section === "reels"}
            icon={<ReelsIcon size={26} filled={section === "reels"} />}
          >
            Reels
          </NavItem>
          <NavItem href="/map" on={section === "map"} icon={<MapIcon size={26} filled={section === "map"} />}>
            Map
          </NavItem>
          {viewer.signedIn ? (
            <>
              <NavItem
                href={myProfile}
                on={section === "profile"}
                icon={<ProfileIcon size={26} filled={section === "profile"} />}
              >
                Your profile
              </NavItem>
              <NavItem
                href="/account"
                on={section === "account"}
                icon={<AccountIcon size={26} filled={section === "account"} />}
              >
                Account
              </NavItem>
              <Link href="/post/new" className="btn btn-primary x-post">
                Post
              </Link>
              <div className="x-me">
                <Avatar name={viewer.displayName ?? viewer.email} url={viewer.avatarUrl} />
                <span className="c-sub">
                  <strong>{viewer.displayName ?? "New member"}</strong>
                  <small>{viewer.handle ? `@${viewer.handle}` : (viewer.email ?? "")}</small>
                </span>
                <SignOutMenu label="Account options" up>
                  <MoreIcon />
                </SignOutMenu>
              </div>
            </>
          ) : null}
        </nav>

        <main className="d-main" id="main">
          {viewer.signedIn && !viewer.ageVerified && !dark ? <AgeCheckBanner returnTo={returnTo} /> : null}
          {children}
        </main>

        <aside className="d-aside" aria-label="More">
          {showSignup ? <JoinCard returnTo={returnTo} /> : null}
          {aside}
        </aside>
      </div>

      {viewer.signedIn && fab ? (
        <Link href="/post/new" className="fab m-only" aria-label="New post">
          <PlusIcon color="#FFFFFF" />
        </Link>
      ) : null}

      {viewer.signedIn && bottomNav ? (
        <nav className={`bnav m-only${dark ? " bnav-dark" : ""}`} aria-label="Main">
          <Link href="/" aria-label="Home" aria-current={section === "home" ? "page" : undefined}>
            <HomeIcon size={26} filled={section === "home"} />
          </Link>
          <Link href="/reels" aria-label="Reels" aria-current={section === "reels" ? "page" : undefined}>
            <ReelsIcon size={26} filled={section === "reels"} />
          </Link>
          <Link href="/map" aria-label="Incident map" aria-current={section === "map" ? "page" : undefined}>
            <MapIcon size={26} filled={section === "map"} />
          </Link>
          <Link
            href={myProfile}
            aria-label="Your profile"
            aria-current={section === "profile" ? "page" : undefined}
          >
            <ProfileIcon size={26} filled={section === "profile"} />
          </Link>
          <Link
            href="/account"
            aria-label="Account"
            aria-current={section === "account" ? "page" : undefined}
          >
            <AccountIcon size={26} filled={section === "account"} />
          </Link>
        </nav>
      ) : null}

      {showSignup ? <SignupBar returnTo={returnTo} /> : null}
    </>
  );
}

function NavItem({
  href,
  on,
  icon,
  children,
}: {
  href: string;
  on: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`nav-i${on ? " nav-on" : ""}`} aria-current={on ? "page" : undefined}>
      {icon}
      {children}
    </Link>
  );
}

/** Screens 01: the black bar at the bottom for visitors. */
export function SignupBar({ returnTo }: { returnTo: string }) {
  return (
    <div className="signup-bar">
      <div className="col">
        <strong>Caught a bad driver on camera?</strong>
        <span className="m-only">Join to post, react and comment.</span>
        <span className="d-only">Join Bad Jockeys to post your clips and photos, react and comment.</span>
      </div>
      <a href={signInPath(returnTo)} className="btn btn-sm btn-ghost-dark">
        Sign in
      </a>
      <a href={joinPath(returnTo)} className="btn btn-sm btn-light">
        Join
      </a>
    </div>
  );
}

function JoinCard({ returnTo }: { returnTo: string }) {
  return (
    <div className="card card-pad">
      <h2 className="h2">New to Bad Jockeys?</h2>
      <p className="muted">Join to post your dashcam clips and photos, react and comment.</p>
      <a href={joinPath(returnTo)} className="btn btn-primary">
        Join
      </a>
      <a href={signInPath(returnTo)} className="btn">
        Sign in
      </a>
    </div>
  );
}

/** Shown to signed-in members who haven't passed the age check: posting, commenting and reacting need it. */
export function AgeCheckBanner({ returnTo }: { returnTo: string }) {
  return (
    <div className="pad">
      <div className="notice" role="note">
        <span className="col">
          <span>
            <strong>Check your age to join in.</strong> Bad Jockeys is for adults: you need to pass a quick
            age check before you post, comment or react.
          </span>
          <a
            href={checkAgePath(returnTo)}
            className="btn btn-sm btn-primary"
            style={{ alignSelf: "flex-start" }}
          >
            Check my age
          </a>
        </span>
      </div>
    </div>
  );
}

export function FooterLinks() {
  return (
    <nav className="footer-links" aria-label="About">
      <Link href="/guidelines">Community guidelines</Link>
      <Link href="/privacy">Privacy</Link>
      <Link href="/terms">Terms</Link>
      <Link href="/report">Report content</Link>
      <span className="muted">© 2026 Bad Jockeys</span>
    </nav>
  );
}
