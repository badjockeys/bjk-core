import type { ReactNode } from "react";

import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { joinPath } from "@/lib/paths";
import type { DashboardDto, DashboardItemDto } from "@/lib/types";
import type { Viewer } from "@/lib/viewer";

import { DashboardView } from "./DashboardView";
import { TrendingPanel } from "./TrendingPanel";
import { TrendsPanel } from "./TrendsPanel";
import { WhoToFollowPanel } from "./WhoToFollowPanel";

/** The default layout, for visitors and when the API can't be reached. */
const DEFAULT_ITEMS: DashboardItemDto[] = (["Trending", "WhoToFollow", "CategoryTrends"] as const).map(
  (kind, position) => ({
    key: kind,
    kind,
    builtIn: true,
    hidden: false,
    locked: false,
    id: null,
    placeName: null,
    latitude: null,
    longitude: null,
    radiusKm: null,
    periodDays: null,
    types: [],
    position,
  }),
);

/**
 * The dashboard (owner, 24 Oct 2026): the right-hand panel on desktop, and the Dashboard tab on your own profile on
 * phones. Visitors get the default cards and "Join to make your own"; Free members their cards (which they can move or
 * hide) and a greyed-out "Your own stats" card; Premium (3 widgets) and Premium + (5) add their own.
 */
export async function Dashboard({ viewer, returnTo }: { viewer: Viewer; returnTo: string }) {
  if (!viewer.signedIn) {
    return (
      <>
        <TrendingPanel />
        <TrendsPanel />
        <div className="card card-pad widget-teaser">
          <h2 className="card-h">Your own stats</h2>
          <p className="small muted">
            Incidents near a postcode, the worst roads and the busiest times, on your own dashboard.
          </p>
          <a href={joinPath(returnTo)} className="btn btn-sm btn-primary">
            Join to make your own
          </a>
        </div>
      </>
    );
  }

  let dashboard: DashboardDto | null = null;
  const token = await getAccessToken();
  if (token) {
    try {
      dashboard = await api().dashboard.get(token);
    } catch {
      dashboard = null;
    }
  }
  const items = dashboard?.items ?? DEFAULT_ITEMS;

  // The built-in cards are server components; the view lays them out with the widgets, in the member's order.
  const cards: Record<string, ReactNode> = {
    Trending: <TrendingPanel />,
    WhoToFollow: <WhoToFollowPanel />,
    CategoryTrends: <TrendsPanel />,
  };

  return (
    <DashboardView
      initial={{
        items,
        limit: dashboard?.limit ?? 0,
        used: dashboard?.used ?? 0,
        plan: dashboard?.plan ?? "Free",
      }}
      cards={cards}
      editable={dashboard !== null}
    />
  );
}
