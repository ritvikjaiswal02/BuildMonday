"use client";
import { useState } from "react";

export function AddMoreComplaints({
  onSubmit,
  disabled,
}: {
  onSubmit: (newComplaints: string) => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");

  const lineCount = draft
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0).length;

  const submit = () => {
    if (!draft.trim()) return;
    onSubmit(draft);
    setDraft("");
    setExpanded(false);
  };

  return (
    <div className="mt-6 rounded-xl border border-white/10 bg-[#0e0e10]">
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm text-white/70 transition hover:bg-white/[0.03] hover:text-white"
        >
          <span>+ Add more complaints to this analysis</span>
          <span className="text-xs text-white/30">Re-runs the full pipeline</span>
        </button>
      ) : (
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-white/80">
              Add more complaints
            </label>
            <button
              type="button"
              onClick={() => {
                setExpanded(false);
                setDraft("");
              }}
              className="text-xs text-white/40 hover:text-white/70"
            >
              Cancel
            </button>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Paste additional complaints, one per line. Will be merged with the existing batch and re-analyzed."
            className="min-h-[120px] w-full resize-y rounded-lg border border-white/10 bg-black/30 p-3 text-sm text-white placeholder-white/30 outline-none transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20"
            disabled={disabled}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-white/50">
              {lineCount} new complaint{lineCount === 1 ? "" : "s"}
              <span className="ml-2 text-amber-300/70">
                · Statuses will reset on re-analyze
              </span>
            </span>
            <button
              type="button"
              onClick={submit}
              disabled={disabled || lineCount === 0}
              className="rounded-md bg-indigo-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {disabled ? "Re-analyzing..." : "Add to Analysis →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
