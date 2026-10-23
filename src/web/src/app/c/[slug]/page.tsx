import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FeedPage } from "@/components/FeedPage";
import { getViewer } from "@/lib/auth";
import {
  categoriesIn,
  categoryBySlug,
  categoryLabel,
  groupBySlug,
  groupHref,
  groupLabel,
} from "@/lib/categories";
import { pageNumber } from "@/lib/feed";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** A group ("/c/parking") or one subcategory ("/c/on-double-yellow-lines"). */
function resolve(slug: string) {
  const group = groupBySlug(slug);
  if (group) {
    return { kind: "group" as const, group, label: group.label, slug: group.slug };
  }
  const category = categoryBySlug(slug);
  return category
    ? { kind: "category" as const, category, label: categoryLabel(category.value), slug: category.slug }
    : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = resolve((await params).slug);
  return found
    ? {
        title: found.label,
        description: `${found.label}: dashcam clips and photos from around the UK on Bad Jockeys.`,
        alternates: { canonical: `/c/${found.slug}` },
      }
    : {};
}

/** Screens 02 and 03: the feed for one group of bad driving, or one subcategory. */
export default async function CategoryPage({ params, searchParams }: Props) {
  const found = resolve((await params).slug);
  if (!found) {
    notFound();
  }
  const viewer = await getViewer();
  const page = pageNumber((await searchParams).page);
  const basePath = `/c/${found.slug}`;
  if (found.kind === "group") {
    return (
      <FeedPage
        viewer={viewer}
        group={found.group.value}
        label={found.label}
        basePath={basePath}
        page={page}
        subnav={
          <nav className="chip-row pad" aria-label={`Kinds of ${found.label.toLowerCase()}`}>
            {categoriesIn(found.group.value).map((c) => (
              <Link key={c.value} href={`/c/${c.slug}`} className="chip">
                {c.label}
              </Link>
            ))}
          </nav>
        }
      />
    );
  }
  return (
    <FeedPage
      viewer={viewer}
      category={found.category.value}
      label={found.label}
      basePath={basePath}
      page={page}
      subnav={
        <nav className="pad small" aria-label="Breadcrumb">
          <Link href={groupHref(found.category.group)}>{groupLabel(found.category.group)}</Link> ›{" "}
          {found.category.label}
        </nav>
      }
    />
  );
}
