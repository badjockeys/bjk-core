import type { Metadata } from "next";

import { PostComposer } from "@/components/PostComposer";

import { composerProps } from "./composer-props";

export const metadata: Metadata = { title: "New post", robots: { index: false } };

/** The composer on its own page: full screen from the + button on phones, and for direct links. */
export default async function NewPostPage() {
  return <PostComposer mode="page" {...await composerProps()} />;
}
