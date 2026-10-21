import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { FeedPage } from "@/components/FeedPage";
import { getViewer } from "@/lib/auth";
import { pageNumber } from "@/lib/feed";
import { signInPath } from "@/lib/paths";

export const metadata: Metadata = { title: "Your timeline", robots: { index: false } };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** One of your custom timelines: posts with any of its types, in its area if it has one. */
export default async function TimelinePage({ params, searchParams }: Props) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    notFound();
  }
  const viewer = await getViewer();
  if (!viewer.signedIn) {
    redirect(signInPath(`/t/${id}`));
  }
  return (
    <FeedPage
      viewer={viewer}
      home={{ kind: "timeline", id }}
      label={null}
      basePath={`/t/${id}`}
      page={pageNumber((await searchParams).page)}
    />
  );
}
