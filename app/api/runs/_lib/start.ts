import "server-only";

import { waitUntil } from "@vercel/functions";
import { eq } from "drizzle-orm";
import { HttpError } from "@/lib/auth/http";
import { assertAndConsume } from "@/lib/billing/entitlements";
import { db } from "@/lib/db";
import { toRunDTO } from "@/lib/db/dto";
import { runs, type Run } from "@/lib/db/schema";
import { executeRun, findActiveRun, hasAnyRun, startRun } from "@/lib/monitor";

/**
 * Starts a run by hand ("Run now", "Group now" in the app and the extension).
 * The product's first run is free (trigger "onboarding"); later ones use
 * manual_runs_per_month. The run is started first and the quota charged
 * after, so a run that cannot start (409 from a concurrent run, 404 for an
 * archived product) never uses a manual run. The pipeline continues in the
 * background.
 */
export async function startManualRun(workspaceId: string, productId: string): Promise<Run> {
  const active = await findActiveRun(productId);
  if (active) {
    throw new HttpError(409, "conflict", "A run is already in progress for this product.", {
      runId: active.id,
      run: toRunDTO(active),
    });
  }

  const first = !(await hasAnyRun(productId));
  const run = await startRun(productId, first ? "onboarding" : "manual");
  if (!first) {
    try {
      await assertAndConsume(workspaceId, "manual_runs_per_month", 1);
    } catch (err) {
      await db
        .update(runs)
        .set({ status: "failed", error: "Monthly manual run limit reached.", finishedAt: new Date() })
        .where(eq(runs.id, run.id));
      throw err;
    }
  }
  waitUntil(
    executeRun(run.id).catch((err) => {
      console.error(`[runs] background run ${run.id} crashed`, err);
    }),
  );
  return run;
}
