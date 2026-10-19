import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { LogoMark } from "@/components/icons";
import { ProfileForm } from "@/components/ProfileForm";
import { getMyProfile, getViewer } from "@/lib/auth";
import { safeReturnTo, signInPath } from "@/lib/paths";

export const metadata: Metadata = { title: "Create your profile", robots: { index: false } };

/** Screen 12: new members choose a username and name before they post or comment. */
export default async function CreateProfilePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const returnTo = safeReturnTo(typeof params.returnTo === "string" ? params.returnTo : "/");
  const viewer = await getViewer();
  if (!viewer.signedIn) {
    redirect(signInPath(`/profile/new?returnTo=${encodeURIComponent(returnTo)}`));
  }
  if (await getMyProfile()) {
    redirect(returnTo);
  }
  return (
    <main id="main" className="auth-card">
      <LogoMark size={40} />
      <div className="col">
        <h1 className="h1">Create your profile</h1>
        <p className="muted">This is how other people see you. You can change it later.</p>
      </div>
      <ProfileForm mode="create" returnTo={returnTo} formId="create-profile" />
    </main>
  );
}
