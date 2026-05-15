"use client";
import { useState } from "react";
import { DEMO_DATA } from "@/lib/demo-data";
import type { Source } from "@/lib/types";

type Mode = "paste" | "appstore";

export function InputPanel({
  text,
  setText,
  onAnalyze,
  disabled,
  onLinesTagged,
}: {
  text: string;
  setText: (s: string) => void;
  onAnalyze: () => void;
  disabled: boolean;
  onLinesTagged?: (lines: string[], source: Source) => void;
}) {
  const [mode, setMode] = useState<Mode>("paste");
  const [appStoreInput, setAppStoreInput] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchStatus, setFetchStatus] = useState<string | null>(null);

  const complaintCount = text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;

  const fetchReviews = async () => {
    setFetching(true);
    setFetchError(null);
    setFetchStatus(null);
    try {
      const r = await fetch("/api/fetch-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: appStoreInput }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        reviews?: string[];
        totalFetched?: number;
        sourceLabel?: string;
        source?: string;
        sourceCode?: Source;
        error?: string;
      };
      if (!r.ok) throw new Error(data.error ?? "Fetch failed");
      if (!data.reviews || data.reviews.length === 0) {
        throw new Error("No reviews returned");
      }
      setText(data.reviews.join("\n"));
      if (onLinesTagged && data.sourceCode) {
        onLinesTagged(data.reviews, data.sourceCode);
      }
      setFetchStatus(
        `Fetched ${data.totalFetched} items from ${data.sourceLabel ?? "source"}${
          data.source === "appstore" ? " · 1-3 star reviews only" : ""
        }`
      );
      setMode("paste");
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setFetching(false);
    }
  };

  const tabBase =
    "rounded-md px-3 py-1.5 text-sm font-medium transition border";
  const tabActive = "border-white/20 bg-white/10 text-white";
  const tabIdle = "border-transparent bg-transparent text-white/50 hover:text-white/80";

  return (
    <section className="space-y-6">
      <div className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
        <button
          type="button"
          onClick={() => setMode("paste")}
          className={`${tabBase} ${mode === "paste" ? tabActive : tabIdle}`}
        >
          Paste Text
        </button>
        <button
          type="button"
          onClick={() => setMode("appstore")}
          className={`${tabBase} ${mode === "appstore" ? tabActive : tabIdle}`}
        >
          Fetch from URL
        </button>
      </div>

      {mode === "appstore" && (
        <div className="space-y-3 rounded-xl border border-white/10 bg-[#111113] p-4">
          <label className="block text-sm font-medium text-white/80">
            Paste any supported URL
          </label>
          <input
            type="text"
            value={appStoreInput}
            onChange={(e) => setAppStoreInput(e.target.value)}
            placeholder="App Store · Reddit thread/subreddit · Hacker News thread"
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20"
            disabled={fetching}
            onKeyDown={(e) => {
              if (e.key === "Enter" && appStoreInput.trim() && !fetching) {
                fetchReviews();
              }
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={fetchReviews}
              disabled={fetching || appStoreInput.trim().length === 0}
              className="rounded-md bg-indigo-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {fetching ? "Fetching..." : "Fetch Reviews →"}
            </button>
            <span className="text-xs text-white/40">Up to 50 items per fetch.</span>
          </div>
          <div className="space-y-1 text-[11px] leading-snug text-white/40">
            <div>
              <span className="text-white/60">App Store:</span> apps.apple.com/in/app/zomato/id434023307 — 1-3★ reviews
            </div>
            <div>
              <span className="text-white/60">Reddit:</span> reddit.com/r/sub or full thread URL — posts + top comments
            </div>
            <div>
              <span className="text-white/60">Hacker News:</span> news.ycombinator.com/item?id=… — full thread comments
            </div>
          </div>
          {fetchError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-200">
              {fetchError}
            </div>
          )}
        </div>
      )}

      <div className="group relative">
        {/* Animated gradient halo on focus-within */}
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition duration-500 group-focus-within:opacity-100"
          style={{
            background:
              "linear-gradient(120deg, rgba(99,102,241,0.55), rgba(168,85,247,0.45), rgba(245,158,11,0.45))",
            filter: "blur(14px)",
            zIndex: -1,
          }}
        />
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (fetchStatus) setFetchStatus(null);
          }}
          placeholder="Paste complaints here... App Store reviews, support tickets, angry tweets — anything works."
          className="relative min-h-[200px] w-full resize-y rounded-xl border border-white/10 bg-[#111113]/95 p-4 text-sm text-white placeholder-white/30 outline-none ring-0 backdrop-blur transition focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/25"
        />
      </div>

      {fetchStatus && (
        <div className="-mt-3 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {fetchStatus}
        </div>
      )}

      {text.trim().length > 0 && (
        <div className="-mt-3 text-xs text-white/50">
          {complaintCount} complaint{complaintCount === 1 ? "" : "s"} detected
          {complaintCount < 5 && complaintCount > 0 && (
            <span className="ml-2 text-amber-300/80">
              · Add more complaints for better clustering (min 5 recommended)
            </span>
          )}
          {complaintCount > 100 && (
            <span className="ml-2 text-amber-300/80">
              · Large batch detected — analysis may take 15-20 seconds
            </span>
          )}
          {complaintCount >= 5 && complaintCount <= 100 && (
            <span className="ml-2 text-white/40">· Ready to analyze</span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-white/40">Try a demo:</span>
        {(Object.keys(DEMO_DATA) as Array<keyof typeof DEMO_DATA>).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setText(DEMO_DATA[k].complaints);
              setFetchStatus(null);
            }}
            className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/80 transition hover:bg-white/10"
          >
            {DEMO_DATA[k].label}
          </button>
        ))}
      </div>

      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onAnalyze}
          disabled={disabled || text.trim().length === 0}
          className="group relative inline-flex cursor-pointer items-center gap-2 overflow-hidden rounded-lg bg-gradient-to-b from-indigo-400 via-indigo-500 to-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-[0_8px_28px_-8px_rgba(99,102,241,0.7)] transition hover:scale-[1.02] hover:shadow-[0_12px_36px_-8px_rgba(99,102,241,0.85)] active:scale-95 disabled:cursor-not-allowed disabled:from-white/10 disabled:via-white/10 disabled:to-white/10 disabled:text-white/40 disabled:shadow-none disabled:hover:scale-100"
        >
          {/* Glow halo behind button */}
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-1 -z-10 rounded-lg bg-gradient-to-r from-indigo-400/50 via-purple-400/50 to-amber-300/40 opacity-0 blur-xl transition duration-500 group-hover:opacity-100 group-disabled:opacity-0"
          />
          {/* Diagonal shimmer sweep */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full group-disabled:hidden"
          />
          <span className="relative">Analyze Complaints</span>
          <span
            aria-hidden
            className="relative transition-transform duration-300 group-hover:translate-x-1"
          >
            →
          </span>
        </button>
        <span className="text-xs text-white/40">
          No data stored · runs in seconds
        </span>
      </div>
    </section>
  );
}
