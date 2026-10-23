// The categories (groups) and subcategories of bad driving, as signed off on 23 Oct 2026. Mirrors IncidentTaxonomy
// in BJK.Modules (the API sends values; these are the words and links). Keep the order: it's the order they're listed.

import type { IncidentCategory, IncidentGroup } from "./types";

export interface GroupInfo {
  value: IncidentGroup;
  label: string;
  slug: string;
}

export interface CategoryInfo {
  value: IncidentCategory;
  group: IncidentGroup;
  label: string;
  slug: string;
}

/** The 13 groups, in the order they're listed. */
export const GROUPS: readonly GroupInfo[] = [
  { value: "Parking", label: "Parking", slug: "parking" },
  { value: "Speeding", label: "Speeding", slug: "speeding" },
  { value: "Overtaking", label: "Overtaking", slug: "overtaking" },
  { value: "Junctions", label: "Junctions and roundabouts", slug: "junctions-and-roundabouts" },
  { value: "LaneDiscipline", label: "Lane discipline", slug: "lane-discipline" },
  { value: "FollowingTooClose", label: "Following too close", slug: "following-too-close" },
  { value: "Distraction", label: "Distraction", slug: "distraction" },
  { value: "RedLightsAndCrossings", label: "Red lights and crossings", slug: "red-lights-and-crossings" },
  {
    value: "VulnerableRoadUsers",
    label: "Cyclists, pedestrians and riders",
    slug: "cyclists-pedestrians-and-riders",
  },
  { value: "RoadRage", label: "Road rage", slug: "road-rage" },
  { value: "Collisions", label: "Collisions and near misses", slug: "collisions-and-near-misses" },
  { value: "VehiclesAndDrivers", label: "Vehicles and drivers", slug: "vehicles-and-drivers" },
  { value: "Motorways", label: "Motorways", slug: "motorways" },
];

