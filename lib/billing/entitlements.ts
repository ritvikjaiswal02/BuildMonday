import "server-only";

import { and, count, eq, isNull, sql } from "drizzle-orm";
import { HttpError } from "@/lib/auth/http";
import { countSeats } from "@/lib/auth/workspace";
import { db, type DbTx } from "@/lib/db";
import {
  products,
  usageCounters,
  users,
  workspaces,
  type BillingInterval,
  type Currency,
  type PlanId,
  type SubscriptionStatus,
  type Workspace,
} from "@/lib/db/schema";
import {
  FEATURE_LABELS,
  LIMIT_UNITS,
  METERED_LIMIT_KEYS,
  PLANS,
  formatLimit,
  getPlan,
  isUnlimited,
  limitFor,
  minimumPlanFor,
  plansWith,
  type FeatureKey,
  type LimitKey,
  type MeteredLimitKey,
  type Plan,
  type PlanErrorBody,
} from "@/lib/plans";

/** Paid features stay on for this long after the period ends when a payment is late or the plan was cancelled. */
export const GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;

/** Every new workspace gets Pro for this long, no card (a reverse trial). */
export const TRIAL_DAYS = 14;
export const TRIAL_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

/** The plan a reverse trial unlocks. */
export const TRIAL_PLAN: PlanId = "pro";

export interface WorkspacePlanState {
  plan: Plan;
  /** "trialing" while the workspace is on the free Pro trial and has not paid. */
  status: SubscriptionStatus | "trialing";
  interval: BillingInterval | null;
  currency: Currency | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  isPaid: boolean;
  /** End of the Pro trial while it is running, else null. */
  trialEndsAt: Date | null;
}

/** Whole days left in a trial, rounded up (1 on its last day); 0 when it has ended. */
export function trialDaysLeft(trialEndsAt: Date | null, now: Date = new Date()): number {
  if (!trialEndsAt) return 0;
  const ms = trialEndsAt.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/** 402 error for plan gates; its body follows PlanErrorBody. */
export class PlanError extends HttpError {
  constructor(code: "plan_required" | "limit_reached", message: string, extra: Omit<PlanErrorBody, "error" | "code">) {
    super(402, code, message, extra as Record<string, unknown>);
    this.name = "PlanError";
  }
}

type PlanFields = Pick<
  Workspace,
  "plan" | "planStatus" | "planInterval" | "planCurrency" | "currentPeriodEnd" | "cancelAtPeriodEnd"
> & { trialEndsAt?: Date | null };

/**
 * Pure: the plan a workspace is entitled to right now.
 * - Free stays free.
 * - active / authenticated: the paid plan.
 * - past_due, cancelled, halted, completed: the paid plan until
 *   currentPeriodEnd + 3 days, then Free.
 * - anything else (none, created): Free.
 * Wherever the result would be Free, a running reverse trial
 * (now < trialEndsAt) turns it into Pro with status "trialing".
 */
export function resolveEffectivePlan(ws: PlanFields, now: Date = new Date()): WorkspacePlanState {
  const base = {
    status: ws.planStatus,
    interval: ws.planInterval ?? null,
    currency: ws.planCurrency ?? null,
    currentPeriodEnd: ws.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: ws.cancelAtPeriodEnd,
    trialEndsAt: null,
  };
  const trialEndsAt = ws.trialEndsAt ? new Date(ws.trialEndsAt) : null;
  const free: WorkspacePlanState =
    trialEndsAt && now.getTime() < trialEndsAt.getTime()
      ? { ...base, plan: getPlan(TRIAL_PLAN), status: "trialing", isPaid: false, trialEndsAt }
      : { ...base, plan: PLANS.free, isPaid: false };
  const paidPlan = getPlan(ws.plan);
  if (paidPlan.id === "free") return free;

  const paid: WorkspacePlanState = { ...base, plan: paidPlan, isPaid: true };
  switch (ws.planStatus) {
    case "active":
    case "authenticated":
      return paid;
    case "past_due":
    case "cancelled":
    case "halted":
    case "completed": {
      if (!ws.currentPeriodEnd) return free;
      const graceEnds = new Date(ws.currentPeriodEnd).getTime() + GRACE_PERIOD_MS;
      return now.getTime() <= graceEnds ? paid : free;
    }
    default:
      return free;
  }
}

async function loadWorkspace(workspaceId: string): Promise<Workspace> {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!ws) throw new HttpError(404, "not_found", "Workspace not found.");
  return ws;
}

