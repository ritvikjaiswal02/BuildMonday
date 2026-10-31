"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, FlaskConical, MoreHorizontal, Pencil, Plus, Rss, Swords, Trash2 } from "lucide-react";
import { SourceGlyph } from "@/components/brand/logos";
import { PaywallGate, UsageMeter, useUpgradeDialog } from "@/components/billing";
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Switch,
  toast,
} from "@/components/ui";
import type { SourceDTO } from "@/lib/db/dto";
import { formatRelativeTime } from "@/lib/utils";
import { hasFeature, limitFor, type PlanErrorBody, type PlanId } from "@/lib/plans";
import { SourceTestResult, useSourceTest } from "@/components/onboarding/useSourceTest";
import { apiRequest } from "./api";
import { ReadOnlyNote } from "./NoProduct";
import { SettingsSection } from "./SettingsSection";
import { SourceDialog, type SourceDialogMode } from "./SourceDialog";

export interface SourcesManagerProps {
  productId: string;
  productName: string;
  sources: SourceDTO[];
  plan: PlanId;
  canEdit: boolean;
}

function SourceHealth({ source }: { source: SourceDTO }) {
  if (source.lastError) {
    return (
      <p className="mt-0.5 flex items-start gap-1.5 text-xs text-danger-ink">
        <AlertCircle aria-hidden className="mt-px size-3.5 shrink-0 text-danger" />
        <span className="line-clamp-2">
          {source.lastFetchedAt ? `Last check failed ${formatRelativeTime(source.lastFetchedAt)}: ` : "Last check failed: "}
          {source.lastError}
        </span>
      </p>
    );
  }
  if (source.lastSuccessAt) {
    const count = source.lastItemCount ?? 0;
    return (
      <p className="mt-0.5 text-xs text-ink-muted">
        Checked {formatRelativeTime(source.lastSuccessAt)}, found {count} {count === 1 ? "item" : "items"}
      </p>
    );
  }
  return <p className="mt-0.5 text-xs text-ink-muted">Not checked yet. It is read on the next run.</p>;
}