/** Every subcategory, group by group, each group's "Other" last. */
export const CATEGORIES: readonly CategoryInfo[] = [
  {
    value: "DisabledBay",
    group: "Parking",
    label: "Disabled bay, no badge showing",
    slug: "disabled-bay-no-badge-showing",
  },
  {
    value: "PavementParking",
    group: "Parking",
    label: "Parked on the pavement",
    slug: "parked-on-the-pavement",
  },
  {
    value: "DoubleYellows",
    group: "Parking",
    label: "On double yellow lines",
    slug: "on-double-yellow-lines",
  },
  { value: "SchoolZigZags", group: "Parking", label: "On school zig-zags", slug: "on-school-zig-zags" },
  {
    value: "BlockingDriveway",
    group: "Parking",
    label: "Blocking a driveway or dropped kerb",
    slug: "blocking-a-driveway-or-dropped-kerb",
  },
  {
    value: "BusStopOrLane",
    group: "Parking",
    label: "In a bus stop or bus lane",
    slug: "in-a-bus-stop-or-bus-lane",
  },
  {
    value: "ParentAndChildBay",
    group: "Parking",
    label: "Parent and child bay, no child",
    slug: "parent-and-child-bay-no-child",
  },
  { value: "AcrossTwoBays", group: "Parking", label: "Across two bays", slug: "across-two-bays" },
  {
    value: "EvChargingBay",
    group: "Parking",
    label: "EV charging bay, not charging",
    slug: "ev-charging-bay-not-charging",
  },
  { value: "ParkingOther", group: "Parking", label: "Other", slug: "parking-other" },
  {
    value: "SpeedingInTown",
    group: "Speeding",
    label: "Speeding in a 20 or 30",
    slug: "speeding-in-a-20-or-30",
  },
  {
    value: "SpeedingFastRoad",
    group: "Speeding",
    label: "Speeding on a fast road",
    slug: "speeding-on-a-fast-road",
  },
  {
    value: "SpeedingSchool",
    group: "Speeding",
    label: "Speeding past a school",
    slug: "speeding-past-a-school",
  },
  { value: "StreetRacing", group: "Speeding", label: "Street racing", slug: "street-racing" },
  { value: "SpeedingOther", group: "Speeding", label: "Other", slug: "speeding-other" },
  {
    value: "OvertakeIntoOncoming",
    group: "Overtaking",
    label: "Into oncoming traffic",
    slug: "into-oncoming-traffic",
  },
  {
    value: "OvertakeOnBend",
    group: "Overtaking",
    label: "On a bend or a crest",
    slug: "on-a-bend-or-a-crest",
  },
  {
    value: "OvertakeSolidWhite",
    group: "Overtaking",
    label: "Over solid white lines",
    slug: "over-solid-white-lines",
  },
  {
    value: "OvertakeAtJunction",
    group: "Overtaking",
    label: "At a crossing or junction",
    slug: "at-a-crossing-or-junction",
  },
  { value: "Undertaking", group: "Overtaking", label: "Undertaking", slug: "undertaking" },
  { value: "OvertakingOther", group: "Overtaking", label: "Other", slug: "overtaking-other" },
  { value: "PulledOut", group: "Junctions", label: "Pulled out in front", slug: "pulled-out-in-front" },
  {
    value: "WrongLaneRoundabout",
    group: "Junctions",
    label: "Wrong lane at a roundabout",
    slug: "wrong-lane-at-a-roundabout",
  },
  {
    value: "RanStopOrGiveWay",
    group: "Junctions",
    label: "Ran a stop or give way sign",
    slug: "ran-a-stop-or-give-way-sign",
  },
  {
    value: "BlockingYellowBox",
    group: "Junctions",
    label: "Blocking a yellow box junction",
    slug: "blocking-a-yellow-box-junction",
  },
  { value: "CuttingCorner", group: "Junctions", label: "Cutting a corner", slug: "cutting-a-corner" },
  { value: "NoSignal", group: "Junctions", label: "No signal", slug: "no-signal" },
  { value: "JunctionsOther", group: "Junctions", label: "Other", slug: "junctions-and-roundabouts-other" },
  {
    value: "MiddleLaneHogging",
    group: "LaneDiscipline",
    label: "Middle lane hogging",
    slug: "middle-lane-hogging",
  },
  {
    value: "Weaving",
    group: "LaneDiscipline",
    label: "Weaving through traffic",
    slug: "weaving-through-traffic",
  },
  {
    value: "PushingInAtMerge",
    group: "LaneDiscipline",
    label: "Pushing in at a merge",
    slug: "pushing-in-at-a-merge",
  },
  {
    value: "StraddlingLanes",
    group: "LaneDiscipline",
    label: "Straddling two lanes",
    slug: "straddling-two-lanes",
  },
  {
    value: "BusOrCycleLane",
    group: "LaneDiscipline",
    label: "Driving in a bus or cycle lane",
    slug: "driving-in-a-bus-or-cycle-lane",
  },
  { value: "LaneDisciplineOther", group: "LaneDiscipline", label: "Other", slug: "lane-discipline-other" },
  { value: "Tailgating", group: "FollowingTooClose", label: "Tailgating", slug: "tailgating" },
  { value: "BrakeTesting", group: "FollowingTooClose", label: "Brake testing", slug: "brake-testing" },
  { value: "FollowingOther", group: "FollowingTooClose", label: "Other", slug: "following-too-close-other" },
  { value: "PhoneInHand", group: "Distraction", label: "Phone in hand", slug: "phone-in-hand" },
  {
    value: "EatingSmokingScreen",
    group: "Distraction",
    label: "Eating, smoking or a screen",
    slug: "eating-smoking-or-a-screen",
  },
  { value: "NotLooking", group: "Distraction", label: "Not looking", slug: "not-looking" },
  { value: "DistractionOther", group: "Distraction", label: "Other", slug: "distraction-other" },
  { value: "RanRedLight", group: "RedLightsAndCrossings", label: "Ran a red light", slug: "ran-a-red-light" },
  {
    value: "RanPedestrianCrossing",
    group: "RedLightsAndCrossings",
    label: "Ran a pedestrian crossing",
    slug: "ran-a-pedestrian-crossing",
  },
  { value: "LevelCrossing", group: "RedLightsAndCrossings", label: "Level crossing", slug: "level-crossing" },
  {
    value: "WrongWayOneWay",
    group: "RedLightsAndCrossings",
    label: "Wrong way down a one-way street",
    slug: "wrong-way-down-a-one-way-street",
  },
  {
    value: "RedLightsOther",
    group: "RedLightsAndCrossings",
    label: "Other",
    slug: "red-lights-and-crossings-other",
  },
  {
    value: "ClosePassCyclist",
    group: "VulnerableRoadUsers",
    label: "Close pass of a cyclist",
    slug: "close-pass-of-a-cyclist",
  },
  {
    value: "ClosePassHorse",
    group: "VulnerableRoadUsers",
    label: "Close pass of a horse rider",
    slug: "close-pass-of-a-horse-rider",
  },
  {
    value: "IgnoredPedestrian",
    group: "VulnerableRoadUsers",
    label: "Ignored a pedestrian at a crossing",
    slug: "ignored-a-pedestrian-at-a-crossing",
  },
  {
    value: "DoorOpened",
    group: "VulnerableRoadUsers",
    label: "Car door opened into traffic",
    slug: "car-door-opened-into-traffic",
  },
  {
    value: "CyclistRidingDangerously",
    group: "VulnerableRoadUsers",
    label: "Cyclist riding dangerously",
    slug: "cyclist-riding-dangerously",
  },
  {
    value: "PedestrianSteppedOut",
    group: "VulnerableRoadUsers",
    label: "Pedestrian stepped out",
    slug: "pedestrian-stepped-out",
  },
  {
    value: "VulnerableOther",
    group: "VulnerableRoadUsers",
    label: "Other",
    slug: "cyclists-pedestrians-and-riders-other",
  },
  {
    value: "ShoutingOrGestures",
    group: "RoadRage",
    label: "Shouting or gestures",
    slug: "shouting-or-gestures",
  },
  {
    value: "FollowingOrChasing",
    group: "RoadRage",
    label: "Following or chasing",
    slug: "following-or-chasing",
  },
  {
    value: "GotOutOfVehicle",
    group: "RoadRage",
    label: "Got out of the vehicle",
    slug: "got-out-of-the-vehicle",
  },
  {
    value: "DeliberatelyBlocking",
    group: "RoadRage",
    label: "Deliberately blocking",
    slug: "deliberately-blocking",
  },
  { value: "RoadRageOther", group: "RoadRage", label: "Other", slug: "road-rage-other" },
  { value: "Collision", group: "Collisions", label: "Collision", slug: "collision" },
  { value: "NearMiss", group: "Collisions", label: "Near miss", slug: "near-miss" },
  {
    value: "FailedToStop",
    group: "Collisions",
    label: "Failed to stop after a collision",
    slug: "failed-to-stop-after-a-collision",
  },
  { value: "LostControl", group: "Collisions", label: "Lost control", slug: "lost-control" },
  { value: "CollisionsOther", group: "Collisions", label: "Other", slug: "collisions-and-near-misses-other" },
  {
    value: "NoLightsAtNight",
    group: "VehiclesAndDrivers",
    label: "No lights at night",
    slug: "no-lights-at-night",
  },
  {
    value: "UnsafeLoad",
    group: "VehiclesAndDrivers",
    label: "Unsafe or falling load",
    slug: "unsafe-or-falling-load",
  },
  {
    value: "UnroadworthyVehicle",
    group: "VehiclesAndDrivers",
    label: "Unroadworthy vehicle",
    slug: "unroadworthy-vehicle",
  },
  {
    value: "LearnerMistake",
    group: "VehiclesAndDrivers",
    label: "Learner or new driver mistake",
    slug: "learner-or-new-driver-mistake",
  },
  {
    value: "LorryOrBusDriving",
    group: "VehiclesAndDrivers",
    label: "Lorry or bus driving",
    slug: "lorry-or-bus-driving",
  },
  { value: "VehiclesOther", group: "VehiclesAndDrivers", label: "Other", slug: "vehicles-and-drivers-other" },
  {
    value: "ClosedLaneRedX",
    group: "Motorways",
    label: "Driving in a closed lane (red X)",
    slug: "driving-in-a-closed-lane-red-x",
  },
  {
    value: "HardShoulderMisuse",
    group: "Motorways",
    label: "Misusing the hard shoulder",
    slug: "misusing-the-hard-shoulder",
  },
  {
    value: "StoppingOnMotorway",
    group: "Motorways",
    label: "Stopping or reversing on a motorway",
    slug: "stopping-or-reversing-on-a-motorway",
  },
  { value: "WrongWayDriver", group: "Motorways", label: "Wrong-way driver", slug: "wrong-way-driver" },
  { value: "MotorwaysOther", group: "Motorways", label: "Other", slug: "motorways-other" },
];

