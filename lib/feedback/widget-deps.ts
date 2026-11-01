import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { clientIp, rateLimit } from "@/lib/auth/rate-limit";
import { getWorkspacePlan } from "@/lib/billing/entitlements";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { isDbConfigured } from "@/lib/env";
import { hasFeature } from "@/lib/plans";
import { ingestFeedback } from "./ingest";
import type { WidgetDeps } from "./widget";

/** Production dependencies for the widget endpoints. */
export const widgetDeps: WidgetDeps = {
  isConfigured: isDbConfigured,
  async findProductByKey(key) {
    if (!/^pk_[A-Za-z0-9]{8,60}$/.test(key)) return null;
    const [row] = await db
      .select()
      .from(products)
      .where(and(eq(products.publicKey, key), isNull(products.archivedAt)))
      .limit(1);
    return row ?? null;
  },
  rateLimit,
  clientIp,
  ingest: ingestFeedback,
  async planFor(workspaceId) {
    return (await getWorkspacePlan(workspaceId)).plan.id;
  },
  hasUnbranded: (plan) => hasFeature(plan, "widget_unbranded"),
};
