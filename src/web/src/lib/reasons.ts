import type { ReportReason } from "./types";

export interface ReasonChoice {
  value: ReportReason;
  label: string;
}

/**
 * In-app reports on a post, comment or profile (screen 07). "Not about driving" comes first (owner, 23 Oct 2026):
 * a few of those, or spam reports, hold a post for a moderator straight away.
 */
export const IN_APP_REASONS: readonly ReasonChoice[] = [
  { value: "NotADrivingIncident", label: "Not about driving" },
  { value: "Spam", label: "Spam or advertising" },
  { value: "PersonalInformation", label: "Shows a face, number plate or home" },
  { value: "DangerousOrIllegal", label: "Dangerous or illegal" },
  { value: "HarassmentOrHate", label: "Harassment or hate" },
  { value: "Other", label: "Something else" },
];

/** Reporting an account: everything above, plus the two reasons only accounts can be reported for. */
export const PROFILE_REASONS: readonly ReasonChoice[] = [
  ...IN_APP_REASONS.slice(0, -1),
  { value: "Impersonation", label: "Pretending to be someone else" },
  { value: "UnderThirteen", label: "Belongs to someone under 13" },
  IN_APP_REASONS[IN_APP_REASONS.length - 1]!,
];

/** The public "Report content" form (screen 23). The API accepts only these reasons from it. */
export const PUBLIC_REASONS: readonly ReasonChoice[] = [
  { value: "InThisClip", label: "I'm in this clip and want it blurred or removed" },
  { value: "PersonalInformation", label: "It shows my personal details" },
  { value: "IllegalContent", label: "It's illegal, threatening or dangerous" },
  { value: "Copyright", label: "It's my footage and posted without permission" },
  { value: "Other", label: "Something else" },
];

export function isReason(value: unknown, choices: readonly ReasonChoice[]): value is ReportReason {
  return choices.some((c) => c.value === value);
}
