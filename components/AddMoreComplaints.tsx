"use client";

import * as React from "react";
import { ListPlus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { countComplaints } from "@/components/app/analyzer";
import { pluralize } from "@/lib/utils";

/**
 * Appends new complaints to the current batch and re-runs the analysis.
 * Collapsed by default so the results stay the focus.
 */
export function AddMoreComplaints({
  onSubmit,
  disabled,
  currentCount,
}: {
  onSubmit: (complaints: string) => void;
  disabled: boolean;
  currentCount?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const id = React.useId();
  const count = countComplaints(draft);

  const submit = () => {
    if (count === 0 || disabled) return;
    onSubmit(draft);
    setDraft("");
    setOpen(false);
  };

  if (!open) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-line-strong bg-surface px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <p className="text-sm font-medium text-ink">Got more feedback?</p>
          <p className="text-sm text-ink-muted">
            Add it to this batch and re-rank everything together. Statuses reset after the new analysis.
          </p>
        </div>
        <Button leftIcon={<ListPlus aria-hidden />} onClick={() => setOpen(true)} disabled={disabled}>
          Add more complaints
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-4 shadow-xs sm:p-5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        More complaints, one per line
      </label>
      <p id={`${id}-hint`} className="mt-0.5 text-xs text-ink-muted">
        {typeof currentCount === "number"
          ? `They are added to the ${pluralize(currentCount, "complaint")} already analyzed.`
          : "They are added to the complaints already analyzed."}
      </p>
      <Textarea
        id={id}
        aria-describedby={`${id}-hint`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        rows={5}
        autoFocus
        placeholder="The export button does nothing on Safari."
        className="mt-3"
      />
      <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setDraft("");
          }}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          leftIcon={<RefreshCw aria-hidden />}
          onClick={submit}
          disabled={disabled || count === 0}
        >
          {count > 0 ? `Re-analyze with ${pluralize(count, "more complaint")}` : "Re-analyze"}
        </Button>
      </div>
    </div>
  );
}