export async function getWorkspacePlan(workspaceId: string): Promise<WorkspacePlanState> {
  return resolveEffectivePlan(await loadWorkspace(workspaceId));
}

/** Plan of the user's active workspace (Free when there is none). */
export async function getUserPlan(userId: string): Promise<Plan> {
  const [user] = await db
    .select({ activeWorkspaceId: users.activeWorkspaceId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user?.activeWorkspaceId) return PLANS.free;
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, user.activeWorkspaceId)).limit(1);
  return ws ? resolveEffectivePlan(ws).plan : PLANS.free;
}

/** Labels that read as plural nouns take "are". */
const PLURAL_FEATURES: ReadonlySet<FeatureKey> = new Set<FeatureKey>([
  "daily_runs",
  "instant_email_alerts",
  "slack_alerts",
  "team_members",
]);

/** "Slack alerts are on Pro and Team." */
export function featureGateMessage(key: FeatureKey): string {
  const verb = PLURAL_FEATURES.has(key) ? "are" : "is";
  return `${FEATURE_LABELS[key]} ${verb} on ${plansWith(key)}.`;
}

/** "Your plan includes 3 sources per product." */
export function limitMessage(key: LimitKey, max: number): string {
  const unit = LIMIT_UNITS[key];
  const noun = max === 1 ? unit.singular : unit.plural;
  switch (key) {
    case "sources_per_product":
      return `Your plan includes ${formatLimit(max)} ${noun} per product.`;
    case "competitors":
      return max === 0
        ? "Competitor tracking is on Pro and Team."
        : `Your plan includes ${formatLimit(max)} ${noun} per product.`;
    case "seats":
      return `Your plan includes ${formatLimit(max)} ${noun}. Remove a member or a pending invite, or upgrade.`;
    case "products":
      return `Your plan includes ${formatLimit(max)} ${noun}.`;
    case "history_days":
      return `Your plan keeps ${formatLimit(max)} days of history.`;
    default:
      return `You have used all ${formatLimit(max)} ${noun} on your plan this month.`;
  }
}

export async function assertFeature(workspaceId: string, key: FeatureKey): Promise<void> {
  const state = await getWorkspacePlan(workspaceId);
  if (state.plan.features[key]) return;
  throw new PlanError("plan_required", featureGateMessage(key), {
    feature: key,
    requiredPlan: minimumPlanFor(key),
  });
}

/** Pure form of assertWithinLimit for callers that already loaded the plan (inside a lock). */
export function assertWithinPlanLimit(planId: PlanId, key: LimitKey, current: number, adding = 1): void {
  const max = limitFor(planId, key);
  if (isUnlimited(max)) return;
  if (current + adding <= max) return;
  throw new PlanError("limit_reached", limitMessage(key, max), {
    limit: key,
    used: current,
    max,
    requiredPlan: minimumPlanFor(key, current + adding),
  });
}

/**
 * Count limits (products, sources_per_product, competitors, seats):
 * throws limit_reached when current + adding (default 1) exceeds the plan.
 * Count-then-insert callers should do both inside withWorkspaceLimitLock.
 */
export async function assertWithinLimit(
  workspaceId: string,
  key: LimitKey,
  current: number,
  adding = 1,
): Promise<void> {
  const state = await getWorkspacePlan(workspaceId);
  assertWithinPlanLimit(state.plan.id, key, current, adding);
}

export type LimitTx = DbTx;

/**
 * Runs `fn` in a transaction holding a per-workspace advisory lock, so two
 * concurrent requests cannot both pass a count limit and then both insert
 * (a double-submitted onboarding, two tabs adding a source, two invites).
 */
