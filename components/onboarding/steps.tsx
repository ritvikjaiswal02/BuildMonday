"use client";

import * as React from "react";
import { CheckCircle2, Globe, MessageSquareText, Plus, Puzzle, Send, Tags, X } from "lucide-react";
import { GitHubGlyph, LinearGlyph, SlackGlyph, SourceGlyph } from "@/components/brand/logos";
import { PaywallGate } from "@/components/billing";
import {
  GitHubConnectForm,
  LinearConnectForm,
  SlackConnectForm,
  TrackerDestination,
  type OAuthAvailability,
} from "@/components/integrations/ConnectForms";
import { apiRequest } from "@/components/settings/api";
import {
  Badge,
  Button,
  Callout,
  Field,
  Input,
  SegmentedControl,
  Select,
  Skeleton,
  Switch,
  Textarea,
  toast,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import type { IntegrationDTO } from "@/lib/db/dto";
import type { IntegrationKind } from "@/lib/db/schema";
import { hasFeature, isUnlimited, limitFor, type PlanErrorBody, type PlanId } from "@/lib/plans";
import { ChoiceGroup } from "./ChoiceGroup";
import {
  ALERT_OPTIONS,
  MAX_WIZARD_COMPETITORS,
  ONBOARDING_AUTOFILE_THRESHOLD,
  TRACKER_OPTIONS,
  buildSourceDrafts,
  newCompetitorRow,
  subredditSuggestion,
  timezoneOptions,
  trustpilotSuggestion,
  type CompetitorStepResult,
  type FieldErrors,
  type SourceField,
  type WizardState,
} from "./model";
import {
  STORE_COUNTRIES,
  detectSourceInput,
  parseKeywords,
  searchTerms,
  type SourceDraft,
} from "./source-input";
import { SourceTestResult, useSourceTest, type SourceTestBody } from "./useSourceTest";

type SetState = React.Dispatch<React.SetStateAction<WizardState>>;

// ---------------------------------------------------------------------------
// Step 1: product
// ---------------------------------------------------------------------------

export function ProductStep({
  state,
  setState,
  errors,
}: {
  state: WizardState;
  setState: SetState;
  errors: FieldErrors;
}) {
  const p = state.product;
  const set = (patch: Partial<WizardState["product"]>) =>
    setState((s) => ({ ...s, product: { ...s.product, ...patch } }));
  return (
    <div className="space-y-6">
      <Field label="Product name" htmlFor="ob-name" error={errors.name ?? null}>
        <Input
          id="ob-name"
          value={p.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Acme Notes"
          maxLength={80}
          autoComplete="organization"
          autoFocus
          className="h-10 text-base sm:text-sm"
        />
      </Field>
      <Field
        label="Website"
        htmlFor="ob-site"
        optional
        hint="We use it to suggest a Trustpilot page."
        error={errors.websiteUrl ?? null}
      >
        <Input
          id="ob-site"
          type="url"
          inputMode="url"
          value={p.websiteUrl}
          onChange={(e) => set({ websiteUrl: e.target.value })}
          placeholder="https://acme.com"
          leftIcon={<Globe />}
          autoComplete="url"
          className="h-10"
        />
      </Field>
      <Field
        label="What does it do, in one sentence?"
        htmlFor="ob-desc"
        optional
        hint={
          <span className="flex justify-between gap-4">
            <span>Helps BuildMonday tell product complaints apart from noise.</span>
            <span className={cn("tabular-nums", p.description.length > 280 && "text-danger")}>
              {p.description.length}/280
            </span>
          </span>
        }
        error={errors.description ?? null}
      >
        <Textarea
          id="ob-desc"
          value={p.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder="A note-taking app for students that syncs across devices."
          rows={3}
          autoGrow
          className="max-h-40"
        />
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: sources
// ---------------------------------------------------------------------------

function SourceRow({
  kind,
  icon,
  label,
  htmlFor,
  hint,
  error,
  children,
  test,
}: {
  kind: string;
  /** Overrides the source glyph, for rows that are not a source themselves. */
  icon?: React.ReactNode;
  label: string;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
  test?: { body: SourceTestBody | null; disabledReason?: string };
}) {
  const { state, run, reset } = useSourceTest();
  const bodyKey = test?.body ? JSON.stringify(test.body) : "";
  const lastKey = React.useRef(bodyKey);
  React.useEffect(() => {
    if (lastKey.current !== bodyKey) {
      lastKey.current = bodyKey;
      reset();
    }
  }, [bodyKey, reset]);

  const hintId = htmlFor ? `${htmlFor}-hint` : undefined;
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;

  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="mb-2 flex items-center gap-2.5">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-line bg-sunken text-ink-secondary">
          {icon ?? <SourceGlyph kind={kind} className="size-3.5" />}
        </span>
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
            {label}
          </label>
        ) : (
          <span className="text-sm font-medium text-ink">{label}</span>
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">{children}</div>
        {test ? (
          <Button
            variant="secondary"
            size="md"
            className="shrink-0 sm:w-[84px]"
            disabled={!test.body || state.status === "loading"}
            onClick={() => test.body && run(test.body)}
            aria-label={`Test ${label}`}
          >
            Test
          </Button>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1.5 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {test ? <SourceTestResult state={state} className="mt-2" /> : null}
    </div>
  );
}

function firstDraftBody(drafts: Array<SourceDraft & { field: SourceField }>, field: SourceField): SourceTestBody | null {
  const d = drafts.find((x) => x.field === field);
  return d ? { kind: d.kind, config: d.config } : null;
}

interface AppStoreSuggestion {
  appId: string;
  name: string;
  developer: string;
  iconUrl: string | null;
  matchesWebsite: boolean;
}

/** Looks the product up in the App Store once per name and website. Fails quietly. */
function useAppStoreSuggestions(name: string, website: string, country: string, enabled: boolean) {
  const [state, setState] = React.useState<{ loading: boolean; items: AppStoreSuggestion[] }>({
    loading: false,
    items: [],
  });
  React.useEffect(() => {
    const term = name.trim();
    if (!enabled || term.length < 2) {
      setState({ loading: false, items: [] });
      return;
    }
    const controller = new AbortController();
    setState({ loading: true, items: [] });
    const params = new URLSearchParams({ name: term, website: website.trim(), country });
    fetch(`/api/sources/suggest?${params.toString()}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { appstore: [] }))
      .then((body: { appstore?: AppStoreSuggestion[] }) =>
        setState({ loading: false, items: Array.isArray(body.appstore) ? body.appstore : [] }),
      )
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name !== "AbortError") setState({ loading: false, items: [] });
      });
    return () => controller.abort();
  }, [name, website, country, enabled]);
  return state;
}

function SuggestionChip({
  onClick,
  children,
  label,
}: {
  onClick: () => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "focus-ring inline-flex max-w-full items-center gap-2 rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink-secondary",
        "transition-colors duration-120 ease-standard hover:border-line-strong hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

export function SourcesStep({
  state,
  setState,
  errors,
  plan,
  showErrors,
  suggest = true,
}: {
  state: WizardState;
  setState: SetState;
  errors: FieldErrors;
  plan: PlanId;
  showErrors: boolean;
  /** Look the product up in the App Store (off in tests). */
  suggest?: boolean;
}) {
  const s = state.sources;
  const set = (patch: Partial<WizardState["sources"]>) =>
    setState((prev) => ({ ...prev, sources: { ...prev.sources, ...patch } }));
  const result = buildSourceDrafts(state);
  const terms = searchTerms(state.product.name, parseKeywords(s.keywords));
  const suggestion = trustpilotSuggestion(state.product.websiteUrl);
  const subreddit = subredditSuggestion(state.product.name);
  const err = (field: string) => (showErrors ? (errors[field] ?? null) : null);
  const appStore = useAppStoreSuggestions(
    state.product.name,
    state.product.websiteUrl,
    s.appStoreCountry,
    suggest && !s.appStore.trim(),
  );

  // Start the keywords with the product name so people see what we search for.
  const prefilled = React.useRef(false);
  React.useEffect(() => {
    if (prefilled.current) return;
    prefilled.current = true;
    const name = state.product.name.trim();
    if (name && !s.keywords.trim()) set({ keywords: name.toLowerCase() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subredditChosen =
    subreddit !== null &&
    s.subreddits
      .toLowerCase()
      .split(/[\s,]+/)
      .some((x) => x.replace(/^\/?r\//, "") === subreddit);

  return (
    <div className="space-y-6">
      <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
        <SourceRow
          kind="appstore"
          label="App Store app"
          htmlFor="ob-appstore"
          hint="We read 1 to 3 star reviews. Pick the country store your users are in."
          error={err("appStore")}
          test={{ body: firstDraftBody(result.drafts, "appStore") }}
        >
          {!s.appStore.trim() && (appStore.loading || appStore.items.length > 0) ? (
            <div className="mb-2 flex flex-wrap items-center gap-2" aria-live="polite">
              {appStore.loading ? (
                <>
                  <span className="sr-only">Looking for your app in the App Store</span>
                  <Skeleton className="h-7 w-44 rounded-md" />
                  <Skeleton className="h-7 w-36 rounded-md" />
                </>
              ) : (
                appStore.items.map((app) => (
                  <SuggestionChip
                    key={app.appId}
                    label={`Use ${app.name}${app.developer ? ` by ${app.developer}` : ""}`}
                    onClick={() => set({ appStore: app.appId })}
                  >
                    {app.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={app.iconUrl} alt="" width={18} height={18} className="size-[18px] shrink-0 rounded-[5px]" />
                    ) : null}
                    <span className="truncate">
                      <span className="font-medium text-ink">{app.name}</span>
                      {app.developer ? <span className="text-ink-muted"> by {app.developer}</span> : null}
                    </span>
                    <span className="shrink-0 font-medium text-brand">Use this</span>
                  </SuggestionChip>
                ))
              )}
            </div>
          ) : null}
          <div className="flex gap-2">
            <Input
              id="ob-appstore"
              aria-describedby="ob-appstore-hint ob-appstore-error"
              value={s.appStore}
              onChange={(e) => {
                const value = e.target.value;
                const fromLink = /apps\.apple\.com\/([a-z]{2})\//i.exec(value)?.[1]?.toLowerCase();
                set({ appStore: value, ...(fromLink ? { appStoreCountry: fromLink } : {}) });
              }}
              placeholder="apps.apple.com/us/app/acme/id123456789 or 123456789"
              aria-invalid={Boolean(err("appStore")) || undefined}
            />
            <Select
              aria-label="App Store country"
              value={s.appStoreCountry}
              onChange={(e) => set({ appStoreCountry: e.target.value })}
              className="w-[92px] shrink-0"
            >
              {STORE_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code.toUpperCase()}
                </option>
              ))}
            </Select>
          </div>
        </SourceRow>

        <SourceRow
          kind="playstore"
          label="Google Play app"
          htmlFor="ob-playstore"
          hint="We read recent low-star reviews."
          error={err("playStore")}
          test={{ body: firstDraftBody(result.drafts, "playStore") }}
        >
          <Input
            id="ob-playstore"
            aria-describedby="ob-playstore-hint ob-playstore-error"
            value={s.playStore}
            onChange={(e) => set({ playStore: e.target.value })}
            placeholder="play.google.com/store/apps/details?id=com.acme.notes or com.acme.notes"
            aria-invalid={Boolean(err("playStore")) || undefined}
          />
        </SourceRow>

        <SourceRow
          kind="reddit"
          label="Subreddits"
          htmlFor="ob-reddit"
          hint="Comma separated. We read new posts that mention your keywords."
          error={err("subreddits")}
          test={{ body: firstDraftBody(result.drafts, "subreddits") }}
        >
          {subreddit && !subredditChosen ? (
            <div className="mb-2 flex flex-wrap gap-2">
              <SuggestionChip
                label={`Add r/${subreddit}`}
                onClick={() =>
                  set({ subreddits: s.subreddits.trim() ? `${s.subreddits.trim().replace(/,$/, "")}, r/${subreddit}` : `r/${subreddit}` })
                }
              >
                <Plus aria-hidden className="size-3.5 text-ink-muted" />
                <span className="font-medium text-ink">r/{subreddit}</span>
              </SuggestionChip>
            </div>
          ) : null}
          <Input
            id="ob-reddit"
            aria-describedby="ob-reddit-hint ob-reddit-error"
            value={s.subreddits}
            onChange={(e) => set({ subreddits: e.target.value })}
            placeholder="r/acme, r/productivity"
            aria-invalid={Boolean(err("subreddits")) || undefined}
          />
        </SourceRow>

        <SourceRow
          kind="keywords"
          icon={<Tags aria-hidden className="size-3.5" />}
          label="Words people use when they mention you"
          htmlFor="ob-keywords"
          hint="Used for Reddit and Hacker News search. Your product name is included automatically."
        >
          <Input
            id="ob-keywords"
            aria-describedby="ob-keywords-hint ob-keywords-error"
            value={s.keywords}
            onChange={(e) => set({ keywords: e.target.value })}
            placeholder="acme notes, acmenotes"
          />
        </SourceRow>

        <SourceRow
          kind="hackernews"
          label="Search Hacker News"
          test={{ body: result.watchHn ? firstDraftBody(result.drafts, "hackernews") : null }}
          hint={
            terms.length > 0
              ? `We will search for: ${terms.slice(0, 3).join(", ")}.`
              : "Add your product name or a keyword above to search Hacker News."
          }
        >
          <label className="flex h-9 cursor-pointer items-center gap-2.5 text-sm text-ink">
            <input
              type="checkbox"
              checked={result.watchHn}
              onChange={(e) => set({ watchHn: e.target.checked })}
              disabled={terms.length === 0}
              className="focus-ring size-4 rounded-sm border-line-strong accent-brand"
            />
            Watch Hacker News for these keywords
          </label>
        </SourceRow>

        <SourceRow
          kind="trustpilot"
          label="Trustpilot page"
          htmlFor="ob-trustpilot"
          error={err("trustpilot")}
          test={{ body: firstDraftBody(result.drafts, "trustpilot") }}
          hint={
            suggestion && !s.trustpilot.trim() ? (
              <>
                From your website:{" "}
                <button
                  type="button"
                  onClick={() => set({ trustpilot: suggestion })}
                  className="focus-ring rounded-sm font-medium text-brand underline-offset-2 hover:underline"
                >
                  use trustpilot.com/review/{suggestion}
                </button>
              </>
            ) : undefined
          }
        >
          <Input
            id="ob-trustpilot"
            aria-describedby="ob-trustpilot-hint ob-trustpilot-error"
            value={s.trustpilot}
            onChange={(e) => set({ trustpilot: e.target.value })}
            placeholder="trustpilot.com/review/acme.com or acme.com"
            aria-invalid={Boolean(err("trustpilot")) || undefined}
          />
        </SourceRow>
      </div>

      <SourceSummary drafts={result.drafts} plan={plan} />
      {!hasFeature(plan, "competitor_tracking") ? (
        <p className="text-sm text-ink-muted">Watching competitors is on Pro and Team.</p>
      ) : null}
    </div>
  );
}

function SourceSummary({ drafts, plan }: { drafts: SourceDraft[]; plan: PlanId }) {
  const limit = limitFor(plan, "sources_per_product");
  if (drafts.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Nothing added yet. You can also collect feedback with the website widget or the Chrome extension.
      </p>
    );
  }
  const over = !isUnlimited(limit) && drafts.length > limit;
  return (
    <section aria-labelledby="ob-summary" className="space-y-3">
      <h2 id="ob-summary" className="text-sm font-medium text-ink">
        We will check {drafts.length} {drafts.length === 1 ? "source" : "sources"}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {drafts.map((d, i) => {
          const paused = !isUnlimited(limit) && i >= limit;
          return (
            <li
              key={`${d.kind}-${d.label}`}
              className={cn(
                "inline-flex max-w-full items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-ink-secondary",
                paused && "border-dashed text-ink-muted",
              )}
            >
              <SourceGlyph kind={d.kind} className="size-3.5" />
              <span className="truncate">{d.label}</span>
              {paused ? (
                <Badge tone="neutral" size="sm">
                  Paused
                </Badge>
              ) : null}
            </li>
          );
        })}
      </ul>
      {over ? (
        <p className="text-sm text-ink-muted">
          {plan === "free"
            ? "The free plan watches 3 sources. Extra sources are saved but paused until you upgrade."
            : `Your plan watches ${limit} sources per product. Extra sources are saved but paused until you upgrade.`}
        </p>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 3: competitors
// ---------------------------------------------------------------------------

export function CompetitorsStep({
  state,
  setState,
  errors,
  plan,
  showErrors,
}: {
  state: WizardState;
  setState: SetState;
  errors: CompetitorStepResult["errors"];
  plan: PlanId;
  showErrors: boolean;
}) {
  const allowed = hasFeature(plan, "competitor_tracking");
  const limit = limitFor(plan, "competitors");
  const maxRows = isUnlimited(limit) ? MAX_WIZARD_COMPETITORS : Math.max(1, Math.min(MAX_WIZARD_COMPETITORS, limit));
  const rows = state.competitors;

  const update = (id: string, patch: Partial<{ name: string; input: string }>) =>
    setState((s) => ({ ...s, competitors: s.competitors.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const remove = (id: string) =>
    setState((s) => {
      const next = s.competitors.filter((r) => r.id !== id);
      return { ...s, competitors: next.length > 0 ? next : [newCompetitorRow()] };
    });
  const add = () => setState((s) => ({ ...s, competitors: [...s.competitors, newCompetitorRow()] }));

  return (
    <div className="space-y-5">
      {!allowed ? (
        <PaywallGate
          feature="competitor_tracking"
          plan={plan}
          mode="inline"
          description="Competitor tracking is on Pro and Team. You can skip this and add competitors later."
        >
          {null}
        </PaywallGate>
      ) : null}

      <fieldset disabled={!allowed} className={cn("space-y-3", !allowed && "opacity-60")}>
        <legend className="sr-only">Competitors</legend>
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface shadow-xs">
          {rows.map((row, index) => {
            const detected = row.input.trim() ? detectSourceInput(row.input, { allowBareDomain: true }) : null;
            const rowErrors = showErrors ? errors[row.id] : undefined;
            const n = index + 1;
            return (
              <li key={row.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] sm:items-start sm:px-5">
                <Field label={`Competitor ${n}`} htmlFor={`ob-comp-name-${row.id}`} error={rowErrors?.name ?? null}>
                  <Input
                    id={`ob-comp-name-${row.id}`}
                    value={row.name}
                    onChange={(e) => update(row.id, { name: e.target.value })}
                    placeholder="Notion"
                    maxLength={60}
                  />
                </Field>
                <Field
                  label="Their App Store, Google Play or Trustpilot page"
                  htmlFor={`ob-comp-src-${row.id}`}
                  error={rowErrors?.input ?? null}
                  hint={
                    detected ? (
                      <span className="inline-flex items-center gap-1.5 text-ink-secondary">
                        <SourceGlyph kind={detected.kind} className="size-3.5" />
                        {detected.label}
                      </span>
                    ) : undefined
                  }
                >
                  <Input
                    id={`ob-comp-src-${row.id}`}
                    value={row.input}
                    onChange={(e) => update(row.id, { input: e.target.value })}
                    placeholder="play.google.com/store/apps/details?id=notion.id"
                  />
                </Field>
                <Button
                  variant="ghost"
                  size="icon"
                  className="justify-self-end sm:mt-[26px]"
                  aria-label={`Remove competitor ${n}`}
                  onClick={() => remove(row.id)}
                  disabled={rows.length === 1 && !row.name && !row.input}
                >
                  <X />
                </Button>
              </li>
            );
          })}
        </ul>
        {rows.length < maxRows ? (
          <Button variant="ghost" leftIcon={<Plus />} onClick={add}>
            Add competitor
          </Button>
        ) : (
          <p className="text-xs text-ink-muted">You can add more competitors later in Settings.</p>
        )}
      </fieldset>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4: notify me (alerts, digest, and where alerts and issues go)
// ---------------------------------------------------------------------------

export type IntegrationMap = Record<IntegrationKind, IntegrationDTO | null>;

function QuestionBlock({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2.5">
      <p id={id} className="text-sm font-medium text-ink">
        {label}
      </p>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function ConnectedLine({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line bg-sunken px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="flex min-w-0 items-center gap-2 text-ink">
        <CheckCircle2 aria-hidden className="size-4 shrink-0 text-success" />
        <span className="min-w-0">{children}</span>
      </p>
      {action}
    </div>
  );
}

function LaterNote() {
  return <p className="text-xs text-ink-muted">You can do this later in Settings, Integrations.</p>;
}

function SlackRow({
  state,
  setState,
  plan,
  integration,
  oauth,
  returnTo,
  onConnected,
  onPlanError,
}: {
  state: WizardState;
  setState: SetState;
  plan: PlanId;
  integration: IntegrationDTO | null;
  oauth: boolean;
  returnTo: string;
  onConnected: (i: IntegrationDTO) => void;
  onPlanError: (p: PlanErrorBody) => void;
}) {
  const [testing, setTesting] = React.useState(false);
  const usesSlack = state.team.usesSlack ?? Boolean(integration);
  const channel = integration?.config.kind === "slack" ? integration.config.channelName : null;

  async function sendTest() {
    setTesting(true);
    const res = await apiRequest<{ ok: true }>("/api/integrations/slack/test", { method: "POST" });
    setTesting(false);
    if (res.ok) toast.success("Test message sent to Slack");
    else toast.error(res.error);
  }

  return (
    <li className="space-y-4 px-4 py-5 sm:px-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-line bg-sunken text-ink">
            <SlackGlyph className="size-4" />
          </span>
          <p id="ob-slack" className="text-sm font-medium text-ink">
            Does your team use Slack?
          </p>
        </div>
        <SegmentedControl
          aria-label="Does your team use Slack?"
          value={usesSlack ? "yes" : "no"}
          onChange={(v) => setState((s) => ({ ...s, team: { ...s.team, usesSlack: v === "yes" } }))}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
        />
      </div>
      {usesSlack ? (
        <PaywallGate
          feature="slack_alerts"
          plan={plan}
          mode="inline"
          description="Slack alerts are on Pro and Team. On Free, everything arrives in the Monday email."
        >
          {integration ? (
            <ConnectedLine
              action={
                <Button size="sm" variant="secondary" leftIcon={<Send />} onClick={() => void sendTest()} loading={testing}>
                  {testing ? "Sending…" : "Send a test"}
                </Button>
              }
            >
              Slack is connected{channel ? (
                <>
                  , alerts go to <span className="font-medium">#{channel}</span>
                </>
              ) : null}
              .
            </ConnectedLine>
          ) : (
            <div className="space-y-3">
              <SlackConnectForm
                existing={null}
                oauth={oauth}
                returnTo={returnTo}
                compact
                onConnected={onConnected}
                onPlanError={onPlanError}
              />
              <LaterNote />
            </div>
          )}
        </PaywallGate>
      ) : null}
    </li>
  );
}

function TrackerRow({
  state,
  setState,
  plan,
  integrations,
  oauth,
  returnTo,
  onConnected,
  onPlanError,
}: {
  state: WizardState;
  setState: SetState;
  plan: PlanId;
  integrations: IntegrationMap;
  oauth: OAuthAvailability;
  returnTo: string;
  onConnected: (i: IntegrationDTO) => void;
  onPlanError: (p: PlanErrorBody) => void;
}) {
  const t = state.team;
  const tracker = t.tracker;
  const target = tracker === "linear" || tracker === "github" ? tracker : null;
  const connected = target ? integrations[target] : null;
  const Glyph = target === "github" ? GitHubGlyph : LinearGlyph;
  const name = target === "github" ? "GitHub" : "Linear";

  const hint =
    tracker === "jira"
      ? "We do not file to Jira yet. You will still get the Monday email and can copy issues as Markdown."
      : tracker === "other"
        ? "You will still get the Monday email and can copy issues as Markdown."
        : undefined;

  return (
    <li className="space-y-4 px-4 py-5 sm:px-5">
      <QuestionBlock id="ob-tracker" label="Where do you track engineering work?" hint={hint}>
        <ChoiceGroup
          aria-labelledby="ob-tracker"
          aria-describedby={hint ? "ob-tracker-hint" : undefined}
          value={tracker}
          onChange={(value) => setState((s) => ({ ...s, team: { ...s.team, tracker: value } }))}
          options={TRACKER_OPTIONS}
        />
      </QuestionBlock>
      {target ? (
        <PaywallGate
          feature="auto_file"
          plan={plan}
          mode="inline"
          description={`Filing issues to ${name} is on Pro and Team.`}
        >
          <div className="space-y-3">
            {connected ? (
              <>
                <ConnectedLine>
                  <span className="inline-flex items-center gap-1.5">
                    <Glyph className="size-3.5" />
                    {name} is connected.
                  </span>
                </ConnectedLine>
                <TrackerDestination integration={connected} canEdit onChanged={onConnected} />
              </>
            ) : target === "linear" ? (
              <LinearConnectForm
                existing={null}
                oauth={oauth.linear}
                returnTo={returnTo}
                compact
                onConnected={onConnected}
                onPlanError={onPlanError}
              />
            ) : (
              <GitHubConnectForm
                existing={null}
                oauth={oauth.github}
                returnTo={returnTo}
                compact
                onConnected={onConnected}
                onPlanError={onPlanError}
              />
            )}
            <div className="flex items-start justify-between gap-6 border-t border-line pt-3">
              <div className="min-w-0">
                <label htmlFor="ob-autofile" className="text-sm font-medium text-ink">
                  Auto-file issues above {ONBOARDING_AUTOFILE_THRESHOLD}
                </label>
                <p id="ob-autofile-desc" className="mt-0.5 text-xs text-ink-muted">
                  {connected
                    ? `Issues that score ${ONBOARDING_AUTOFILE_THRESHOLD} or more are filed to ${name} with the quotes and a link back.`
                    : `Turns on once ${name} is connected. Change the score in Settings, Alerts.`}
                </p>
              </div>
              <Switch
                id="ob-autofile"
                checked={t.autofile}
                onCheckedChange={(autofile) => setState((s) => ({ ...s, team: { ...s.team, autofile } }))}
                aria-describedby="ob-autofile-desc"
                className="mt-0.5"
              />
            </div>
            {!connected ? <LaterNote /> : null}
          </div>
        </PaywallGate>
      ) : null}
    </li>
  );
}

export function NotificationsStep({
  state,
  setState,
  plan,
  sourceCount,
  integrations,
  onIntegrationChange,
  oauth,
  returnTo,
  digestCopy,
  onPlanError,
}: {
  state: WizardState;
  setState: SetState;
  plan: PlanId;
  sourceCount: number;
  integrations: IntegrationMap;
  onIntegrationChange: (integration: IntegrationDTO) => void;
  oauth: OAuthAvailability;
  returnTo: string;
  digestCopy: { digest: string; timezoneHint: string };
  onPlanError: (p: PlanErrorBody) => void;
}) {
  const n = state.notifications;
  const set = (patch: Partial<WizardState["notifications"]>) =>
    setState((s) => ({ ...s, notifications: { ...s.notifications, ...patch } }));
  const zones = React.useMemo(() => timezoneOptions(n.timezone), [n.timezone]);
  const alertsAllowed = hasFeature(plan, "instant_email_alerts");

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-6 rounded-lg border border-line bg-surface px-4 py-4 shadow-xs sm:px-5">
        <div className="min-w-0">
          <label htmlFor="ob-digest" className="text-sm font-medium text-ink">
            Monday digest
          </label>
          <p id="ob-digest-desc" className="mt-1 text-sm text-ink-muted">
            {digestCopy.digest}
          </p>
        </div>
        <Switch
          id="ob-digest"
          checked={n.digest}
          onCheckedChange={(digest) => set({ digest })}
          aria-describedby="ob-digest-desc"
          className="mt-0.5"
        />
      </div>

      <div className="space-y-2.5">
        <p id="ob-alerts" className="text-sm font-medium text-ink">
          Instant alerts
        </p>
        <ChoiceGroup
          aria-labelledby="ob-alerts"
          aria-describedby={alertsAllowed ? undefined : "ob-alerts-locked"}
          variant="list"
          value={alertsAllowed ? n.alerts : "off"}
          onChange={(alerts) => set({ alerts })}
          options={ALERT_OPTIONS}
          disabled={!alertsAllowed}
        />
        {!alertsAllowed ? (
          <p id="ob-alerts-locked" className="text-xs text-ink-muted">
            Instant alerts are on Pro and Team. On Free, everything arrives in the Monday email.
          </p>
        ) : null}
      </div>

      <Field label="Time zone" htmlFor="ob-tz" hint={digestCopy.timezoneHint}>
        <Select id="ob-tz" value={n.timezone} onChange={(e) => set({ timezone: e.target.value })} className="sm:max-w-[320px]">
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
      </Field>

      <section aria-labelledby="ob-tools" className="space-y-3">
        <div>
          <h2 id="ob-tools" className="text-sm font-medium text-ink">
            Send it where your team works
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Connect these now and the first serious issue reaches Slack and your tracker without you lifting a finger.
          </p>
        </div>
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface shadow-xs">
          <SlackRow
            state={state}
            setState={setState}
            plan={plan}
            integration={integrations.slack}
            oauth={oauth.slack}
            returnTo={returnTo}
            onConnected={onIntegrationChange}
            onPlanError={onPlanError}
          />
          <TrackerRow
            state={state}
            setState={setState}
            plan={plan}
            integrations={integrations}
            oauth={oauth}
            returnTo={returnTo}
            onConnected={onIntegrationChange}
            onPlanError={onPlanError}
          />
        </ul>
      </section>

      <Callout tone={sourceCount === 0 ? "brand" : "neutral"} icon={Puzzle} title="Also collect feedback directly">
        <p>
          Add a feedback button to your website with one script tag, or clip reviews from any page with the Chrome
          extension. Both are under Extension and widget in the sidebar after setup.
        </p>
        {sourceCount === 0 ? (
          <p className="mt-1.5 flex items-center gap-1.5">
            <MessageSquareText aria-hidden className="size-4 shrink-0 text-brand" />
            You have not added sources yet, so these are the quickest way to start.
          </p>
        ) : null}
      </Callout>
    </div>
  );
}
