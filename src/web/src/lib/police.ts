/**
 * Reporting a post to the police (owner feedback, 22 Oct 2026, item 12). There's no API to send footage to the
 * police, and the copy on Bad Jockeys is blurred and silent, so we point the poster to the right place to send their
 * own original file. Nothing is sent or recorded by us.
 */

/** Where an incident happened, for who takes the footage. */
export type Nation = "england-wales" | "scotland" | "northern-ireland";

/** The National Dash Cam Safety Portal (run by Nextbase, free): it passes footage to forces in England and Wales. */
export const DASHCAM_PORTAL_URL = "https://nextbase.co.uk/national-dash-cam-safety-portal/";

/** Forces usually want footage quickly: some offences need a notice sent to the driver within 14 days. */
export const REPORT_WITHIN_DAYS = 14;

export const NATIONS: readonly { value: Nation; label: string }[] = [
  { value: "england-wales", label: "England or Wales" },
  { value: "scotland", label: "Scotland" },
  { value: "northern-ireland", label: "Northern Ireland" },
];

/**
 * A best guess from the pin, which the poster confirms: Northern Ireland west of the North Channel, Scotland north
 * of a line from the Solway Firth to Berwick-upon-Tweed (and the Galloway coast), otherwise England or Wales.
 */
export function guessNation(latitude: number, longitude: number): Nation {
  if (longitude < -5.43 && latitude >= 54.0 && latitude < 55.25) {
    return "northern-ireland";
  }
  let border: number;
  if (longitude <= -3.65) {
    border = 54.5;
  } else if (longitude <= -3.1) {
    border = 54.95;
  } else if (longitude <= -2.03) {
    border = 54.95 + ((longitude + 3.1) * (55.8 - 54.95)) / (3.1 - 2.03);
  } else {
    border = 55.8;
  }
  return latitude > border ? "scotland" : "england-wales";
}

/** Whole days since it happened (0 on the day), for "send it within 14 days". */
export function daysSince(incidentAt: string, now: number = Date.now()): number {
  return Math.max(0, Math.floor((now - Date.parse(incidentAt)) / 86_400_000));
}
