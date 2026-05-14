"use client";
import { useEffect, useRef, useState } from "react";
import type { Issue } from "@/lib/types";

interface ChatMessage {
  role: "user" | "model";
  content: string;
}

const SUGGESTIONS = [
  "What's the #1 thing engineering should fix this week?",
  "Which clusters look like Pro / power-user complaints?",
  "Are any of these issues likely caused by the same root cause?",
  "Summarize the riskiest churn signals in 3 bullets.",
];

export function ChatPanel({ issues }: { issues: Issue[] }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async (rawText: string) => {
    const userText = rawText.trim();
    if (!userText || loading) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: userText }];
    setMessages(nextMessages);
    setDraft("");
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, issues }),
      });
      const data = (await r.json().catch(() => ({}))) as { reply?: string; error?: string };
      if (!r.ok || !data.reply) throw new Error(data.error ?? "Chat failed");
      setMessages((prev) => [...prev, { role: "model", content: data.reply ?? "" }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chat failed");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setMessages([]);
    setError(null);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 flex w-full items-center justify-between rounded-xl border border-white/10 bg-[#0e0e10] px-4 py-3 text-left text-sm text-white/70 transition hover:bg-white/[0.03] hover:text-white"
      >
        <span className="flex items-center gap-2">
          <span className="text-base">✦</span>
          Ask about these issues
        </span>
        <span className="text-xs text-white/30">Gemini · grounded in your analysis</span>
      </button>
    );
  }

  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-white/10 bg-[#0e0e10]">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-white/90">
          <span className="text-base">✦</span>
          Ask about these issues
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={reset}
              className="text-xs text-white/40 hover:text-white/70"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            className="text-xs text-white/40 hover:text-white/70"
          >
            Hide
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="max-h-[420px] space-y-3 overflow-y-auto px-4 py-3"
      >
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-white/50">
              Try one of these, or ask anything about the {issues.length} clusters above.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={loading}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-8 rounded-lg bg-indigo-500/15 px-3 py-2 text-sm text-indigo-100 ring-1 ring-inset ring-indigo-500/25"
                : "mr-8 whitespace-pre-wrap rounded-lg bg-white/5 px-3 py-2 text-sm text-white/85 ring-1 ring-inset ring-white/10"
            }
          >
            {m.content}
          </div>
        ))}

        {loading && (
          <div className="mr-8 inline-flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-white/50 ring-1 ring-inset ring-white/10">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white/60" />
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white/60 [animation-delay:150ms]" />
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-white/60 [animation-delay:300ms]" />
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        )}
      </div>

      <div className="border-t border-white/5 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
            placeholder="Ask anything about these clusters..."
            rows={1}
            className="min-h-[40px] flex-1 resize-none rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/30 outline-none transition focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20"
            disabled={loading}
          />
          <button
            onClick={() => send(draft)}
            disabled={loading || draft.trim().length === 0}
            className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-white/30">
          Enter to send · Shift+Enter for newline · history kept to last 6 turns
        </p>
      </div>
    </div>
  );
}
