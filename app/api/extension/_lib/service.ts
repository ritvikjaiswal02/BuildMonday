import "server-only";

import { and, count, desc, eq, isNull } from "drizzle-orm";
import { HttpError } from "@/lib/auth/http";
import { rateLimit, rateLimitHeaders } from "@/lib/auth/rate-limit";
import { hasRole, type SessionContext } from "@/lib/auth/session";
import { authenticateBearer, revokeApiToken } from "@/lib/auth/tokens";
import { PlanError, getUsage, getWorkspacePlan } from "@/lib/billing/entitlements";
import { db } from "@/lib/db";
import { toApiTokenDTO, type ApiTokenDTO } from "@/lib/db/dto";
import { apiTokens, products, users, type ApiToken, type Product, type Workspace } from "@/lib/db/schema";
import { LIMIT_UNITS, formatLimit, isUnlimited, limitFor, minimumPlanFor, type PlanId } from "@/lib/plans";

export const TOKEN_INVALID_MESSAGE =
  "This token is not valid. Create a new one in BuildMonday under Extension & widget.";

/** Requests per token per minute across /me and /clip. */
export const TOKEN_RATE_LIMIT = { limit: 60, windowSec: 60 } as const;

export interface ExtensionAuth {
  token: ApiToken;
  workspace: Workspace;
  userId: string;
}

/** Bearer token auth for the extension endpoints; 401 with a fix-it message otherwise. */
export async function requireExtensionAuth(req: Request): Promise<ExtensionAuth> {
  const auth = await authenticateBearer(req);
  if (!auth) throw new HttpError(401, "unauthorized", TOKEN_INVALID_MESSAGE);
  return auth;
}

/** 60 requests per token per minute; throws 429 with retryAfter. */
export async function enforceTokenRateLimit(tokenId: string): Promise<void> {
  const r = await rateLimit(`ext:${tokenId}`, TOKEN_RATE_LIMIT);
  if (r.ok) return;
  const retryAfter = Number(rateLimitHeaders(r)["Retry-After"]);
  throw new HttpError(429, "rate_limited", "Too many clips in a short time. Wait a minute and try again.", {
    retryAfter,
  });
}

/** A product of the workspace that is not archived, or 404. */
export async function requireWorkspaceProduct(workspaceId: string, productId: string): Promise<Product> {
  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.workspaceId, workspaceId), isNull(products.archivedAt)))
    .limit(1);
  if (!product) {
    throw new HttpError(404, "not_found", "That product is not in this workspace. Pick another product in the extension.");
  }
  return product;
}

/**
 * The 402 to return when a clip stored nothing because of a monthly quota.
 * Reports whichever limit is exhausted: extension clips first, then feedback items.
 */
export async function quotaError(workspaceId: string): Promise<PlanError> {
  const state = await getWorkspacePlan(workspaceId);
  const plan: PlanId = state.plan.id;

  const clipMax = limitFor(plan, "extension_clips_per_month");
  if (!isUnlimited(clipMax)) {
    const used = await getUsage(workspaceId, "extension_clips_per_month");
    if (used >= clipMax) {
      return new PlanError(
        "limit_reached",
        `You have used all ${formatLimit(clipMax)} ${LIMIT_UNITS.extension_clips_per_month.plural} on your plan this month. Upgrade for unlimited clips.`,
        {
          limit: "extension_clips_per_month",
          used,
          max: clipMax,
          requiredPlan: minimumPlanFor("extension_clips_per_month", used + 1),
        },
      );
    }
  }

  const feedbackMax = limitFor(plan, "feedback_items_per_month");
  const used = await getUsage(workspaceId, "feedback_items_per_month");
  return new PlanError(
    "limit_reached",
    `Your workspace has used all ${formatLimit(feedbackMax)} ${LIMIT_UNITS.feedback_items_per_month.plural} for this month. Upgrade to keep collecting.`,
    {
      limit: "feedback_items_per_month",
      used,
      max: feedbackMax,
      requiredPlan: minimumPlanFor("feedback_items_per_month", used + 1),
    },
  );
}

/** Clip usage this month for the popup and the /extension page. */
export async function clipUsage(workspaceId: string, plan: PlanId): Promise<{ used: number; max: number }> {
  const max = limitFor(plan, "extension_clips_per_month");
  const used = await getUsage(workspaceId, "extension_clips_per_month");
  return { used, max };
}

// ---------------------------------------------------------------------------
// Token management (session routes and the /extension page)
// ---------------------------------------------------------------------------

export interface ExtensionTokenRow extends ApiTokenDTO {
  /** True when the signed-in user created this token. */
  mine: boolean;
  owner: { name: string | null; email: string } | null;
}

/**
 * Members see their own tokens; admins and owners see every active token in
 * the workspace (so they can revoke one a former teammate left behind).
 */
export async function listTokensForContext(ctx: SessionContext): Promise<ExtensionTokenRow[]> {
  const seeAll = hasRole(ctx, "admin");
  const where = seeAll
    ? and(eq(apiTokens.workspaceId, ctx.workspace.id), isNull(apiTokens.revokedAt))
    : and(eq(apiTokens.workspaceId, ctx.workspace.id), eq(apiTokens.userId, ctx.user.id), isNull(apiTokens.revokedAt));

  const rows = await db
    .select({ token: apiTokens, ownerName: users.name, ownerEmail: users.email })
    .from(apiTokens)
    .leftJoin(users, eq(users.id, apiTokens.userId))
    .where(where)
    .orderBy(desc(apiTokens.createdAt));

  return rows.map((r) => ({
    ...toApiTokenDTO(r.token),
    mine: r.token.userId === ctx.user.id,
    owner: r.ownerEmail ? { name: r.ownerName ?? null, email: r.ownerEmail } : null,
  }));
}

export async function countActiveTokens(workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(apiTokens)
    .where(and(eq(apiTokens.workspaceId, workspaceId), isNull(apiTokens.revokedAt)));
  return Number(row?.n ?? 0);
}

/** Revokes a token the user owns, or any workspace token for admins. 404 when missing, 403 otherwise. */
export async function revokeTokenForContext(ctx: SessionContext, id: string): Promise<void> {
  if (!id || id.length > 64) throw new HttpError(404, "not_found", "Token not found.");
  const [row] = await db
    .select({ userId: apiTokens.userId, revokedAt: apiTokens.revokedAt })
    .from(apiTokens)
    .where(and(eq(apiTokens.id, id), eq(apiTokens.workspaceId, ctx.workspace.id)))
    .limit(1);
  if (!row || row.revokedAt) throw new HttpError(404, "not_found", "Token not found. It may already be revoked.");
  if (row.userId !== ctx.user.id && !hasRole(ctx, "admin")) {
    throw new HttpError(403, "forbidden", "Only the person who created this token or a workspace admin can revoke it.");
  }
  const ok = await revokeApiToken(ctx.workspace.id, id);
  if (!ok) throw new HttpError(404, "not_found", "Token not found. It may already be revoked.");
}