export async function withWorkspaceLimitLock<T>(workspaceId: string, fn: (tx: LimitTx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`bm:limits:${workspaceId}`}))`);
    return fn(tx);
  });
}

/** "2026-11" for the UTC month of `date`. */
export function currentPeriod(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function getUsage(workspaceId: string, metric: MeteredLimitKey, period?: string): Promise<number> {
  const [row] = await db
    .select({ count: usageCounters.count })
    .from(usageCounters)
    .where(
      and(
        eq(usageCounters.workspaceId, workspaceId),
        eq(usageCounters.period, period ?? currentPeriod()),
        eq(usageCounters.metric, metric),
      ),
    )
    .limit(1);
  return row?.count ?? 0;
}

/** Pure: how much of `amount` can be granted given `used` of `max`. */
export function grantable(amount: number, used: number, max: number): number {
  if (amount <= 0) return 0;
  if (isUnlimited(max)) return amount;
  return Math.max(0, Math.min(amount, max - used));
}

/**
 * Locks the counter row for this workspace, period and metric inside a
 * transaction and runs `decide` with the current count. The row is created
 * first if missing.
 */
async function withLockedCounter<T>(
  workspaceId: string,
  metric: MeteredLimitKey,
  decide: (used: number, max: number) => { increment: number; result: T },
): Promise<T> {
  const period = currentPeriod();
  const state = await getWorkspacePlan(workspaceId);
  const max = limitFor(state.plan.id, metric);

  return db.transaction(async (tx) => {
    await tx.insert(usageCounters).values({ workspaceId, period, metric, count: 0 }).onConflictDoNothing();
    const [row] = await tx
      .select({ count: usageCounters.count })
      .from(usageCounters)
      .where(
        and(
          eq(usageCounters.workspaceId, workspaceId),
          eq(usageCounters.period, period),
          eq(usageCounters.metric, metric),
        ),
      )
      .for("update");
    const used = row?.count ?? 0;
    const { increment, result } = decide(used, max);
    if (increment > 0) {
      await tx
        .update(usageCounters)
        .set({ count: sql`${usageCounters.count} + ${increment}` })
        .where(
          and(
            eq(usageCounters.workspaceId, workspaceId),
            eq(usageCounters.period, period),
            eq(usageCounters.metric, metric),
          ),
        );
    }
    return result;
  });
}

/**
 * Atomic partial consumption: grants min(amount, remaining) and records it.
 * `allowed` is 0 when the quota is exhausted; unlimited plans get the full amount.
 * `used` is the count after this call.
 */
export async function consumeUsage(
  workspaceId: string,
  metric: MeteredLimitKey,
  amount = 1,
): Promise<{ allowed: number; used: number; max: number }> {
  return withLockedCounter(workspaceId, metric, (used, max) => {
    const allowed = grantable(amount, used, max);
    return { increment: allowed, result: { allowed, used: used + allowed, max } };
  });
}

/** All-or-nothing: records `amount` or throws limit_reached without recording anything. */
export async function assertAndConsume(workspaceId: string, metric: MeteredLimitKey, amount = 1): Promise<void> {
  type Outcome = { ok: true } | { ok: false; used: number; max: number };
  const outcome = await withLockedCounter<Outcome>(workspaceId, metric, (used, max) => {
    if (amount <= 0) return { increment: 0, result: { ok: true } };
    if (!isUnlimited(max) && used + amount > max) {
      return { increment: 0, result: { ok: false, used, max } };
    }
    return { increment: amount, result: { ok: true } };
  });
  if (!outcome.ok) {
    throw new PlanError("limit_reached", limitMessage(metric, outcome.max), {
      limit: metric,
      used: outcome.used,
      max: outcome.max,
      requiredPlan: minimumPlanFor(metric, outcome.used + amount),
    });
  }
}

export interface UsageSummary {
  period: string;
  metrics: Record<MeteredLimitKey, { used: number; max: number }>;
  counts: { products: { used: number; max: number }; seats: { used: number; max: number } };
}

export async function getUsageSummary(workspaceId: string): Promise<UsageSummary> {
  const period = currentPeriod();
  const state = await getWorkspacePlan(workspaceId);
  const planId: PlanId = state.plan.id;

  const rows = await db
    .select({ metric: usageCounters.metric, count: usageCounters.count })
    .from(usageCounters)
    .where(and(eq(usageCounters.workspaceId, workspaceId), eq(usageCounters.period, period)));
  const byMetric = new Map(rows.map((r) => [r.metric, r.count]));

  const metrics = Object.fromEntries(
    METERED_LIMIT_KEYS.map((key) => [key, { used: byMetric.get(key) ?? 0, max: limitFor(planId, key) }]),
  ) as Record<MeteredLimitKey, { used: number; max: number }>;

  const [productCount] = await db
    .select({ n: count() })
    .from(products)
    .where(and(eq(products.workspaceId, workspaceId), isNull(products.archivedAt)));
  const seats = await countSeats(workspaceId);

  return {
    period,
    metrics,
    counts: {
      products: { used: Number(productCount?.n ?? 0), max: limitFor(planId, "products") },
      seats: { used: seats, max: limitFor(planId, "seats") },
    },
  };
}
