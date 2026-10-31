"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ChevronDown, MessageSquareText, Save } from "lucide-react";
import { PaywallGate } from "@/components/billing";
import {
  Button,
  Callout,
  CopyField,
  EmptyState,
  Field,
  Input,
  SegmentedControl,
  Select,
  Switch,
  Textarea,
  toast,
} from "@/components/ui";
import type { ProductDTO } from "@/lib/db/dto";
import type { WidgetSettings } from "@/lib/db/schema";
import { hasFeature, type PlanId } from "@/lib/plans";
import { cn, formatRelativeTime, pluralize } from "@/lib/utils";
import type { ProductActivity } from "../_lib/data";
import { widgetCustomTriggerSnippet, widgetSnippet } from "../_lib/snippet";
import { requestJson } from "./request";
import { Section } from "./Section";
import { WidgetPreview } from "./WidgetPreview";

const DEFAULT_ACCENT = "#2340d9";
const HEX = /^#[0-9a-f]{6}$/i;

interface FormState {
  buttonLabel: string;
  prompt: string;
  position: WidgetSettings["position"];
  askEmail: boolean;
  accent: string | null;
  origins: string;
}

type FormErrors = Partial<Record<"buttonLabel" | "prompt" | "accent" | "origins", string>>;

function formFrom(p: ProductDTO): FormState {
  const w = p.widgetSettings;
  return {
    buttonLabel: w.buttonLabel,
    prompt: w.prompt,
    position: w.position,
    askEmail: w.askEmail,
    accent: w.accent,
    origins: p.allowedOrigins.join("\n"),
  };
}

