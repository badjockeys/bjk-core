import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { BackButton } from "@/components/BackButton";
import { getViewer } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { signInPath } from "@/lib/paths";

export const metadata: Metadata = { title: "Deactivate account", robots: { index: false } };

/**
 * Screen 15. Deactivating needs the account password, which only the identity server sees, so the last step (and the
 * password box) is its /Manage/Deactivate page.
 */
export default async function DeactivatePage() {
  const viewer = await getViewer();
  if (!viewer.signedIn) {
    redirect(signInPath("/account/deactivate"));
  }
  return (
    <AppShell viewer={viewer} section="account" returnTo="/account/deactivate">
      <header className="top">
        <div className="top-left">
          <BackButton fallback="/account" />
          <span className="top-title">Deactivate account</span>
        </div>
      </header>
      <div className="stack pad">
        <h1 className="h1">Deactivate your account?</h1>
        <ol className="col" style={{ paddingLeft: 20, margin: 0, gap: 10 }}>
          <li>Your profile, posts and comments are hidden straight away.</li>
          <li>
            You have <strong>90 days</strong> to change your mind. Just sign in again to reactivate.
          </li>
          <li>After that, everything is deleted for good, including your photos and videos.</li>
        </ol>
        <div className="notice">
          <span>
            Want a copy first?{" "}
            <a href="/account/export" className="link" download>
              Download your data
            </a>
          </span>
        </div>
        <p className="help">You&apos;ll confirm with your password on the next page.</p>
        <a href={`${getConfig().authority}/Manage/Deactivate`} className="btn btn-danger btn-block">
          Deactivate my account
        </a>
        <Link href="/account" className="btn btn-block">
          Keep my account
        </Link>
      </div>
    </AppShell>
  );
}
