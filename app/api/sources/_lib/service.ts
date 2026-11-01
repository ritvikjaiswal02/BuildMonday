import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";
import { HttpError } from "@/lib/auth/http";
import type { SessionContext } from "@/lib/auth/session";
import {
  PlanError,
  assertWithinLimit,
  assertWithinPlanLimit,
  featureGateMessage,
  getWorkspacePlan,
  withWorkspaceLimitLock,
} from "@/lib/billing/entitlements";
import { db, type DbExecutor } from "@/lib/db";
import { products, sources, type MonitorSourceKind, type Product, type Source, type SourceConfig, type SourceRole } from "@/lib/db/schema";
import { minimumPlanFor } from "@/lib/plans";
import { detectSourceFromUrl, sourceLabel, validateSourceConfig } from "@/lib/sources";
import { sourceFingerprint } from "@/components/onboarding/source-input";
import { normalizeCompetitorName } from "./allocate";
import type { SourceLocator, UpdateSourceBody } from "./schemas";

const UNRECOGNISED_LINK =
  "We could not recognise that link. Paste an App Store, Google Play, Reddit, Hacker News or Trustpilot link.";

/** `{ kind, config }` (validated) or `{ url }` (detected, then validated). Throws 400 on failure. */
export function resolveSourceLocator(input: SourceLocator): { kind: MonitorSourceKind; config: SourceConfig } {
  if ("url" in input) {
    const detected = detectSourceFromUrl(input.url);
    if (!detected) throw new HttpError(400, "invalid_request", UNRECOGNISED_LINK);
    const checked = validateSourceConfig(detected.kind, detected.config);
    if (!checked.ok) throw new HttpError(400, "invalid_request", checked.error);
    return { kind: detected.kind, config: checked.config };
  }
  const checked = validateSourceConfig(input.kind, input.config);
  if (!checked.ok) throw new HttpError(400, "invalid_request", checked.error);
  return { kind: input.kind, config: checked.config };
}

export async function listProductSources(
  workspaceId: string,
  productId: string,
  executor: DbExecutor = db,
): Promise<Source[]> {
  return executor
    .select()
    .from(sources)
    .where(and(eq(sources.workspaceId, workspaceId), eq(sources.productId, productId)))
    .orderBy(asc(sources.createdAt));
}

/** The source, scoped to the active workspace and a product that is not archived; 404 otherwise. */
export async function requireSource(ctx: SessionContext, sourceId: string): Promise<{ source: Source; product: Product }> {
  if (!sourceId || sourceId.length > 64) throw new HttpError(404, "not_found", "Source not found.");
  const [row] = await db
    .select({ source: sources, product: products })
    .from(sources)
    .innerJoin(products, eq(products.id, sources.productId))
    .where(and(eq(sources.id, sourceId), eq(sources.workspaceId, ctx.workspace.id), isNull(products.archivedAt)))
    .limit(1);
  if (!row) throw new HttpError(404, "not_found", "Source not found.");
  return row;
}

function competitorGate(): never {
  throw new PlanError("plan_required", featureGateMessage("competitor_tracking"), {
    feature: "competitor_tracking",
    requiredPlan: minimumPlanFor("competitor_tracking"),
  });
}

/**
 * Creates one source with the plan rules of POST /api/sources: duplicates are
 * 409, competitor sources need competitor_tracking and room for the name, and
 * a source beyond sources_per_product is a 402 (not saved).
 */
export async function createSource(
  ctx: SessionContext,
  product: Product,
  input: { kind: MonitorSourceKind; config: SourceConfig; role: SourceRole; competitorName: string | null },
): Promise<Source> {
  const state = await getWorkspacePlan(ctx.workspace.id);
  return withWorkspaceLimitLock(ctx.workspace.id, async (tx) => {
    const existing = await listProductSources(ctx.workspace.id, product.id, tx);

    const fingerprint = sourceFingerprint(input.kind, input.config);
    if (existing.some((s) => sourceFingerprint(s.kind, s.config) === fingerprint)) {
      throw new HttpError(409, "conflict", "This source is already being watched for this product.");
    }

    let competitorName: string | null = null;
    if (input.role === "competitor") {
      competitorName = normalizeCompetitorName(input.competitorName);
      if (!competitorName) throw new HttpError(400, "invalid_request", "Add the competitor's name.");
      if (!state.plan.features.competitor_tracking) competitorGate();
      const names = new Set(
        existing.filter((s) => s.role === "competitor" && s.competitorName).map((s) => s.competitorName!.toLowerCase()),
      );
      if (!names.has(competitorName.toLowerCase())) {
        assertWithinPlanLimit(state.plan.id, "competitors", names.size);
      }
    }

    const enabledCount = existing.filter((s) => s.enabled).length;
    assertWithinPlanLimit(state.plan.id, "sources_per_product", enabledCount);

    const [row] = await tx
      .insert(sources)
      .values({
        workspaceId: ctx.workspace.id,
        productId: product.id,
        kind: input.kind,
        config: input.config,
        label: sourceLabel(input.kind, input.config),
        role: input.role,
        competitorName,
        enabled: true,
      })
      .returning();
    return row;
  });
}

export async function updateSource(ctx: SessionContext, source: Source, patch: UpdateSourceBody): Promise<Source> {
  const values: Partial<typeof sources.$inferInsert> = {};

  if (patch.config !== undefined) {
    const checked = validateSourceConfig(source.kind, patch.config);
    if (!checked.ok) throw new HttpError(400, "invalid_request", checked.error);
    const existing = await listProductSources(ctx.workspace.id, source.productId);
    const fingerprint = sourceFingerprint(source.kind, checked.config);
    if (existing.some((s) => s.id !== source.id && sourceFingerprint(s.kind, s.config) === fingerprint)) {
      throw new HttpError(409, "conflict", "This source is already being watched for this product.");
    }
    values.config = checked.config;
    values.lastError = null;
    if (patch.label === undefined) values.label = sourceLabel(source.kind, checked.config);
  }

  if (patch.label !== undefined) values.label = patch.label;

  if (patch.enabled !== undefined && patch.enabled !== source.enabled) {
    if (patch.enabled) {
      const state = await getWorkspacePlan(ctx.workspace.id);
      if (source.role === "competitor" && !state.plan.features.competitor_tracking) competitorGate();
      const existing = await listProductSources(ctx.workspace.id, source.productId);
      const enabledOthers = existing.filter((s) => s.enabled && s.id !== source.id).length;
      await assertWithinLimit(ctx.workspace.id, "sources_per_product", enabledOthers);
    }
    values.enabled = patch.enabled;
  }

  if (Object.keys(values).length === 0) return source;

  const [row] = await db
    .update(sources)
    .set(values)
    .where(and(eq(sources.id, source.id), eq(sources.workspaceId, ctx.workspace.id)))
    .returning();
  if (!row) throw new HttpError(404, "not_found", "Source not found.");
  return row;
}

export async function deleteSource(ctx: SessionContext, source: Source): Promise<void> {
  // feedback.source_id is ON DELETE SET NULL, so collected feedback stays in the inbox.
  await db.delete(sources).where(and(eq(sources.id, source.id), eq(sources.workspaceId, ctx.workspace.id)));
}
