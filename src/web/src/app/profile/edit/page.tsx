import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { BackButton } from "@/components/BackButton";
import { ProfileForm } from "@/components/ProfileForm";
import { getMyProfile, getViewer } from "@/lib/auth";
import { profilePath, signInPath } from "@/lib/paths";

export const metadata: Metadata = { title: "Edit profile", robots: { index: false } };

/** Screen 13. */
export default async function EditProfilePage() {
  const viewer = await getViewer();
  if (!viewer.signedIn) {
    redirect(signInPath("/profile/edit"));
  }
  const profile = await getMyProfile();
  if (!profile) {
    redirect("/profile/new?returnTo=%2Fprofile%2Fedit");
  }
  return (
    <AppShell viewer={viewer} section="profile" returnTo="/profile/edit">
      <header className="top">
        <div className="top-left">
          <span className="m-only">
            <BackButton fallback={profilePath(profile.handle)} />
          </span>
          <h1 className="h2">Edit profile</h1>
        </div>
        <div className="row d-only">
          <Link href={profilePath(profile.handle)} className="btn btn-sm">
            Cancel
          </Link>
          <button type="submit" form="edit-profile" className="btn btn-primary btn-sm">
            Save
          </button>
        </div>
      </header>
      <div className="pad">
        <ProfileForm
          mode="edit"
          profile={profile}
          returnTo={profilePath(profile.handle)}
          formId="edit-profile"
        />
      </div>
    </AppShell>
  );
}
