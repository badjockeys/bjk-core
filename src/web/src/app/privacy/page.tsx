import type { Metadata } from "next";

import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = { title: "Privacy" };

// Placeholder until the privacy notice is written.
export default function PrivacyPage() {
  return (
    <DocPage title="Privacy">
      <p>Our privacy notice is being written. Until then, email privacy@badjockeys.com with any questions.</p>
    </DocPage>
  );
}
