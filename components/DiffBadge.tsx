import type { IssueDiff } from "@/lib/types";
import { TrendBadge } from "./Badges";

/**
 * Run-over-run change for an analyzer issue. Persistent issues show nothing:
 * that is the default state.
 */
export function DiffBadge({
  diff,
  currentFrequency,
  size,
}: {
  diff: IssueDiff;
  currentFrequency: number;
  size?: "sm" | "md";
}) {
  if (diff.category === "persistent") return null;
  if (diff.category === "new") return <TrendBadge trend="new" size={size} />;
  const delta = currentFrequency - (diff.priorFrequency ?? 0);
  return <TrendBadge trend={diff.category} size={size} delta={delta} />;
}
