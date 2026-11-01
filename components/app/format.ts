/**
 * Formatting for schedule and comparison copy on app pages. Pure.
 */
import { formatDate, formatNumber, formatRelativeTime } from "@/lib/utils";
import type { StatDelta } from "@/components/ui/stat";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const pad = (n: number) => String(n).padStart(2, "0");

/** "Mon 05:00 UTC" within the coming week, otherwise "12 Oct 05:00 UTC". Times are labelled UTC. */
export function formatScheduleUtc(date: string | Date, now: Date = new Date()): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
  const diff = d.getTime() - now.getTime();
  if (diff >= 0 && diff < 6.5 * 86_400_000) return `${WEEKDAYS[d.getUTCDay()]} ${time}`;
  return `${formatDate(d, now)} ${time}`;
}

/** Dashboard header meta: "Last run 3 h ago", "Next run Mon 05:00 UTC" (or why there is none). */
export function scheduleMeta(
  product: { lastRunAt: string | null; nextRunAt: string | null; monitoringEnabled: boolean },
  now: Date = new Date(),
): string[] {
  const parts: string[] = [];
  parts.push(product.lastRunAt ? `Last run ${formatRelativeTime(product.lastRunAt, now)}` : "No runs yet");
  if (!product.monitoringEnabled) parts.push("Monitoring is paused");
  else if (product.nextRunAt) {
    const next = new Date(product.nextRunAt);
    parts.push(next.getTime() <= now.getTime() ? "Next run is due now" : `Next run ${formatScheduleUtc(next, now)}`);
  }
  return parts;
}

/** Week-over-week change for a count, for the Stat delta. More feedback is neither good nor bad. */
export function weekDelta(thisWeek: number, lastWeek: number): StatDelta | undefined {
  if (thisWeek === 0 && lastWeek === 0) return undefined;
  const diff = thisWeek - lastWeek;
  if (diff === 0) return { value: "same as last week", direction: "flat", tone: "neutral" };
  return {
    value: `${diff > 0 ? "+" : "-"}${formatNumber(Math.abs(diff))} vs last week`,
    direction: diff > 0 ? "up" : "down",
    tone: "neutral",
  };
}
