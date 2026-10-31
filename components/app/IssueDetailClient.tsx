"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ClipboardCopy, ExternalLink, FileText, Lock, RefreshCw, Send, Settings2 } from "lucide-react";
import type { IssueDTO } from "@/lib/db/dto";
import type { IssueWorkflowStatus, TrackerTarget } from "@/lib/db/schema";
import { hasFeature, type PlanId } from "@/lib/plans";
import { issueToMarkdown } from "@/lib/markdown";
import { GitHubGlyph, LinearGlyph } from "@/components/brand/logos";
import { PrdSection } from "@/components/PrdSection";
import { StatusSelector } from "@/components/StatusSelector";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { toast } from "@/components/ui/toast";
import { issueDtoToAnalysis, issuePrd } from "./adapters";
import { ApiError, apiFetch, errorMessage } from "./api";
import { ISSUE_STATUS_META, ISSUE_STATUS_ORDER } from "./labels";
import { useApiErrorHandler } from "./use-api-error";

export interface TrackerInfo {
  linear: { connected: boolean; label: string | null };
  github: { connected: boolean; label: string | null };
}

const TRACKER_NAME: Record<TrackerTarget, string> = { linear: "Linear", github: "GitHub" };

/** Status, file-to-tracker and copy actions in the issue page header. */
export function IssueHeaderActions({
  issue,
  trackers,
  plan,
  canFile,
}: {
  issue: IssueDTO;
  trackers: TrackerInfo;
  plan: PlanId;
  /** Members without admin rights can still file; this only hides the action when filing is impossible. */
  canFile?: boolean;
}) {
  const router = useRouter();
  const { handle, dialog, openUpgrade } = useApiErrorHandler();
  const [status, setStatus] = React.useState<IssueWorkflowStatus>(issue.status);
  const [savingStatus, setSavingStatus] = React.useState(false);
  const [filing, setFiling] = React.useState<TrackerTarget | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => setStatus(issue.status), [issue.status]);

  const changeStatus = async (next: IssueWorkflowStatus) => {
    const prev = status;
    setStatus(next);
    setSavingStatus(true);
    try {
      await apiFetch(`/api/issues/${encodeURIComponent(issue.id)}`, { method: "PATCH", json: { status: next } });
      toast.success(`Status set to ${ISSUE_STATUS_META[next].label.toLowerCase()}`);
      router.refresh();
    } catch (err) {
      setStatus(prev);
      handle(err, "The status could not be saved.");
    } finally {
      setSavingStatus(false);
    }
  };

  const file = async (target: TrackerTarget) => {
    if (!hasFeature(plan, "auto_file")) {
      openUpgrade({ feature: "auto_file", requiredPlan: "pro", reason: "Filing issues to Linear and GitHub is on Pro and Team." });
      return;
    }
    setFiling(target);
    try {
      const data = await apiFetch<{ issue: IssueDTO }>(`/api/issues/${encodeURIComponent(issue.id)}/file`, {
        method: "POST",
        json: { target },
      });
      toast.success(`Filed to ${TRACKER_NAME[target]}`, {
        action: data.issue.externalUrl
          ? { label: "Open", onClick: () => window.open(data.issue.externalUrl ?? "", "_blank", "noopener") }
          : undefined,
      });
      router.refresh();
    } catch (err) {
      handle(err, `The issue could not be filed to ${TRACKER_NAME[target]}.`);
    } finally {
      setFiling(null);
    }
  };

  const copyMarkdown = async () => {
    const md = issueToMarkdown(issueDtoToAnalysis(issue), {
      rank: issue.rank ?? undefined,
      status,
      prd: issuePrd(issue),
      link: typeof window !== "undefined" ? window.location.href : null,
    });
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
      toast.success("Issue copied as Markdown");
    } catch {
      toast.error("Your browser blocked the clipboard.");
    }
  };

  const fileAllowed = hasFeature(plan, "auto_file");
  const anyConnected = trackers.linear.connected || trackers.github.connected;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusSelector
        status={status}
        options={ISSUE_STATUS_ORDER}
        onChange={(s) => void changeStatus(s)}
        pending={savingStatus}
        className="h-9"
      />

      {issue.externalUrl ? (
        <Button asChild variant="secondary" leftIcon={<ExternalLink aria-hidden />}>
          <a href={issue.externalUrl} target="_blank" rel="noreferrer">
            Open in {issue.externalTarget ? TRACKER_NAME[issue.externalTarget] : "tracker"}
          </a>
        </Button>
      ) : canFile === false ? null : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              loading={filing !== null}
              leftIcon={fileAllowed ? <Send aria-hidden /> : <Lock aria-hidden />}
              rightIcon={<ChevronDown aria-hidden />}
            >
              {filing ? `Filing to ${TRACKER_NAME[filing]}` : "File to tracker"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {!fileAllowed ? (
              <>
                <DropdownMenuLabel>Filing to Linear and GitHub is on Pro and Team.</DropdownMenuLabel>
                <DropdownMenuItem
                  icon={Lock}
                  onSelect={() => openUpgrade({ feature: "auto_file", requiredPlan: "pro" })}
                >
                  See what Pro includes
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem disabled={!trackers.linear.connected} onSelect={() => void file("linear")}>
                  <LinearGlyph className="size-4" />
                  <span className="flex-1">File to Linear</span>
                  <span className="max-w-[90px] truncate text-xs text-ink-muted">
                    {trackers.linear.connected ? trackers.linear.label : "Not connected"}
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!trackers.github.connected} onSelect={() => void file("github")}>
                  <GitHubGlyph className="size-4" />
                  <span className="flex-1">File to GitHub</span>
                  <span className="max-w-[90px] truncate text-xs text-ink-muted">
                    {trackers.github.connected ? trackers.github.label : "Not connected"}
                  </span>
                </DropdownMenuItem>
                {!anyConnected || !trackers.linear.connected || !trackers.github.connected ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild icon={Settings2}>
                      <Link href="/settings/integrations">Connect a tracker</Link>
                    </DropdownMenuItem>
                  </>
                ) : null}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Button
        variant="ghost"
        onClick={() => void copyMarkdown()}
        leftIcon={copied ? <Check aria-hidden /> : <ClipboardCopy aria-hidden />}
      >
        {copied ? "Copied" : "Copy as Markdown"}
      </Button>
      {dialog}
    </div>
  );
}

