import "server-only";

import * as React from "react";
import { and, asc, eq, isNull } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import {
  products,
  users,
  workspaceMembers,
  workspaces,
  type MemberRole,
  type Product,
  type Workspace,
} from "@/lib/db/schema";
import { isAuthConfigured, isDbConfigured } from "@/lib/env";
import { ACTIVE_PRODUCT_COOKIE, PATH_HEADER, onboardingPath, safeNextPath } from "./cookies";
import { HttpError } from "./http";
import { ensurePersonalWorkspace } from "./workspace";

export { ACTIVE_PRODUCT_COOKIE, onboardingPath, onboardingThen } from "./cookies";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  onboardedAt: Date | null;
}

export interface SessionContext {
  user: SessionUser;
  workspace: Workspace;
  role: MemberRole;
}

const ROLE_RANK: Record<MemberRole, number> = { member: 0, admin: 1, owner: 2 };

/** Per-request memoisation when React's `cache` is available (server components); identity otherwise. */
const reactCache: <T extends (...args: never[]) => unknown>(fn: T) => T =
  (React as unknown as { cache?: <T>(fn: T) => T }).cache ?? ((fn) => fn);

async function loadMemberships(userId: string) {
  return getDb()
    .select({ workspace: workspaces, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(asc(workspaceMembers.createdAt));
}

async function resolveSessionContext(): Promise<SessionContext | null> {
  if (!isAuthConfigured()) return null;

  let userId: string | undefined;
  try {
    const session = await auth();
    userId = session?.user?.id;
  } catch (err) {
    console.warn("[session] could not read the session", err);
    return null;
  }
  if (!userId) return null;

  try {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return null;

    let memberships = await loadMemberships(user.id);
    if (memberships.length === 0) {
      // The createUser event normally does this; recover if it failed.
      await ensurePersonalWorkspace(user.id);
      memberships = await loadMemberships(user.id);
      if (memberships.length === 0) return null;
    }

    const active = memberships.find((m) => m.workspace.id === user.activeWorkspaceId) ?? memberships[0];
    if (active.workspace.id !== user.activeWorkspaceId) {
      await db.update(users).set({ activeWorkspaceId: active.workspace.id }).where(eq(users.id, user.id));
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        onboardedAt: user.onboardedAt,
      },
      workspace: active.workspace,
      role: active.role,
    };
  } catch (err) {
    console.error("[session] could not load the session context", err);
    return null;
  }
}

/** The signed-in user, their active workspace and role; null when signed out, unconfigured or the user is gone. */
export const getSessionContext: () => Promise<SessionContext | null> = reactCache(resolveSessionContext);

/** For API routes: throws HttpError(401) when there is no session. */
export async function requireUser(): Promise<SessionContext> {
  if (!isDbConfigured()) {
    throw new HttpError(503, "not_configured", "Accounts are not set up on this deployment yet.");
  }
  const ctx = await getSessionContext();
  if (!ctx) throw new HttpError(401, "unauthorized", "Sign in to continue.");
  return ctx;
}

function currentPath(): string {
  try {
    return safeNextPath(headers().get(PATH_HEADER), "/dashboard");
  } catch {
    return "/dashboard";
  }
}

/**
 * For pages: redirects to /login?next=<current path> when signed out, and to
 * /onboarding when the user has not finished onboarding (unless
 * `opts.onboarded === false`, which the onboarding pages themselves pass).
 */
export async function requirePageContext(opts?: { onboarded?: boolean }): Promise<SessionContext> {
  if (!isDbConfigured()) redirect("/login");
  const ctx = await getSessionContext();
  if (!ctx) redirect(`/login?next=${encodeURIComponent(currentPath())}`);
  if (opts?.onboarded !== false && !ctx.user.onboardedAt) redirect(onboardingPath(currentPath()));
  return ctx;
}

/** Throws 403 unless the member's role is at least `min`. */
export function requireRole(ctx: SessionContext, min: "admin" | "owner"): void {
  if (ROLE_RANK[ctx.role] < ROLE_RANK[min]) {
    throw new HttpError(
      403,
      "forbidden",
      min === "owner" ? "Only the workspace owner can do this." : "Only workspace admins can do this.",
    );
  }
}

/** True when the member's role is at least `min`; the non-throwing form of requireRole. */
export function hasRole(ctx: SessionContext, min: MemberRole): boolean {
  return ROLE_RANK[ctx.role] >= ROLE_RANK[min];
}

/** 404 unless the product belongs to the active workspace and is not archived. */
export async function requireProduct(ctx: SessionContext, productId: string): Promise<Product> {
  if (typeof productId !== "string" || productId.length === 0 || productId.length > 64) {
    throw new HttpError(404, "not_found", "Product not found.");
  }
  const [product] = await getDb()
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.workspaceId, ctx.workspace.id), isNull(products.archivedAt)))
    .limit(1);
  if (!product) throw new HttpError(404, "not_found", "Product not found.");
  return product;
}

/** Products of a workspace that are not archived, oldest first. */
export async function listProducts(workspaceId: string): Promise<Product[]> {
  return getDb()
    .select()
    .from(products)
    .where(and(eq(products.workspaceId, workspaceId), isNull(products.archivedAt)))
    .orderBy(asc(products.createdAt));
}

/** The product in the bm_product cookie when it is valid, else the first product, else null. */
export async function getActiveProduct(ctx: SessionContext): Promise<Product | null> {
  const list = await listProducts(ctx.workspace.id);
  if (list.length === 0) return null;
  let selected: string | undefined;
  try {
    selected = cookies().get(ACTIVE_PRODUCT_COOKIE)?.value;
  } catch {
    selected = undefined;
  }
  return list.find((p) => p.id === selected) ?? list[0];
}

/** Workspaces the user belongs to, in join order. */
export async function listUserWorkspaces(
  userId: string,
): Promise<Array<{ id: string; name: string; role: MemberRole }>> {
  const rows = await loadMemberships(userId);
  return rows.map((r) => ({ id: r.workspace.id, name: r.workspace.name, role: r.role }));
}
