"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUp, MessageSquareText, RotateCcw, X } from "lucide-react";
import type { Issue } from "@/lib/types";
import { parseLightMarkdown, type MdSpan } from "@/lib/markdown";
import { parsePlanError, type PlanErrorBody } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Spinner } from "@/components/ui/spinner";

interface ChatMessage {
  role: "user" | "model";
  content: string;
}

const DEFAULT_SUGGESTIONS = [
  "What should engineering fix first this week?",
  "Which issues are likely to cause people to cancel?",
  "Could any of these share the same root cause?",
  "Summarise the top three issues for a planning meeting.",
];

export interface ChatPanelProps {
  /** Anonymous mode: the analyzer's issues are sent with every question. */
  issues?: Issue[];
  /** Signed-in mode: the server grounds answers in this product's stored issues. */
  productId?: string;
  /** "panel" is collapsible (analyzer); "embedded" is always open and fills its container (sheet). */
  variant?: "panel" | "embedded";
  suggestions?: string[];
  /** Called on a 402 so the page can open the upgrade dialog. */
  onPlanError?: (err: PlanErrorBody) => void;
  className?: string;
}

/** Questions about the ranked issues, answered from the analysis only. */
export function ChatPanel({
  issues,
  productId,
  variant = "panel",
  suggestions = DEFAULT_SUGGESTIONS,
  onPlanError,
  className,
}: ChatPanelProps) {
  const [open, setOpen] = React.useState(variant === "embedded");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [draft, setDraft] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; signup?: boolean } | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const inputId = React.useId();

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  const count = issues?.length;

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || loading) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setDraft("");
    setLoading(true);
    setError(null);
    try {
      const payload = productId ? { messages: next, productId } : { messages: next, issues: issues ?? [] };
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await r.json().catch(() => ({}))) as { reply?: string; error?: string };
      if (r.status === 402) {
        const plan = parsePlanError(data);
        if (plan && onPlanError) onPlanError(plan);
        throw Object.assign(new Error(plan?.error ?? data.error ?? "You have used this month's questions."), {
          signup: false,
        });
      }
      if (r.status === 429 && !productId) {
        throw Object.assign(new Error("You have used today's free questions. Create a free account to keep going."), {
          signup: true,
        });
      }
      if (!r.ok || !data.reply) throw new Error(data.error ?? "No answer came back. Try asking again.");
      setMessages((prev) => [...prev, { role: "model", content: data.reply ?? "" }]);
    } catch (e) {
      const err = e as Error & { signup?: boolean };
      setError({ message: err.message || "No answer came back. Try asking again.", signup: err.signup });
      // Keep the question so the user can resend it.
      setMessages((prev) => prev.slice(0, -1));
      setDraft(text);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "focus-ring group flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3.5 text-left shadow-xs",
          "transition-colors duration-120 hover:bg-sunken",
          className,
        )}
      >
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand">
          <MessageSquareText aria-hidden className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink">Ask about these issues</span>
          <span className="block truncate text-xs text-ink-muted">
            Answers come only from this analysis{typeof count === "number" ? `, ${count} issues` : ""}.
          </span>
        </span>
        <span className="hidden text-sm font-medium text-brand sm:inline">Ask a question</span>
      </button>
    );
  }

  return (
    <section
      aria-label="Ask about these issues"
      className={cn(
        "flex min-h-0 flex-col overflow-hidden",
        variant === "panel" && "rounded-lg border border-line bg-surface shadow-xs",
        variant === "embedded" && "h-full",
        className,
      )}
    >
      {variant === "panel" ? (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageSquareText aria-hidden className="size-4 text-brand" />
            <h3 className="text-sm font-medium text-ink">Ask about these issues</h3>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<RotateCcw aria-hidden />}
                onClick={() => {
                  setMessages([]);
                  setError(null);
                }}
              >
                Clear
              </Button>
            ) : null}
            <Button variant="ghost" size="icon" aria-label="Close chat" onClick={() => setOpen(false)} className="size-8">
              <X aria-hidden />
            </Button>
          </div>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className={cn(
          "scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4",
          variant === "panel" && "max-h-[460px]",
        )}
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              Ask anything about the ranked issues. Try one of these:
            </p>
            <ul className="flex flex-col gap-1.5">
              {suggestions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => void send(s)}
                    disabled={loading}
                    className="focus-ring w-full rounded-md border border-line bg-canvas px-3 py-2 text-left text-sm text-ink-secondary transition-colors duration-120 hover:border-line-strong hover:text-ink disabled:opacity-50"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand-ink">
                {m.content}
              </p>
            </div>
          ) : (
            <div key={i} className="max-w-[92%]">
              <ChatMarkdown text={m.content} />
            </div>
          ),
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <Spinner size="sm" />
            Reading the issues
          </div>
        ) : null}

        {error ? (
          <Callout
            tone={error.signup ? "warning" : "danger"}
            action={
              error.signup ? (
                <Button asChild size="sm" variant="primary">
                  <Link href="/login?next=/onboarding">Start free</Link>
                </Button>
              ) : undefined
            }
          >
            {error.message}
          </Callout>
        ) : null}
      </div>

      <form
        className="border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <label htmlFor={inputId} className="sr-only">
          Your question
        </label>
        <div className="flex items-end gap-2 rounded-md border border-line-strong bg-surface px-2 py-1.5 focus-within:ring-2 focus-within:ring-brand/60">
          <textarea
            ref={inputRef}
            id={inputId}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
            rows={1}
            placeholder="Ask a question about these issues"
            className="max-h-32 min-h-[32px] flex-1 resize-none bg-transparent px-1 py-1.5 text-sm text-ink placeholder:text-ink-muted focus:outline-none"
            disabled={loading}
          />
          <Button
            type="submit"
            variant="primary"
            size="icon"
            className="size-8"
            aria-label="Send question"
            disabled={loading || draft.trim().length === 0}
          >
            <ArrowUp aria-hidden />
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-ink-muted">Enter to send, Shift+Enter for a new line.</p>
      </form>
    </section>
  );
}

function Spans({ spans }: { spans: MdSpan[] }) {
  return (
    <>
      {spans.map((s, i) =>
        s.code ? (
          <code key={i} className="rounded-sm bg-sunken px-1 font-mono text-[0.85em] text-ink">
            {s.text}
          </code>
        ) : s.bold ? (
          <strong key={i} className="font-semibold text-ink">
            {s.text}
          </strong>
        ) : (
          <React.Fragment key={i}>{s.text}</React.Fragment>
        ),
      )}
    </>
  );
}

function ChatMarkdown({ text }: { text: string }) {
  const blocks = React.useMemo(() => parseLightMarkdown(text), [text]);
  return (
    <div className="space-y-2 text-sm leading-6 text-ink-secondary">
      {blocks.map((b, i) => {
        if (b.type === "h")
          return (
            <p key={i} className="font-medium text-ink">
              <Spans spans={b.spans} />
            </p>
          );
        if (b.type === "ul")
          return (
            <ul key={i} className="list-disc space-y-1 pl-5 marker:text-ink-faint">
              {b.items.map((it, j) => (
                <li key={j}>
                  <Spans spans={it} />
                </li>
              ))}
            </ul>
          );
        if (b.type === "ol")
          return (
            <ol key={i} start={b.start} className="list-decimal space-y-1 pl-5 marker:text-ink-muted">
              {b.items.map((it, j) => (
                <li key={j}>
                  <Spans spans={it} />
                </li>
              ))}
            </ol>
          );
        return (
          <p key={i}>
            <Spans spans={b.spans} />
          </p>
        );
      })}
    </div>
  );
}
