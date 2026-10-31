"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Lock } from "lucide-react";
import { GitHubGlyph, LinearGlyph, SlackGlyph } from "@/components/brand/logos";
import { useUpgradeDialog } from "@/components/billing";
import { useSearchParams } from "next/navigation";
import {
  CONNECT_FORMS,
  NO_OAUTH,
  TrackerDestination,
  type OAuthAvailability,
} from "@/components/integrations/ConnectForms";
import { Badge, Button, ConfirmDialog, Dialog, DialogContent, toast } from "@/components/ui";
import type { IntegrationDTO } from "@/lib/db/dto";
import type { IntegrationKind } from "@/lib/db/schema";
import { formatRelativeTime } from "@/lib/utils";
import { hasFeature, type FeatureKey, type PlanErrorBody, type PlanId } from "@/lib/plans";
import { apiRequest } from "./api";
import { ReadOnlyNote } from "./NoProduct";
import { SettingsSection } from "./SettingsSection";

export interface IntegrationsPanelProps {
  integrations: Record<IntegrationKind, IntegrationDTO | null>;
  plan: PlanId;
  canEdit: boolean;
  /** Which one-click connect flows this deployment has set up. */
  oauth?: OAuthAvailability;
}

const META: Record<
  IntegrationKind,
  { name: string; Glyph: typeof SlackGlyph; feature: FeatureKey; description: string; gate: string }
> = {
  slack: {
    name: "Slack",
    Glyph: SlackGlyph,
    feature: "slack_alerts",
    description: "Alerts for new and worsening issues, and a short Monday summary, posted to one channel.",
    gate: "Slack alerts are on Pro and Team.",
  },
  linear: {
    name: "Linear",
    Glyph: LinearGlyph,
    feature: "auto_file",
    description: "File issues to a Linear team, by hand from an issue or automatically above a score.",
    gate: "Filing to Linear is on Pro and Team.",
  },
  github: {
    name: "GitHub Issues",
    Glyph: GitHubGlyph,
    feature: "auto_file",
    description: "File issues to a repository with the evidence and a link back to BuildMonday.",
    gate: "Filing to GitHub is on Pro and Team.",
  },
};

function detailLine(i: IntegrationDTO): string {
  const c = i.config;
  if (c.kind === "slack") {
    const where = c.channelName ? `Posts to #${c.channelName}` : "Posts to the webhook's channel";
    return c.auth === "oauth" ? `${where}, added with Slack` : where;
  }
  if (c.kind === "linear") {
    const how = c.auth === "oauth" ? "Connected with Linear OAuth" : "Personal API key";
    return `${how}${c.labelName ? `, label "${c.labelName}"` : ""}`;
  }
  const how = c.auth === "app" ? "BuildMonday GitHub App" : `${c.owner}/${c.repo} with a fine-grained token`;
  return `${how}${c.labels.length > 0 ? `, labels ${c.labels.join(", ")}` : ""}`;
}

/** Secret hints only mean something for pasted secrets. */
function showsSecretHint(i: IntegrationDTO): boolean {
  const c = i.config;
  return !((c.kind === "github" && c.auth === "app") || (c.kind === "linear" && c.auth === "oauth"));
}

// ---------------------------------------------------------------------------
// Connect dialog
// ---------------------------------------------------------------------------

