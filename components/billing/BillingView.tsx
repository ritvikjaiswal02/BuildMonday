"use client";

import * as React from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { Callout } from "@/components/ui/callout";
import { ConfirmDialog } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { toast } from "@/components/ui/toast";
import { PLANS, type BillingInterval, type Currency } from "@/lib/plans";
import { CurrentPlanPanel } from "./CurrentPlanPanel";
import { PlanBadge } from "./PlanBadge";
import { PlanChooser, type PlanAction } from "./PlanChooser";
import { UsagePanel } from "./UsagePanel";
import { formatBillingDate, priceLabel, type PaidPlanId } from "./copy";
import {
  RAZORPAY_CHECKOUT_SRC,
  RAZORPAY_THEME_COLOR,
  loadRazorpay,
  type RazorpayFailure,
  type RazorpaySuccess,
} from "./razorpay-checkout";
import type { BillingPreselect, BillingState, BillingUsage } from "./types";
import { invalidateBillingSnapshot } from "./use-billing-snapshot";

export interface BillingViewProps {
  workspaceName: string;
  state: BillingState;
  usage: BillingUsage;
  billingEnabled: boolean;
  canManage: boolean;
  suggestedCurrency: Currency;
  preselect: BillingPreselect;
}

interface CheckoutBody {
  subscriptionId: string;
  keyId: string;
  name: string;
  description: string;
  prefill: { email: string; name: string | null };
  notes: Record<string, string>;
}

