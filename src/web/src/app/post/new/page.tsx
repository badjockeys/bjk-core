import type { Metadata } from "next";

import { PostComposer } from "@/components/PostComposer";

import { composerProps } from "./composer-props";

export const metadata: Metadata = { title: "New post", robots: { index: false } };

/**
 * The composer on its own page: full screen from the + button on phones, and for direct links. `?vault={clip id}`
 * posts a clip from your vault.
 */
export default async function NewPostPage({
  searchParams,
}: {
  searchParams: Promise<{ vault?: string | string[] }>;
}) {
  const { vault } = await searchParams;
  const vaultClipId = typeof vault === "string" && /^[0-9a-f-]{36}$/i.test(vault) ? vault : undefined;
  return <PostComposer mode="page" {...await composerProps()} vaultClipId={vaultClipId} />;
}
