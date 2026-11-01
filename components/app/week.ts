/**
 * Day bucketing for the week strip: feedback per calendar day in the
 * workspace's time zone, oldest day first, ending today. Pure.
 */
import type { WeekStripDay } from "@/components/ui/week-strip";

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** A valid IANA zone, or "UTC" when the stored value is unknown to this runtime. */
export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

/** "2026-11-01" for the calendar day `date` falls on in `timeZone`. */
export function dayKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** The last `days` day keys ending with today, oldest first. */
export function lastDayKeys(now: Date, timeZone: string, days = 7): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  // Step back in 24 h increments from noon UTC-ish so DST shifts never skip a day.
  for (let i = 0; keys.length < days && i < days * 2; i++) {
    const key = dayKey(new Date(now.getTime() - i * 86_400_000), timeZone);
    if (!seen.has(key)) {
      seen.add(key);
      keys.unshift(key);
    }
  }
  return keys;
}

/** Week strip cells from a day-key -> count map. */
export function buildWeekDays(counts: Map<string, number> | Record<string, number>, now: Date, timeZone: string, days = 7): WeekStripDay[] {
  const get = (k: string) => (counts instanceof Map ? counts.get(k) : counts[k]) ?? 0;
  return lastDayKeys(now, timeZone, days).map((key) => {
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    const weekday = SHORT_DAYS[date.getUTCDay()];
    return {
      label: weekday,
      value: get(key),
      title: `${weekday} ${d} ${MONTHS[m - 1]}`,
    };
  });
}
