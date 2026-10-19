import type { Metadata } from "next";
import Link from "next/link";

import { AppShell, FooterLinks } from "@/components/AppShell";
import { ReelsPlayer } from "@/components/ReelsPlayer";
import { getViewer } from "@/lib/auth";
import { categoryBySlug } from "@/lib/categories";
import { loadReels } from "@/lib/reels";

export const metadata: Metadata = {
  title: "Reels",
  description:
    "Dashcam clips of bad driving from around the UK, one after another. Faces and number plates blurred.",
};

/** Screens 27 and 29: reels, a full-screen feed of video posts with a daily allowance by plan. */
export default async function ReelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const category = categoryBySlug(typeof params.category === "string" ? params.category : "")?.value;
  const [viewer, first] = await Promise.all([getViewer(), loadReels(null, category)]);
  const unlimited = first?.ok === true && first.page.dailyPlayLimit === null;

  return (
    <AppShell
      viewer={viewer}
      section="reels"
      returnTo="/reels"
      bottomNav
      dark
      aside={
        <>
          <section className="card card-pad">
            <h2 className="h2">How reels work</h2>
            <p className="small muted">
              One video post per reel. Swipe or use the arrow keys. Sensitive posts are skipped unless
              you&apos;ve verified your age.
            </p>
          </section>
          {unlimited ? null : (
            <section className="card card-pad">
              <h2 className="h2">{viewer.signedIn ? "Free plan" : "Watching without an account"}</h2>
              <p className="small muted">
                {viewer.signedIn
                  ? "25 reels a day. Premium is unlimited, from £19.99 a year."
                  : "10 reels a day. Join free for 25 a day; Premium is unlimited, from £19.99 a year."}
              </p>
              <Link href="/premium" className="btn btn-primary btn-block">
                Get Premium
              </Link>
            </section>
          )}
          <FooterLinks />
        </>
      }
    >
      <ReelsPlayer
        key={category ?? "all"}
        initial={first?.ok ? first.page : null}
        limitReached={first && !first.ok ? { limit: first.limit.limit } : null}
        failed={first === null}
        viewer={viewer}
        category={category ?? null}
      />
    </AppShell>
  );
}
