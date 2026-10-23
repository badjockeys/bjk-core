import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { VaultScreen } from "@/components/VaultScreen";
import { api } from "@/lib/api";
import { getAccessToken, getViewer } from "@/lib/auth";
import { signInPath } from "@/lib/paths";
import type { VaultClipDto, VaultDto } from "@/lib/types";
import { parseCollection, sourceOf, VAULT_COLLECTIONS, type VaultCollection } from "@/lib/vault";

export const metadata: Metadata = { title: "Vault", robots: { index: false } };

/**
 * Your vault, in Account (owner, 23 Oct 2026): the originals of your posts and clips you add, kept privately as
 * evidence. Laid out like Instagram's Saved screen: collections first (?c= opens one), then a grid. Also where you turn
 * keeping your posts' originals automatically on or off.
 */
export default async function VaultPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await getViewer();
  const collection = parseCollection((await searchParams).c);
  const here = collection ? `/account/vault?c=${collection}` : "/account/vault";
  if (!viewer.signedIn) {
    redirect(signInPath(here));
  }
  const token = await getAccessToken();
  if (!token) {
    redirect(signInPath(here));
  }

  let vault: VaultDto | null = null;
  let covers: Partial<Record<VaultCollection, { clips: VaultClipDto[]; total: number }>> | undefined;
  try {
    if (collection) {
      vault = await api().vault.get(token, 1, 30, sourceOf(collection));
    } else {
      // Each collection's first four clips, for its tile, and its count.
      const pages = await Promise.all(VAULT_COLLECTIONS.map((c) => api().vault.get(token, 1, 4, sourceOf(c.id))));
      vault = pages[0]!;
      covers = Object.fromEntries(
        VAULT_COLLECTIONS.map((c, i) => [c.id, { clips: pages[i]!.clips.items, total: pages[i]!.clips.totalCount }]),
      );
    }
  } catch {
    vault = null;
  }

  return (
    <AppShell viewer={viewer} section="account" returnTo={here} bottomNav>
      {vault ? (
        <VaultScreen key={collection ?? "collections"} vault={vault} collection={collection} covers={covers} />
      ) : (
        <p className="error pad" role="alert">
          We couldn&apos;t load your vault. Please try again.
        </p>
      )}
    </AppShell>
  );
}
