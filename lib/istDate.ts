/**
 * Real, reported bug fixed by using this everywhere: analytics/dashboard
 * "Today"/"Yesterday" boundaries were computed inconsistently between the
 * WRITE side (track-view/route.ts wrote `statDate` as the UTC calendar
 * date, via `new Date().toISOString().slice(0, 10)`) and the READ side
 * (analyticsData.ts and dashboardStats.ts both used `setHours(0,0,0,0)`,
 * which computes midnight in the Node PROCESS'S LOCAL timezone — whatever
 * that happens to be on whichever server this runs on).
 *
 * On a server whose local timezone isn't UTC, those two "midnight"s land
 * at different real moments. A visit that happened in the evening (IST)
 * gets written under one calendar date (the UTC one), while a "yesterday"
 * query computed from IST-local midnight looks for a DIFFERENT calendar
 * date — so real traffic silently splits across two buckets, and neither
 * "today" nor "yesterday" reflects what actually happened. Reported
 * exactly as: real click counts were correct in total, but "yesterday"
 * showed a small fraction of the true number.
 *
 * The fix here isn't "make both sides agree on whatever the ambient
 * server timezone happens to be" — that's fragile; a server migration, a
 * changed TZ env var, or a differently-configured deployment host would
 * silently reintroduce the exact same class of bug. Instead this file is
 * the ONE place "what day is it" gets decided, using an EXPLICIT,
 * deployment-independent offset for the site's actual audience timezone
 * (India, UTC+5:30) — every read site and every write site imports from
 * here, so they can no longer drift apart.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The calendar date (as a UTC-midnight-anchored Date, matching how
 *  Prisma/MySQL DATE columns are already used throughout this project)
 *  that `date` falls on when viewed in India Standard Time — regardless
 *  of what timezone the server process itself is running in. */
export function istCalendarDate(date: Date): Date {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

/** Today's IST calendar date. */
export function istToday(): Date {
  return istCalendarDate(new Date());
}

export function istAddDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

/** "YYYY-MM-DD" for the IST calendar date `date` falls on — for grouping
 *  keys and chart labels, matching what `.toISOString().slice(0, 10)`
 *  was being used for at several read sites, but IST-correct. */
export function istDateKey(date: Date): string {
  return istCalendarDate(date).toISOString().slice(0, 10);
}

/**
 * The UTC instant corresponding to the START of the IST hour that
 * `date` falls in.
 *
 * Why this needs its own function rather than a simple hour-truncate:
 * IST is UTC+5:30, a HALF-HOUR offset — so a UTC hour-bucket (e.g.
 * 00:00-00:59 UTC) straddles TWO different IST hours (05:30-06:29 IST).
 * Truncating to the hour in UTC and then just adding 5.5 hours for
 * display, as the code here originally did, would put roughly half of
 * each IST hour's real traffic into the wrong label on the chart. This
 * shifts into IST first, truncates to the hour there, then shifts back —
 * so the stored instant unambiguously represents one specific IST hour,
 * and reading `istHourOfDay()` back out always recovers the right label. */
export function istHourStart(date: Date): Date {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  shifted.setUTCMinutes(0, 0, 0);
  return new Date(shifted.getTime() - IST_OFFSET_MS);
}

/** The IST hour-of-day (0-23) that a `statHour` value written by
 *  `istHourStart()` represents. */
export function istHourOfDay(statHour: Date): number {
  return new Date(statHour.getTime() + IST_OFFSET_MS).getUTCHours();
}
