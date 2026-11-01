import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { formatNumber } from "@/lib/utils";

/** Share of a quota used, 0 to 1; 0 for unlimited (-1) or a zero max. */
export function quotaShare(used: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, used / max);
}

/**
 * Feedback quota warning, shown from 90 % of `feedback_items_per_month`.
 * At 100 % new feedback is not stored until the month resets.
 */
export function QuotaBanner({ used, max, className }: { used: number; max: number; className?: string }) {
  const share = quotaShare(used, max);
  if (share < 0.9) return null;
  const full = share >= 1;
  return (
    <Callout
      tone={full ? "danger" : "warning"}
      title={full ? "Monthly feedback limit reached" : "Close to this month's feedback limit"}
      className={className}
      action={
        <Button asChild size="sm" variant={full ? "primary" : "secondary"}>
          <Link href="/billing">See plans</Link>
        </Button>
      }
    >
      {full
        ? `All ${formatNumber(max)} feedback items for this month are used. New feedback is not saved until the 1st, and runs analyze what is already stored.`
        : `${formatNumber(used)} of ${formatNumber(max)} feedback items used this month. New feedback stops being saved at the limit.`}
    </Callout>
  );
}
