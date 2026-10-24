import Link from "next/link";
import type { ReactNode } from "react";

import { ASK_BAD_JOCKEYS_ENABLED } from "@/lib/chat";
import { joinPath, profilePath, signInPath } from "@/lib/paths";
import type { Viewer } from "@/lib/viewer";

import { AskBadJockeys, AskButton } from "./AskBadJockeys";
import { Avatar } from "./Avatar";
import {
  CommunitiesIcon,
  AccountIcon,
  BellIcon,
  BookmarkIcon,
  HomeIcon,
  LogoMark,
  MapIcon,
  MoreIcon,
  PlusIcon,
  ProfileIcon,
  ReelsIcon,
} from "./icons";
import { ForgetSession } from "./ForgetSession";
import { NotificationBell } from "./NotificationBell";
import { SignOutMenu } from "./SignOutMenu";

export type Section =
  | "home"
  | "reels"
  | "map"
  | "communities"
  | "profile"
  | "account"
  | "notifications"
  | "bookmarks"
  | null;

/**
 * The page frame. Desktop (1024 px and up): X-style navigation on the left (Home, Reels, Map, then the member's
 * links), the page in the middle and a panel on the right. Phones: the page full width, with a floating glass tab
 * bar at the bottom (Home, Reels, Map, Profile, like Instagram and Facebook; Account is on your profile) and the +
 * button, or the sign-up bar for visitors. `dark` is the reels page: a black page and a dark glass bar. Every page
 * but reels has a floating Ask button for Ask Bad Jockeys (the AI chat; bottom right on desktop, bottom left on phones,
 * above the tab bar or sign-up bar); visitors and Free members see its locked preview. Hidden while
 * ASK_BAD_JOCKEYS_ENABLED is false (the chat is on hold).
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
  /** Visitors see every section, but only Home works: the rest are greyed out and lead to join (owner, 24 Oct). */
  const locked = !viewer.signedIn;
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
            locked={locked}
            icon={<ReelsIcon size={26} filled={section === "reels"} />}
          >
            Reels
          </NavItem>
          <NavItem
            href="/map"
            on={section === "map"}
            locked={locked}
            icon={<MapIcon size={26} filled={section === "map"} />}
          >
            Map
          </NavItem>
          <NavItem
            href="/communities"
            on={section === "communities"}
            locked={locked}
            icon={<CommunitiesIcon size={26} filled={section === "communities"} />}
          >
            Communities
          </NavItem>
          {viewer.signedIn ? (
            <NotificationBell label className={`nav-i${section === "notifications" ? " nav-on" : ""}`} />
          ) : (
            <NavItem href="/notifications" on={false} locked icon={<BellIcon size={26} />}>
              Notifications
            </NavItem>
          )}
          <NavItem
            href="/bookmarks"
            on={section === "bookmarks"}
            locked={locked}
            icon={<BookmarkIcon size={26} on={section === "bookmarks"} />}
          >
            Bookmarks
          </NavItem>
          <NavItem
            href={myProfile}
            on={section === "profile"}
            locked={locked}
            icon={<ProfileIcon size={26} filled={section === "profile"} />}
          >
            Your profile
          </NavItem>
          <NavItem
            href="/account"
            on={section === "account"}
            locked={locked}
            icon={<AccountIcon size={26} filled={section === "account"} />}
          >
            Account
          </NavItem>
          {viewer.signedIn ? (
            <>
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
          {children}
        </main>

        <aside className="d-aside" aria-label="More">
          {showSignup ? <JoinCard returnTo={returnTo} /> : null}
          {aside}
        </aside>
      </div>

      {viewer.sessionRefused ? <ForgetSession /> : null}

      {ASK_BAD_JOCKEYS_ENABLED && !dark ? <AskButton /> : null}
      {ASK_BAD_JOCKEYS_ENABLED ? <AskBadJockeys viewer={viewer} /> : null}

      {viewer.signedIn && fab ? (
        <Link href="/post/new" className="fab m-only" aria-label="New post">
          <PlusIcon color="#FFFFFF" />
        </Link>
      ) : null}

      {viewer.signedIn && bottomNav ? (
        <nav className={`bnav m-only${dark ? " bnav-dark" : ""}`} aria-label="Main">
          <TabLink href="/" on={section === "home"} icon={<HomeIcon size={24} filled={section === "home"} />}>
            Home
          </TabLink>
          <TabLink
            href="/reels"
            on={section === "reels"}
            icon={<ReelsIcon size={24} filled={section === "reels"} />}
          >
            Reels
          </TabLink>
          <TabLink href="/map" on={section === "map"} icon={<MapIcon size={24} filled={section === "map"} />}>
            Map
          </TabLink>
          <TabLink
            href={myProfile}
            on={section === "profile" || section === "account"}
            icon={<ProfileIcon size={24} filled={section === "profile" || section === "account"} />}
          >
            Profile
          </TabLink>
        </nav>
      ) : null}

      {showSignup ? <SignupBar returnTo={returnTo} /> : null}
    </>
  );
}

function NavItem({
  href,
  on,
  locked = false,
  icon,
  children,
}: {
  href: string;
  on: boolean;
  /** Signed out: greyed out, and goes to join (which links to sign in), then on to the section. */
  locked?: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  if (locked) {
    return (
      <Link href={joinPath(href)} className="nav-i nav-locked" title="Join or sign in to use this">
        {icon}
        {children}
        <span className="sr-only"> (join or sign in first)</span>
      </Link>
    );
  }
  return (
    <Link href={href} className={`nav-i${on ? " nav-on" : ""}`} aria-current={on ? "page" : undefined}>
      {icon}
      {children}
    </Link>
  );
}

/** A tab in the phone's bottom bar: icon over a short label, highlighted in cyan when it's the current section. */
function TabLink({
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
    <Link href={href} className="bnav-tab" aria-current={on ? "page" : undefined}>
      {icon}
      <span>{children}</span>
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
