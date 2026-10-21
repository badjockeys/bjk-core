import Link from "next/link";

import type { TimelineDto } from "@/lib/types";

import { PlusIcon } from "./icons";

export type HomeTab = { kind: "for-you" } | { kind: "following" } | { kind: "timeline"; id: string };

/**
 * The home timelines (UI step 6), X style: For you, Following, then the member's custom timelines, and + to add or
 * manage them. Scrolls sideways on narrow screens. Visitors only have For you, so they get no tabs.
 */
export function HomeTabs({ current, timelines }: { current: HomeTab; timelines: TimelineDto[] }) {
  const on = (tab: HomeTab) =>
    tab.kind === current.kind &&
    (tab.kind !== "timeline" || (current.kind === "timeline" && tab.id === current.id));
  const tab = (key: string, href: string, label: string, active: boolean) => (
    <Link
      key={key}
      href={href}
      className={`tab${active ? " tab-on" : ""}`}
      aria-current={active ? "page" : undefined}
    >
      {label}
    </Link>
  );
  return (
    <nav className="tabs" aria-label="Timelines">
      {tab("for-you", "/", "For you", on({ kind: "for-you" }))}
      {tab("following", "/following", "Following", on({ kind: "following" }))}
      {timelines.map((t) => tab(t.id, `/t/${t.id}`, t.name, on({ kind: "timeline", id: t.id })))}
      <Link href="/timelines" className="tab tab-add" aria-label="Add or change your timelines">
        <PlusIcon size={18} />
      </Link>
    </nav>
  );
}
