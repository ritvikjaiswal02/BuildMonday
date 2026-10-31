"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { actionError, type ActionResult } from "@/app/settings/_lib/action-result";

/** Hides the dashboard "Finish setting up" panel for the whole workspace. */
export async function hideSetupChecklistAction(): Promise<ActionResult> {
  try {
    const ctx = await requireUser();
    requireRole(ctx, "admin");
    const hiddenAt = new Date().toISOString();
    await db
      .update(workspaces)
      .set({
        onboardingAnswers: sql`jsonb_set(coalesce(${workspaces.onboardingAnswers}, '{}'::jsonb), '{checklistHiddenAt}', to_jsonb(${hiddenAt}::text), true)`,
      })
      .where(eq(workspaces.id, ctx.workspace.id));
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return actionError(err);
  }
}