function originLines(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function sameForm(a: FormState, b: FormState): boolean {
  return (
    a.buttonLabel.trim() === b.buttonLabel.trim() &&
    a.prompt.trim() === b.prompt.trim() &&
    a.position === b.position &&
    a.askEmail === b.askEmail &&
    (a.accent ?? "").toLowerCase() === (b.accent ?? "").toLowerCase() &&
    originLines(a.origins).join("\n") === originLines(b.origins).join("\n")
  );
}

function validate(f: FormState): FormErrors {
  const errors: FormErrors = {};
  if (!f.buttonLabel.trim()) errors.buttonLabel = "Add a button label.";
  else if (f.buttonLabel.trim().length > 24) errors.buttonLabel = "Keep the button label under 24 characters.";
  if (!f.prompt.trim()) errors.prompt = "Add a question for the text box.";
  else if (f.prompt.trim().length > 120) errors.prompt = "Keep the question under 120 characters.";
  if (f.accent !== null && !HEX.test(f.accent)) errors.accent = "Use a hex colour like #2340d9.";
  if (originLines(f.origins).length > 10) errors.origins = "Add at most 10 sites.";
  return errors;
}

export interface WidgetPanelProps {
  appUrl: string;
  plan: PlanId;
  isAdmin: boolean;
  products: ProductDTO[];
  activeProductId: string | null;
  activity: ProductActivity;
}

export function WidgetPanel({ appUrl, plan, isAdmin, products: initialProducts, activeProductId, activity }: WidgetPanelProps) {
  const router = useRouter();
  const [products, setProducts] = React.useState(initialProducts);
  const [productId, setProductId] = React.useState<string | null>(
    activeProductId && initialProducts.some((p) => p.id === activeProductId) ? activeProductId : initialProducts[0]?.id ?? null,
  );
  const product = products.find((p) => p.id === productId) ?? null;
  const [form, setForm] = React.useState<FormState | null>(product ? formFrom(product) : null);
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => setProducts(initialProducts), [initialProducts]);

  React.useEffect(() => {
    const p = products.find((x) => x.id === productId);
    setForm(p ? formFrom(p) : null);
    setErrors({});
    setSaveError(null);
    // Only reset the form when the selected product changes, not on every save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  if (!product || !form) {
    return (
      <Section id="widget" title="Website widget">
        <EmptyState headingLevel={3}
          icon={MessageSquareText}
          title="Add your first product"
          description="The widget sends what visitors write straight to a product's inbox. Add a product to get its snippet."
          action={
            <Button asChild variant="primary">
              <Link href="/onboarding?new=1">Add product</Link>
            </Button>
          }
        />
      </Section>
    );
  }

  const dirty = !sameForm(form, formFrom(product));
  const showBranding = !hasFeature(plan, "widget_unbranded");
  const stats = activity[product.id]?.widget ?? { count30d: 0, lastAt: null };
  const disabled = !isAdmin || saving;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !product) return;
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    setSaveError(null);
    const res = await requestJson<{ product: ProductDTO }>(`/api/products/${product.id}`, {
      method: "PATCH",
      body: {
        widgetSettings: {
          buttonLabel: form.buttonLabel.trim(),
          prompt: form.prompt.trim(),
          position: form.position,
          askEmail: form.askEmail,
          accent: form.accent,
        },
        allowedOrigins: originLines(form.origins),
      },
    });
    setSaving(false);
    if (!res.ok) {
      if (/site|address|origin/i.test(res.error)) setErrors({ origins: res.error });
      else setSaveError(res.error);
      return;
    }
    const saved = res.data.product;
    setProducts((list) => list.map((p) => (p.id === saved.id ? saved : p)));
    setForm(formFrom(saved));
    toast.success("Widget saved. Sites with the snippet pick it up on their next page load.");
    router.refresh();
  }

  const snippet = widgetSnippet(appUrl, product.publicKey);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
      <div className="min-w-0 space-y-6">
        {products.length > 1 ? (
          <div className="max-w-[360px]">
            <Field label="Product" htmlFor="widget-product" hint="Each product has its own snippet and settings.">
              <Select id="widget-product" value={product.id} onChange={(e) => setProductId(e.target.value)}>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        ) : null}

        <Section
          id="snippet"
          title="Add it to your site"
          description="Paste this before the closing body tag on every page where you want the Feedback button. Messages arrive in your inbox and are grouped on the next run."
        >
          <div className="space-y-4">
            <CopyField value={snippet} label="Snippet" multiline mono />
            <InstallStatus count={stats.count30d} lastAt={stats.lastAt} />
            <details className="group rounded-md border border-line">
              <summary className="focus-ring flex cursor-pointer list-none items-center justify-between gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-ink hover:bg-sunken">
                Use your own button instead
                <ChevronDown aria-hidden className="size-4 text-ink-muted transition-transform duration-120 group-open:rotate-180" />
              </summary>
              <div className="space-y-3 border-t border-line px-3 py-3">
                <p className="text-sm text-ink-secondary">
                  Hide the floating button and open the widget from a link or button you already have, such as a Help menu item.
                </p>
                <CopyField value={widgetCustomTriggerSnippet(appUrl, product.publicKey)} label="Snippet with your own button" multiline mono />
              </div>
            </details>
            <Link
              href="/widget-demo"
              target="_blank"
              className="focus-ring inline-flex items-center gap-1 rounded-sm text-sm font-medium text-brand hover:underline"
            >
              See it on a sample page
              <ArrowUpRight aria-hidden className="size-4" />
            </Link>
          </div>
        </Section>

        <form onSubmit={save} noValidate>
          <Section
            id="widget-settings"
            title="Widget settings"
            description={isAdmin ? "Changes apply the next time a visitor loads a page with the snippet." : "Only workspace admins can change the widget."}
            footer={
              isAdmin ? (
                <>
                  {dirty ? <span className="text-sm text-ink-muted sm:mr-auto">Unsaved changes</span> : null}
                  <Button
                    variant="secondary"
                    disabled={!dirty || saving}
                    onClick={() => {
                      setForm(formFrom(product));
                      setErrors({});
                      setSaveError(null);
                    }}
                  >
                    Discard
                  </Button>
                  <Button type="submit" variant="primary" leftIcon={<Save />} loading={saving} disabled={!dirty}>
                    Save widget
                  </Button>
                </>
              ) : null
            }
          >
            <div className="space-y-6">
              <fieldset className="space-y-4" disabled={disabled}>
                <legend className="mb-3 text-sm font-semibold text-ink">Appearance</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Button label" htmlFor="widget-label" error={errors.buttonLabel} hint="Up to 24 characters.">
                    <Input
                      id="widget-label"
                      value={form.buttonLabel}
                      maxLength={24}
                      onChange={(e) => update("buttonLabel", e.target.value)}
                    />
                  </Field>
                  <Field label="Question" htmlFor="widget-prompt" error={errors.prompt} hint="Shown above the text box.">
                    <Input
                      id="widget-prompt"
                      value={form.prompt}
                      maxLength={120}
                      onChange={(e) => update("prompt", e.target.value)}
                    />
                  </Field>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span id="widget-position-label" className="text-sm font-medium text-ink">
                    Position
                  </span>
                  <SegmentedControl
                    aria-label="Position"
                    value={form.position}
                    onChange={(v) => update("position", v)}
                    disabled={disabled}
                    options={[
                      { value: "bottom-right", label: "Bottom right" },
                      { value: "bottom-left", label: "Bottom left" },
                    ]}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="widget-accent-hex" className="text-sm font-medium text-ink">
                    Button colour
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="color"
                      aria-label="Pick a button colour"
                      value={form.accent && HEX.test(form.accent) ? form.accent : DEFAULT_ACCENT}
                      onChange={(e) => update("accent", e.target.value.toLowerCase())}
                      disabled={disabled}
                      className="focus-ring h-9 w-11 cursor-pointer rounded-md border border-line-strong bg-surface p-1 disabled:cursor-not-allowed"
                    />
                    <Input
                      id="widget-accent-hex"
                      className="w-[120px] font-mono"
                      value={form.accent ?? ""}
                      placeholder={DEFAULT_ACCENT}
                      maxLength={7}
                      invalid={Boolean(errors.accent)}
                      aria-describedby={errors.accent ? "widget-accent-error" : "widget-accent-hint"}
                      onChange={(e) => {
                        const v = e.target.value.trim();
                        update("accent", v ? (v.startsWith("#") ? v : `#${v}`).toLowerCase() : null);
                      }}
                    />
                    {form.accent ? (
                      <Button variant="ghost" size="sm" onClick={() => update("accent", null)} disabled={disabled}>
                        Use default
                      </Button>
                    ) : null}
                  </div>
                  {errors.accent ? (
                    <p id="widget-accent-error" className="text-xs text-danger">
                      {errors.accent}
                    </p>
                  ) : (
                    <p id="widget-accent-hint" className="text-xs text-ink-muted">
                      Leave empty for BuildMonday blue. Text on the button turns dark or light to stay readable.
                    </p>
                  )}
                </div>

                <div className="flex items-start justify-between gap-6 rounded-md border border-line px-3 py-3">
                  <div className="min-w-0">
                    <label htmlFor="widget-email" className="text-sm font-medium text-ink">
                      Ask for an email address
                    </label>
                    <p className="mt-0.5 text-sm text-ink-muted">Optional for visitors. Useful when you want to reply.</p>
                  </div>
                  <Switch
                    id="widget-email"
                    checked={form.askEmail}
                    onCheckedChange={(v) => update("askEmail", v)}
                    disabled={disabled}
                  />
                </div>
              </fieldset>

              <fieldset className="space-y-3 border-t border-line pt-6" disabled={disabled}>
                <legend className="sr-only">Where it can run</legend>
                <Field
                  label="Allowed sites"
                  htmlFor="widget-origins"
                  optional
                  error={errors.origins}
                  hint="One per line, like https://acme.com. Leave empty to accept feedback from any site. When set, copies of your snippet on other sites are refused."
                >
                  <Textarea
                    id="widget-origins"
                    rows={3}
                    className="font-mono text-[12.5px]"
                    placeholder={"https://acme.com\nhttps://app.acme.com"}
                    value={form.origins}
                    onChange={(e) => update("origins", e.target.value)}
                    spellCheck={false}
                  />
                </Field>
                {originLines(form.origins).length === 0 ? (
                  <Callout tone="warning" title="Any website can send feedback with this key">
                    The key is visible in your page source. Add your site above so copies of the snippet elsewhere are
                    refused. Widget messages have their own daily allowance, so a flood never uses up the quota your
                    sources need.
                  </Callout>
                ) : null}
              </fieldset>

              <PaywallGate
                feature="widget_unbranded"
                plan={plan}
                mode="inline"
                title="Remove the BuildMonday credit"
                description="Free widgets show “Feedback by BuildMonday” under the form. Pro and Team remove it."
              >
                <p className="text-sm text-ink-muted">The “Feedback by BuildMonday” credit is hidden on your plan.</p>
              </PaywallGate>

              {saveError ? <Callout tone="danger" title="Widget not saved">{saveError}</Callout> : null}
            </div>
          </Section>
        </form>
      </div>

      <aside className="min-w-0 lg:sticky lg:top-24">
        <Section id="widget-preview" title="Preview" description="Try it here. Nothing you send in the preview is saved." flush>
          <WidgetPreview
            settings={{
              buttonLabel: form.buttonLabel.trim() || "Feedback",
              prompt: form.prompt.trim() || "What could be better?",
              position: form.position,
              askEmail: form.askEmail,
              accent: form.accent && HEX.test(form.accent) ? form.accent : null,
              showBranding,
              productName: product.name,
            }}
          />
        </Section>
      </aside>
    </div>
  );
}

function InstallStatus({ count, lastAt }: { count: number; lastAt: string | null }) {
  const live = Boolean(lastAt);
  return (
    <div className="flex items-start gap-2.5 text-sm" aria-live="polite">
      <span
        aria-hidden
        className={cn("mt-1.5 size-2 shrink-0 rounded-full", live ? "bg-success" : "bg-line-strong")}
      />
      {live && lastAt ? (
        <p className="text-ink-secondary">
          <span className="font-medium text-ink">Receiving feedback.</span> Last message {formatRelativeTime(lastAt)},{" "}
          {pluralize(count, "message")} in the last 30 days.
        </p>
      ) : (
        <p className="text-ink-secondary">
          <span className="font-medium text-ink">No messages yet.</span> After you add the snippet, send one from your site to check it arrives in the inbox.
        </p>
      )}
    </div>
  );
}
