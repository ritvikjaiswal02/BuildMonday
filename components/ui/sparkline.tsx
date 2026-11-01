import * as React from "react";
import { cn } from "@/lib/utils";

export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  "aria-label": string;
}

/** Points for a polyline fitted into width x height with 2 px padding. Exported for tests. */
export function sparklinePoints(values: number[], width: number, height: number): Array<[number, number]> {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return [];
  const pad = 2;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = max - min || 1;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const step = clean.length > 1 ? innerW / (clean.length - 1) : 0;
  return clean.map((v, i) => {
    const x = clean.length > 1 ? pad + i * step : width / 2;
    // Flat series sit on the middle line rather than the floor.
    const y = max === min ? height / 2 : pad + innerH - ((v - min) / range) * innerH;
    return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
  });
}

/** Tiny trend line in `currentColor`; the last point is marked with a dot. */
export function Sparkline({
  values,
  width = 64,
  height = 20,
  className,
  "aria-label": ariaLabel,
}: SparklineProps) {
  const points = sparklinePoints(values, width, height);
  const last = points[points.length - 1];
  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("shrink-0 overflow-visible text-brand", className)}
    >
      {points.length > 1 ? (
        <polyline
          points={points.map(([x, y]) => `${x},${y}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
      {last ? <circle cx={last[0]} cy={last[1]} r={2.25} fill="currentColor" /> : null}
    </svg>
  );
}
