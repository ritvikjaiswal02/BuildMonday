"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check } from "lucide-react";
import { useUpgradeDialog } from "@/components/billing";
import { NO_OAUTH, type OAuthAvailability } from "@/components/integrations/ConnectForms";
import { Button, Callout } from "@/components/ui";
import { cn } from "@/lib/utils";
import { parsePlanError, type PlanErrorBody, type PlanId } from "@/lib/plans";
import type { IntegrationDTO } from "@/lib/db/dto";
import type { OnboardingAnswers } from "@/lib/db/schema";
import { digestTimingCopy } from "@/lib/digest/schedule";
import {
  CARRY_FEEDBACK_KEY,
  browserTimezone,
  buildCompetitorDrafts,
  buildOnboardingPayload,
  buildSourceDrafts,
  hasErrors,
  initialWizardState,
  parseCarriedFeedback,
  stepsFor,
  validateProduct,
  type StepId,
  type WizardState,
} from "./model";
import type { MonitorSourceKind } from "./source-input";
import { CompetitorsStep, NotificationsStep, ProductStep, SourcesStep, type IntegrationMap } from "./steps";

export interface OnboardingPrefill {
  kind: MonitorSourceKind;
  input: string;
  country?: string;
  label: string;
}

export interface OnboardingWizardProps {
  mode: "first" | "new";
  plan: PlanId;
  prefill: OnboardingPrefill | null;
  initialAnswers: Partial<OnboardingAnswers> | null;
  /** Where to go after setup; carries a plan the visitor picked before signing up. */
  afterSetupHref?: string;
  /** Integrations already connected in this workspace (for example after a one-click connect). */
  integrations?: IntegrationMap;
  /** Which one-click connect flows this deployment has set up. */
  oauth?: OAuthAvailability;
  /** When the Monday email goes out, for the copy in the last step. */
  digestCopy?: { digest: string; timezoneHint: string };
  /** Page to come back to after a one-click connect. */
  returnTo?: string;
  /** Look the product up in the App Store on the sources step. */
  suggestSources?: boolean;
}

const DRAFT_KEY = "bm-onboarding-draft-v2";
const NO_INTEGRATIONS: IntegrationMap = { slack: null, linear: null, github: null };

function readDraft(mode: string): { state: WizardState; step: number; visited: number } | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { mode?: string; state?: WizardState; step?: number; visited?: number };
    if (parsed.mode !== mode || !parsed.state?.product || !parsed.state.sources || !parsed.state.team) return null;
    return { state: parsed.state, step: parsed.step ?? 0, visited: parsed.visited ?? 0 };
  } catch {
    return null;
  }
}

function writeDraft(mode: string, state: WizardState, step: number, visited: number) {
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ mode, state, step, visited }));
  } catch {
    // Storage can be unavailable (private mode); the wizard still works without it.
  }
}

function clearDraft() {
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

function readCarried(): string[] {
  try {
    return parseCarriedFeedback(window.localStorage.getItem(CARRY_FEEDBACK_KEY));
  } catch {
    return [];
  }
}

function clearCarried() {
  try {
    window.localStorage.removeItem(CARRY_FEEDBACK_KEY);
  } catch {
    // ignore
  }
}

/** Adds the text analyzed on /app before signing up to the new product's inbox. Best effort. */
async function importCarried(productId: string, items: string[]): Promise<number> {
  if (items.length === 0) return 0;
  try {
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, items: items.map((text) => ({ text })) }),
    });
    if (!res.ok) return 0;
    const body = (await res.json().catch(() => null)) as { inserted?: number } | null;
    return body?.inserted ?? 0;
  } catch {
    return 0;
  }
}

