"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { cn, pluralize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export interface IssueOption {
  id: string;
  title: string;
  scope: "own" | "competitor";
}

/** Pick an issue to link the selected feedback to, or unlink it. */
export function LinkIssueDialog({
  open,
  onOpenChange,
  issues,
  count,
  currentIssueId,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issues: IssueOption[];
  count: number;
  /** When every selected item already shares an issue. */
  currentIssueId: string | null;
  onConfirm: (issueId: string | null) => Promise<void> | void;
}) {
  const [query, setQuery] = React.useState("");
  const [choice, setChoice] = React.useState<string | null>(currentIssueId);
  const [saving, setSaving] = React.useState(false);
  const listId = React.useId();

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setChoice(currentIssueId);
    }
  }, [open, currentIssueId]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? issues.filter((i) => i.title.toLowerCase().includes(q)) : issues;
  }, [issues, query]);

  const confirm = async (issueId: string | null) => {
    setSaving(true);
    try {
      await onConfirm(issueId);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (saving ? undefined : onOpenChange(o))}>
      <DialogContent
        size="md"
        title="Link to an issue"
        description={`Group ${pluralize(count, "selected item")} with an existing issue. Runs keep this link.`}
        footer={
          <>
            {currentIssueId ? (
              <Button variant="ghost" onClick={() => void confirm(null)} disabled={saving} className="sm:mr-auto">
                Remove link
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" loading={saving} disabled={!choice} onClick={() => void confirm(choice)}>
              Link {pluralize(count, "item")}
            </Button>
          </>
        }
      >
        {issues.length === 0 ? (
          <p className="text-sm text-ink-muted">
            There are no issues yet. They appear after the first run groups your feedback.
          </p>
        ) : (
          <div className="space-y-3">
            <label htmlFor={`${listId}-q`} className="sr-only">
              Search issues
            </label>
            <Input
              id={`${listId}-q`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search issues"
              leftIcon={<Search aria-hidden className="size-4" />}
              autoFocus
            />
            <div
              role="radiogroup"
              aria-label="Issues"
              className="scrollbar-thin max-h-[320px] divide-y divide-line overflow-y-auto rounded-md border border-line"
            >
              {filtered.length === 0 ? (
                <p className="px-3 py-3 text-sm text-ink-muted">No issue matches that search.</p>
              ) : (
                filtered.map((issue) => {
                  const selected = choice === issue.id;
                  return (
                    <label
                      key={issue.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm transition-colors duration-120",
                        selected ? "bg-brand-soft" : "hover:bg-sunken",
                      )}
                    >
                      <input
                        type="radio"
                        name={`${listId}-issue`}
                        value={issue.id}
                        checked={selected}
                        onChange={() => setChoice(issue.id)}
                        className="focus-ring mt-0.5 size-4 shrink-0 accent-brand"
                      />
                      <span className={cn("min-w-0 flex-1", selected ? "text-brand-ink" : "text-ink")}>
                        {issue.title}
                        {issue.scope === "competitor" ? (
                          <span className="ml-2 text-xs text-ink-muted">Competitor</span>
                        ) : null}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
