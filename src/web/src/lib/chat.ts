// Ask Bad Jockeys, the Premium AI chat: the helpers the chat window uses that don't need the browser, so they can be
// tested on their own. The API decides everything that matters (plans, limits, what's allowed, hiding small counts);
// these only shape what it sends for the screen.

import { CATEGORIES } from "./categories";
import { count } from "./format";
import type {
  ChatAnswerDto,
  ChatCardDto,
  ChatCardPointDto,
  ChatMapLinkDto,
  ChatTurn,
  ChatUsageDto,
  IncidentCategory,
} from "./types";

/**
 * Whether the app shows Ask Bad Jockeys (the Ask button and the chat window). Off while the chat is on hold until a
 * model is chosen (owner, 23 Oct 2026); the API answers "not switched on yet" anyway. To switch it on, set this to
 * true once `Chat:Model` is filled in, and un-skip `e2e/chat.spec.ts`.
 */
export const ASK_BAD_JOCKEYS_ENABLED = false;

/** The longest question the API accepts. */
export const MAX_QUESTION = 500;

/** How many earlier turns are sent with a question (the API reads the last 6, and takes at most 20). */
export const HISTORY_TURNS = 6;

/** One exchange in the chat window: the question, and the answer once it's back. */
export interface ChatEntry {
  id: string;
  question: string;
  /** Null while it's being answered. */
  answer: ChatAnswerDto | null;
  /** Sent back with this turn in later questions; null for questions the API stopped (they aren't history). */
  token: string | null;
  /** Set when asking failed (limit, paused, busy): shown instead of an answer. */
  error: string | null;
  /** Why it failed: "busy" offers to ask again (it didn't count). */
  problem?: ChatProblem;
}

/** Why asking failed, so the window can say what to do next. */
export type ChatProblem = "signin" | "premium" | "limit" | "paused" | "busy" | "other";

/**
 * The turns to send with the next question: answered ones with a token (the API ignores the rest), oldest first,
 * the last few only.
 */
export function historyFor(entries: readonly ChatEntry[]): ChatTurn[] {
  return entries
    .filter((e): e is ChatEntry & { answer: ChatAnswerDto; token: string } => e.answer !== null && !!e.token)
    .slice(-HISTORY_TURNS)
    .map((e) => ({ question: e.question, answer: e.answer.text, token: e.token }));
}

/** "12 questions left today", "1 question left today", or why there are none. */
export function allowanceLabel(usage: ChatUsageDto): string {
  if (!usage.canAsk) {
    return "Part of Premium";
  }
  if (usage.paused) {
    return "Paused until midnight";
  }
  if (usage.remaining <= 0) {
    return "No questions left today";
  }
  return `${count(usage.remaining)} ${usage.remaining === 1 ? "question" : "questions"} left today`;
}

/** A card figure: "1,284", or "fewer than 3" when the API hid it. */
export function pointValue(point: Pick<ChatCardPointDto, "value" | "hidden">): string {
  if (point.hidden || point.value === null) {
    return "fewer than 3";
  }
  return Number.isInteger(point.value)
    ? count(point.value)
    : point.value.toLocaleString("en-GB", { maximumFractionDigits: 1 });
}

/** The largest shown figure on a card, for scaling its bars (at least 1, so empty cards don't divide by zero). */
export function cardMax(card: Pick<ChatCardDto, "points">): number {
  return Math.max(1, ...card.points.map((p) => (p.hidden || p.value === null ? 0 : p.value)));
}

/** A bar's width as a percentage of the card's largest figure (hidden figures get a sliver, not nothing). */
export function barPercent(point: Pick<ChatCardPointDto, "value" | "hidden">, max: number): number {
  if (point.hidden || point.value === null) {
    return 2;
  }
  return Math.max(2, Math.min(100, Math.round((point.value / max) * 100)));
}

const KNOWN_TYPES = new Set<string>(CATEGORIES.map((c) => c.value));
const isKnownType = (value: string): value is IncidentCategory => KNOWN_TYPES.has(value);

/**
 * The incident map, centred where the answer was about and filtered to its types. Only coordinates within the UK's
 * rough bounds and types the map knows are passed on; null when there's nothing to show.
 */
export function mapHref(link: ChatMapLinkDto | null | undefined): string | null {
  if (!link) {
    return null;
  }
  const params = new URLSearchParams();
  if (isUkPoint(link.latitude, link.longitude)) {
    params.set("lat", link.latitude!.toFixed(3));
    params.set("lng", link.longitude!.toFixed(3));
    params.set("zoom", String(clampZoom(link.zoom ?? 11)));
  }
  const types = (link.subcategories ?? []).filter(isKnownType).slice(0, 3);
  if (types.length > 0) {
    params.set("types", types.join(","));
  }
  const query = params.toString();
  return query ? `/map?${query}` : "/map";
}

/** Where the map starts, from /map's query (what mapHref writes); anything odd is ignored. */
export interface MapStart {
  centre: [number, number] | null;
  zoom: number | null;
  types: IncidentCategory[];
}

export function parseMapStart(query: Record<string, string | string[] | undefined>): MapStart {
  const one = (key: string) => {
    const value = query[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const lat = Number(one("lat"));
  const lng = Number(one("lng"));
  const zoom = Number(one("zoom"));
  const centre: [number, number] | null = one("lat") && one("lng") && isUkPoint(lat, lng) ? [lat, lng] : null;
  const types = (one("types") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(isKnownType)
    .slice(0, 3);
  return { centre, zoom: centre && Number.isFinite(zoom) && one("zoom") ? clampZoom(zoom) : null, types };
}

function isUkPoint(lat: number | null | undefined, lng: number | null | undefined): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= 49 &&
    lat <= 61 &&
    lng >= -9 &&
    lng <= 3
  );
}

function clampZoom(zoom: number): number {
  return Math.min(16, Math.max(5, Math.round(zoom)));
}

/** A short id for a chat entry (only needs to be unique within the window). */
export function entryId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** What the window says when asking failed. */
export function problemMessage(problem: ChatProblem, detail?: string): string {
  switch (problem) {
    case "signin":
      return "Sign in to ask Bad Jockeys.";
    case "premium":
      return "Ask Bad Jockeys is part of Premium.";
    case "busy":
      return (
        detail || "Ask Bad Jockeys is busy right now. Try again in a minute; that question didn't count."
      );
    default:
      return detail || "Something went wrong. Please try again.";
  }
}
