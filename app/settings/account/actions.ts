"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole, requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users, workspaces } from "@/lib/db/schema";
import { isValidTimezone } from "@/components/onboarding/model";
import { actionError, type ActionResult } from "../_lib/action-result";

const nameSchema = z
  .string()
  .transform((v) => v.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(1, "Enter your name.").max(80, "Keep your name under 80 characters."));

export async function updateProfileAction(input: { name: string }): Promise<ActionResult<{ name: string }>> {
  try {
    const ctx = await requireUser();
    const name = nameSchema.parse(input.name);
    await db.update(users).set({ name }).where(eq(users.id, ctx.user.id));
    revalidatePath("/settings/account");
    return { ok: true, name };
  } catch (err) {
    return actionError(err);
  }
}

const workspaceSchema = z.object({
  name: z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, " "))
    .pipe(z.string().min(1, "Enter a workspace name.").max(60, "Keep the name under 60 characters.")),
  timezone: z.string().max(64).refine(isValidTimezone, { message: "Choose a time zone from the list." }),
});

/** Workspace name and time zone (admins). The time zone is stored for the Monday email. */
export async function updateWorkspaceAction(input: {
  name: string;
  timezone: string;
}): Promise<ActionResult<{ name: string; timezone: string }>> {
  try {
    const ctx = await requireUser();
    requireRole(ctx, "admin");
    const values = workspaceSchema.parse(input);
    await db.update(workspaces).set(values).where(eq(workspaces.id, ctx.workspace.id));
    revalidatePath("/settings", "layout");
    return { ok: true, ...values };
  } catch (err) {
    return actionError(err);
  }
}
