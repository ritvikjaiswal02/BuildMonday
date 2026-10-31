"use client";

import * as React from "react";
import Link from "next/link";
import {
  Archive,
  Ban,
  CheckCheck,
  ChevronDown,
  Download,
  ExternalLink,
  Inbox as InboxIcon,
  Link2,
  Lock,
  MoreHorizontal,
  RotateCcw,
  Search,
  SearchX,
  Trash2,
  X,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/dialog";
import type { FeedbackDTO } from "@/lib/db/dto";
import type { FeedbackSourceKind, FeedbackStatus } from "@/lib/db/schema";
import { hasFeature, type PlanId } from "@/lib/plans";
import { cn, formatNumber, formatRelativeTime, pluralize } from "@/lib/utils";
import { SourceGlyph, sourceKindLabel } from "@/components/brand/logos";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Select } from "@/components/ui/select";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, apiFetch, errorMessage } from "../api";
import { downloadText, fileSlug } from "../csv";
import { FEEDBACK_KIND_LABEL, FEEDBACK_KIND_ORDER, FEEDBACK_STATUS_META, formatRating } from "../labels";
import { QuotaBanner } from "../QuotaBanner";
import { useApiErrorHandler } from "../use-api-error";
import { AddFeedbackDialog } from "./AddFeedbackDialog";
import { LinkIssueDialog, type IssueOption } from "./LinkIssueDialog";
import {
  applyStatusChange,
  EMPTY_COUNTS,
  feedbackQuery,
  groupIdsByStatus,
  hasActiveFilters,
  inboxKeyAction,
  inboxUrlQuery,
  isTypingTarget,
  totalCount,
  type InboxFilters,
  type InboxTab,
  type StatusCounts,
} from "./inbox-utils";

interface FeedbackListResponse {
  items: FeedbackDTO[];
  nextCursor: string | null;
  counts: StatusCounts;
  quota: { used: number; max: number };
}

const TABS: InboxTab[] = ["new", "triaged", "archived", "spam", "all"];
const TAB_LABEL: Record<InboxTab, string> = {
  new: "Not grouped",
  triaged: "Grouped",
  archived: "Archived",
  spam: "Spam",
  all: "All",
};

