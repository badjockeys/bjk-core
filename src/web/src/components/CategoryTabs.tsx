import Link from "next/link";

import { CATEGORIES } from "@/lib/categories";
import type { IncidentCategory } from "@/lib/types";

/** The feed's category tabs: All, then each kind of incident. Scrolls sideways on narrow screens. */
export function CategoryTabs({ current }: { current?: IncidentCategory }) {
  return (
    <nav className="tabs" aria-label="Categories">
      <Link href="/" className={`tab${current ? "" : " tab-on"}`} aria-current={current ? undefined : "page"}>
        All
      </Link>
      {CATEGORIES.map((c) => (
        <Link
          key={c.value}
          href={`/c/${c.slug}`}
          className={`tab${current === c.value ? " tab-on" : ""}`}
          aria-current={current === c.value ? "page" : undefined}
        >
          {c.label}
        </Link>
      ))}
    </nav>
  );
}
