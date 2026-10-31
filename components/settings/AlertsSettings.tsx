"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LinearGlyph, GitHubGlyph } from "@/components/brand/logos";
import { PaywallGate, useUpgradeDialog } from "@/components/billing";
import { ChoiceGroup } from "@/components/onboarding/ChoiceGroup";
import { ALERT_OPTIONS } from "@/components/onboarding/model";
import { Button, Callout, PriorityMeter, SegmentedControl, Switch, toast } from "@/components/ui";
import type { ProductDTO } from "@/lib/db/dto";
import type { AlertMode, TrackerTarget } from "@/lib/db/schema";
import { hasFeature, type PlanId } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { updateMyNotificationsAction } from "@/app/settings/team/actions";
import { apiRequest } from "./api";
import { ReadOnlyNote } from "./NoProduct";
import { SettingRow, SettingsSection } from "./SettingsSection";

export interface AlertsSettingsProps {
  product: ProductDTO | null;
  plan: PlanId;
  canEdit: boolean;
  me: { notifyDigest: boolean; alertMode: AlertMode };
  connected: Record<TrackerTarget, boolean>;
  slackConnected: boolean;
}

function Slider({
  id,
  value,
  min,
  max,
  step = 5,
  onChange,
  disabled,
  describedBy,
}: {
  id: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  return (
    <div className="space-y-1.5">
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={(e) => onChange(Number(e.target.value))}
        className="focus-ring h-2 w-full cursor-pointer rounded-full accent-brand disabled:cursor-not-allowed"
      />
      <div aria-hidden className="flex justify-between text-xs tabular-nums text-ink-muted">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function ThresholdReadout({ score, text }: { score: number; text: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-ink-secondary">{text}</p>
      <span className="inline-flex items-center gap-2">
        <span className="font-display text-2xl font-semibold tabular-nums text-ink">{score}</span>
        <PriorityMeter score={score} />
      </span>
    </div>
  );
}

const TRACKERS: Record<TrackerTarget, { name: string; Glyph: typeof LinearGlyph }> = {
  linear: { name: "Linear", Glyph: LinearGlyph },
  github: { name: "GitHub", Glyph: GitHubGlyph },
};

export function AlertsSettings({ product, plan, canEdit, me, connected, slackConnected }: AlertsSettingsProps) {
  const router = useRouter();
  const { open: openUpgrade, dialog: upgradeDialog } = useUpgradeDialog();

  // ---- my notifications (auto-saved) ----
  const [prefs, setPrefs] = React.useState(me);
  const [prefsPending, startPrefs] = React.useTransition();
  function savePrefs(next: { notifyDigest: boolean; alertMode: AlertMode }) {
    const previous = prefs;
    setPrefs(next);
    startPrefs(async () => {
      const res = await updateMyNotificationsAction(next);
      if (!res.ok) {
        setPrefs(previous);
        toast.error(res.error);
        return;
      }
      toast.success("Notification settings saved");
    });
  }

  // ---- alert threshold ----
  const [threshold, setThreshold] = React.useState(product?.alertThreshold ?? 70);
  const [thresholdSaving, setThresholdSaving] = React.useState(false);

  // ---- auto-file ----
  const [autofile, setAutofile] = React.useState({
    enabled: product?.autofileEnabled ?? false,
    target: (product?.autofileTarget ?? (connected.linear ? "linear" : connected.github ? "github" : "linear")) as TrackerTarget,
    threshold: product?.autofileThreshold ?? 80,
  });
  const [autofileSaving, setAutofileSaving] = React.useState(false);
  const [autofileError, setAutofileError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!product) return;
    setThreshold(product.alertThreshold);
    setAutofile({
      enabled: product.autofileEnabled,
      target: (product.autofileTarget ?? (connected.linear ? "linear" : connected.github ? "github" : "linear")) as TrackerTarget,
      threshold: product.autofileThreshold,
    });
  }, [product, connected.linear, connected.github]);

  async function patchProduct(body: Record<string, unknown>): Promise<boolean> {
    if (!product) return false;
    const res = await apiRequest<{ product: ProductDTO }>(`/api/products/${product.id}`, { method: "PATCH", body });
    if (!res.ok) {
      if (res.plan) {
        openUpgrade({
          feature: res.plan.feature,
          limit: res.plan.limit,
          requiredPlan: res.plan.requiredPlan === "free" ? undefined : res.plan.requiredPlan,
          reason: res.plan.error,
        });
      }
      throw new Error(res.error);
    }
    router.refresh();
    return true;
  }

  async function saveThreshold() {
    setThresholdSaving(true);
    try {
      await patchProduct({ alertThreshold: threshold });
      toast.success("Alert threshold saved");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setThresholdSaving(false);
    }
  }

  async function saveAutofile() {
    setAutofileSaving(true);
    setAutofileError(null);
    try {
      await patchProduct({
        autofileEnabled: autofile.enabled,
        autofileTarget: autofile.target,
        autofileThreshold: autofile.threshold,
      });
      toast.success(autofile.enabled ? `Auto-filing to ${TRACKERS[autofile.target].name} is on` : "Auto-filing is off");
    } catch (err) {
      setAutofileError((err as Error).message);
    } finally {
      setAutofileSaving(false);
    }
  }

  const instant = hasFeature(plan, "instant_email_alerts");
  const thresholdDirty = product ? threshold !== product.alertThreshold : false;
  const autofileDirty = product
    ? autofile.enabled !== product.autofileEnabled ||
      autofile.threshold !== product.autofileThreshold ||
      (autofile.enabled && autofile.target !== product.autofileTarget)
    : false;
  const targetConnected = connected[autofile.target];

  return (
    <>
      {upgradeDialog}

      <SettingsSection
        id="my-notifications"
        title="Your notifications"
        description="Just for you. Everyone on the team picks their own."
      >
        <div className="space-y-6">
          <SettingRow
            title="Monday email"
            htmlFor="al-digest"
            description="Every Monday morning: the ranked list, what is new, what got worse and what you fixed."
            control={
              <Switch
                id="al-digest"
                checked={prefs.notifyDigest}
                disabled={prefsPending}
                onCheckedChange={(notifyDigest) => savePrefs({ ...prefs, notifyDigest })}
              />
            }
          />
          <div className="space-y-2.5">
            <p id="al-mode" className="text-sm font-medium text-ink">
              Alerts by email
            </p>
            <ChoiceGroup
              aria-labelledby="al-mode"
              variant="list"
              value={prefs.alertMode}
              disabled={prefsPending}
              onChange={(alertMode) => savePrefs({ ...prefs, alertMode })}
              options={ALERT_OPTIONS}
            />
            {!instant ? (
              <PaywallGate
                feature="instant_email_alerts"
                plan={plan}
                mode="inline"
                description="Instant alerts are on Pro and Team. On Free, everything arrives in the Monday email."
              >
                {null}
              </PaywallGate>
            ) : null}
          </div>
        </div>
      </SettingsSection>

      {product ? (
        <>
          {!canEdit ? <ReadOnlyNote>Only workspace admins can change the product&apos;s alert and filing rules.</ReadOnlyNote> : null}

          <SettingsSection
            id="threshold"
            title="What counts as serious"
            description={`For ${product.name}. A new issue alerts people on "Only new serious issues" when its priority reaches this score, or when we would fix it now.`}
            footer={
              canEdit ? (
                <Button variant="primary" onClick={saveThreshold} loading={thresholdSaving} disabled={!thresholdDirty}>
                  {thresholdSaving ? "Saving…" : "Save threshold"}
                </Button>
              ) : undefined
            }
          >
            <div className="space-y-4">
              <ThresholdReadout score={threshold} text={`Alert when a new or worsening issue scores ${threshold} or more.`} />
              <Slider
                id="al-threshold"
                value={threshold}
                min={0}
                max={100}
                onChange={setThreshold}
                disabled={!canEdit}
                describedBy="al-threshold-hint"
              />
              <p id="al-threshold-hint" className="text-xs text-ink-muted">
                Most teams use 60 to 80. Lower means more alerts.
                {slackConnected ? " Slack alerts use the same threshold." : ""}
              </p>
            </div>
          </SettingsSection>

          <SettingsSection
            id="autofile"
            title="File issues automatically"
            description="When an issue in your own list crosses the score you choose, BuildMonday files it once in Linear or GitHub with the evidence and a link back."
            footer={
              canEdit && hasFeature(plan, "auto_file") ? (
                <Button variant="primary" onClick={saveAutofile} loading={autofileSaving} disabled={!autofileDirty}>
                  {autofileSaving ? "Saving…" : "Save filing rules"}
                </Button>
              ) : undefined
            }
          >
            <PaywallGate
              feature="auto_file"
              plan={plan}
              title="Auto-filing is on Pro and Team"
              description="Issues that cross your threshold land in Linear or GitHub with quotes from users, filed once."
            >
              <fieldset disabled={!canEdit} className="space-y-6">
                <legend className="sr-only">Auto-filing</legend>
                {autofileError ? (
                  <Callout
                    tone="danger"
                    action={
                      /Connect/i.test(autofileError) ? (
                        <Button asChild variant="secondary" size="sm">
                          <Link href="/settings/integrations">Open integrations</Link>
                        </Button>
                      ) : undefined
                    }
                  >
                    {autofileError}
                  </Callout>
                ) : null}
                <SettingRow
                  title="File issues automatically"
                  htmlFor="al-autofile"
                  description="Off by default. Issues are never filed twice."
                  control={
                    <Switch
                      id="al-autofile"
                      checked={autofile.enabled}
                      onCheckedChange={(enabled) => setAutofile((a) => ({ ...a, enabled }))}
                    />
                  }
                />
                <div className={cn("space-y-6", !autofile.enabled && "opacity-60")}>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-ink">File to</p>
                    <SegmentedControl
                      aria-label="File issues to"
                      value={autofile.target}
                      onChange={(target) => setAutofile((a) => ({ ...a, target }))}
                      disabled={!autofile.enabled || !canEdit}
                      options={[
                        { value: "linear", label: "Linear" },
                        { value: "github", label: "GitHub Issues" },
                      ]}
                    />
                    <p className="flex items-center gap-1.5 text-xs text-ink-muted">
                      {React.createElement(TRACKERS[autofile.target].Glyph, { className: "size-3.5" })}
                      {targetConnected ? (
                        `${TRACKERS[autofile.target].name} is connected.`
                      ) : (
                        <span>
                          {TRACKERS[autofile.target].name} is not connected.{" "}
                          <Link href="/settings/integrations" className="focus-ring rounded-sm font-medium text-brand hover:underline">
                            Connect it
                          </Link>
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="space-y-4">
                    <ThresholdReadout
                      score={autofile.threshold}
                      text={`File issues that score ${autofile.threshold} or more.`}
                    />
                    <Slider
                      id="al-autofile-threshold"
                      value={autofile.threshold}
                      min={50}
                      max={100}
                      onChange={(v) => setAutofile((a) => ({ ...a, threshold: v }))}
                      disabled={!autofile.enabled || !canEdit}
                    />
                  </div>
                </div>
              </fieldset>
            </PaywallGate>
          </SettingsSection>
        </>
      ) : null}
    </>
  );
}
