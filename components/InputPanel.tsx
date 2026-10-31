"use client";

import * as React from "react";
import Link from "next/link";
import { ClipboardPaste, Download, Link2, ListOrdered } from "lucide-react";
import { DEMO_DATA, DEMO_KEYS } from "@/lib/demo-data";
import type { Source } from "@/lib/types";
import { cn, pluralize } from "@/lib/utils";
import { complaintBatchHint, countComplaints, MAX_ANALYZE_ITEMS } from "@/components/app/analyzer";
import { SourceGlyph } from "@/components/brand/logos";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Mode = "paste" | "link";

const SUPPORTED = [
  { kind: "appstore", label: "App Store", example: "apps.apple.com/us/app/…/id123456789", note: "1 to 3 star reviews" },
  { kind: "playstore", label: "Google Play", example: "play.google.com/store/apps/details?id=…", note: "Recent low-star reviews" },
  { kind: "reddit", label: "Reddit", example: "reddit.com/r/yourapp or a thread link", note: "Posts and top comments" },
  { kind: "hackernews", label: "Hacker News", example: "news.ycombinator.com/item?id=…", note: "Every comment in the thread" },
  { kind: "trustpilot", label: "Trustpilot", example: "trustpilot.com/review/yourapp.com", note: "Recent low-star reviews" },
];

interface FetchResponse {
  reviews?: string[];
  totalFetched?: number;
  sourceLabel?: string;
  source?: string;
  sourceCode?: Source;
  error?: string;
}

/**
 * Input for the anonymous analyzer: paste complaints or fetch them from a
 * supported link, with example datasets to try it in one click.
 */
