"use client";

import * as React from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { cn } from "@/lib/utils";
import { hasFeature, minimumPlanFor, type FeatureKey, type PlanId } from "@/lib/plans";
import { featureGateMessage, type PaidPlanId } from "./copy";
import { useUpgradeDialog } from "./UpgradeDialog";

export interface PaywallGateProps {
  feature: FeatureKey;
  plan: PlanId;
  children: React.ReactNode;
  /** Rendered instead of the default locked state, in any mode. */
  fallback?: React.ReactNode;
  /** replace (default): a callout instead of the children. overlay: children dimmed and inert under a panel. inline: a one-line note. */
  mode?: "replace" | "overlay" | "inline";
  title?: string;
  description?: string;
  className?: string;
}

function requiredFor(feature: FeatureKey): PaidPlanId {
  const plan = minimumPlanFor(feature);
  return plan === "free" ? "pro" : plan;
}

/**
 * Shows `children` when the plan includes `feature`; otherwise a factual
 * locked state with an "Upgrade" action that opens UpgradeDialog. The server
 * still enforces the gate; this only saves people a failed request.
 */
export function PaywallGate({
  feature,
  plan,
  children,
  fallback,
  mode = "replace",
  title,
  description,
  className,
}: PaywallGateProps) {
  const upgrade = useUpgradeDialog();
  const inertRef = React.useRef<HTMLDivElement>(null);
  const allowed = hasFeature(plan, feature);

  // React 18 does not type `inert`; set it on the node so the dimmed content is skipped by keyboard and screen readers.
  React.useEffect(() => {
    const node = inertRef.current;
    if (!node) return;
    node.setAttribute("inert", "");
    return () => node.removeAttribute("inert");
  }, [allowed, mode]);

  if (allowed) return <>{children}</>;
  if (fallback !== undefined) return <>{fallback}</>;

  const requiredPlan = requiredFor(feature);
  const heading = title ?? featureGateMessage(feature);
  const openDialog = () => upgrade.open({ feature, requiredPlan, reason: description ?? featureGateMessage(feature) });

  if (mode === "inline") {
    return (
      <p className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted", className)}>
        <Lock aria-hidden className="size-3.5 shrink-0" />
        <span>{description ?? heading}</span>
        <Button variant="link" size="sm" onClick={openDialog}>
          Upgrade
        </Button>
        {upgrade.dialog}
      </p>
    );
  }

  if (mode === "overlay") {
    return (
      <div className={cn("relative", className)}>
        <div
          ref={inertRef}
          aria-hidden
          className="pointer-events-none select-none opacity-40 saturate-50 motion-safe:transition-opacity"
        >
          {children}
        </div>
        <div className="absolute inset-x-0 top-0 flex justify-center p-3 sm:p-6">
          <div
            role="group"
            aria-label={heading}
            className="w-full max-w-[420px] rounded-lg border border-line bg-surface p-4 shadow-md"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
                <Lock aria-hidden className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium text-ink">{heading}</p>
                {description ? <p className="text-sm text-ink-secondary">{description}</p> : null}
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button variant="primary" size="sm" onClick={openDialog}>
                Upgrade
              </Button>
            </div>
          </div>
        </div>
        {upgrade.dialog}
      </div>
    );
  }

  return (
    <div className={className}>
      <Callout
        tone="brand"
        icon={Lock}
        title={heading}
        action={
          <Button variant="primary" size="sm" onClick={openDialog}>
            Upgrade
          </Button>
        }
      >
        {description ?? null}
      </Callout>
      {upgrade.dialog}
    </div>
  );
}