/** How many subcategories one post can have; the first is the main one. */
export const MAX_TYPES = 3;

const byValue = new Map(CATEGORIES.map((c) => [c.value, c]));
const groupByValue = new Map(GROUPS.map((g) => [g.value, g]));

export function groupLabel(value: IncidentGroup): string {
  return groupByValue.get(value)?.label ?? value;
}

export function groupOf(value: IncidentCategory): IncidentGroup | undefined {
  return byValue.get(value)?.group;
}

/** A subcategory's name; an "Other" is named with its group ("Parking: other") so it reads on its own. */
export function categoryLabel(value: IncidentCategory): string {
  const info = byValue.get(value);
  if (!info) {
    return value;
  }
  return info.label === "Other" ? `${groupLabel(info.group)}: other` : info.label;
}

/** The subcategories in a group, in order. */
export function categoriesIn(group: IncidentGroup): CategoryInfo[] {
  return CATEGORIES.filter((c) => c.group === group);
}

export function categoryBySlug(slug: string): CategoryInfo | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}

export function groupBySlug(slug: string): GroupInfo | undefined {
  return GROUPS.find((g) => g.slug === slug);
}

export function categoryHref(value: IncidentCategory): string {
  const slug = byValue.get(value)?.slug;
  return slug ? `/c/${slug}` : "/";
}

