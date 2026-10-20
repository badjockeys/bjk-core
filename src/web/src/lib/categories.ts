import type { IncidentCategory } from "./types";

export interface CategoryInfo {
  value: IncidentCategory;
  label: string;
  slug: string;
}

/** In the order of the feed's tabs: the wireframes' first six, then the rest. */
export const CATEGORIES: readonly CategoryInfo[] = [
  { value: "RoadRage", label: "Road rage", slug: "road-rage" },
  { value: "BadParking", label: "Bad parking", slug: "bad-parking" },
  { value: "ClosePass", label: "Close pass", slug: "close-pass" },
  { value: "Tailgating", label: "Tailgating", slug: "tailgating" },
  { value: "Speeding", label: "Speeding", slug: "speeding" },
  { value: "Undertaking", label: "Undertaking", slug: "undertaking" },
  { value: "DangerousOvertaking", label: "Dangerous overtaking", slug: "dangerous-overtaking" },
  { value: "MobilePhoneUse", label: "Mobile phone use", slug: "mobile-phone-use" },
  { value: "RedLightRunning", label: "Running a red light", slug: "running-a-red-light" },
  { value: "CuttingUp", label: "Cutting up", slug: "cutting-up" },
  { value: "LaneHogging", label: "Lane hogging", slug: "lane-hogging" },
  { value: "Other", label: "Other", slug: "other" },
];

/** The order of the "What happened?" list on the new post page. */
export const CATEGORY_CHOICES: readonly IncidentCategory[] = [
  "BadParking",
  "RoadRage",
  "DangerousOvertaking",
  "Undertaking",
  "CuttingUp",
  "ClosePass",
  "Tailgating",
  "LaneHogging",
  "MobilePhoneUse",
  "Speeding",
  "RedLightRunning",
  "Other",
];

export function categoryLabel(value: IncidentCategory): string {
  return CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export function categoryBySlug(slug: string): CategoryInfo | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}

export function categoryHref(value: IncidentCategory): string {
  const slug = CATEGORIES.find((c) => c.value === value)?.slug;
  return slug ? `/c/${slug}` : "/";
}

type HasTypes = { category: IncidentCategory; types?: IncidentCategory[] | null };

/** Every type of bad driving on a post, main first (older API versions only send the one category). */
export function postTypes(post: HasTypes): IncidentCategory[] {
  return post.types && post.types.length > 0 ? post.types : [post.category];
}

/** The most "What happened?" can hold. */
export const DESCRIPTION_MAX = 500;
