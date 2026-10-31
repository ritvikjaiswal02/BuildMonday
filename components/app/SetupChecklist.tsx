"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/meter";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { hideSetupChecklistAction } from "@/app/dashboard/actions";
import type { SetupChecklist as SetupChecklistData } from "./setup-checklist";

/**
 * "Finish setting up": the automation that makes BuildMonday run on its own
 * (Slack, auto-filing, widget, extension, teammates), with one link each.
 */
export function SetupChecklist({ checklist, canHide }: { checklist: SetupChecklistData; canHide: boolean }) {
  const [hidden, setHidden] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  if (hidden) return null;

  function hide() {
    startTransition(async () => {
      const result = await hideSetupChecklistAction();
      if (result.ok) setHidden(true);
      else toast.error(result.error);
    });
  }

  return (
    <section
      aria-labelledby="setup-title"
      className="overflow-hidden rounded-lg border border-line bg-surface shadow-xs"
    >
      <div className="space-y-2.5 border-b border-line px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="setup-title" className="text-sm font-medium text-ink">
            Finish setting up
          </h2>
          <span className="text-xs tabular-nums text-ink-muted">
            {checklist.done} of {checklist.total}
          </span>
        </div>
        <ProgressBar value={checklist.done} max={checklist.total} label="Setup progress" />
      </div>
      <ul className="divide-y divide-line">
        {checklist.items.map((item) => (
          <li key={item.id} className="relative flex gap-3 px-4 py-3">
            {item.done ? (
              <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
            ) : (
              <Circle aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-faint" />
            )}
            <div className="min-w-0">
              {item.done ? (
                <p className="text-sm text-ink-muted line-through decoration-ink-faint">
                  {item.label}
                  <span className="sr-only"> (done)</span>
                </p>
              ) : (
                <Link
                  href={item.href}
                  className={cn(
                    "focus-ring rounded-sm text-sm font-medium text-ink hover:text-brand",
                    "after:absolute after:inset-0",
                  )}
                >
                  {item.label}
                </Link>
              )}
              {!item.done ? <p className="mt-0.5 text-xs text-ink-muted">{item.description}</p> : null}
            </div>
          </li>
        ))}
      </ul>
      {canHide ? (
        <div className="border-t border-line px-2 py-1.5">
          <Button variant="ghost" size="sm" onClick={hide} loading={pending}>
            Hide
          </Button>
        </div>
      ) : null}
    </section>
  );
}
