import { checkAgePath, joinPath, signInPath } from "@/lib/paths";

/**
 * A sensitive post's media for someone who may not see it yet: the heavily blurred preview the API sends
 * (`previewUrl`), with "Sensitive content — Injuries or a serious crash" over it. Signed-in members can verify their age
 * (the identity server's age check, then back to `returnTo`); visitors are asked to sign in first. Authors and
 * age-verified members get the real media from the API, so they never see this.
 */
export function SensitiveCover({
  previewUrl,
  signedIn,
  returnTo,
  className = "",
}: {
  previewUrl: string | null | undefined;
  signedIn: boolean;
  returnTo: string;
  className?: string;
}) {
  return (
    <div className={`sensitive ${className}`.trim()} role="group" aria-label="Sensitive content">
      {previewUrl ? <img src={previewUrl} alt="" loading="lazy" className="sensitive-preview" /> : null}
      <div className="sensitive-over">
        <strong>Sensitive content</strong>
        <span>Injuries or a serious crash</span>
        {signedIn ? (
          <a href={checkAgePath(returnTo)} className="btn btn-sm btn-primary">
            Verify your age to view
          </a>
        ) : (
          <>
            <a href={joinPath(returnTo)} className="btn btn-sm btn-primary">
              Join to view
            </a>
            <a href={signInPath(returnTo)} className="sensitive-signin">
              Already a member? Sign in
            </a>
          </>
        )}
      </div>
    </div>
  );
}