function ConnectDialog({
  kind,
  existing,
  oauth,
  onOpenChange,
  onConnected,
  onPlanError,
}: {
  kind: IntegrationKind | null;
  existing: IntegrationDTO | null;
  oauth: OAuthAvailability;
  onOpenChange: (open: boolean) => void;
  onConnected: (integration: IntegrationDTO) => void;
  onPlanError: (plan: PlanErrorBody) => void;
}) {
  const meta = kind ? META[kind] : null;
  const Form = kind ? CONNECT_FORMS[kind] : null;
  return (
    <Dialog open={Boolean(kind)} onOpenChange={onOpenChange}>
      {kind && meta && Form ? (
        <DialogContent
          title={existing ? `Reconnect ${meta.name}` : `Connect ${meta.name}`}
          description={meta.description}
          size="md"
        >
          <Form
            key={kind}
            existing={existing}
            oauth={oauth[kind]}
            returnTo="/settings/integrations"
            autoFocus
            onCancel={() => onOpenChange(false)}
            onConnected={(integration) => {
              onConnected(integration);
              onOpenChange(false);
            }}
            onPlanError={(plan) => {
              onOpenChange(false);
              onPlanError(plan);
            }}
          />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function IntegrationsPanel({ integrations: initial, plan, canEdit, oauth = NO_OAUTH }: IntegrationsPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { open: openUpgrade, dialog: upgradeDialog } = useUpgradeDialog();
  const [items, setItems] = React.useState(initial);
  const [connecting, setConnecting] = React.useState<IntegrationKind | null>(null);
  const [disconnecting, setDisconnecting] = React.useState<IntegrationKind | null>(null);
  const [testing, setTesting] = React.useState<IntegrationKind | null>(null);

  React.useEffect(() => setItems(initial), [initial]);

  // Coming back from a one-click connect flow: say what happened once, then clean the URL.
  const handledReturn = React.useRef(false);
  React.useEffect(() => {
    if (handledReturn.current) return;
    const connected = searchParams?.get("connected");
    const failed = searchParams?.get("integration_error");
    if (!connected && !failed) return;
    handledReturn.current = true;
    if (connected && connected in META) toast.success(`${META[connected as IntegrationKind].name} connected`);
    if (failed) toast.error(failed);
    router.replace("/settings/integrations", { scroll: false });
  }, [router, searchParams]);

  const handlePlan = (p: PlanErrorBody) =>
    openUpgrade({
      feature: p.feature,
      limit: p.limit,
      requiredPlan: p.requiredPlan === "free" ? undefined : p.requiredPlan,
      reason: p.error,
    });

  async function test(kind: IntegrationKind) {
    setTesting(kind);
    const res = await apiRequest<{ ok: true }>(`/api/integrations/${kind}/test`, { method: "POST" });
    setTesting(null);
    const name = META[kind].name;
    if (!res.ok) {
      setItems((s) => (s[kind] ? { ...s, [kind]: { ...s[kind]!, status: "error", lastError: res.error } } : s));
      toast.error(res.error);
      return;
    }
    setItems((s) => (s[kind] ? { ...s, [kind]: { ...s[kind]!, status: "connected", lastError: null } } : s));
    toast.success(kind === "slack" ? "Test message sent to Slack" : `${name} connection works`);
  }

  async function disconnect() {
    if (!disconnecting) return;
    const kind = disconnecting;
    const res = await apiRequest<{ ok: true }>(`/api/integrations/${kind}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(res.error);
      throw new Error(res.error);
    }
    setItems((s) => ({ ...s, [kind]: null }));
    toast.success(`${META[kind].name} disconnected`);
    router.refresh();
  }

  const kinds: IntegrationKind[] = ["slack", "linear", "github"];

  return (
    <>
      {upgradeDialog}
      {!canEdit ? <ReadOnlyNote>Only workspace admins can connect or change integrations.</ReadOnlyNote> : null}

      <SettingsSection
        id="integrations"
        title="Integrations"
        description="Where alerts and issues go. Keys and webhook URLs are encrypted, and only the last four characters are shown."
        flush
      >
        <ul className="divide-y divide-line">
          {kinds.map((kind) => {
            const meta = META[kind];
            const item = items[kind];
            const allowed = hasFeature(plan, meta.feature);
            const Glyph = meta.Glyph;
            return (
              <li key={kind} className="flex flex-col gap-4 px-4 py-5 sm:flex-row sm:items-start sm:px-5">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-line bg-sunken text-ink">
                  <Glyph className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold text-ink">{meta.name}</h3>
                    {item ? (
                      item.status === "connected" ? (
                        <Badge tone="success" icon={CheckCircle2} size="sm">
                          Connected
                        </Badge>
                      ) : (
                        <Badge tone="danger" icon={AlertCircle} size="sm">
                          Needs attention
                        </Badge>
                      )
                    ) : null}
                    {!allowed ? (
                      <Badge tone="neutral" variant="outline" icon={Lock} size="sm">
                        Pro
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">{meta.description}</p>
                  {item ? (
                    <div className="mt-2 space-y-1 text-xs text-ink-secondary">
                      <p>
                        {detailLine(item)}.
                        {showsSecretHint(item) ? (
                          <>
                            {" "}
                            Secret ending in <span className="font-mono">{item.secretHint}</span>.
                          </>
                        ) : null}{" "}
                        Connected {formatRelativeTime(item.connectedAt)}.
                      </p>
                      {kind !== "slack" ? (
                        <TrackerDestination
                          integration={item}
                          canEdit={canEdit && allowed}
                          onChanged={(updated) => {
                            setItems((st) => ({ ...st, [updated.kind]: updated }));
                            toast.success(`${meta.name} destination updated`);
                          }}
                        />
                      ) : null}
                      {item.lastError ? <p className="text-danger-ink">{item.lastError}</p> : null}
                      {!allowed ? <p className="text-ink-muted">Saved, but not used on your current plan.</p> : null}
                    </div>
                  ) : !allowed ? (
                    <p className="mt-2 text-xs text-ink-muted">{meta.gate}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  {!allowed && !item ? (
                    <Button variant="secondary" size="sm" onClick={() => openUpgrade({ feature: meta.feature, reason: meta.gate })}>
                      Upgrade
                    </Button>
                  ) : null}
                  {allowed && !item && canEdit ? (
                    <Button variant="primary" size="sm" onClick={() => setConnecting(kind)}>
                      Connect {meta.name === "GitHub Issues" ? "GitHub" : meta.name}
                    </Button>
                  ) : null}
                  {item ? (
                    <>
                      {canEdit ? (
                        <Button variant="secondary" size="sm" onClick={() => test(kind)} loading={testing === kind}>
                          {testing === kind ? "Testing…" : "Test"}
                        </Button>
                      ) : null}
                      {canEdit && allowed ? (
                        <Button variant="ghost" size="sm" onClick={() => setConnecting(kind)}>
                          Change
                        </Button>
                      ) : null}
                      {canEdit ? (
                        <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setDisconnecting(kind)}>
                          Disconnect
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </SettingsSection>

      <ConnectDialog
        kind={connecting}
        existing={connecting ? items[connecting] : null}
        oauth={oauth}
        onOpenChange={(open) => (!open ? setConnecting(null) : undefined)}
        onConnected={(integration) => {
          setItems((s) => ({ ...s, [integration.kind]: integration }));
          toast.success(`${META[integration.kind].name} connected`);
          router.refresh();
        }}
        onPlanError={handlePlan}
      />
      <ConfirmDialog
        open={Boolean(disconnecting)}
        onOpenChange={(open) => (!open ? setDisconnecting(null) : undefined)}
        tone="danger"
        title={disconnecting ? `Disconnect ${META[disconnecting].name}?` : "Disconnect"}
        description={
          disconnecting === "slack"
            ? "Alerts stop posting to Slack. Email alerts and the Monday email are not affected."
            : "Auto-filing stops for every product that files here. Issues already filed stay where they are."
        }
        confirmLabel="Disconnect"
        onConfirm={disconnect}
      />
    </>
  );
}