/** PRD for a stored issue: generate, regenerate and copy. Generation counts toward `prds_per_month` on Free. */
export function IssuePrdPanel({ issue }: { issue: IssueDTO }) {
  const router = useRouter();
  const { handle, dialog } = useApiErrorHandler();
  const [prd, setPrd] = React.useState(issuePrd(issue));
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => setPrd(issuePrd(issue)), [issue]);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ issue: IssueDTO }>(`/api/issues/${encodeURIComponent(issue.id)}/prd`, {
        method: "POST",
        json: {},
      });
      setPrd(issuePrd(data.issue));
      toast.success("PRD stub ready");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.plan) handle(err);
      else setError(errorMessage(err, "The PRD could not be generated. Try again."));
    } finally {
      setLoading(false);
    }
  };

  const analysisIssue = React.useMemo(() => issueDtoToAnalysis(issue), [issue]);

  return (
    <div className="space-y-3">
      {!prd && !loading ? (
        <div className="flex flex-col gap-3 rounded-lg border border-dashed border-line-strong bg-surface px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <p className="text-sm font-medium text-ink">No PRD yet</p>
            <p className="text-sm text-ink-muted">
              Write a stub from the evidence: problem, affected users, acceptance criteria, edge cases and metrics.
            </p>
          </div>
          <Button variant="primary" leftIcon={<FileText aria-hidden />} onClick={() => void generate()}>
            Generate PRD
          </Button>
        </div>
      ) : null}
      <div className="rounded-lg border border-line bg-surface p-4 shadow-xs sm:p-5" hidden={!prd && !loading && !error}>
        <PrdSection issue={analysisIssue} prd={prd} loading={loading} error={error} bare />
        {prd && !loading ? (
          <div className="mt-4 flex justify-end border-t border-line pt-3">
            <Button size="sm" variant="ghost" leftIcon={<RefreshCw aria-hidden />} onClick={() => void generate()}>
              Regenerate
            </Button>
          </div>
        ) : null}
      </div>
      {dialog}
    </div>
  );
}
