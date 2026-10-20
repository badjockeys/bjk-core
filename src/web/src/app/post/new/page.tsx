import type { Metadata } from "next";

import { PostComposer } from "@/components/PostComposer";

import { composerProps } from "./composer-props";

export const metadata: Metadata = { title: "New post", robots: { index: false } };

/** The composer on its own page, for direct links and reloads. Links from inside the app open it as a pop-up. */
export default async function NewPostPage() {
  return <PostComposer mode="page" {...await composerProps()} />;
}
