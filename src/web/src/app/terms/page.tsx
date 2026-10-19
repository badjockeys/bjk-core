import type { Metadata } from "next";

import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = { title: "Terms" };

// Placeholder until the terms of use are written.
export default function TermsPage() {
  return (
    <DocPage title="Terms">
      <p>Our terms of use are being written. Until then, email legal@badjockeys.com with any questions.</p>
    </DocPage>
  );
}
