import type { IssueDiff } from "@/lib/types";

const base =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset";

export function DiffBadge({
  diff,
  currentFrequency,
}: {
  diff: IssueDiff;
  currentFrequency: number;
}) {
  if (diff.category === "persistent") return null;

  if (diff.category === "new") {
    return (
      <span
        className={`${base} bg-orange-500/20 text-orange-300 ring-orange-500/40`}
        title="Cluster did not appear in the previous analysis"
      >
        New
      </span>
    );
  }

  const delta = currentFrequency - (diff.priorFrequency ?? 0);

  if (diff.category === "worsened") {
    return (
      <span
        className={`${base} bg-red-500/20 text-red-300 ring-red-500/40`}
        title={`Up from ${diff.priorFrequency ?? 0} complaints last run`}
      >
        Worsened +{delta}
      </span>
    );
  }

  return (
    <span
      className={`${base} bg-emerald-500/20 text-emerald-300 ring-emerald-500/40`}
      title={`Down from ${diff.priorFrequency ?? 0} complaints last run`}
    >
      Improved {delta}
    </span>
  );
}
