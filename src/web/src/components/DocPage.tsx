import Link from "next/link";
import type { ReactNode } from "react";

import { LogoMark } from "./icons";

/** A plain text page (guidelines, privacy, terms). */
export function DocPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main id="main" className="auth-card">
      <Link href="/" className="logo" aria-label="Bad Jockeys home">
        <LogoMark size={36} />
      </Link>
      <h1 className="h1">{title}</h1>
      {children}
      <Link href="/" className="link">
        Back to the feed
      </Link>
    </main>
  );
}
