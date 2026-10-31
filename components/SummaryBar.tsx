import type { AnalysisDiff, Issue } from "@/lib/types";
import { Stat, StatGroup } from "@/components/ui/stat";
import { formatNumber, formatRelativeTime, pluralize } from "@/lib/utils";
import { sprintEstimate } from "@/components/app/analyzer";
import { TrendBadge } from "./Badges";

/**
 * The analyzer's headline numbers, then what changed since the previous
 * analysis in this browser.
 */
export function SummaryBar({ issues, diff }: { issues: Issue[]; diff: AnalysisDiff | null }) {
  const totalComplaints = issues.reduce((sum, i) => sum + (i.frequency || 0), 0);
  const fixNow = issues.filter((i) => i.recommended_action === "fix_now").length;
  const investigate = issues.filter((i) => i.recommended_action === "investigate").length;
  const sprints = sprintEstimate(issues);

  const counts = {
    new: diff?.perIssue.filter((d) => d.category === "new").length ?? 0,
    worsened: diff?.perIssue.filter((d) => d.category === "worsened").length ?? 0,
    improved: diff?.perIssue.filter((d) => d.category === "improved").length ?? 0,
    resolved: diff?.resolved.length ?? 0,
  };
  const anyChange = counts.new + counts.worsened + counts.improved + counts.resolved > 0;

  return (
    <div className="space-y-3">
      <StatGroup>
        <Stat label="Complaints grouped" value={formatNumber(totalComplaints)} />
        <Stat label="Issues found" value={formatNumber(issues.length)} />
        <Stat
          label="Fix now"
          value={formatNumber(fixNow)}
          hint={investigate > 0 ? `${pluralize(investigate, "more")} to investigate` : undefined}
        />
        <Stat
          label="Rough effort"
          value={sprints > 0 ? pluralize(sprints, "sprint") : "None"}
          hint={sprints > 0 ? "To clear fix-now and investigate" : "Nothing urgent"}
        />
      </StatGroup>

      {diff && anyChange ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ink-muted">Compared with your analysis {formatRelativeTime(diff.priorRunDate)}:</span>
          {counts.new > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <TrendBadge trend="new" size="sm" />
              <span className="tabular-nums text-ink-secondary">{counts.new}</span>
            </span>
          ) : null}
          {counts.worsened > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <TrendBadge trend="worsened" size="sm" />
              <span className="tabular-nums text-ink-secondary">{counts.worsened}</span>
            </span>
          ) : null}
          {counts.improved > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <TrendBadge trend="improved" size="sm" />
              <span className="tabular-nums text-ink-secondary">{counts.improved}</span>
            </span>
          ) : null}
          {counts.resolved > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <TrendBadge trend="resolved" size="sm" />
              <span className="tabular-nums text-ink-secondary">{counts.resolved}</span>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
