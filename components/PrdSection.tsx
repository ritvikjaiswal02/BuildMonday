"use client";
import { useState } from "react";
import type { Issue, PrdStub } from "@/lib/types";
import { prdToMarkdown } from "@/lib/markdown";

export function PrdSection({
  issue,
  prd,
  loading,
  error,
}: {
  issue: Issue;
  prd: PrdStub | null;
  loading: boolean;
  error: string | null;
}) {
  const [copied, setCopied] = useState(false);

  if (loading) {
    return (
      <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm text-white/70">
        <span className="inline-block h-3 w-3 animate-pulse rounded-full bg-indigo-400 align-middle" />
        <span className="ml-2 align-middle">Generating PRD stub...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
        {error}
      </div>
    );
  }

  if (!prd) return null;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(prdToMarkdown(issue, prd));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-white/50">{label}</div>
      <div className="mt-1 text-sm text-white/85">{children}</div>
    </div>
  );

  const List = ({ items }: { items: string[] }) => (
    <ul className="ml-4 list-disc space-y-1">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );

  return (
    <div className="mt-4 space-y-4 rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-white">PRD Stub</h4>
        <button
          onClick={onCopy}
          className="rounded-md border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/80 transition hover:bg-white/10"
        >
          {copied ? "Copied ✓" : "Copy as Markdown"}
        </button>
      </div>

      <Field label="Problem Statement">{prd.problem_statement}</Field>
      <Field label="Affected Users">
        <List items={prd.affected_users} />
      </Field>
      <Field label="Acceptance Criteria">
        <List items={prd.acceptance_criteria} />
      </Field>
      <Field label="Edge Cases">
        <List items={prd.edge_cases} />
      </Field>
      <Field label="Success Metrics">
        <List items={prd.success_metrics} />
      </Field>
      <Field label="Implementation Notes">{prd.implementation_notes}</Field>
      <Field label="Estimated Complexity">
        <span className="inline-flex items-center rounded-full bg-white/5 px-2 py-0.5 text-xs ring-1 ring-inset ring-white/15">
          {prd.estimated_complexity}
        </span>
      </Field>
    </div>
  );
}
