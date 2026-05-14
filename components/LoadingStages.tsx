"use client";
import { useEffect, useState } from "react";

const STAGES = [
  "Reading complaints...",
  "Clustering issues...",
  "Ranking by priority...",
];

export function LoadingStages() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % STAGES.length), 2000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-3 text-sm text-white/70">
      <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-indigo-400" />
      <span>{STAGES[idx]}</span>
    </div>
  );
}
