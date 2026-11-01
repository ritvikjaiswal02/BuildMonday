"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PLANS, type PlanId } from "@/lib/plans";

export interface PlanBadgeProps {
  plan: PlanId;
  size?: "sm" | "md";
  className?: string;
}

/** Free: neutral outline. Pro: brand soft. Team: ink solid. The text is always the plan name. */
export function PlanBadge({ plan, size = "md", className }: PlanBadgeProps) {
  const id: PlanId = PLANS[plan] ? plan : "free";
  const name = PLANS[id].name;
  if (id === "pro") {
    return (
      <Badge tone="brand" variant="soft" size={size} className={className}>
        {name}
      </Badge>
    );
  }
  if (id === "team") {
    return (
      <Badge tone="neutral" variant="solid" size={size} className={className}>
        {name}
      </Badge>
    );
  }
  return (
    <Badge tone="neutral" variant="outline" size={size} className={cn(className)}>
      {name}
    </Badge>
  );
}
