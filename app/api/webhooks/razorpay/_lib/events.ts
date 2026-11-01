import "server-only";

import { eq } from "drizzle-orm";
import { sha256Hex } from "@/lib/auth/crypto";
import { db } from "@/lib/db";
import { billingEvents, type SubscriptionStatus } from "@/lib/db/schema";
import { fetchSubscription, type RazorpaySubscription } from "@/lib/billing/razorpay";
import { cancelReplacedSubscriptions, enforcePlanLimits, mapRazorpayStatus, syncSubscription } from "@/lib/billing/sync";

/** Subscription events we act on. Everything else is acknowledged and stored. */
export const SUBSCRIPTION_EVENTS = [
  "subscription.authenticated",
  "subscription.activated",
  "subscription.charged",
  "subscription.pending",
  "subscription.halted",
  "subscription.cancelled",
  "subscription.completed",
  "subscription.updated",
] as const;
export type SubscriptionEvent = (typeof SUBSCRIPTION_EVENTS)[number];

export interface RazorpayWebhookBody {
  event: string;
  created_at?: number;
  payload?: {
    subscription?: { entity?: Partial<RazorpaySubscription> & { id?: string } };
    payment?: { entity?: { id?: string; status?: string; error_description?: string | null; subscription_id?: string | null } };
  };
}

export function isSubscriptionEvent(event: string): event is SubscriptionEvent {
  return (SUBSCRIPTION_EVENTS as readonly string[]).includes(event);
}

/**
 * The status an event implies. Used only when the live subscription cannot be
 * fetched from Razorpay; otherwise the live status wins (events can arrive out
 * of order).
 */
export function statusForEvent(event: SubscriptionEvent, entityStatus: string | undefined): SubscriptionStatus {
  switch (event) {
    case "subscription.authenticated":
      return "authenticated";
    case "subscription.activated":
    case "subscription.charged":
      return "active";
    case "subscription.pending":
      return "past_due";
    case "subscription.halted":
      return "halted";
    case "subscription.cancelled":
      return "cancelled";
    case "subscription.completed":
      return "completed";
    case "subscription.updated":
      return mapRazorpayStatus(entityStatus ?? "");
  }
}

/** Razorpay sends X-Razorpay-Event-Id; fall back to a hash of the body so retries still dedupe. */
export function eventIdFor(headerValue: string | null, rawBody: string): string {
  const id = headerValue?.trim();
  if (id && id.length <= 128) return id;
  return `body_${sha256Hex(rawBody)}`;
}

/** Normalises a payload entity into the RazorpaySubscription shape sync expects. */
export function entityToSubscription(entity: Partial<RazorpaySubscription> & { id?: string }): RazorpaySubscription | null {
  if (!entity.id || typeof entity.id !== "string") return null;
  return {
    id: entity.id,
    plan_id: typeof entity.plan_id === "string" ? entity.plan_id : "",
    status: typeof entity.status === "string" ? entity.status : "created",
    current_start: typeof entity.current_start === "number" ? entity.current_start : null,
    current_end: typeof entity.current_end === "number" ? entity.current_end : null,
    charge_at: typeof entity.charge_at === "number" ? entity.charge_at : null,
    total_count: typeof entity.total_count === "number" ? entity.total_count : 0,
    paid_count: typeof entity.paid_count === "number" ? entity.paid_count : 0,
    short_url: typeof entity.short_url === "string" ? entity.short_url : undefined,
    notes: entity.notes && typeof entity.notes === "object" && !Array.isArray(entity.notes) ? entity.notes : {},
  };
}

export type ClaimResult = { state: "new" | "retry" } | { state: "duplicate" };

/**
 * Records the event. A second delivery of an event we already processed is a
 * duplicate; one whose earlier processing failed (no processedAt) is retried.
 */
export async function claimEvent(args: { eventId: string; type: string; payload: unknown }): Promise<ClaimResult> {
  const inserted = await db
    .insert(billingEvents)
    .values({ eventId: args.eventId, type: args.type, payload: args.payload as object })
    .onConflictDoNothing({ target: billingEvents.eventId })
    .returning({ id: billingEvents.id });
  if (inserted.length > 0) return { state: "new" };

  const [existing] = await db
    .select({ processedAt: billingEvents.processedAt })
    .from(billingEvents)
    .where(eq(billingEvents.eventId, args.eventId))
    .limit(1);
  return existing?.processedAt ? { state: "duplicate" } : { state: "retry" };
}

export async function markProcessed(eventId: string, workspaceId: string | null): Promise<void> {
  await db
    .update(billingEvents)
    .set({ processedAt: new Date(), ...(workspaceId ? { workspaceId } : {}) })
    .where(eq(billingEvents.eventId, eventId));
}

/**
 * Applies one verified webhook event. Returns the workspace it touched, or
 * null for events that change nothing (payment.failed, unknown events,
 * subscriptions we cannot tie to a workspace). Throws on database or Razorpay
 * failures so the route answers 500 and Razorpay retries.
 */
export async function processEvent(body: RazorpayWebhookBody): Promise<string | null> {
  const event = body.event;

  if (event === "payment.failed") {
    const payment = body.payload?.payment?.entity;
    console.warn(
      `[billing] payment failed${payment?.id ? ` ${payment.id}` : ""}${
        payment?.subscription_id ? ` for ${payment.subscription_id}` : ""
      }: ${payment?.error_description ?? "no reason given"}`,
    );
    return null;
  }

  if (!isSubscriptionEvent(event)) return null;

  const entity = body.payload?.subscription?.entity;
  const fromPayload = entity ? entityToSubscription(entity) : null;
  if (!fromPayload) {
    console.warn(`[billing] ${event} without a subscription entity; ignoring`);
    return null;
  }

  // Prefer Razorpay's current view: webhooks can arrive late or out of order.
  let live: RazorpaySubscription | null = null;
  try {
    live = await fetchSubscription(fromPayload.id);
  } catch (err) {
    console.warn(`[billing] could not fetch ${fromPayload.id}; using the webhook payload`, err);
  }

  const paymentId = body.payload?.payment?.entity?.id;
  const synced = await syncSubscription(
    live ?? fromPayload,
    {
      ...(paymentId ? { paymentId } : {}),
      ...(live ? {} : { eventStatus: statusForEvent(event, fromPayload.status) }),
    },
  );
  if (!synced) return null;

  // A paid subscription that now owns the workspace replaces any other live
  // one. This runs here too (not only in Checkout's verify call) so a customer
  // who pays and closes the tab is never charged for two plans. A failure
  // throws, the route answers 500 and Razorpay retries the event.
  if (synced.owns && (synced.status === "active" || synced.status === "authenticated")) {
    await cancelReplacedSubscriptions(synced.workspaceId, (live ?? fromPayload).id);
  }

  await enforcePlanLimits(synced.workspaceId);
  return synced.workspaceId;
}