export function InputPanel({
  text,
  setText,
  onAnalyze,
  disabled,
  onLinesTagged,
  onSourceFetched,
}: {
  text: string;
  setText: (s: string) => void;
  onAnalyze: () => void;
  disabled: boolean;
  onLinesTagged?: (lines: string[], source: Source) => void;
  /** Called with the fetched URL, so the page can offer to watch it every day. */
  onSourceFetched?: (url: string, label: string | null) => void;
}) {
  const [mode, setMode] = React.useState<Mode>("paste");
  const [url, setUrl] = React.useState("");
  const [fetching, setFetching] = React.useState(false);
  const [fetchError, setFetchError] = React.useState<{ message: string; limited?: boolean } | null>(null);
  const [fetched, setFetched] = React.useState<string | null>(null);
  const textareaId = React.useId();
  const urlId = React.useId();

  const count = countComplaints(text);
  const hint = complaintBatchHint(count);

  const fetchReviews = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const target = url.trim();
    if (!target || fetching) return;
    setFetching(true);
    setFetchError(null);
    setFetched(null);
    try {
      const r = await fetch("/api/fetch-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: target }),
      });
      const data = (await r.json().catch(() => ({}))) as FetchResponse;
      if (r.status === 429) {
        setFetchError({ message: "You have used today's free fetches. Create a free account to keep going.", limited: true });
        return;
      }
      if (!r.ok) throw new Error(data.error ?? "That link could not be read. Check it and try again.");
      if (!data.reviews || data.reviews.length === 0) {
        throw new Error("We reached that page but found no reviews or comments on it.");
      }
      setText(data.reviews.join("\n"));
      if (onLinesTagged && data.sourceCode) onLinesTagged(data.reviews, data.sourceCode);
      onSourceFetched?.(target, data.sourceLabel ?? null);
      const lowStars = data.source === "appstore" || data.source === "playstore" || data.source === "trustpilot";
      setFetched(
        `Fetched ${pluralize(data.totalFetched ?? data.reviews.length, "item")} from ${data.sourceLabel ?? "that link"}${
          lowStars ? ", low-star reviews only" : ""
        }. Edit them below or analyze as they are.`,
      );
      setMode("paste");
    } catch (err) {
      setFetchError({ message: err instanceof Error ? err.message : "That link could not be read." });
    } finally {
      setFetching(false);
    }
  };

  return (
    <section aria-label="Complaints to analyze" className="rounded-lg border border-line bg-surface shadow-xs">
      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <div className="px-4 pt-1 sm:px-5">
          <TabsList aria-label="How to add complaints">
            <TabsTrigger value="paste">
              <ClipboardPaste aria-hidden />
              Paste text
            </TabsTrigger>
            <TabsTrigger value="link">
              <Link2 aria-hidden />
              Fetch from a link
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="paste" className="mt-0 px-4 pb-4 pt-4 sm:px-5">
          {fetched ? (
            <Callout tone="success" className="mb-3">
              {fetched}
            </Callout>
          ) : null}
          <label htmlFor={textareaId} className="sr-only">
            Complaints, one per line
          </label>
          <Textarea
            id={textareaId}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (fetched) setFetched(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && count > 0 && !disabled) {
                e.preventDefault();
                onAnalyze();
              }
            }}
            placeholder={"One complaint per line. App reviews, support tickets, survey answers, posts.\n\nCheckout fails at the payment step every time.\nI was charged twice for one order."}
            className="min-h-[220px] font-normal"
            aria-describedby={`${textareaId}-hint`}
          />
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
            <span className="text-sm text-ink-muted">Try an example:</span>
            {DEMO_KEYS.map((k) => (
              <Button
                key={k}
                size="sm"
                variant="outline"
                title={DEMO_DATA[k].description}
                onClick={() => {
                  setText(DEMO_DATA[k].complaints);
                  setFetched(null);
                }}
              >
                {DEMO_DATA[k].label}
              </Button>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="link" className="mt-0 px-4 pb-4 pt-4 sm:px-5">
          <form onSubmit={fetchReviews} className="space-y-3">
            <label htmlFor={urlId} className="text-sm font-medium text-ink">
              Link to reviews or a discussion
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id={urlId}
                type="text"
                inputMode="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://apps.apple.com/us/app/your-app/id123456789"
                disabled={fetching}
                autoComplete="off"
                spellCheck={false}
                invalid={!!fetchError && !fetchError.limited}
                aria-describedby={`${urlId}-help`}
                leftIcon={<Link2 aria-hidden className="size-4" />}
              />
              <Button
                type="submit"
                variant="primary"
                loading={fetching}
                disabled={url.trim().length === 0}
                leftIcon={<Download aria-hidden />}
                className="sm:w-auto"
              >
                {fetching ? "Fetching" : "Fetch reviews"}
              </Button>
            </div>
            <p id={`${urlId}-help`} className="text-xs text-ink-muted">
              Up to 50 items per link. We read the page once; nothing is stored on our side.
            </p>
            {fetchError ? (
              <Callout
                tone={fetchError.limited ? "warning" : "danger"}
                action={
                  fetchError.limited ? (
                    <Button asChild size="sm" variant="primary">
                      <Link href="/login?next=/onboarding">Start free</Link>
                    </Button>
                  ) : undefined
                }
              >
                {fetchError.message}
              </Callout>
            ) : null}
          </form>
          <ul className="mt-5 divide-y divide-line rounded-md border border-line">
            {SUPPORTED.map((s) => (
              <li key={s.kind} className="flex items-start gap-3 px-3 py-2.5">
                <SourceGlyph kind={s.kind} className="mt-0.5 size-4 text-ink-muted" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">
                    {s.label} <span className="text-ink-muted">({s.note})</span>
                  </p>
                  <p className="truncate font-mono text-xs text-ink-muted">{s.example}</p>
                </div>
              </li>
            ))}
          </ul>
        </TabsContent>
      </Tabs>

      <div className="flex flex-col gap-3 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p
          id={`${textareaId}-hint`}
          aria-live="polite"
          className={cn("text-sm", hint?.tone === "warning" ? "text-warning-ink dark:text-warning" : "text-ink-muted")}
        >
          {count === 0
            ? "Paste at least 5 complaints, one per line."
            : `${pluralize(Math.min(count, MAX_ANALYZE_ITEMS), "complaint")} ready. ${hint?.message ?? ""}`}
        </p>
        <Button
          variant="primary"
          size="lg"
          onClick={onAnalyze}
          disabled={disabled || count === 0}
          leftIcon={<ListOrdered aria-hidden />}
          className="w-full sm:w-auto"
        >
          Analyze complaints
        </Button>
      </div>
    </section>
  );
}
