import type { Metadata } from "next";

import { BackButton } from "@/components/BackButton";
import { PublicReportForm } from "@/components/PublicReportForm";
import { getConfig } from "@/lib/config";

export const metadata: Metadata = {
  title: "Report content",
  description:
    "Report a post on Bad Jockeys, or ask for a clip you're in to be blurred or removed. No account needed.",
};

/** Screen 23: the public report form. */
export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const post = (await searchParams).post;
  return (
    <main id="main" className="auth-card">
      <div className="row">
        <BackButton />
        <h1 className="h1">Report content</h1>
      </div>
      <PublicReportForm
        siteKey={getConfig().turnstileSiteKey}
        initialTarget={typeof post === "string" ? post.slice(0, 500) : ""}
      />
    </main>
  );
}