export function OnboardingWizard({
  mode,
  plan,
  prefill,
  initialAnswers,
  afterSetupHref = "/dashboard?first=1",
  integrations: initialIntegrations = NO_INTEGRATIONS,
  oauth = NO_OAUTH,
  digestCopy = digestTimingCopy("weekly"),
  returnTo = "/onboarding",
  suggestSources = true,
}: OnboardingWizardProps) {
  const router = useRouter();
  const steps = React.useMemo(() => stepsFor(mode, plan), [mode, plan]);
  const { open: openUpgrade, dialog: upgradeDialog } = useUpgradeDialog();

  const [state, setState] = React.useState<WizardState>(() =>
    initialWizardState({
      timezone: "UTC",
      prefill: prefill ? { kind: prefill.kind, input: prefill.input, country: prefill.country } : null,
      answers: initialAnswers,
      plan,
    }),
  );
  const [integrations, setIntegrations] = React.useState<IntegrationMap>(initialIntegrations);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [visited, setVisited] = React.useState(0);
  const [skipped, setSkipped] = React.useState<Set<StepId>>(() => new Set());
  const [showErrors, setShowErrors] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [restored, setRestored] = React.useState(false);
  const [carried, setCarried] = React.useState<string[]>([]);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const firstRender = React.useRef(true);

  React.useEffect(() => setIntegrations(initialIntegrations), [initialIntegrations]);

  // Restore an unfinished draft (after a refresh or a one-click connect) and pick up the browser's time zone.
  React.useEffect(() => {
    const draft = prefill ? null : readDraft(mode);
    if (draft) {
      setState(draft.state);
      setStepIndex(Math.min(draft.step, steps.length - 1));
      setVisited(Math.min(draft.visited, steps.length - 1));
    } else if (!initialAnswers?.notifications?.timezone) {
      const tz = browserTimezone();
      setState((s) => ({ ...s, notifications: { ...s.notifications, timezone: tz } }));
    }
    setCarried(readCarried());
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (restored) writeDraft(mode, state, stepIndex, visited);
  }, [mode, restored, state, stepIndex, visited]);

  // Move focus to the step heading when the step changes, so screen readers announce it.
  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [stepIndex]);

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const hasCompetitorStep = steps.some((s) => s.id === "competitors");

  const productErrors = validateProduct(state.product);
  const sourceResult = buildSourceDrafts(state);
  const competitorResult = buildCompetitorDrafts(state.competitors);
  const ownSourceCount = skipped.has("sources") ? 0 : sourceResult.drafts.length;

  function stepErrors(id: StepId): boolean {
    if (id === "product") return hasErrors(productErrors);
    if (id === "sources") return hasErrors(sourceResult.errors);
    if (id === "competitors") return Object.keys(competitorResult.errors).length > 0;
    return false;
  }

  function goTo(index: number) {
    setShowErrors(false);
    setSubmitError(null);
    setStepIndex(index);
    setVisited((v) => Math.max(v, index));
  }

  function handlePlanError(planError: PlanErrorBody) {
    openUpgrade({
      feature: planError.feature,
      limit: planError.limit,
      requiredPlan: planError.requiredPlan === "free" ? undefined : planError.requiredPlan,
      reason: planError.error,
    });
  }

  function onIntegrationChange(integration: IntegrationDTO) {
    setIntegrations((current) => ({ ...current, [integration.kind]: integration }));
    if (integration.kind === "slack") setState((s) => ({ ...s, team: { ...s.team, usesSlack: true } }));
  }

  async function submit(skipping: Set<StepId>) {
    setSubmitting(true);
    setSubmitError(null);
    const skippedNotifications = skipping.has("notifications");
    const includeCompetitors = hasCompetitorStep && !skipping.has("competitors");
    const effective: WizardState = {
      ...state,
      sources: skipping.has("sources")
        ? { ...state.sources, appStore: "", playStore: "", subreddits: "", watchHn: false, trustpilot: "" }
        : state.sources,
      competitors: includeCompetitors ? state.competitors : [],
      team: skippedNotifications
        ? { tracker: null, usesSlack: integrations.slack ? true : null, autofile: false }
        : state.team,
      notifications: skippedNotifications
        ? { digest: true, alerts: state.notifications.alerts, timezone: state.notifications.timezone }
        : state.notifications,
    };
    const body = buildOnboardingPayload(effective, { includeCompetitors });
    try {
      const res = await fetch(mode === "new" ? "/api/onboarding?new=1" : "/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) {
        const message =
          (data && typeof data.error === "string" && data.error) ||
          "We could not finish setup. Your answers are still here; try again.";
        setSubmitError(message);
        if (res.status === 402) {
          const planError = parsePlanError(data);
          if (planError) handlePlanError(planError);
        }
        if (res.status === 401) {
          setSubmitError("Your session ended. Sign in again; your answers are saved in this tab.");
        }
        setSubmitting(false);
        return;
      }
      // Bring over what the visitor analyzed before signing up, so the first run has data even with no sources.
      const productId = data && typeof data.productId === "string" ? data.productId : null;
      if (productId && carried.length > 0 && mode === "first") {
        await importCarried(productId, carried);
      }
      clearCarried();
      clearDraft();
      router.push(afterSetupHref);
      router.refresh();
    } catch {
      setSubmitError("We could not reach BuildMonday. Check your connection and try again. Nothing is lost.");
      setSubmitting(false);
    }
  }

  function next() {
    if (stepErrors(step.id)) {
      setShowErrors(true);
      return;
    }
    const nextSkipped = new Set(skipped);
    nextSkipped.delete(step.id);
    setSkipped(nextSkipped);
    if (isLast) void submit(nextSkipped);
    else goTo(stepIndex + 1);
  }

  function skip() {
    const nextSkipped = new Set(skipped);
    nextSkipped.add(step.id);
    setSkipped(nextSkipped);
    if (isLast) void submit(nextSkipped);
    else goTo(stepIndex + 1);
  }

  function back() {
    if (stepIndex > 0) goTo(stepIndex - 1);
  }

  const primaryLabel = isLast
    ? mode === "new"
      ? "Add product and start monitoring"
      : "Start monitoring"
    : step.id === "sources" && sourceResult.drafts.length === 0
      ? "Continue without sources"
      : "Continue";

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,640px)] lg:gap-16">
      {upgradeDialog}

      {/* Desktop step list */}
      <nav aria-label="Setup steps" className="hidden lg:block">
        <ol className="sticky top-24 space-y-1">
          {steps.map((s, i) => {
            const done = i < stepIndex || (i <= visited && i !== stepIndex && !stepErrors(s.id));
            const current = i === stepIndex;
            const reachable = i <= visited && !submitting;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => reachable && goTo(i)}
                  disabled={!reachable}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "focus-ring flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm",
                    "transition-colors duration-120 ease-standard",
                    current ? "bg-surface font-medium text-ink shadow-xs" : "text-ink-secondary",
                    reachable && !current && "hover:bg-sunken hover:text-ink",
                    !reachable && "cursor-default text-ink-muted",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums",
                      current && "border-brand bg-brand text-on-brand",
                      !current && done && "border-brand/40 bg-brand-soft text-brand-ink",
                      !current && !done && "border-line-strong bg-surface text-ink-muted",
                    )}
                  >
                    {done && !current ? <Check className="size-3.5" /> : i + 1}
                  </span>
                  <span className="min-w-0 truncate">{s.short}</span>
                  {skipped.has(s.id) && !current ? (
                    <span className="ml-auto text-xs font-normal text-ink-muted">Skipped</span>
                  ) : null}
                  <span className="sr-only">{done && !current ? "(done)" : ""}</span>
                </button>
              </li>
            );
          })}
        </ol>
        {carried.length > 0 && mode === "first" ? (
          <p className="mt-6 px-2 text-xs text-ink-muted">
            The {carried.length} {carried.length === 1 ? "piece" : "pieces"} of feedback you analyzed will be added
            to your inbox.
          </p>
        ) : null}
      </nav>

      <div className="min-w-0">
        {/* Mobile progress */}
        <div className="mb-6 lg:hidden">
          <div className="mb-2 flex items-center justify-between text-xs text-ink-muted">
            <span>
              Step {stepIndex + 1} of {steps.length}
            </span>
            <span>{step.short}</span>
          </div>
          <div
            className="h-1 overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-valuenow={stepIndex + 1}
          >
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-240 ease-standard"
              style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
            />
          </div>
        </div>

        <section key={step.id} aria-labelledby="ob-step-title" className="animate-slide-up-sm">
          <header className="mb-8">
            <h1
              id="ob-step-title"
              ref={headingRef}
              tabIndex={-1}
              className="font-display text-2xl font-semibold text-ink outline-none sm:text-3xl"
            >
              {step.id === "product" && mode === "new" ? "Add another product" : step.title}
            </h1>
            <p className="mt-2 max-w-[60ch] text-base text-ink-secondary">{step.intro}</p>
            {step.id === "sources" && prefill ? (
              <p className="mt-3 text-sm text-ink-muted">
                We filled in the source you just analyzed: <span className="text-ink-secondary">{prefill.label}</span>.
              </p>
            ) : null}
          </header>

          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!submitting) next();
            }}
          >
            {step.id === "product" ? (
              <ProductStep state={state} setState={setState} errors={showErrors ? productErrors : {}} />
            ) : null}
            {step.id === "sources" ? (
              <SourcesStep
                state={state}
                setState={setState}
                errors={sourceResult.errors}
                plan={plan}
                showErrors={showErrors}
                suggest={suggestSources}
              />
            ) : null}
            {step.id === "competitors" ? (
              <CompetitorsStep
                state={state}
                setState={setState}
                errors={competitorResult.errors}
                plan={plan}
                showErrors={showErrors}
              />
            ) : null}
            {step.id === "notifications" ? (
              <NotificationsStep
                state={state}
                setState={setState}
                plan={plan}
                sourceCount={ownSourceCount + (carried.length > 0 ? 1 : 0)}
                integrations={integrations}
                onIntegrationChange={onIntegrationChange}
                oauth={oauth}
                returnTo={returnTo}
                digestCopy={digestCopy}
                onPlanError={handlePlanError}
              />
            ) : null}

            {showErrors && stepErrors(step.id) ? (
              <Callout tone="danger" className="mt-6">
                Fix the highlighted fields to continue{step.skippable ? ", or skip this step for now" : ""}.
              </Callout>
            ) : null}

            {submitError ? (
              <Callout tone="danger" className="mt-6" title="Setup did not finish">
                {submitError}
              </Callout>
            ) : null}

            <div className="mt-10 flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:items-center">
              {stepIndex > 0 ? (
                <Button variant="ghost" leftIcon={<ArrowLeft />} onClick={back} disabled={submitting}>
                  Back
                </Button>
              ) : null}
              <div className="flex flex-col-reverse gap-3 sm:ml-auto sm:flex-row sm:items-center">
                {step.skippable ? (
                  <Button variant="ghost" onClick={skip} disabled={submitting}>
                    Skip for now
                  </Button>
                ) : null}
                <Button type="submit" variant="primary" size="lg" loading={submitting && isLast}>
                  {submitting && isLast ? "Starting…" : primaryLabel}
                </Button>
              </div>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
