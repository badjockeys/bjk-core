import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { PostReachDto } from "@/lib/types";

import { EyeIcon } from "./icons";
import { PostAnalytics } from "./PostAnalytics";

/**
 * How far your post reached: only its author sees this. Views count each viewer once; local views are viewers whose
 * home area is within 10 km of where it happened.
 */
export async function ReachStats({ postId }: { postId: string }) {
  const reach = await load(postId);
  if (!reach) {
    return null;
  }
  const items: [string, number][] = [
    ["Views", reach.views],
    ["Local views", reach.localViews],
    ["Reactions", reach.reactions],
    ["Comments", reach.comments],
    ["Shares", reach.shares],
  ];
  return (
    <section className="reach" aria-labelledby={`reach-${postId}`}>
      <h2 id={`reach-${postId}`} className="reach-title">
        <EyeIcon />
        Your post&apos;s reach <span className="small muted">(only you can see this)</span>
      </h2>
      <dl className="reach-grid">
        {items.map(([label, value]) => (
          <div key={label} className="fact">
            <dt className="small muted">{label}</dt>
            <dd>{value.toLocaleString("en-GB")}</dd>
          </div>
        ))}
      </dl>
      <p className="small muted">
        Local views come from people whose home area is within 10 km of where it happened.
      </p>
      <div>
        <PostAnalytics postId={postId} />
      </div>
    </section>
  );
}

async function load(postId: string): Promise<PostReachDto | null> {
  const token = await getAccessToken();
  if (!token) {
    return null;
  }
  try {
    return await api().engagement.reach(token, postId);
  } catch {
    return null;
  }
}