type Phase = "idle" | "creating" | "open" | "verifying";

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    return typeof body.error === "string" && body.error ? body.error : fallback;
  } catch {
    return fallback;
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** The /billing page: current plan, usage, plan chooser and the Razorpay checkout and cancel flows. */
export function BillingView({
  workspaceName,
  state,
  usage,
  billingEnabled,
  canManage,
  suggestedCurrency,
  preselect,
}: BillingViewProps) {
  const router = useRouter();
  const chooserRef = React.useRef<HTMLElement>(null);

  const [interval, setBillingInterval] = React.useState<BillingInterval>(
    preselect.interval ?? state.interval ?? "month",
  );
  const [currency, setCurrency] = React.useState<Currency>(preselect.currency ?? state.currency ?? suggestedCurrency);
  const [pendingPlan, setPendingPlan] = React.useState<PaidPlanId | null>(null);
  const [phase, setPhaseState] = React.useState<Phase>("idle");
  const phaseRef = React.useRef<Phase>("idle");
  const setPhase = React.useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);
  const [error, setError] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<{ plan: PaidPlanId; mode: "switch" | "restart" } | null>(null);
  const [cancelOpen, setCancelOpen] = React.useState(false);

  const scrollToPlans = React.useCallback(() => {
    const node = chooserRef.current;
    if (!node) return;
    node.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    node.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }, []);

  React.useEffect(() => {
    if (preselect.plan) scrollToPlans();
  }, [preselect.plan, scrollToPlans]);

  const disabledReason = !billingEnabled
    ? "Payments are not set up on this deployment, so plans cannot be bought here yet."
    : !canManage
      ? "Only workspace owners and admins can change the plan."
      : null;

  const resetCheckout = React.useCallback(() => {
    setPendingPlan(null);
    setPhase("idle");
  }, [setPhase]);

  const verify = React.useCallback(
    async (plan: PaidPlanId, response: RazorpaySuccess) => {
      setPhase("verifying");
      try {
        const res = await fetch("/api/billing/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(response),
        });
        if (!res.ok) {
          setError(
            await readError(
              res,
              "We could not confirm the payment. If you were charged, your plan updates within a few minutes.",
            ),
          );
          return;
        }
        const body = (await res.json()) as { plan?: string; pending?: boolean };
        invalidateBillingSnapshot();
        if (body.pending) {
          toast.success("Payment received. Your plan updates in a minute.");
        } else {
          toast.success(`You are on ${PLANS[plan].name} now.`);
        }
        router.refresh();
      } catch {
        setError("We could not reach BuildMonday to confirm the payment. If you were charged, your plan updates within a few minutes.");
      } finally {
        resetCheckout();
      }
    },
    [resetCheckout, router, setPhase],
  );

  const startCheckout = React.useCallback(
    async (plan: PaidPlanId) => {
      setError(null);
      setPendingPlan(plan);
      setPhase("creating");
      try {
        const [res, Razorpay] = await Promise.all([
          fetch("/api/billing/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plan, interval, currency }),
          }),
          loadRazorpay().catch(() => null),
        ]);
        if (!res.ok) {
          setError(await readError(res, "Checkout could not start. Try again in a moment."));
          resetCheckout();
          return;
        }
        if (!Razorpay) {
          setError(
            "The payment window could not load. Check your connection, allow checkout.razorpay.com in any blocker, then try again.",
          );
          resetCheckout();
          return;
        }
        const body = (await res.json()) as CheckoutBody;
        const rzp = new Razorpay({
          key: body.keyId,
          subscription_id: body.subscriptionId,
          name: body.name,
          description: body.description,
          prefill: { email: body.prefill.email, name: body.prefill.name ?? undefined },
          notes: body.notes,
          theme: { color: RAZORPAY_THEME_COLOR },
          handler: (response) => {
            void verify(plan, response);
          },
          modal: {
            ondismiss: () => {
              // Closing the window after a successful payment leaves us verifying; only reset an abandoned checkout.
              if (phaseRef.current === "open") resetCheckout();
            },
          },
        });
        rzp.on("payment.failed", (response: RazorpayFailure) => {
          const reason = response.error?.description;
          setError(
            reason
              ? `The payment did not go through: ${reason.replace(/\.?$/, ".")} You have not been charged.`
              : "The payment did not go through. You have not been charged.",
          );
        });
        setPhase("open");
        rzp.open();
      } catch {
        setError("Checkout could not start. Check your connection and try again.");
        resetCheckout();
      }
    },
    [currency, interval, resetCheckout, setPhase, verify],
  );

  const onChoose = React.useCallback(
    (plan: PaidPlanId, action: PlanAction) => {
      if (action.kind === "current") return;
      if (action.confirm) {
        setConfirm({ plan, mode: action.confirm });
        return;
      }
      void startCheckout(plan);
    },
    [startCheckout],
  );

  const cancelSubscription = React.useCallback(async () => {
    const res = await fetch("/api/billing/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (!res.ok) {
      const message = await readError(res, "The subscription could not be cancelled. Try again in a moment.");
      toast.error(message);
      throw new Error(message);
    }
    const body = (await res.json()) as { currentPeriodEnd?: string | null };
    const end = formatBillingDate(body.currentPeriodEnd ?? state.currentPeriodEnd);
    invalidateBillingSnapshot();
    toast.success(
      end
        ? `Subscription cancelled. ${PLANS[state.plan].name} stays on until ${end}.`
        : "Subscription cancelled. Your plan stays on until the end of the paid period.",
    );
    router.refresh();
  }, [router, state.currentPeriodEnd, state.plan]);

  const currentName = PLANS[state.plan].name;
  const periodEnd = formatBillingDate(state.currentPeriodEnd);
  const lapsed = !state.isPaid && state.storedPlan !== "free";

  const liveStatus =
    phase === "creating"
      ? "Opening checkout…"
      : phase === "open"
        ? "Checkout is open in a payment window."
        : phase === "verifying"
          ? "Confirming your payment…"
          : "";

  const confirmTarget = confirm ? PLANS[confirm.plan] : null;
  const confirmPrice = confirm ? priceLabel(confirm.plan, currency, interval) : "";

  return (
    <div className="space-y-8">
      {billingEnabled && canManage ? <Script src={RAZORPAY_CHECKOUT_SRC} strategy="lazyOnload" /> : null}

      <PageHeader
        title="Billing"
        description={`Your plan, this month's usage and payments for ${workspaceName}.`}
        meta={
          <>
            <PlanBadge plan={state.plan} size="sm" />
            {state.isPaid && periodEnd ? (
              <span>{state.cancelAtPeriodEnd ? `Ends ${periodEnd}` : `Renews ${periodEnd}`}</span>
            ) : null}
          </>
        }
      />

      <p aria-live="polite" className="sr-only">
        {liveStatus}
      </p>

      {!billingEnabled ? (
        <Callout tone="warning" title="Payments are not set up on this deployment.">
          Plans and usage are shown for reference. Add the Razorpay keys and plan ids to the environment to take payments.
        </Callout>
      ) : null}

      {error ? (
        <Callout tone="danger" title="Payment problem">
          {error}
        </Callout>
      ) : null}

      {phase === "verifying" ? (
        <Callout tone="brand" title="Confirming your payment">
          Hold on while Razorpay confirms the subscription. This takes a few seconds.
        </Callout>
      ) : null}

      {state.status === "past_due" && state.isPaid ? (
        <Callout tone="danger" title="Your last payment did not go through">
          Razorpay will retry the charge on the card or UPI mandate you used. {currentName} stays on
          {periodEnd ? ` until at least ${periodEnd}` : " for now"}. To use a different payment method, restart the plan
          below.
        </Callout>
      ) : null}

      {lapsed ? (
        <Callout tone="neutral" title={`Your ${PLANS[state.storedPlan].name} subscription has ended`}>
          The workspace is on Free now. Nothing was deleted: products and sources beyond the free limits are paused until
          you upgrade again.
        </Callout>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <CurrentPlanPanel
            state={state}
            canManage={canManage}
            billingEnabled={billingEnabled}
            onCancel={() => setCancelOpen(true)}
            onChangePlan={scrollToPlans}
          />
        </div>
        <div className="lg:col-span-7">
          <UsagePanel usage={usage} />
        </div>
      </div>

      <PlanChooser
        ref={chooserRef}
        state={state}
        interval={interval}
        currency={currency}
        onIntervalChange={setBillingInterval}
        onCurrencyChange={setCurrency}
        selected={preselect.plan}
        pendingPlan={pendingPlan}
        disabled={Boolean(disabledReason) || phase === "verifying"}
        disabledReason={disabledReason}
        onChoose={onChoose}
      />

      <div className="space-y-1 border-t border-line pt-6 text-sm text-ink-muted">
        <p>Receipts are emailed by Razorpay.</p>
        <p>
          Cancel any time: you keep the plan until the end of the period you paid for, then the workspace moves to Free.
          Nothing is deleted when a plan ends.
        </p>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={
          confirm?.mode === "restart"
            ? `Start ${confirmTarget?.name ?? ""} now?`
            : confirm && confirm.plan === state.plan
              ? `Switch to ${interval === "year" ? "yearly" : "monthly"} billing?`
              : `Switch to ${confirmTarget?.name ?? ""}?`
        }
        description={
          confirm?.mode === "restart"
            ? `A new ${confirmTarget?.name ?? ""} subscription starts today at ${confirmPrice}. The rest of your current paid period is not refunded.`
            : `${confirmTarget?.name ?? ""} at ${confirmPrice} starts today. Once the payment goes through, your current ${currentName} subscription is cancelled, so you are never billed for both. Razorpay does not refund the unused part of the current period.`
        }
        confirmLabel="Continue to payment"
        cancelLabel="Not now"
        onConfirm={() => {
          const plan = confirm?.plan;
          setConfirm(null);
          if (plan) void startCheckout(plan);
        }}
      />

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        tone="danger"
        title={`Cancel your ${currentName} subscription?`}
        description={
          periodEnd
            ? `Razorpay stops charging you. You keep ${currentName} until ${periodEnd}, then the workspace moves to Free. Nothing is deleted; products and sources beyond the free limits pause.`
            : `Razorpay stops charging you. You keep ${currentName} until the end of the paid period, then the workspace moves to Free. Nothing is deleted.`
        }
        confirmLabel="Cancel subscription"
        cancelLabel={`Keep ${currentName}`}
        onConfirm={cancelSubscription}
      />
    </div>
  );
}
