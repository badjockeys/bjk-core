import Link from "next/link";

import { LogoMark } from "@/components/icons";

/** Screen 21. */
export default function NotFound() {
  return (
    <>
      <header className="top">
        <Link href="/" className="logo" aria-label="Bad Jockeys home">
          <LogoMark size={28} />
        </Link>
      </header>
      <main id="main" className="centre" style={{ padding: "96px 32px" }}>
        <LogoMark size={88} ring="#B5B5B0" dot={false} />
        <h1 className="h1">Nothing to see here</h1>
        <p className="muted">This post or profile doesn&apos;t exist, or it&apos;s been removed.</p>
        <Link href="/" className="btn btn-primary">
          Back to the feed
        </Link>
      </main>
    </>
  );
}
