import Link from "next/link";

import { api } from "@/lib/api";
import { postsToday, tagPath } from "@/lib/hashtags";
import type { TrendingDto } from "@/lib/types";

/**
 * The desktop right panel's "Trending" card (UI step 5): hashtags and towns with the most posts in the last 24 hours
 * compared with their usual level, each from several people. Hidden when nothing is trending.
 */
export async function TrendingPanel() {
  let trending: TrendingDto | null = null;
  try {
    trending = await api().trends.trending();
  } catch {
    trending = null;
  }
  if (!trending || (trending.hashtags.length === 0 && trending.places.length === 0)) {
    return null;
  }

  return (
    <div className="card">
      <h2 className="card-h">Trending</h2>
      {trending.hashtags.map((t) => (
        <Link key={t.tag} href={tagPath(t.tag)} className="trend">
          <span className="small muted">Trending</span>
          <b>#{t.tag}</b>
          <span className="small muted">{postsToday(t.posts)}</span>
        </Link>
      ))}
      {trending.places.map((p) => (
        <div key={p.name} className="trend">
          <span className="small muted">Trending place</span>
          <b>
            {p.name} · {postsToday(p.posts)}
          </b>
        </div>
      ))}
    </div>
  );
}
