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
 * The UTC instant at which the IST hour containing `date` begins.
 *
 * Unlike `istCalendarDate()` — which deliberately returns a *label*, a
 * UTC-midnight-anchored Date standing in for an IST calendar day, matching
 * how MySQL DATE columns work — this returns a **genuine UTC instant**,
 * because `statHour` is a real DATETIME column holding a real moment.
 *
 * Real bug fixed here (second attempt at this): Phase 132 tried to solve
 * a mismatch by making this return a "shifted" pseudo-instant so it would
 * compare cleanly against `istCalendarDate()`'s label-space values. That
 * made the two agree, but at the cost of storing values in `statHour`
 * that weren't real timestamps at all — fragile, and confusing to anyone
 * reading the column directly. The real inconsistency was never in this
 * function: it was that the hourly QUERY compared real instants against
 * a calendar-date *label*. That's now fixed properly at the query site via
 * `istDayToUtcRange()` below, so this can go back to doing the honest,
 * obvious thing.
 *
 * IST's half-hour offset is still why this needs its own function rather
 * than a plain hour-truncate: a raw UTC hour bucket (00:00–00:59 UTC)
 * straddles two IST hours (05:30–06:29 IST), so truncating in UTC and
 * shifting only for display would split each real IST hour's traffic
 * across two chart buckets. Shifting first, truncating, then shifting
 * back lands exactly on an IST hour boundary — a real instant that
 * unambiguously represents one specific IST hour.
 */
export function istHourStart(date: Date): Date {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  shifted.setUTCMinutes(0, 0, 0);
  return new Date(shifted.getTime() - IST_OFFSET_MS);
}

/** The IST hour-of-day (0-23) a real `statHour` instant represents. */
export function istHourOfDay(statHour: Date): number {
  return new Date(statHour.getTime() + IST_OFFSET_MS).getUTCHours();
}

/**
 * The real UTC instant range `[start, end]` covered by an IST calendar
 * day — i.e. converting a *label* (what `istCalendarDate()`/`istToday()`
 * return) into the actual moments it spans.
 *
 * This is the piece that was missing and caused the "Views Over Time
 * chart is empty for today" bug: the hourly query took an
 * `istCalendarDate()` label (a UTC-midnight Date standing in for an IST
 * day) and compared it directly against `statHour`'s real UTC instants.
 * Those live in different spaces, so the window was wrong by 5½ hours —
 * silently excluding real data rather than erroring. IST day D actually
 * runs from D-1 18:30 UTC to D 18:29:59.999 UTC.
 */
export function istDayToUtcRange(istDay: Date): { start: Date; end: Date } {
  const start = new Date(istDay.getTime() - IST_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1) };
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
