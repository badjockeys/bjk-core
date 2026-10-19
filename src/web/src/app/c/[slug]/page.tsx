import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FeedPage } from "@/components/FeedPage";
import { getViewer } from "@/lib/auth";
import { categoryBySlug } from "@/lib/categories";
import { pageNumber } from "@/lib/feed";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = categoryBySlug((await params).slug);
  return category
    ? {
        title: category.label,
        description: `${category.label}: dashcam clips and photos from around the UK on Bad Jockeys.`,
        alternates: { canonical: `/c/${category.slug}` },
      }
    : {};
}

/** Screens 02 and 03: the feed for one kind of incident. */
export default async function CategoryPage({ params, searchParams }: Props) {
  const category = categoryBySlug((await params).slug);
  if (!category) {
    notFound();
  }
  const viewer = await getViewer();
  return (
    <FeedPage
      viewer={viewer}
      category={category.value}
      label={category.label}
      basePath={`/c/${category.slug}`}
      page={pageNumber((await searchParams).page)}
    />
  );
}
