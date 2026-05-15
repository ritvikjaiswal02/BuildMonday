"use client";
import { useEffect, useState } from "react";

const STAGES = [
  "Reading every complaint...",
  "Spotting recurring patterns...",
  "Grouping by root cause...",
  "Weighing severity signals...",
  "Tallying frequency...",
  "Cross-referencing sources...",
  "Stitching themes together...",
  "Scoring impact...",
  "Ranking by priority...",
  "Drafting your shortlist...",
  "Pulling it all together...",
  "Almost there...",
];

export function LoadingStages() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % STAGES.length), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-3 text-sm text-white/70">
      <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-indigo-400" />
      <span
        key={idx}
        className="animate-[fadeIn_400ms_ease-out] tabular-nums"
        style={{
          animationName: "lsFade",
        }}
      >
        {STAGES[idx]}
      </span>
      <style jsx>{`
        @keyframes lsFade {
          from {
            opacity: 0;
            transform: translateY(2px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
