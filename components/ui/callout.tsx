import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  OctagonAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type CalloutTone = "neutral" | "brand" | "success" | "warning" | "danger";

export interface CalloutProps {
  tone?: CalloutTone;
  title?: string;
  children?: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}

const TONES: Record<CalloutTone, { box: string; icon: string; title: string; Icon: LucideIcon }> = {
  neutral: { box: "border-line bg-sunken", icon: "text-ink-muted", title: "text-ink", Icon: Info },
  brand: { box: "border-brand/25 bg-brand-soft", icon: "text-brand", title: "text-brand-ink", Icon: Info },
  success: {
    box: "border-success/25 bg-success-soft",
    icon: "text-success",
    title: "text-success-ink",
    Icon: CheckCircle2,
  },
  warning: {
    box: "border-warning/25 bg-warning-soft",
    icon: "text-warning",
    title: "text-warning-ink",
    Icon: AlertTriangle,
  },
  danger: {
    box: "border-danger/25 bg-danger-soft",
    icon: "text-danger",
    title: "text-danger-ink",
    Icon: OctagonAlert,
  },
};

/** Inline notice for errors, quota banners and plan gates. Danger callouts are announced (role="alert"). */
export function Callout({ tone = "neutral", title, children, icon, action, className }: CalloutProps) {
  const t = TONES[tone];
  const Icon = icon ?? t.Icon;
  return (
    <div
      role={tone === "danger" ? "alert" : undefined}
      className={cn(
        "flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-start",
        t.box,
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", t.icon)} />
        <div className="min-w-0 flex-1 space-y-0.5">
          {title ? <p className={cn("font-medium", t.title)}>{title}</p> : null}
          {children ? <div className="text-ink-secondary">{children}</div> : null}
        </div>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2 pl-7 sm:pl-0">{action}</div> : null}
    </div>
  );
}