export function InboxView({
  productId,
  productName,
  plan,
  issues,
  initialFilters,
}: {
  productId: string;
  productName: string;
  plan: PlanId;
  issues: IssueOption[];
  initialFilters: InboxFilters;
}) {
  const { handle, dialog, openUpgrade } = useApiErrorHandler();
  const [filters, setFilters] = React.useState<InboxFilters>(initialFilters);
  const [search, setSearch] = React.useState(initialFilters.q);
  const [items, setItems] = React.useState<FeedbackDTO[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [counts, setCounts] = React.useState<StatusCounts>(EMPTY_COUNTS);
  const [quota, setQuota] = React.useState<{ used: number; max: number } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [focusIndex, setFocusIndex] = React.useState(-1);
  const [busy, setBusy] = React.useState(false);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkTargets, setLinkTargets] = React.useState<string[]>([]);
  const [addOpen, setAddOpen] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  const searchRef = React.useRef<HTMLInputElement>(null);
  const rowRefs = React.useRef<Array<HTMLLIElement | null>>([]);
  const controllerRef = React.useRef<AbortController | null>(null);
  const ids = { source: React.useId(), issue: React.useId(), search: React.useId() };

  const issueTitle = React.useMemo(() => new Map(issues.map((i) => [i.id, i.title])), [issues]);

  // Keep the URL in step with the filters without a server round trip.
  React.useEffect(() => {
    const qs = inboxUrlQuery(filters);
    const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    window.history.replaceState(window.history.state, "", url);
  }, [filters]);

  // Debounced search box.
  React.useEffect(() => {
    if (search === filters.q) return;
    const t = window.setTimeout(() => setFilters((f) => ({ ...f, q: search })), 300);
    return () => window.clearTimeout(t);
  }, [search, filters.q]);

  // First page whenever the filters change.
  React.useEffect(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setLoadError(null);
    setSelected(new Set());
    setFocusIndex(-1);
    apiFetch<FeedbackListResponse>(`/api/feedback?${feedbackQuery(productId, filters)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((data) => {
        setItems(data.items ?? []);
        setCursor(data.nextCursor ?? null);
        setCounts({ ...EMPTY_COUNTS, ...(data.counts ?? {}) });
        setQuota(data.quota ?? null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setLoadError(errorMessage(err, "The inbox could not load."));
        setLoading(false);
      });
    return () => controller.abort();
  }, [productId, filters, reloadKey]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await apiFetch<FeedbackListResponse>(`/api/feedback?${feedbackQuery(productId, filters, { cursor })}`, {
        cache: "no-store",
      });
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...(data.items ?? []).filter((i) => !seen.has(i.id))];
      });
      setCursor(data.nextCursor ?? null);
    } catch (err) {
      handle(err, "More feedback could not load.");
    } finally {
      setLoadingMore(false);
    }
  };

  const reload = () => setReloadKey((k) => k + 1);
  const [deleting, setDeleting] = React.useState<string[] | null>(null);

  const deleteFeedback = async () => {
    const ids = deleting ?? [];
    if (ids.length === 0) return;
    try {
      const res = await apiFetch<{ deleted: number }>("/api/feedback", { method: "DELETE", json: { ids } });
      toast.success(`Deleted ${pluralize(res.deleted, "item")}`);
      setSelected(new Set());
      reload();
    } catch (err) {
      toast.error(errorMessage(err, "The feedback could not be deleted."));
      throw err;
    }
  };

  // ---- mutations -----------------------------------------------------------

  const setStatus = async (targetIds: string[], status: FeedbackStatus, opts: { undo?: boolean } = {}) => {
    if (targetIds.length === 0 || busy) return;
    const affected = items.filter((i) => targetIds.includes(i.id));
    const before = affected.map((i) => ({ id: i.id, status: i.status }));
    setBusy(true);
    try {
      await apiFetch<{ updated: number }>("/api/feedback", { method: "PATCH", json: { ids: targetIds, status } });
      setCounts((c) => applyStatusChange(c, affected, status));
      setItems((prev) =>
        filters.tab === "all" || filters.tab === status
          ? prev.map((i) => (targetIds.includes(i.id) ? { ...i, status } : i))
          : prev.filter((i) => !targetIds.includes(i.id)),
      );
      setSelected(new Set());
      const label = FEEDBACK_STATUS_META[status].label.toLowerCase();
      const verb = status === "new" ? "Moved back to new" : status === "spam" ? "Marked as spam" : `Marked ${label}`;
      if (opts.undo === false) {
        toast.success(`${verb}: ${pluralize(targetIds.length, "item")}`);
      } else {
        toast.success(`${verb}: ${pluralize(targetIds.length, "item")}`, {
          action: {
            label: "Undo",
            onClick: () => void undoStatus(before),
          },
        });
      }
    } catch (err) {
      handle(err, "The change could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const undoStatus = async (before: Array<{ id: string; status: FeedbackStatus }>) => {
    try {
      for (const [status, groupIds] of groupIdsByStatus(before)) {
        await apiFetch("/api/feedback", { method: "PATCH", json: { ids: groupIds, status } });
      }
      toast("Change undone");
      reload();
    } catch (err) {
      handle(err, "The change could not be undone.");
    }
  };

  const linkIssue = async (targetIds: string[], issueId: string | null) => {
    try {
      await apiFetch("/api/feedback", { method: "PATCH", json: { ids: targetIds, issueId } });
      // Linking also marks the items triaged (server rule); unlinking keeps the status.
      const affected = items.filter((i) => targetIds.includes(i.id));
      const nextStatus: FeedbackStatus | null = issueId ? "triaged" : null;
      if (nextStatus) setCounts((c) => applyStatusChange(c, affected, nextStatus));
      setItems((prev) =>
        prev
          .filter(
            (i) => !nextStatus || !targetIds.includes(i.id) || filters.tab === "all" || filters.tab === nextStatus,
          )
          .map((i) =>
            targetIds.includes(i.id)
              ? {
                  ...i,
                  status: nextStatus ?? i.status,
                  issueId,
                  issueTitle: issueId ? (issueTitle.get(issueId) ?? i.issueTitle) : null,
                }
              : i,
          ),
      );
      setSelected(new Set());
      toast.success(issueId ? `Linked ${pluralize(targetIds.length, "item")}` : `Removed the link from ${pluralize(targetIds.length, "item")}`);
    } catch (err) {
      handle(err, "The link could not be saved.");
      throw err;
    }
  };

  const openLinkDialog = (targetIds: string[]) => {
    if (targetIds.length === 0) return;
    setLinkTargets(targetIds);
    setLinkOpen(true);
  };

  const exportCsv = async () => {
    if (!hasFeature(plan, "export")) {
      openUpgrade({ feature: "export", requiredPlan: "pro", reason: "Exporting feedback is on Pro and Team." });
      return;
    }
    setExporting(true);
    try {
      const params = new URLSearchParams(feedbackQuery(productId, filters));
      params.delete("limit");
      const res = await fetch(`/api/feedback/export?${params.toString()}`, { credentials: "same-origin" });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null);
        const message =
          body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
            ? (body as { error: string }).error
            : "The export did not finish.";
        throw new ApiError(res.status, message, body);
      }
      const csv = await res.text();
      const date = new Date().toISOString().slice(0, 10);
      downloadText(`buildmonday-feedback-${fileSlug(productName)}-${date}.csv`, csv, "text/csv;charset=utf-8");
      toast.success("Feedback exported as CSV");
    } catch (err) {
      handle(err, "The export did not finish.");
    } finally {
      setExporting(false);
    }
  };

  // ---- selection and keyboard ---------------------------------------------

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));
  const someSelected = selected.size > 0 && !allSelected;
  const selectAllRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const focusRow = React.useCallback((index: number) => {
    setFocusIndex(index);
    const el = rowRefs.current[index];
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "nearest" });
    }
  }, []);

  const setStatusRef = React.useRef(setStatus);
  setStatusRef.current = setStatus;

  const stateRef = React.useRef({ items, focusIndex, selected, linkOpen, addOpen });
  stateRef.current = { items, focusIndex, selected, linkOpen, addOpen };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (s.linkOpen || s.addOpen) return;
      if (document.querySelector("[role='dialog'][data-state='open'], [role='menu'][data-state='open']")) return;
      if (isTypingTarget(e.target)) {
        if (e.key === "Escape" && e.target === searchRef.current) searchRef.current?.blur();
        return;
      }
      const action = inboxKeyAction(e);
      if (!action) return;
      const current = s.items[s.focusIndex];
      switch (action) {
        case "next":
          e.preventDefault();
          if (s.items.length) focusRow(Math.min(s.items.length - 1, s.focusIndex + 1));
          break;
        case "prev":
          e.preventDefault();
          if (s.items.length) focusRow(Math.max(0, s.focusIndex - 1));
          break;
        case "toggle-select":
          if (current) {
            e.preventDefault();
            toggleSelect(current.id);
          }
          break;
        case "archive": {
          const target = s.selected.size > 0 ? Array.from(s.selected) : current ? [current.id] : [];
          if (target.length) {
            e.preventDefault();
            void setStatusRef.current(target, "archived");
          }
          break;
        }
        case "focus-search":
          e.preventDefault();
          searchRef.current?.focus();
          break;
        case "expand":
          if (current && (e.target === rowRefs.current[s.focusIndex] || e.key === "o")) {
            e.preventDefault();
            toggleExpand(current.id);
          }
          break;
        case "clear-selection":
          if (s.selected.size > 0) setSelected(new Set());
          break;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focusRow]);

  // ---- render --------------------------------------------------------------

  const total = totalCount(counts);
  const filtered = hasActiveFilters(filters);
  const selectedIds = Array.from(selected);
  const selectedItems = items.filter((i) => selected.has(i.id));
  const sharedIssue =
    selectedItems.length > 0 && selectedItems.every((i) => i.issueId && i.issueId === selectedItems[0].issueId)
      ? selectedItems[0].issueId
      : null;
  const exportAllowed = hasFeature(plan, "export");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inbox"
        description={`Every piece of feedback for ${productName}: from your sources, the website widget, the extension and what you add here. Runs group it into issues.`}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => void exportCsv()}
              loading={exporting}
              leftIcon={exportAllowed ? <Download aria-hidden /> : <Lock aria-hidden />}
            >
              Export
            </Button>
            <AddFeedbackDialog
              productId={productId}
              onAdded={reload}
              onPlanError={(err) => handle(err)}
              open={addOpen}
              onOpenChange={setAddOpen}
            />
          </>
        }
      />

      {quota ? <QuotaBanner used={quota.used} max={quota.max} /> : null}

      <Tabs value={filters.tab} onValueChange={(v) => setFilters((f) => ({ ...f, tab: v as InboxTab }))}>
        <TabsList aria-label="Feedback status">
          {TABS.map((t) => (
            <TabsTrigger key={t} value={t} count={loading && total === 0 ? undefined : t === "all" ? total : counts[t]}>
              {TAB_LABEL[t]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_220px]">
        <div>
          <label htmlFor={ids.search} className="sr-only">
            Search feedback
          </label>
          <Input
            ref={searchRef}
            id={ids.search}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search feedback"
            leftIcon={<Search aria-hidden className="size-4" />}
          />
        </div>
        <div>
          <label htmlFor={ids.source} className="sr-only">
            Source
          </label>
          <Select
            id={ids.source}
            value={filters.sourceKind}
            onChange={(e) => setFilters((f) => ({ ...f, sourceKind: e.target.value as FeedbackSourceKind | "" }))}
          >
            <option value="">All sources</option>
            {FEEDBACK_KIND_ORDER.map((k) => (
              <option key={k} value={k}>
                {FEEDBACK_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor={ids.issue} className="sr-only">
            Issue
          </label>
          <Select
            id={ids.issue}
            value={filters.issueId}
            onChange={(e) => setFilters((f) => ({ ...f, issueId: e.target.value }))}
          >
            <option value="">Any issue</option>
            <option value="none">Not linked to an issue</option>
            {issues.map((i) => (
              <option key={i.id} value={i.id}>
                {i.title.length > 60 ? `${i.title.slice(0, 59)}…` : i.title}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {filtered ? (
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <span>Filtered view.</span>
          <Button
            size="sm"
            variant="ghost"
            leftIcon={<X aria-hidden />}
            onClick={() => {
              setSearch("");
              setFilters((f) => ({ ...f, sourceKind: "", issueId: "", q: "" }));
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : null}

      {selected.size > 0 ? (
        <div
          role="toolbar"
          aria-label="Bulk actions"
          className="sticky top-[calc(var(--topbar-height)+8px)] z-[5] flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-surface px-3 py-2 shadow-sm"
        >
          <span className="mr-1 text-sm font-medium text-ink">{pluralize(selected.size, "selected", "selected")}</span>
          {filters.tab !== "triaged" ? (
            <Button size="sm" variant="secondary" leftIcon={<CheckCheck aria-hidden />} disabled={busy} onClick={() => void setStatus(selectedIds, "triaged")}>
              Mark grouped
            </Button>
          ) : null}
          {filters.tab !== "archived" ? (
            <Button size="sm" variant="secondary" leftIcon={<Archive aria-hidden />} disabled={busy} onClick={() => void setStatus(selectedIds, "archived")}>
              Archive
            </Button>
          ) : null}
          {filters.tab !== "spam" ? (
            <Button size="sm" variant="secondary" leftIcon={<Ban aria-hidden />} disabled={busy} onClick={() => void setStatus(selectedIds, "spam")}>
              Mark as spam
            </Button>
          ) : null}
          {filters.tab === "archived" || filters.tab === "spam" ? (
            <Button size="sm" variant="secondary" leftIcon={<RotateCcw aria-hidden />} disabled={busy} onClick={() => void setStatus(selectedIds, "new")}>
              Move to not grouped
            </Button>
          ) : null}
          <Button size="sm" variant="secondary" leftIcon={<Link2 aria-hidden />} disabled={busy} onClick={() => openLinkDialog(selectedIds)}>
            Link to issue
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-danger hover:text-danger"
            leftIcon={<Trash2 aria-hidden />}
            disabled={busy}
            onClick={() => setDeleting(selectedIds)}
          >
            Delete
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
          {busy ? <Spinner size="sm" label="Saving" /> : null}
        </div>
      ) : null}

      {loadError ? (
        <Callout
          tone="danger"
          title="The inbox did not load"
          action={
            <Button size="sm" onClick={reload} leftIcon={<RotateCcw aria-hidden />}>
              Try again
            </Button>
          }
        >
          {loadError}
        </Callout>
      ) : loading ? (
        <SkeletonRows rows={8} />
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface shadow-xs">
          {filtered ? (
            <EmptyState
              icon={SearchX}
              title="No feedback matches these filters"
              description="Try another source or issue, or clear the search."
              action={
                <Button
                  onClick={() => {
                    setSearch("");
                    setFilters((f) => ({ ...f, sourceKind: "", issueId: "", q: "" }));
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : total === 0 ? (
            <EmptyState
              icon={InboxIcon}
              title="No feedback yet"
              description="Add a source, install the widget, or paste feedback to get started."
              action={
                <Button variant="primary" onClick={() => setAddOpen(true)}>
                  Paste feedback
                </Button>
              }
              secondaryAction={
                <>
                  <Button asChild variant="secondary">
                    <Link href="/settings/sources">Add a source</Link>
                  </Button>
                  <Button asChild variant="ghost">
                    <Link href="/extension">Install the widget</Link>
                  </Button>
                </>
              }
            />
          ) : (
            <EmptyState
              icon={CheckCheck}
              title={filters.tab === "new" ? "Nothing waiting to be grouped" : `No ${TAB_LABEL[filters.tab].toLowerCase()} feedback`}
              description={
                filters.tab === "new"
                  ? "Feedback from your sources, the widget and the extension waits here until a run groups it into issues."
                  : filters.tab === "triaged"
                    ? "Feedback a run grouped into an issue, or that you marked as grouped, shows up here."
                    : "Items you move here from the other tabs show up in this list."
              }
            />
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
            <div className="flex items-center gap-3 border-b border-line bg-sunken px-4 py-2">
              <input
                ref={selectAllRef}
                type="checkbox"
                aria-label={allSelected ? "Deselect all loaded feedback" : "Select all loaded feedback"}
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)))}
                className="focus-ring size-4 shrink-0 cursor-pointer rounded-sm accent-brand"
              />
              <span className="text-xs text-ink-muted">
                {formatNumber(items.length)} shown
                {cursor ? ", more below" : ""}
              </span>
            </div>
            <ul aria-label="Feedback" className="divide-y divide-line">
              {items.map((item, index) => (
                <FeedbackRow
                  key={item.id}
                  ref={(el) => {
                    rowRefs.current[index] = el;
                  }}
                  item={item}
                  focused={index === focusIndex}
                  selected={selected.has(item.id)}
                  expanded={expanded.has(item.id)}
                  busy={busy}
                  showStatus={filters.tab === "all"}
                  onFocus={() => setFocusIndex(index)}
                  onToggleSelect={() => toggleSelect(item.id)}
                  onToggleExpand={() => toggleExpand(item.id)}
                  onStatus={(s) => void setStatus([item.id], s)}
                  onLink={() => openLinkDialog([item.id])}
                />
              ))}
            </ul>
          </div>
          {cursor ? (
            <div className="flex justify-center">
              <Button variant="secondary" onClick={() => void loadMore()} loading={loadingMore} leftIcon={<ChevronDown aria-hidden />}>
                Load more
              </Button>
            </div>
          ) : null}
          <p className="hidden flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted md:flex">
            <span>
              <Kbd>j</Kbd> <Kbd>k</Kbd> move
            </span>
            <span>
              <Kbd>x</Kbd> select
            </span>
            <span>
              <Kbd>e</Kbd> archive
            </span>
            <span>
              <Kbd>o</Kbd> expand
            </span>
            <span>
              <Kbd>/</Kbd> search
            </span>
          </p>
        </div>
      )}

      <LinkIssueDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        issues={issues}
        count={linkTargets.length}
        currentIssueId={
          (() => {
            const targets = items.filter((i) => linkTargets.includes(i.id));
            return targets.length > 0 && targets.every((t) => t.issueId && t.issueId === targets[0].issueId)
              ? targets[0].issueId
              : sharedIssue && linkTargets.length === selectedIds.length
                ? sharedIssue
                : null;
          })()
        }
        onConfirm={(issueId) => linkIssue(linkTargets, issueId)}
      />
      {dialog}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => (!open ? setDeleting(null) : undefined)}
        tone="danger"
        title={deleting ? `Delete ${pluralize(deleting.length, "item")}?` : "Delete feedback"}
        description="This removes the feedback from BuildMonday for good. Issues it was grouped into keep their counts until the next run."
        confirmLabel="Delete"
        onConfirm={deleteFeedback}
      />
    </div>
  );
}

const FeedbackRow = React.forwardRef<
  HTMLLIElement,
  {
    item: FeedbackDTO;
    focused: boolean;
    selected: boolean;
    expanded: boolean;
    busy: boolean;
    showStatus: boolean;
    onFocus: () => void;
    onToggleSelect: () => void;
    onToggleExpand: () => void;
    onStatus: (s: FeedbackStatus) => void;
    onLink: () => void;
  }
>(function FeedbackRow(
  { item, focused, selected, expanded, busy, showStatus, onFocus, onToggleSelect, onToggleExpand, onStatus, onLink },
  ref,
) {
  const kind = item.site ?? item.sourceKind;
  const when = item.postedAt ?? item.ingestedAt;
  const rating = formatRating(item.rating);
  const long = item.text.length > 220 || item.text.split("\n").length > 2;
  const textId = `fb-${item.id}`;

  return (
    <li
      ref={ref}
      tabIndex={-1}
      onFocus={onFocus}
      aria-describedby={textId}
      className={cn(
        "group relative flex gap-3 px-4 py-3 outline-none transition-colors duration-120",
        selected ? "bg-brand-soft/60" : "bg-surface hover:bg-sunken/50",
        focused && "shadow-[inset_2px_0_0_0_rgb(var(--brand))]",
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        aria-label={`Select feedback: ${item.text.slice(0, 60)}`}
        className="focus-ring mt-0.5 size-4 shrink-0 cursor-pointer rounded-sm accent-brand"
      />
      <SourceGlyph kind={kind} className="mt-0.5 size-4 text-ink-muted" title={sourceKindLabel(kind)} />
      <div className="min-w-0 flex-1">
        <p
          id={textId}
          className={cn("whitespace-pre-line break-words text-sm text-ink", !expanded && "line-clamp-2")}
        >
          {item.title ? <span className="font-medium">{item.title}. </span> : null}
          {item.text}
        </p>
        {long ? (
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={expanded}
            className="focus-ring mt-0.5 rounded-sm text-xs font-medium text-brand hover:underline"
          >
            {expanded ? "Show less" : "Show all"}
          </button>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
          {showStatus ? <span className="font-medium text-ink-secondary">{FEEDBACK_STATUS_META[item.status].label}</span> : null}
          {item.author ? <span className="max-w-[24ch] truncate">{item.author}</span> : null}
          {rating ? <span>{rating}</span> : null}
          <time dateTime={when} title={new Date(when).toLocaleString()}>
            {formatRelativeTime(when)}
          </time>
          {item.role === "competitor" && item.competitorName ? <span>Competitor: {item.competitorName}</span> : null}
          {item.issueId ? (
            <Link
              href={`/issues/${item.issueId}`}
              className="focus-ring inline-flex max-w-[32ch] items-center gap-1 truncate rounded border border-line bg-surface px-1.5 py-0.5 text-ink-secondary hover:border-line-strong hover:text-ink"
            >
              <Link2 aria-hidden className="size-3 shrink-0" />
              <span className="truncate">
                {item.status === "new" ? "Matches: " : ""}
                {item.issueTitle ?? "Linked issue"}
              </span>
            </Link>
          ) : null}
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="focus-ring inline-flex items-center gap-1 rounded-sm text-brand hover:underline"
            >
              Original
              <ExternalLink aria-hidden className="size-3" />
            </a>
          ) : null}
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={busy}
          aria-label="Actions for this feedback"
          className="focus-ring inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors duration-120 hover:bg-sunken hover:text-ink"
        >
          <MoreHorizontal aria-hidden className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {item.status !== "triaged" ? (
            <DropdownMenuItem icon={CheckCheck} onSelect={() => onStatus("triaged")}>
              Mark grouped
            </DropdownMenuItem>
          ) : null}
          {item.status !== "archived" ? (
            <DropdownMenuItem icon={Archive} shortcut="E" onSelect={() => onStatus("archived")}>
              Archive
            </DropdownMenuItem>
          ) : null}
          {item.status !== "spam" ? (
            <DropdownMenuItem icon={Ban} onSelect={() => onStatus("spam")}>
              Mark as spam
            </DropdownMenuItem>
          ) : null}
          {item.status !== "new" ? (
            <DropdownMenuItem icon={RotateCcw} onSelect={() => onStatus("new")}>
              Move to new
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={Link2} onSelect={onLink}>
            {item.issueId ? "Change linked issue" : "Link to issue"}
          </DropdownMenuItem>
          {item.url ? (
            <DropdownMenuItem icon={ExternalLink} asChild>
              <a href={item.url} target="_blank" rel="noreferrer">
                Open original
              </a>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
});
