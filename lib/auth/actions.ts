"use server";

import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { getDb } from "@/lib/db";
import { users, workspaceMembers } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { ACTIVE_PRODUCT_COOKIE } from "./cookies";
import { getSessionContext, requireProduct } from "./session";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/** Validates the product belongs to the active workspace and remembers it in the bm_product cookie. */
export async function setActiveProductAction(productId: string): Promise<{ ok: boolean }> {
  if (typeof productId !== "string" || productId.length === 0) return { ok: false };
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false };
  try {
    await requireProduct(ctx, productId);
  } catch {
    return { ok: false };
  }
  cookies().set(ACTIVE_PRODUCT_COOKIE, productId, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  });
  return { ok: true };
}

/** Switches the active workspace after checking membership, and clears the active product. */
export async function switchWorkspaceAction(workspaceId: string): Promise<{ ok: boolean }> {
  if (typeof workspaceId !== "string" || workspaceId.length === 0) return { ok: false };
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false };
  try {
    const db = getDb();
    const [membership] = await db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, ctx.user.id)))
      .limit(1);
    if (!membership) return { ok: false };
    await db.update(users).set({ activeWorkspaceId: workspaceId }).where(eq(users.id, ctx.user.id));
  } catch (err) {
    console.error("[actions] switchWorkspaceAction failed", err);
    return { ok: false };
  }
  cookies().delete(ACTIVE_PRODUCT_COOKIE);
  return { ok: true };
}

export async function signOutAction(): Promise<void> {
  cookies().delete(ACTIVE_PRODUCT_COOKIE);
  if (!env.AUTH_SECRET) redirect("/");
  await signOut({ redirectTo: "/" });
}
