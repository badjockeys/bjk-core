import type { Metadata } from "next";

import { AppShell, FooterLinks } from "@/components/AppShell";
import { MapIcon } from "@/components/icons";
import { IncidentMapLoader } from "@/components/IncidentMapLoader";
import { getViewer } from "@/lib/auth";
import { parseMapStart } from "@/lib/chat";
import { getConfig } from "@/lib/config";
import { joinPath, signInPath } from "@/lib/paths";

export const metadata: Metadata = {
  title: "Incident map",
  description: "Where bad driving is reported across the UK, from rounded locations.",
};

/**
 * Screen 28: the incident map. Members only; the map itself needs the browser (IncidentMap). Ask AI's "Open on
 * the map" links here with where to centre it and which types to show (?lat=&lng=&zoom=&types=).
 */
export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await getViewer();
  const config = getConfig();

  if (!viewer.signedIn) {
    return (
      <AppShell viewer={viewer} section="map" returnTo="/map" aside={<FooterLinks />}>
        <section className="centre stack" style={{ padding: "72px 32px" }}>
          <MapIcon size={56} />
          <h1 className="h2">Join to see the incident map</h1>
          <p className="muted">
            See where bad driving is reported near you: hotspots by area, time of day and type of incident.
            Built from rounded locations, so no single incident can be pinpointed.
          </p>
          <a href={joinPath("/map")} className="btn btn-primary">
            Join free
          </a>
          <a href={signInPath("/map")} className="btn">
            Already a member? Sign in
          </a>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell viewer={viewer} section="map" returnTo="/map" bottomNav wide>
      <IncidentMapLoader
        tileUrl={config.mapTileUrl}
        attribution={config.mapAttribution}
        start={parseMapStart(await searchParams)}
      />
    </AppShell>
  );
}
