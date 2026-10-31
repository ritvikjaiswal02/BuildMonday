import { ArrowDownRight, ArrowUpRight, CheckCheck, Minus, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ExampleTrend } from "./example-data";

const TRENDS = {
  new: { label: "New", tone: "brand", variant: "soft", icon: Plus },
  worsened: { label: "Worse", tone: "danger", variant: "soft", icon: ArrowUpRight },
  improved: { label: "Improving", tone: "success", variant: "soft", icon: ArrowDownRight },
  resolved: { label: "Resolved", tone: "success", variant: "outline", icon: CheckCheck },
  persistent: { label: "Steady", tone: "neutral", variant: "soft", icon: Minus },
} as const;

/** Trend label following the semantic mapping in BUILD_CONTRACTS 8.2. Always a word plus an icon. */
export function TrendBadge({ trend, size = "sm" }: { trend: ExampleTrend; size?: "sm" | "md" }) {
  const t = TRENDS[trend];
  return (
    <Badge tone={t.tone} variant={t.variant} icon={t.icon} size={size}>
      {t.label}
    </Badge>
  );
}
