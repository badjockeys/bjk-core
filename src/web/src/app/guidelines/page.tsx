import type { Metadata } from "next";

import { DocPage } from "@/components/DocPage";

export const metadata: Metadata = { title: "Community guidelines" };

// Placeholder until the guidelines are written (not part of the MVP wireframes).
export default function GuidelinesPage() {
  return (
    <DocPage title="Community guidelines">
      <p>Post real incidents you filmed or photographed yourself, in the UK. Keep it about the driving.</p>
      <ul className="col" style={{ paddingLeft: 20, margin: 0 }}>
        <li>Don&apos;t type number plates, names, phone numbers, addresses or social media handles.</li>
        <li>Faces and number plates are blurred automatically, and video sound is removed.</li>
        <li>No threats, harassment or hate. Disagree with the driving, not the person.</li>
        <li>Mark posts showing injuries or serious crashes as sensitive.</li>
      </ul>
      <p className="muted">The full guidelines are being written.</p>
    </DocPage>
  );
}
