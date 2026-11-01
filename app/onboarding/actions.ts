"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

/**
 * For members of a workspace that is already set up (they cannot add products):
 * marks them onboarded and opens the dashboard. Failures reach app/onboarding/error.tsx.
 */
export async function finishMemberOnboardingAction(): Promise<void> {
  const ctx = await requireUser();
  if (!ctx.user.onboardedAt) {
    await db.update(users).set({ onboardedAt: new Date() }).where(eq(users.id, ctx.user.id));
  }
  redirect("/dashboard");
}
