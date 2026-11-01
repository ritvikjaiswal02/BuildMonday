import "server-only";

import { and, count, eq, gte, inArray, max } from "drizzle-orm";
import { db } from "@/lib/db";
import { feedback } from "@/lib/db/schema";

export interface ChannelActivity {
  /** Items received in the last 30 days. */
  count30d: number;
  /** ISO time of the newest item ever received through the channel, within the window. */
  lastAt: string | null;
}

export type ProductActivity = Record<string, { widget: ChannelActivity; extension: ChannelActivity }>;

const EMPTY: ChannelActivity = { count30d: 0, lastAt: null };

/** Widget and extension feedback per product over the last 30 days, for the install status lines. */
export async function loadCollectionActivity(workspaceId: string, now: Date = new Date()): Promise<ProductActivity> {
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      productId: feedback.productId,
      channel: feedback.channel,
      n: count(),
      lastAt: max(feedback.ingestedAt),
    })
    .from(feedback)
    .where(
      and(
        eq(feedback.workspaceId, workspaceId),
        inArray(feedback.channel, ["widget", "extension"]),
        gte(feedback.ingestedAt, since),
      ),
    )
    .groupBy(feedback.productId, feedback.channel);

  const out: ProductActivity = {};
  for (const r of rows) {
    const entry = (out[r.productId] ??= { widget: { ...EMPTY }, extension: { ...EMPTY } });
    const value: ChannelActivity = {
      count30d: Number(r.n ?? 0),
      lastAt: r.lastAt ? new Date(r.lastAt).toISOString() : null,
    };
    if (r.channel === "widget") entry.widget = value;
    else if (r.channel === "extension") entry.extension = value;
  }
  return out;
}
