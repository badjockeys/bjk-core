import type { Metadata } from "next";
import Link from "next/link";

import { AppShell, FooterLinks } from "@/components/AppShell";
import { getViewer } from "@/lib/auth";

export const metadata: Metadata = { title: "Premium" };

/** Placeholder until subscriptions are on sale: what Premium will include, and its prices. */
export default async function PremiumPage() {
  const viewer = await getViewer();
  return (
    <AppShell viewer={viewer} section={null} returnTo="/premium" aside={<FooterLinks />}>
      <section className="stack pad" style={{ paddingTop: 24 }}>
        <h1 className="h1">Premium is coming soon</h1>
        <p>
          Subscriptions aren&apos;t on sale yet. When they are, you&apos;ll be able to sign up here. Nothing
          is charged today.
        </p>
        <div className="plan-box">
          <div className="spread">
            <strong>Premium yearly</strong>
            <strong>£19.99/year</strong>
          </div>
          <span className="small muted">
            Just £1.67 a month. Unlimited reels, comments anywhere, the incident map with 12 months of history
            and filters, and area alerts.
          </span>
        </div>
        <div className="spread" style={{ padding: "0 14px" }}>
          <span>Premium monthly</span>
          <span>£2.49/month</span>
        </div>
        <p className="small muted">Prices include VAT.</p>
        <Link href="/" className="btn">
          Back to the feed
        </Link>
      </section>
    </AppShell>
  );
}
