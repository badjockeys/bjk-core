import { api } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { CategoryTrendsDto } from "@/lib/types";

import { CategoryTrends } from "./CategoryTrends";

/**
 * The desktop right panel's "Category trends" card (UI step 4): each type of bad driving with a sparkline of incidents,
 * its total and the change on the previous period, and a date range picker. Starts on the last 7 days for the whole
 * UK; the picker and (for Premium) the area are changed in the browser.
 */
export async function TrendsPanel() {
  let initial: CategoryTrendsDto | null = null;
  try {
    initial = await api().trends.categories(await getAccessToken());
  } catch {
    initial = null;
  }

  if (!initial) {
    return (
      <div className="card">
        <h2 className="card-h">Category trends</h2>
        <p className="small muted trends-pad">Trends aren&apos;t available right now.</p>
      </div>
    );
  }
  return <CategoryTrends initial={initial} />;
}
