// Dates and numbers, always in UK time and English, so the server and the browser render the same text.

const TIME_ZONE = "Europe/London";

const dayMonth = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, day: "numeric", month: "short" });
const dayMonthYear = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});
const timeOfDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});
const monthYear = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, month: "long", year: "numeric" });
const isoDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const number = new Intl.NumberFormat("en-GB");

/** The current time. A function, so tests can fake it and components don't call Date.now() while rendering. */
export function now(): number {
  return Date.now();
}

/** "now", "25m", "5h", "3d", then "18 Oct" (this year) or "18 Oct 2025": the X-style timestamp in the feed. */
export function timeAgo(iso: string, at: number = now()): string {
  const then = new Date(iso).getTime();
  const seconds = Math.max(0, Math.round((at - then) / 1000));
  if (seconds < 60) {
    return "now";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return `${days}d`;
  }
  const sameYear = new Date(then).getUTCFullYear() === new Date(at).getUTCFullYear();
  return (sameYear ? dayMonth : dayMonthYear).format(then);
}

/** "Today, 08:14", "Yesterday, 08:14" or "18 Oct 2026, 08:14", for the post page. */
export function postedAt(iso: string, at: number = now()): string {
  const then = new Date(iso);
  const day = isoDay.format(then);
  if (day === isoDay.format(at)) {
    return `Today, ${timeOfDay.format(then)}`;
  }
  if (day === isoDay.format(at - 86_400_000)) {
    return `Yesterday, ${timeOfDay.format(then)}`;
  }
  return dateTime(iso);
}

/** "18 Oct 2026, 08:05". */
export function dateTime(iso: string): string {
  const then = new Date(iso);
  return `${dayMonthYear.format(then)}, ${timeOfDay.format(then)}`;
}

/** "18 Oct 2026". */
export function longDate(iso: string): string {
  return dayMonthYear.format(new Date(iso));
}

/** "October 2026", for "Joined October 2026". */
export function joined(iso: string): string {
  return monthYear.format(new Date(iso));
}

/** "0:24", "1:48". */
export function duration(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.round(seconds ?? 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

/** "1,284". */
export function count(value: number): string {
  return number.format(value);
}

/** "1 photo", "3 photos". */
export function plural(value: number, one: string, many: string = `${one}s`): string {
  return `${count(value)} ${value === 1 ? one : many}`;
}

/** "RH" from "Road Hog", "D" from "dave". */
export function initials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }
  const letters =
    words.length === 1 ? words[0]!.slice(0, 2) : `${words[0]![0]}${words[words.length - 1]![0]}`;
  return letters.toUpperCase();
}

/** Today's date and time in the UK as "2026-10-18" and "08:05", for the date and time inputs. */
export function ukDateAndTime(at: number = now()): { date: string; time: string } {
  return { date: isoDay.format(at), time: timeOfDay.format(at) };
}

/**
 * The instant for a UK date and time typed into the form ("2026-10-18", "08:05"), as an ISO string with its offset,
 * taking British Summer Time into account.
 */
export function ukLocalToIso(date: string, time: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const clock = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match || !clock) {
    return null;
  }
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const [hh, mm] = [Number(clock[1]), Number(clock[2])];
  // Guess as UTC, then correct by the UK offset at that moment (0 or +1 hour).
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offsetMinutes = ukOffsetMinutes(guess);
  return new Date(guess - offsetMinutes * 60_000).toISOString();
}

function ukOffsetMinutes(utc: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(utc);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - utc) / 60_000);
}

/** "Today, 08:14", "Yesterday, 22:05" or "Sat 17 Oct, 08:14". */
export function whenLabel(date: string, time: string, today: string): string {
  if (date === today) return `Today, ${time}`;
  const day = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(day.getTime())) return time;
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (day.getTime() === yesterday.getTime()) return `Yesterday, ${time}`;
  const label = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(day);
  return `${label.replace(",", "")}, ${time}`;
}
