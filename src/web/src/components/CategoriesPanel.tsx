import Link from "next/link";

import { api } from "@/lib/api";
import { CATEGORIES } from "@/lib/categories";
import { plural } from "@/lib/format";

import { ShowAll } from "./ShowAll";

/**
 * The desktop "Categories" panel: the busiest categories with their post counts. The API has no counts endpoint, so
 * this asks the public feed for one post per category and reads its total, cached for five minutes.
 */
export async function CategoriesPanel() {
  const totals = await Promise.all(
    CATEGORIES.map(async (c) => {
      try {
        const page = await api().posts.list(null, { category: c.value, pageSize: 1 }, 300);
        return { ...c, total: page.totalCount };
      } catch {
        return { ...c, total: null };
      }
    }),
  );
  const sorted = [...totals].sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
  const entry = (c: (typeof sorted)[number]) => (
    <Link key={c.value} href={`/c/${c.slug}`} className="trend">
      <span className="small muted">Category</span>
      <b>{c.label}</b>
      {c.total !== null ? <span className="small muted">{plural(c.total, "post")}</span> : null}
    </Link>
  );

  return (
    <div className="card">
      <h2 className="card-h">Categories</h2>
      {sorted.slice(0, 5).map(entry)}
      <ShowAll label="Show all categories">{sorted.slice(5).map(entry)}</ShowAll>
    </div>
  );
}
