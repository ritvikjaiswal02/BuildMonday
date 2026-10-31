"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Globe, Plus, RefreshCw } from "lucide-react";
import { useUpgradeDialog } from "@/components/billing";
import { Button, Callout, ConfirmDialog, CopyField, Field, Input, Switch, Textarea, toast } from "@/components/ui";
import type { ProductDTO } from "@/lib/db/dto";
import { formatRelativeTime } from "@/lib/utils";
import { hasFeature, type PlanId } from "@/lib/plans";
import { apiRequest, formatUtc } from "./api";
import { ReadOnlyNote } from "./NoProduct";
import { SettingRow, SettingsSection } from "./SettingsSection";

export interface ProductSettingsProps {
  product: ProductDTO;
  plan: PlanId;
  canEdit: boolean;
  canAddProduct: boolean;
  productCount: number;
}

interface DetailsForm {
  name: string;
  websiteUrl: string;
  description: string;
}

function detailsFrom(p: ProductDTO): DetailsForm {
  return { name: p.name, websiteUrl: p.websiteUrl ?? "", description: p.description ?? "" };
}

export function ProductSettings({ product: initial, plan, canEdit, canAddProduct, productCount }: ProductSettingsProps) {
  const router = useRouter();
  const { open: openUpgrade, dialog: upgradeDialog } = useUpgradeDialog();
  const [product, setProduct] = React.useState(initial);
  const [form, setForm] = React.useState<DetailsForm>(() => detailsFrom(initial));
  const [saving, setSaving] = React.useState(false);
  const [detailsError, setDetailsError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Partial<Record<keyof DetailsForm, string>>>({});
  const [monitoringPending, setMonitoringPending] = React.useState(false);
  const [rotateOpen, setRotateOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);

  React.useEffect(() => {
    setProduct(initial);
    setForm(detailsFrom(initial));
  }, [initial]);

  const dirty =
    form.name.trim() !== product.name ||
    (form.websiteUrl.trim() || null) !== (product.websiteUrl ?? null) ||
    (form.description.trim() || null) !== (product.description ?? null);

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    const errors: Partial<Record<keyof DetailsForm, string>> = {};
    if (!form.name.trim()) errors.name = "Enter a product name.";
    if (form.description.trim().length > 280) errors.description = "Keep the description under 280 characters.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    setDetailsError(null);
    const res = await apiRequest<{ product: ProductDTO }>(`/api/products/${product.id}`, {
      method: "PATCH",
      body: {
        name: form.name,
        websiteUrl: form.websiteUrl.trim() || null,
        description: form.description.trim() || null,
      },
    });
    setSaving(false);
    if (!res.ok) {
      if (/web address/i.test(res.error)) setFieldErrors({ websiteUrl: res.error });
      else setDetailsError(res.error);
      return;
    }
    setProduct(res.data.product);
    setForm(detailsFrom(res.data.product));
    toast.success("Product saved");
    router.refresh();
  }

  async function toggleMonitoring(next: boolean) {
    setMonitoringPending(true);
    const res = await apiRequest<{ product: ProductDTO }>(`/api/products/${product.id}`, {
      method: "PATCH",
      body: { monitoringEnabled: next },
    });
    setMonitoringPending(false);
    if (!res.ok) {
      if (res.plan) {
        openUpgrade({
          limit: res.plan.limit,
          feature: res.plan.feature,
          requiredPlan: res.plan.requiredPlan === "free" ? undefined : res.plan.requiredPlan,
          reason: res.plan.error,
        });
      } else toast.error(res.error);
      return;
    }
    setProduct(res.data.product);
    toast.success(next ? "Monitoring is on" : "Monitoring paused");
    router.refresh();
  }

  async function rotateKey() {
    const res = await apiRequest<{ publicKey: string }>(`/api/products/${product.id}/rotate-key`, { method: "POST" });
    if (!res.ok) {
      toast.error(res.error);
      throw new Error(res.error);
    }
    setProduct((p) => ({ ...p, publicKey: res.data.publicKey }));
    toast.success("New key created. Update the script tag on your site.");
  }

  async function archive() {
    const res = await apiRequest<{ ok: true }>(`/api/products/${product.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(res.error);
      throw new Error(res.error);
    }
    toast.success(`${product.name} archived`);
    router.push("/dashboard");
    router.refresh();
  }

  const daily = hasFeature(plan, "daily_runs");
  const lastRun = product.lastRunAt ? formatRelativeTime(product.lastRunAt) : null;
  const nextRun = formatUtc(product.nextRunAt);

  return (
    <>
      {upgradeDialog}
      {!canEdit ? <ReadOnlyNote /> : null}

      <form onSubmit={saveDetails} noValidate>
        <SettingsSection
          id="details"
          title="Product details"
          description="The name and description give the analysis context, so complaints about other things are easier to ignore."
          footer={
            canEdit ? (
              <>
                {dirty ? (
                  <Button variant="ghost" onClick={() => setForm(detailsFrom(product))} disabled={saving}>
                    Discard changes
                  </Button>
                ) : null}
                <Button type="submit" variant="primary" loading={saving} disabled={!dirty}>
                  {saving ? "Saving…" : "Save changes"}
                </Button>
              </>
            ) : undefined
          }
        >
          <fieldset disabled={!canEdit} className="space-y-5">
            <legend className="sr-only">Product details</legend>
            {detailsError ? <Callout tone="danger">{detailsError}</Callout> : null}
            <Field label="Product name" htmlFor="ps-name" error={fieldErrors.name ?? null}>
              <Input
                id="ps-name"
                value={form.name}
                maxLength={60}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <Field label="Website" htmlFor="ps-site" optional error={fieldErrors.websiteUrl ?? null}>
              <Input
                id="ps-site"
                type="url"
                inputMode="url"
                leftIcon={<Globe />}
                value={form.websiteUrl}
                placeholder="https://acme.com"
                onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))}
              />
            </Field>
            <Field
              label="What does it do, in one sentence?"
              htmlFor="ps-desc"
              optional
              hint={`${form.description.length}/280`}
              error={fieldErrors.description ?? null}
            >
              <Textarea
                id="ps-desc"
                rows={3}
                autoGrow
                className="max-h-40"
                value={form.description}
                placeholder="A note-taking app for students that syncs across devices."
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </Field>
          </fieldset>
        </SettingsSection>
      </form>

      <SettingsSection
        id="monitoring"
        title="Monitoring"
        description={
          daily
            ? "BuildMonday checks every source once a day and updates the list."
            : "On Free, BuildMonday checks every Sunday so your Monday email has a fresh list. Pro checks daily."
        }
      >
        <SettingRow
          title="Check this product's sources"
          htmlFor="ps-monitoring"
          description={
            <span className="flex flex-wrap gap-x-4 gap-y-1">
              <span>{lastRun ? `Last run ${lastRun}` : "No runs yet"}</span>
              {product.monitoringEnabled && nextRun ? <span>Next run {nextRun}</span> : null}
              {!product.monitoringEnabled ? <span>Paused. Feedback from the widget and extension still arrives.</span> : null}
            </span>
          }
          control={
            <Switch
              id="ps-monitoring"
              checked={product.monitoringEnabled}
              onCheckedChange={toggleMonitoring}
              disabled={!canEdit || monitoringPending}
            />
          }
        />
      </SettingsSection>

      <SettingsSection
        id="widget-key"
        title="Website widget key"
        description="The public key in your feedback widget's script tag. It only allows sending feedback to this product."
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/extension">Set up the widget</Link>
          </Button>
        }
      >
        <div className="space-y-3">
          <CopyField value={product.publicKey} label="Public key" mono />
          {canEdit ? (
            <Button variant="ghost" size="sm" leftIcon={<RefreshCw />} onClick={() => setRotateOpen(true)}>
              Rotate key
            </Button>
          ) : null}
        </div>
      </SettingsSection>

      {canEdit ? (
        <SettingsSection
          id="products"
          title="Products"
          description={`This workspace has ${productCount} ${productCount === 1 ? "product" : "products"}. Each one has its own sources, inbox and issue list.`}
        >
          {canAddProduct ? (
            <Button asChild variant="secondary" leftIcon={<Plus />}>
              <Link href="/onboarding?new=1">Add another product</Link>
            </Button>
          ) : (
            <p className="text-sm text-ink-muted">
              Your plan is full.{" "}
              <button
                type="button"
                className="focus-ring rounded-sm font-medium text-brand hover:underline"
                onClick={() => openUpgrade({ limit: "products", reason: "Add more products on Pro and Team." })}
              >
                Upgrade
              </button>{" "}
              to watch more products.
            </p>
          )}
        </SettingsSection>
      ) : null}

      {canEdit ? (
        <SettingsSection
          id="danger"
          tone="danger"
          title="Archive this product"
          description="Monitoring stops and the product leaves the product switcher. Its feedback and issues are kept."
        >
          <Button variant="secondary" leftIcon={<Archive />} onClick={() => setArchiveOpen(true)} className="text-danger">
            Archive {product.name}
          </Button>
        </SettingsSection>
      ) : null}

      <ConfirmDialog
        open={rotateOpen}
        onOpenChange={setRotateOpen}
        title="Rotate the widget key?"
        description="The current key stops working right away. Update the script tag on your site with the new key."
        confirmLabel="Rotate key"
        onConfirm={rotateKey}
      />
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        tone="danger"
        title={`Archive ${product.name}?`}
        description="Monitoring stops and the product leaves the product switcher. Its feedback and issues are kept."
        confirmLabel="Archive product"
        onConfirm={archive}
      />
    </>
  );
}
