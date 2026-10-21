import { BADGE_LABEL } from "@/lib/votes";
import type { Badge } from "@/lib/types";

import { BadgeIcon } from "./icons";

/** A profile's badges: Founding member, Trusted reporter, Local regular. Each says what it means on hover and to screen readers. */
export function ProfileBadges({ badges }: { badges: Badge[] | null | undefined }) {
  if (!badges || badges.length === 0) {
    return null;
  }
  return (
    <ul className="badges" aria-label="Badges">
      {badges.map((badge) => {
        const { name, about } = BADGE_LABEL[badge] ?? { name: badge, about: "" };
        return (
          <li key={badge} className="badge" title={about}>
            <BadgeIcon />
            <span>{name}</span>
            <span className="sr-only">: {about}</span>
          </li>
        );
      })}
    </ul>
  );
}
