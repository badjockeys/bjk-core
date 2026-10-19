"use client";

import Link from "next/link";

/** Something went wrong while rendering a page (e.g. the API is down). */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="centre" style={{ padding: "96px 32px" }}>
      <h1 className="h1">Something went wrong</h1>
      <p className="muted">Please try again in a moment.</p>
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={reset}>
          Try again
        </button>
        <Link href="/" className="btn">
          Back to the feed
        </Link>
      </div>
    </main>
  );
}
