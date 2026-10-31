import type { ReactNode } from "react";
import { CircleDot, ExternalLink, Mail, Tag } from "lucide-react";
import { LinearGlyph, SlackGlyph, SourceGlyph, sourceKindLabel } from "@/components/brand/logos";
import { LogoMark } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { PriorityMeter } from "@/components/ui/meter";
import { cn } from "@/lib/utils";
import { EXAMPLE_ISSUES, EXAMPLE_PRODUCT, EXAMPLE_WEEK_TOTAL } from "./example-data";
import { TrendBadge } from "./TrendBadge";

const TOP = EXAMPLE_ISSUES[0];
const SECOND = EXAMPLE_ISSUES[1];

function ExcerptFrame({
  label,
  icon,
  children,
  className,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <figure className={cn("overflow-hidden rounded-xl border border-line bg-surface shadow-md", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line bg-sunken/60 px-4 py-2.5">
        <span className="inline-flex min-w-0 items-center gap-2 text-xs font-medium text-ink-secondary">
          {icon}
          <span className="truncate">{label}</span>
        </span>
        <Badge tone="neutral" variant="outline" size="sm">
          Example
        </Badge>
      </div>
      {children}
    </figure>
  );
}

/** A Slack alert as BuildMonday posts it through an incoming webhook. */
export function SlackAlertExcerpt() {
  return (
    <ExcerptFrame label="#product-feedback in Slack" icon={<SlackGlyph className="size-3.5" />}>
      <div className="flex gap-3 p-4 sm:p-5">
        <LogoMark size={36} className="rounded-md" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-semibold text-ink">BuildMonday</span>
            <span className="text-xs text-ink-muted">9:12</span>
          </p>
          <p className="mt-1 text-sm font-medium text-ink">New issue in {EXAMPLE_PRODUCT}: {SECOND.title}</p>
          <div className="mt-3 rounded-md border-l-2 border-brand bg-sunken px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <TrendBadge trend={SECOND.trend} />
              <span className="text-xs tabular-nums text-ink-muted">{SECOND.mentions} mentions</span>
              <span className="text-xs tabular-nums text-ink-muted">Priority {SECOND.priority}</span>
            </div>
            <blockquote className="mt-2 text-sm text-ink-secondary">&ldquo;{SECOND.quote}&rdquo;</blockquote>
          </div>
          <span className="mt-3 inline-flex h-7 items-center rounded border border-line-strong bg-surface px-2.5 text-xs font-medium text-ink">
            View in BuildMonday
          </span>
        </div>
      </div>
    </ExcerptFrame>
  );
}

/** An issue auto-filed to Linear once it crossed the priority threshold. */
export function LinearIssueExcerpt() {
  return (
    <ExcerptFrame label="Filed to Linear automatically" icon={<LinearGlyph className="size-3.5" />}>
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
          <span className="font-mono">ACN-214</span>
          <span className="inline-flex items-center gap-1">
            <CircleDot aria-hidden className="size-3.5 text-ink-muted" />
            Todo
          </span>
          <span className="inline-flex items-center gap-1">
            <Tag aria-hidden className="size-3.5" />
            customer-feedback
          </span>
        </div>
        <p className="mt-2 font-display text-lg font-semibold leading-6 text-ink">{TOP.title}</p>
        <div className="mt-3 space-y-2 text-sm text-ink-secondary">
          <p>
            Reported {TOP.mentions} times in the last 30 days across{" "}
            {TOP.sources.map((s) => sourceKindLabel(s)).join(", ")}. Priority {TOP.priority} of 100, getting worse.
          </p>
          <p className="text-xs font-medium text-ink-muted">Evidence</p>
          <blockquote className="border-l-2 border-line-strong pl-3">&ldquo;{TOP.quote}&rdquo;</blockquote>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs text-ink-muted">
          <span>Filed by BuildMonday when priority passed 80</span>
          <span className="inline-flex items-center gap-1 text-brand">
            <ExternalLink aria-hidden className="size-3.5" />
            Open the issue in BuildMonday
          </span>
        </div>
      </div>
    </ExcerptFrame>
  );
}

/** The Monday email, condensed. */
export function DigestEmailExcerpt() {
  const top = EXAMPLE_ISSUES.slice(0, 3);
  return (
    <ExcerptFrame label="Monday morning in your inbox" icon={<Mail aria-hidden className="size-3.5" />}>
      <div className="p-4 sm:p-5">
        <p className="text-xs text-ink-muted">Subject</p>
        <p className="mt-0.5 text-sm font-medium text-ink">
          Your Monday list for {EXAMPLE_PRODUCT}: 2 new, 1 worse
        </p>

        <p className="mt-5 text-xs font-medium text-ink-muted">Top issues this week</p>
        <ol className="mt-2 divide-y divide-line rounded-md border border-line">
          {top.map((issue) => (
            <li key={issue.id} className="flex items-center gap-3 px-3 py-2.5">
              <span
                className={cn(
                  "w-5 shrink-0 font-display text-base font-semibold tabular-nums",
                  issue.rank <= 3 ? "text-brand" : "text-ink",
                )}
              >
                {issue.rank}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{issue.title}</span>
              <span className="hidden sm:inline-flex">
                <TrendBadge trend={issue.trend} />
              </span>
              <PriorityMeter score={issue.priority} className="hidden min-[420px]:inline-flex" />
            </li>
          ))}
        </ol>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-md bg-success-soft px-3 py-2.5">
            <p className="text-xs font-medium text-success-ink">Resolved</p>
            <p className="mt-0.5 text-sm text-ink">Login loop on iPad after updating</p>
          </div>
          <div className="rounded-md bg-sunken px-3 py-2.5">
            <p className="text-xs font-medium text-ink-muted">Feedback this week</p>
            <p className="mt-0.5 flex items-center gap-2 text-sm text-ink">
              <span className="tabular-nums">{EXAMPLE_WEEK_TOTAL} items from</span>
              {["appstore", "playstore", "reddit", "widget"].map((k) => (
                <SourceGlyph key={k} kind={k} className="size-3.5 text-ink-muted" title={sourceKindLabel(k)} />
              ))}
            </p>
          </div>
        </div>

        <span className="mt-5 inline-flex h-9 items-center rounded-md bg-brand px-3.5 text-sm font-medium text-on-brand">
          Open your list
        </span>
      </div>
    </ExcerptFrame>
  );
}
