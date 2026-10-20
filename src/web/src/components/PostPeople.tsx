import Link from "next/link";

import { profilePath } from "@/lib/paths";
import type { PassengerDto, RoadUser } from "@/lib/types";

const ROAD_USER_LABELS: Record<RoadUser, string> = {
  Driver: "Driver",
  Cyclist: "Cyclist",
  Both: "Driver and cyclist",
};

export function roadUserLabel(value: RoadUser): string {
  return ROAD_USER_LABELS[value] ?? value;
}

/** "Cyclist" next to a name, when they chose to show it. */
export function RoadBadge({ value }: { value: RoadUser | null | undefined }) {
  return value ? <span className="road-badge">{roadUserLabel(value)}</span> : null;
}

/**
 * "with Sam J and Alex P": passengers who accepted their tag. `showPending` (the author) also lists people who
 * haven't answered yet, marked as waiting.
 */
export function WithPassengers({
  passengers,
  showPending = false,
}: {
  passengers: PassengerDto[] | undefined;
  showPending?: boolean;
}) {
  const accepted = (passengers ?? []).filter((p) => p.status === "Accepted");
  const waiting = showPending ? (passengers ?? []).filter((p) => p.status === "Pending") : [];
  if (accepted.length === 0 && waiting.length === 0) {
    return null;
  }
  return (
    <p className="with-line small">
      {accepted.length > 0 ? (
        <>
          <span className="muted">with </span>
          {accepted.map((p, i) => (
            <span key={p.person.id}>
              {i > 0 ? <span className="muted">{i === accepted.length - 1 ? " and " : ", "}</span> : null}
              {p.person.handle ? (
                <Link href={profilePath(p.person.handle)} className="with-name">
                  {p.person.displayName}
                </Link>
              ) : (
                <span className="with-name">{p.person.displayName}</span>
              )}
            </span>
          ))}
        </>
      ) : null}
      {waiting.length > 0 ? (
        <span className="muted">
          {accepted.length > 0 ? " · " : ""}
          Waiting for {waiting.map((p) => `@${p.person.handle ?? "someone"}`).join(", ")} to accept
        </span>
      ) : null}
    </p>
  );
}
