import type { AnalysisDiff, Issue } from "@/lib/types";

function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const days = Math.floor((now - then) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "earlier today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

export function SummaryBar({
  issues,
  diff,
}: {
  issues: Issue[];
  diff: AnalysisDiff | null;
}) {
  const totalComplaints = issues.reduce((sum, i) => sum + (i.frequency || 0), 0);
  const clusters = issues.length;
  const fixNow = issues.filter((i) => i.recommended_action === "fix_now").length;
  const investigate = issues.filter((i) => i.recommended_action === "investigate").length;
  const monitor = issues.filter((i) => i.recommended_action === "monitor").length;
  const sprints = Math.max(1, Math.ceil(fixNow * 0.5 + investigate * 0.3));
  const hasCritical = fixNow + investigate > 0;

  const newCount = diff?.perIssue.filter((d) => d.category === "new").length ?? 0;
  const worsenedCount = diff?.perIssue.filter((d) => d.category === "worsened").length ?? 0;
  const improvedCount = diff?.perIssue.filter((d) => d.category === "improved").length ?? 0;
  const resolvedCount = diff?.resolved.length ?? 0;

  const pill =
    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset";

  return (
    <div className="mb-6 space-y-2 rounded-xl border border-white/10 bg-[#0e0e10] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${pill} bg-white/5 text-white/80 ring-white/15`}>
          <span className="font-semibold text-white">{totalComplaints}</span> complaints analyzed
        </span>
        <span className="text-white/20">·</span>
        <span className={`${pill} bg-white/5 text-white/80 ring-white/15`}>
          <span className="font-semibold text-white">{clusters}</span> clusters
        </span>
        <span className="text-white/20">·</span>
        <span className={`${pill} bg-red-500/15 text-red-200 ring-red-500/30`}>
          <span className="font-semibold">{fixNow}</span> Fix Now
        </span>
        <span className={`${pill} bg-amber-500/15 text-amber-200 ring-amber-500/30`}>
          <span className="font-semibold">{investigate}</span> Investigate
        </span>
        <span className={`${pill} bg-white/5 text-white/60 ring-white/15`}>
          <span className="font-semibold">{monitor}</span> Monitor
        </span>
        {hasCritical && (
          <span className="ml-auto text-xs text-white/50">
            ~<span className="font-semibold text-white/80">{sprints}</span> sprint{sprints === 1 ? "" : "s"} to clear critical issues
          </span>
        )}
      </div>

      {diff && (newCount + worsenedCount + improvedCount + resolvedCount > 0) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-2 text-xs">
          <span className="text-white/40">vs {relativeDate(diff.priorRunDate)}:</span>
          {newCount > 0 && (
            <span className={`${pill} bg-orange-500/15 text-orange-200 ring-orange-500/30`}>
              <span className="font-semibold">{newCount}</span> new
            </span>
          )}
          {worsenedCount > 0 && (
            <span className={`${pill} bg-red-500/15 text-red-200 ring-red-500/30`}>
              <span className="font-semibold">{worsenedCount}</span> worsened
            </span>
          )}
          {improvedCount > 0 && (
            <span className={`${pill} bg-emerald-500/15 text-emerald-200 ring-emerald-500/30`}>
              <span className="font-semibold">{improvedCount}</span> improved
            </span>
          )}
          {resolvedCount > 0 && (
            <span className={`${pill} bg-emerald-500/10 text-emerald-200/90 ring-emerald-500/25`}>
              <span className="font-semibold">{resolvedCount}</span> resolved
            </span>
          )}
        </div>
      )}
    </div>
  );
}
