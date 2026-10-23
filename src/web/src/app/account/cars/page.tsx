import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { BackButton } from "@/components/BackButton";
import { CarsManager } from "@/components/CarsManager";
import { api } from "@/lib/api";
import { getAccessToken, getViewer } from "@/lib/auth";
import { signInPath } from "@/lib/paths";
import type { HouseholdCarDto, VehicleCatalogue } from "@/lib/types";

export const metadata: Metadata = { title: "Your cars", robots: { index: false } };

/**
 * Your household cars (owner, 22 Oct 2026): pick one when posting and the post shows "Filmed from: Dave's Golf".
 * Make, model, colour and a nickname only; never a registration.
 */
export default async function CarsPage() {
  const viewer = await getViewer();
  if (!viewer.signedIn) {
    redirect(signInPath("/account/cars"));
  }
  const token = await getAccessToken();
  const [cars, catalogue] = await Promise.all([
    token
      ? api()
          .vehicles.mine(token)
          .catch(() => null)
      : null,
    api()
      .vehicles.catalogue()
      .catch(() => null),
  ]);

  return (
    <AppShell viewer={viewer} section="account" returnTo="/account/cars" bottomNav>
      <header className="top">
        <div className="top-left">
          <BackButton />
          <h1 className="h2">Your cars</h1>
        </div>
      </header>
      {cars && catalogue ? (
        <CarsManager cars={cars as HouseholdCarDto[]} catalogue={catalogue as VehicleCatalogue} />
      ) : (
        <p className="pad muted">Your cars aren&apos;t available right now. Try again in a minute.</p>
      )}
    </AppShell>
  );
}
