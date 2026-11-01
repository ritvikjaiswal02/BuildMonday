"use client";

import * as React from "react";
import { useUpgradeDialog } from "@/components/billing";
import { toast } from "@/components/ui/toast";
import { ApiError, errorMessage } from "./api";

/**
 * One handler for failed API calls in app pages: plan errors (402) open the
 * upgrade dialog, everything else becomes an error toast. Render `dialog` once.
 */
export function useApiErrorHandler() {
  const upgrade = useUpgradeDialog();
  const { open } = upgrade;

  const handle = React.useCallback(
    (err: unknown, fallback?: string) => {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (err instanceof ApiError && err.plan) {
        const requiredPlan = err.plan.requiredPlan === "free" ? "pro" : err.plan.requiredPlan;
        open({
          feature: err.plan.feature,
          limit: err.plan.limit,
          requiredPlan,
          reason: err.plan.error,
        });
        return;
      }
      toast.error(errorMessage(err, fallback));
    },
    [open],
  );

  return { handle, dialog: upgrade.dialog, openUpgrade: open };
}
