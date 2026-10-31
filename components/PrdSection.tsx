"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import type { Issue, PrdStub } from "@/lib/types";
import { prdToMarkdown } from "@/lib/markdown";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { SkeletonText } from "@/components/ui/skeleton";
import { EFFORT_META } from "@/components/app/labels";

/**
 * A generated PRD stub, laid out as a short document. Shows a skeleton while
 * generating and an inline error when generation fails.
 */
export function PrdSection({
  issue,
  prd,
  loading,
  error,
  bare = false,
}: {
  issue: Issue;
  prd: PrdStub | null;
  loading: boolean;
  error: string | null;
  /** Without the bordered frame, for pages that already provide one. */
  bare?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);

  const frame = bare ? "" : "rounded-md border border-line bg-canvas p-4 sm:p-5";

  if (loading) {
    return (
      <div className={frame} role="status" aria-live="polite">
        <p className="text-sm font-medium text-ink">Writing the PRD stub</p>
        <p className="mb-4 text-xs text-ink-muted">Problem, users, acceptance criteria and edge cases.</p>
        <SkeletonText lines={5} />
      </div>
    );
  }

  if (error) {
    return <Callout tone="danger" title="The PRD could not be generated">{error}</Callout>;
  }

  if (!prd) return null;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(prdToMarkdown(issue, prd));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section aria-label="PRD stub" className={frame}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-display text-base font-semibold text-ink">PRD stub</h4>
          <p className="text-xs text-ink-muted">A starting point for planning. Edit it before you commit to it.</p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={onCopy}
          leftIcon={copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        >
          {copied ? "Copied" : "Copy as Markdown"}
        </Button>
      </div>
      <span aria-live="polite" className="sr-only">
        {copied ? "PRD copied to the clipboard" : ""}
      </span>

      <dl className="mt-4 space-y-4 text-sm">
        <PrdField label="Problem statement">
          <p className="text-ink-secondary">{prd.problem_statement}</p>
        </PrdField>
        <PrdField label="Affected users">
          <PrdList items={prd.affected_users} />
        </PrdField>
        <PrdField label="Acceptance criteria">
          <PrdList items={prd.acceptance_criteria} ordered />
        </PrdField>
        <PrdField label="Edge cases">
          <PrdList items={prd.edge_cases} />
        </PrdField>
        <PrdField label="Success metrics">
          <PrdList items={prd.success_metrics} />
        </PrdField>
        <PrdField label="Implementation notes">
          <p className="text-ink-secondary">{prd.implementation_notes}</p>
        </PrdField>
        <PrdField label="Estimated complexity">
          <p className="text-ink-secondary">
            {prd.estimated_complexity}: {EFFORT_META[prd.estimated_complexity]?.label ?? ""}
          </p>
        </PrdField>
      </dl>
    </section>
  );
}

function PrdField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-xs font-medium text-ink-muted sm:pt-0.5">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function PrdList({ items, ordered = false }: { items: string[]; ordered?: boolean }) {
  if (items.length === 0) return <p className="text-ink-muted">None listed.</p>;
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={ordered ? "list-decimal space-y-1 pl-5 text-ink-secondary marker:text-ink-muted" : "list-disc space-y-1 pl-5 text-ink-secondary marker:text-ink-faint"}>
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </Tag>
  );
}