export function groupHref(value: IncidentGroup): string {
  const slug = groupByValue.get(value)?.slug;
  return slug ? `/c/${slug}` : "/";
}

/**
 * Subcategories matching a search, best first: a word in the name starting with the text ("pave" finds "Parked on
 * the pavement"), then the name containing it, then the group's name matching. Empty text matches nothing.
 */
export function searchCategories(text: string, limit = 8): CategoryInfo[] {
  const q = text.trim().toLowerCase();
  if (!q) {
    return [];
  }
  const scored: { info: CategoryInfo; score: number; index: number }[] = [];
  CATEGORIES.forEach((info, index) => {
    const name = categoryLabel(info.value).toLowerCase();
    const group = groupLabel(info.group).toLowerCase();
    const score = name.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))
      ? 0
      : name.includes(q)
        ? 1
        : group.split(/[^a-z0-9]+/).some((w) => w.startsWith(q))
          ? 2
          : -1;
    if (score >= 0) {
      scored.push({ info, score, index });
    }
  });
  return scored
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, limit)
    .map((s) => s.info);
}

/** Whole groups among these subcategories, and the subcategories left over (in list order). */
function splitByGroup(types: readonly IncidentCategory[]) {
  const set = new Set(types);
  const groups = GROUPS.filter((g) => categoriesIn(g.value).every((c) => set.has(c.value)));
  const inGroups = new Set(groups.flatMap((g) => categoriesIn(g.value).map((c) => c.value)));
  const rest = CATEGORIES.filter((c) => set.has(c.value) && !inGroups.has(c.value)).map((c) => c.value);
  return { groups, rest };
}

/**
 * Subcategories for a filter's query string, with whole groups sent as the group's name (the API takes both), so
 * "all of Parking" is "Parking" rather than ten names.
 */
export function compactTypes(types: readonly IncidentCategory[]): string {
  const { groups, rest } = splitByGroup(types);
  return [...groups.map((g) => g.value), ...rest].join(",");
}

/** A filter's choice in a few words: "Parking", "Tailgating", "Parking and 2 more", or "5 types". */
export function describeTypes(types: readonly IncidentCategory[]): string {
  const { groups, rest } = splitByGroup(types);
  const names = [...groups.map((g) => g.label), ...rest.map(categoryLabel)];
  if (names.length === 0) {
    return "All types";
  }
  if (names.length <= 2) {
    return names.join(" and ");
  }
  return groups.length > 0 ? `${names[0]} and ${names.length - 1} more` : `${types.length} types`;
}

type HasTypes = { category: IncidentCategory; types?: IncidentCategory[] | null };

/** Every subcategory on a post, main first (older API versions only send the one category). */
export function postTypes(post: HasTypes): IncidentCategory[] {
  return post.types && post.types.length > 0 ? post.types : [post.category];
}

/** The most "What happened?" can hold. */
export const DESCRIPTION_MAX = 500;
