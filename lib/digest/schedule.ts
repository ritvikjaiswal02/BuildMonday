/**
 * When a workspace's Monday digest is due. Pure and client-safe.
 *
 * Two modes, chosen by the DIGEST_SCHEDULE environment variable:
 *
 * - "weekly" (default): one cron tick on Mondays at 03:30 UTC sends every
 *   workspace its digest. This works on Vercel Hobby, which only allows
 *   daily-or-slower cron jobs. 03:30 UTC is 9:00 in India.
 * - "local": the digest route is called every hour (Vercel Pro cron
 *   `30 * * * 0,1`, or an Upstash QStash schedule) and each workspace is sent
 *   its digest at the first tick on or after 9:00 on Monday in the workspace's
 *   time zone. A missed tick is caught up later the same local Monday.
 */
import { isoWeekKey } from "./week";

export type DigestScheduleMode = "weekly" | "local";

/** Local hour (0-23) at which the digest goes out in "local" mode. */
export const DIGEST_LOCAL_HOUR = 9;

/** The UTC time of the weekly tick, for copy. */
export const DIGEST_WEEKLY_UTC_LABEL = "03:30 UTC";

export function parseDigestMode(value: string | null | undefined): DigestScheduleMode {
  return value?.trim().toLowerCase() === "local" ? "local" : "weekly";
}

export interface LocalClock {
  /** 0 = Sunday ... 6 = Saturday, in the zone. */
  weekday: number;
  hour: number;
  /** A Date at 00:00 UTC on the zone's calendar date, for week keys. */
  calendarDate: Date;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** The calendar date, weekday and hour at `now` in `timeZone` (UTC when the zone is unknown). */
export function localClock(now: Date, timeZone: string): LocalClock {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    }).formatToParts(now);
  } catch {
    return localClock(now, "UTC");
  }
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  const hour = Number(get("hour")) % 24;
  const weekday = WEEKDAYS[get("weekday")] ?? now.getUTCDay();
  return { weekday, hour, calendarDate: new Date(Date.UTC(year, month - 1, day)) };
}

export interface DigestSlot {
  /** Send now. */
  due: boolean;
  /** The ISO week this send belongs to, used for the once-a-week claim. */
  weekKey: string;
}

/**
 * Whether a workspace in `timeZone` is due its digest at `now`.
 * Weekly mode: always due, keyed by the UTC ISO week.
 * Local mode: due on the zone's Monday from 9:00, keyed by the zone's ISO week.
 */
export function digestSlot(now: Date, timeZone: string, mode: DigestScheduleMode): DigestSlot {
  if (mode === "weekly") return { due: true, weekKey: isoWeekKey(now) };
  const clock = localClock(now, timeZone || "UTC");
  return {
    due: clock.weekday === 1 && clock.hour >= DIGEST_LOCAL_HOUR,
    weekKey: isoWeekKey(clock.calendarDate),
  };
}

/** One sentence for onboarding and settings describing when the digest arrives. */
export function digestTimingCopy(mode: DigestScheduleMode): { digest: string; timezoneHint: string } {
  if (mode === "local") {
    return {
      digest: "Every Monday at 9:00 in your time zone: the ranked list, what is new, what got worse, what you fixed.",
      timezoneHint: "Your Monday email is sent at 9:00 in this time zone.",
    };
  }
  return {
    digest: `Every Monday at ${DIGEST_WEEKLY_UTC_LABEL} (9:00 in India): the ranked list, what is new, what got worse, what you fixed.`,
    timezoneHint: `Saved so we can send at your local morning. Today every email goes out at ${DIGEST_WEEKLY_UTC_LABEL}.`,
  };
}