function TestDialog({ source, onOpenChange }: { source: SourceDTO | null; onOpenChange: (open: boolean) => void }) {
  const { state, run, reset } = useSourceTest();
  React.useEffect(() => {
    if (source) void run({ kind: source.kind, config: source.config });
    else reset();
  }, [source, run, reset]);
  return (
    <Dialog open={Boolean(source)} onOpenChange={onOpenChange}>
      <DialogContent title="Test source" description={source?.label} size="md">
        <div className="space-y-4">
          <SourceTestResult state={state} />
          {state.status === "ok" && state.sample.length > 0 ? (
            <ul className="space-y-3">
              {state.sample.slice(0, 5).map((item, i) => (
                <li key={item.externalId ?? i} className="border-l-2 border-line-strong pl-3">
                  <p className="line-clamp-3 text-sm text-ink-secondary">{item.text}</p>
                  {item.author || item.rating ? (
                    <p className="mt-1 text-xs text-ink-muted">
                      {[item.author, item.rating ? `${item.rating} of 5` : null].filter(Boolean).join(", ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {state.status !== "loading" ? (
            <Button variant="secondary" size="sm" onClick={() => source && run({ kind: source.kind, config: source.config })}>
              Test again
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SourceRowItem({
  source,
  canEdit,
  pending,
  onToggle,
  onEdit,
  onTest,
  onRemove,
}: {
  source: SourceDTO;
  canEdit: boolean;
  pending: boolean;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onTest: () => void;
  onRemove: () => void;
}) {
  const switchId = `src-${source.id}`;
  return (
    <li className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
      <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-line bg-sunken text-ink-secondary">
        <SourceGlyph kind={source.kind} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <label htmlFor={switchId} className="min-w-0 truncate text-sm font-medium text-ink">
            {source.label}
          </label>
          {!source.enabled ? (
            <Badge tone="neutral" size="sm">
              Paused
            </Badge>
          ) : null}
        </div>
        <SourceHealth source={source} />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Switch
          id={switchId}
          checked={source.enabled}
          onCheckedChange={onToggle}
          disabled={!canEdit || pending}
          aria-label={`Check ${source.label} on every run`}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Actions for ${source.label}`} className="size-8">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem icon={FlaskConical} onSelect={onTest}>
              Test
            </DropdownMenuItem>
            {canEdit ? (
              <>
                <DropdownMenuItem icon={Pencil} onSelect={onEdit}>
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem icon={Trash2} tone="danger" onSelect={onRemove}>
                  Remove
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

export function SourcesManager({ productId, productName, sources: initial, plan, canEdit }: SourcesManagerProps) {
  const router = useRouter();
  const { open: openUpgrade, dialog: upgradeDialog } = useUpgradeDialog();
  const [sources, setSources] = React.useState(initial);
  const [dialogMode, setDialogMode] = React.useState<SourceDialogMode>({ type: "add", role: "own" });
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [testing, setTesting] = React.useState<SourceDTO | null>(null);
  const [removing, setRemoving] = React.useState<SourceDTO | null>(null);
  const [pendingIds, setPendingIds] = React.useState<Set<string>>(() => new Set());

  React.useEffect(() => setSources(initial), [initial]);

  const own = sources.filter((s) => s.role === "own");
  const competitors = sources.filter((s) => s.role === "competitor");
  const enabledCount = sources.filter((s) => s.enabled).length;
  const limit = limitFor(plan, "sources_per_product");
  const competitorNames = Array.from(new Set(competitors.map((s) => s.competitorName).filter((n): n is string => Boolean(n))));
  const competitorGroups = competitorNames.map((name) => ({
    name,
    items: competitors.filter((s) => s.competitorName === name),
  }));

  const handlePlan = React.useCallback(
    (p: PlanErrorBody) =>
      openUpgrade({
        feature: p.feature,
        limit: p.limit,
        requiredPlan: p.requiredPlan === "free" ? undefined : p.requiredPlan,
        reason: p.error,
      }),
    [openUpgrade],
  );

  function openAdd(role: "own" | "competitor") {
    setDialogMode({ type: "add", role });
    setDialogOpen(true);
  }

  function openEdit(source: SourceDTO) {
    setDialogMode({ type: "edit", source });
    setDialogOpen(true);
  }

  async function toggle(source: SourceDTO, enabled: boolean) {
    setPendingIds((s) => new Set(s).add(source.id));
    setSources((list) => list.map((s) => (s.id === source.id ? { ...s, enabled } : s)));
    const res = await apiRequest<{ source: SourceDTO }>(`/api/sources/${source.id}`, { method: "PATCH", body: { enabled } });
    setPendingIds((s) => {
      const next = new Set(s);
      next.delete(source.id);
      return next;
    });
    if (!res.ok) {
      setSources((list) => list.map((s) => (s.id === source.id ? { ...s, enabled: source.enabled } : s)));
      if (res.plan) handlePlan(res.plan);
      else toast.error(res.error);
      return;
    }
    setSources((list) => list.map((s) => (s.id === source.id ? res.data.source : s)));
    toast.success(enabled ? `${res.data.source.label} is on` : `${res.data.source.label} paused`);
    router.refresh();
  }

  async function remove() {
    if (!removing) return;
    const target = removing;
    const res = await apiRequest<{ ok: true }>(`/api/sources/${target.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(res.error);
      throw new Error(res.error);
    }
    setSources((list) => list.filter((s) => s.id !== target.id));
    toast.success("Source removed. Its feedback stays in your inbox.");
    router.refresh();
  }

  function onSaved(source: SourceDTO, created: boolean) {
    setSources((list) => (created ? [...list, source] : list.map((s) => (s.id === source.id ? source : s))));
    toast.success(created ? `Added ${source.label}. It is read on the next run.` : "Source updated");
    router.refresh();
  }

  const rows = (list: SourceDTO[]) =>
    list.map((source) => (
      <SourceRowItem
        key={source.id}
        source={source}
        canEdit={canEdit}
        pending={pendingIds.has(source.id)}
        onToggle={(v) => toggle(source, v)}
        onEdit={() => openEdit(source)}
        onTest={() => setTesting(source)}
        onRemove={() => setRemoving(source)}
      />
    ));

  return (
    <>
      {upgradeDialog}
      {!canEdit ? <ReadOnlyNote /> : null}

      <SettingsSection
        id="sources"
        title="Sources"
        description={`Where BuildMonday reads feedback about ${productName}. Paused sources keep their settings but are skipped on runs.`}
        actions={
          canEdit ? (
            <Button variant="primary" size="sm" leftIcon={<Plus />} onClick={() => openAdd("own")}>
              Add source
            </Button>
          ) : undefined
        }
        flush
      >
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <UsageMeter label="Sources checked on each run" used={enabledCount} limit={limit} unit="sources" compact />
        </div>
        {own.length > 0 ? (
          <ul className="divide-y divide-line">{rows(own)}</ul>
        ) : (
          <EmptyState headingLevel={3}
            icon={Rss}
            title="No sources yet"
            description="Add an App Store app, a subreddit or your Trustpilot page and BuildMonday checks it on every run."
            action={
              canEdit ? (
                <Button variant="primary" leftIcon={<Plus />} onClick={() => openAdd("own")}>
                  Add source
                </Button>
              ) : undefined
            }
          />
        )}
      </SettingsSection>

      <SettingsSection
        id="competitors"
        title="Competitors"
        description="We read competitors' reviews in a separate list, so you can see the complaints you could win on."
        actions={
          canEdit && hasFeature(plan, "competitor_tracking") ? (
            <Button variant="secondary" size="sm" leftIcon={<Plus />} onClick={() => openAdd("competitor")}>
              Add competitor source
            </Button>
          ) : undefined
        }
        flush
      >
        <PaywallGate
          feature="competitor_tracking"
          plan={plan}
          className="p-4 sm:p-5"
          title="Competitor tracking is on Pro and Team"
          description="Watch up to 2 competitors on Pro and 10 on Team. Their complaints show up as a separate list on your dashboard."
        >
          {competitorGroups.length > 0 ? (
            <div className="divide-y divide-line">
              {competitorGroups.map((group) => (
                <div key={group.name}>
                  <p className="bg-sunken/60 px-4 py-2 text-xs font-medium text-ink-secondary sm:px-5">{group.name}</p>
                  <ul className="divide-y divide-line">{rows(group.items)}</ul>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState headingLevel={3}
              icon={Swords}
              title="No competitors yet"
              description="Add a competitor's App Store, Google Play or Trustpilot page."
              action={
                canEdit ? (
                  <Button variant="secondary" leftIcon={<Plus />} onClick={() => openAdd("competitor")}>
                    Add competitor source
                  </Button>
                ) : undefined
              }
            />
          )}
        </PaywallGate>
      </SettingsSection>

      <SourceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        mode={dialogMode}
        productId={productId}
        productName={productName}
        competitorNames={competitorNames}
        onSaved={onSaved}
        onPlanError={handlePlan}
      />
      <TestDialog source={testing} onOpenChange={(open) => (!open ? setTesting(null) : undefined)} />
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => (!open ? setRemoving(null) : undefined)}
        tone="danger"
        title="Remove this source?"
        description={
          removing
            ? `${removing.label} will no longer be checked. Feedback already collected from it stays in your inbox.`
            : undefined
        }
        confirmLabel="Remove source"
        onConfirm={remove}
      />
    </>
  );
}
