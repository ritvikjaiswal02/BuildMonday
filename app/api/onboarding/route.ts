import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ACTIVE_PRODUCT_COOKIE } from "@/lib/auth/cookies";
import { HttpError, withRoute } from "@/lib/auth/http";
import { requireUser } from "@/lib/auth/session";
import { assertWithinPlanLimit, getWorkspacePlan, withWorkspaceLimitLock } from "@/lib/billing/entitlements";
import { db } from "@/lib/db";
import { toSourceDTO } from "@/lib/db/dto";
import { integrations, products, sources, users, workspaceMembers, workspaces, type OnboardingAnswers } from "@/lib/db/schema";
import { sourceLabel, validateSourceConfig } from "@/lib/sources";
import { countActiveProducts, insertProduct } from "@/app/api/products/_lib/service";
import { allocateSources } from "@/app/api/sources/_lib/allocate";
import { onboardingSchema } from "./_lib/schema";
import { parseBody } from "@/app/api/products/_lib/parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * Finishes onboarding in one transaction: creates the product (with a widget
 * key), saves the sources the plan allows (extras paused, competitor sources
 * dropped without competitor tracking), stores the answers, timezone and
 * notification preferences, marks the user onboarded and selects the product.
 *
 * `?new=1` adds another product to an onboarded workspace: only the product
 * and its sources are written.
 */
export const POST = withRoute(async (req) => {
  const ctx = await requireUser();
  const isNew = new URL(req.url).searchParams.get("new") === "1";

  if (ctx.role === "member") {
    throw new HttpError(
      403,
      "forbidden",
      "Only workspace admins can add products. Ask an admin to add it, or open your dashboard.",
    );
  }

  const body = await parseBody(req, onboardingSchema, { maxBytes: 64 * 1024 });

  const planState = await getWorkspacePlan(ctx.workspace.id);
  const plan = planState.plan;
  const { toInsert, skipped } = allocateSources(
    body.sources.map((s) => ({
      kind: s.kind,
      config: s.config,
      role: s.role,
      competitorName: s.competitorName ?? null,
    })),
    {
      sourceLimit: plan.limits.sources_per_product,
      competitorTracking: plan.features.competitor_tracking,
      competitorLimit: plan.limits.competitors,
    },
    validateSourceConfig,
    sourceLabel,
  );

  const now = new Date();
  const answers: OnboardingAnswers = {
    team: body.team,
    notifications: body.notifications,
    completedAt: now.toISOString(),
  };
  const firstOnboarding = !isNew && !ctx.user.onboardedAt;

  // Auto-file from setup only when the plan includes it and the tracker is already connected.
  let autofile: { enabled: boolean; target: "linear" | "github"; threshold: number } | null = null;
  if (body.autofile) {
    const [connected] = await db
      .select({ id: integrations.id })
      .from(integrations)
      .where(and(eq(integrations.workspaceId, ctx.workspace.id), eq(integrations.kind, body.autofile.target)))
      .limit(1);
    autofile = {
      target: body.autofile.target,
      threshold: body.autofile.threshold,
      enabled: body.autofile.enabled && Boolean(connected) && plan.features.auto_file,
    };
  }

  // Count and insert under a per-workspace lock so a double submit cannot create two products on a one-product plan.
  const { product, inserted } = await withWorkspaceLimitLock(ctx.workspace.id, async (tx) => {
    const existingProducts = await countActiveProducts(ctx.workspace.id, tx);
    if (isNew || existingProducts > 0) {
      assertWithinPlanLimit(plan.id, "products", existingProducts);
    }

    const created = await insertProduct(tx, {
      workspaceId: ctx.workspace.id,
      plan: plan.id,
      name: body.product.name,
      websiteUrl: body.product.websiteUrl ?? null,
      description: body.product.description ?? null,
      now,
    });
    const product = autofile
      ? ((
          await tx
            .update(products)
            .set({
              autofileTarget: autofile.target,
              autofileThreshold: autofile.threshold,
              autofileEnabled: autofile.enabled,
            })
            .where(eq(products.id, created.id))
            .returning()
        )[0] ?? created)
      : created;

    const inserted =
      toInsert.length > 0
        ? await tx
            .insert(sources)
            .values(
              toInsert.map((s) => ({
                workspaceId: ctx.workspace.id,
                productId: product.id,
                kind: s.kind,
                config: s.config,
                label: s.label,
                role: s.role,
                competitorName: s.competitorName,
                enabled: s.enabled,
              })),
            )
            .returning()
        : [];

    if (!isNew) {
      const workspaceValues: Partial<typeof workspaces.$inferInsert> = {
        onboardingAnswers: answers,
        timezone: body.notifications.timezone,
      };
      // The personal workspace takes the product's name on first setup ("We use this to name your workspace").
      if (firstOnboarding && ctx.role === "owner" && existingProducts === 0) {
        workspaceValues.name = body.product.name;
      }
      await tx.update(workspaces).set(workspaceValues).where(eq(workspaces.id, ctx.workspace.id));
      await tx
        .update(workspaceMembers)
        .set({ notifyDigest: body.notifications.digest, alertMode: body.notifications.alerts })
        .where(and(eq(workspaceMembers.workspaceId, ctx.workspace.id), eq(workspaceMembers.userId, ctx.user.id)));
    }

    if (!ctx.user.onboardedAt) {
      await tx.update(users).set({ onboardedAt: now }).where(eq(users.id, ctx.user.id));
    }

    return { product, inserted };
  });

  const res = NextResponse.json(
    { productId: product.id, sources: inserted.map(toSourceDTO), skipped },
    { status: 201 },
  );
  res.cookies.set(ACTIVE_PRODUCT_COOKIE, product.id, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
});
