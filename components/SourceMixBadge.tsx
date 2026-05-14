import type { Source, SourceMix } from "@/lib/types";

const labels: Record<Source, string> = {
  appstore: "App Store",
  reddit: "Reddit",
  hn: "HN",
  manual: "Pasted",
};

const colors: Record<Source, string> = {
  appstore: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  reddit: "bg-orange-500/15 text-orange-300 ring-orange-500/30",
  hn: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  manual: "bg-white/10 text-white/60 ring-white/20",
};

const order: Source[] = ["appstore", "reddit", "hn", "manual"];

const pill =
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset";

export function SourceMixBadge({ mix }: { mix: SourceMix }) {
  const entries = order
    .map((s) => [s, mix[s] ?? 0] as const)
    .filter(([, n]) => n > 0);
  if (entries.length === 0) return null;
  if (entries.length === 1) {
    const [s, n] = entries[0];
    return (
      <span className={`${pill} ${colors[s]}`} title={`${n} complaint${n === 1 ? "" : "s"} from ${labels[s]}`}>
        {labels[s]} · {n}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {entries.map(([s, n]) => (
        <span
          key={s}
          className={`${pill} ${colors[s]}`}
          title={`${n} complaint${n === 1 ? "" : "s"} from ${labels[s]}`}
        >
          {labels[s]} · {n}
        </span>
      ))}
    </span>
  );
}
