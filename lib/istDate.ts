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
 * The instant (stored as a Date, but see below) representing the START
 * of the IST hour that `date` falls in.
 *
 * Real bug fixed here, found from a live report ("Views Over Time" graph
 * showed nothing for today): the original version of this function
 * shifted into IST, truncated to the hour, then shifted BACK to a real
 * UTC instant. That kept the STORED value a genuine UTC timestamp, but
 * broke consistency with `istCalendarDate()`'s day-boundary math, which
 * shifts into IST and STAYS there (treating the shifted clock time as if
 * it were UTC, to get a clean day-boundary box). For any IST hour before
 * roughly 05:30 (i.e. whenever the shift crosses a UTC calendar-date
 * line), shifting back afterward moved the stored instant onto the
 * PREVIOUS UTC calendar day — which then fell OUTSIDE the
 * `[dayStart, dayEnd]` window `getRangeSeries()` queries for "today",
 * so those hours' real data was silently excluded from the graph
 * entirely, even though `postStatsDaily`'s own (correctly-consistent)
 * total for the same day was unaffected.
 *
 * Fixed by staying in the same "shifted" coordinate space `istCalendarDate`
 * already uses, rather than converting back to a genuine UTC instant:
 * this value is never meant to be read as a real timestamp by anything
 * outside this module — only compared against other `istDate.ts` values
 * or read back through `istHourOfDay()`, both of which now consistently
 * agree on what "space" these Dates live in.
 *
 * IST is a HALF-HOUR UTC offset, which is still the reason this needs a
 * dedicated function rather than a plain hour-truncate: a raw UTC hour
 * bucket (e.g. 00:00-00:59 UTC) straddles two different IST hours
 * (05:30-06:29 IST), so truncating in UTC and shifting only for display
 * would still split each real IST hour's traffic across two buckets.
 */
export function istHourStart(date: Date): Date {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  shifted.setUTCMinutes(0, 0, 0);
  return shifted;
}

/** The IST hour-of-day (0-23) that a `statHour` value written by
 *  `istHourStart()` represents. `statHour` is already in the "shifted"
 *  coordinate space `istHourStart` produces, so this reads it directly —
 *  no further shift, matching the fix above. */
export function istHourOfDay(statHour: Date): number {
  return statHour.getUTCHours();
}

/** The last instant of the IST calendar day that `date` (an
 *  istCalendarDate()-anchored Date) belongs to — for building an
 *  inclusive `[start, end]` range against a plain DATETIME column like
 *  `Post.date`, which isn't itself IST-day-bucketed the way
 *  `postStatsDaily`/`postStatsHourly` are. */
export function istEndOfDay(date: Date): Date {
  return new Date(istCalendarDate(date).getTime() + 24 * 60 * 60 * 1000 - 1);
}

export type DateRangePreset = "today" | "yesterday" | "week" | "month" | "custom";

/**
 * New feature, no PHP equivalent — resolves a Blog Manager date-range
 * filter preset (or an explicit custom start/end) into a concrete
 * `[start, end]` window, all IST-anchored so "Today" here means the same
 * calendar day the Analytics/Dashboard pages already mean by it.
 *
 * `customFrom`/`customTo` are plain "YYYY-MM-DD" strings from a date
 * `<input>`; invalid or missing values fall back to `today` rather than
 * silently producing an unbounded or reversed range.
 */
export function resolveDateRangeFilter(
  preset: DateRangePreset,
  customFrom?: string | null,
  customTo?: string | null
): { start: Date; end: Date } {
  const today = istToday();

  switch (preset) {
    case "yesterday": {
      const d = istAddDays(today, -1);
      return { start: d, end: istEndOfDay(d) };
    }
    case "week":
      return { start: istAddDays(today, -6), end: istEndOfDay(today) };
    case "month": {
      // "This Month" means the current CALENDAR month (1st to today), not
      // a rolling 30-day window — the Analytics page already has "30
      // Days" for that; this is deliberately a different, more literal
      // thing, per explicit request. `today` is already a clean
      // UTC-midnight-anchored IST calendar date, so Date.UTC(year,
      // month, 1) directly gives the same clean form for the 1st.
      const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      return { start: monthStart, end: istEndOfDay(today) };
    }
    case "custom": {
      const from = customFrom ? new Date(`${customFrom}T00:00:00.000Z`) : null;
      const to = customTo ? new Date(`${customTo}T00:00:00.000Z`) : null;
      if (from && to && !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to) {
        return { start: istCalendarDate(from), end: istEndOfDay(to) };
      }
      // Malformed/incomplete custom range — fall back to today rather
      // than guessing at an open-ended or reversed window.
      return { start: today, end: istEndOfDay(today) };
    }
    case "today":
    default:
      return { start: today, end: istEndOfDay(today) };
  }
}
