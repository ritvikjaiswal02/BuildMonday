/**
 * The onboarding wizard's state, step definitions, validation and the
 * request body it posts to POST /api/onboarding. Pure and client-safe.
 */
import type { AlertMode, OnboardingAnswers } from "@/lib/db/schema";
import { hasFeature, type PlanId } from "@/lib/plans";
import {
  describeSource,
  detectSourceInput,
  parseAppStoreInput,
  parseKeywords,
  parsePlayStoreInput,
  parseSubreddits,
  parseTrustpilotInput,
  searchTerms,
  sourceFingerprint,
  type MonitorSourceKind,
  type SourceDraft,
} from "./source-input";

export type TeamAnswers = OnboardingAnswers["team"];
export type NotificationAnswers = OnboardingAnswers["notifications"];

export type StepId = "product" | "sources" | "competitors" | "notifications";

export interface StepDef {
  id: StepId;
  title: string;
  short: string;
  intro: string;
  skippable: boolean;
}

export const STEPS: StepDef[] = [
  {
    id: "product",
    title: "What are you building?",
    short: "Your product",
    intro: "We use this to name your workspace and to give the analysis context.",
    skippable: false,
  },
  {
    id: "sources",
    title: "Where do your customers talk about you?",
    short: "Sources",
    intro:
      "Add the places you want BuildMonday to check every day. Paste a link or an ID. You can add more later.",
    skippable: true,
  },
  {
    id: "competitors",
    title: "Who do you compete with?",
    short: "Competitors",
    intro: "Optional. We watch competitors' reviews and show you the complaints you could win on.",
    skippable: true,
  },
  {
    id: "notifications",
    title: "Who should hear about it?",
    short: "Notify me",
    intro: "Pick how loud BuildMonday should be and where alerts and issues go. You can change all of it later in Settings.",
    skippable: true,
  },
];

/**
 * The steps to show. Competitors only appear when the plan can track them;
 * adding a second product skips the workspace questions.
 */
export function stepsFor(mode: "first" | "new", plan: PlanId = "free"): StepDef[] {
  const competitors = hasFeature(plan, "competitor_tracking");
  return STEPS.filter((s) => {
    if (s.id === "competitors") return competitors;
    if (s.id === "notifications") return mode === "first";
    return true;
  });
}

export type TrackerAnswer = TeamAnswers["tracker"];

/** Auto-filing starts above this priority score when it is turned on during setup. */
export const ONBOARDING_AUTOFILE_THRESHOLD = 80;

export const TRACKER_OPTIONS: Array<{ value: TeamAnswers["tracker"]; label: string }> = [
  { value: "linear", label: "Linear" },
  { value: "github", label: "GitHub Issues" },
  { value: "jira", label: "Jira" },
  { value: "other", label: "Something else" },
];

export const ALERT_OPTIONS: Array<{ value: AlertMode; label: string; description: string }> = [
  {
    value: "serious",
    label: "Only new serious issues",
    description: "A new issue that scores high on priority, or one we would fix now.",
  },
  {
    value: "all",
    label: "Every new or worsening issue",
    description: "Anything that appears or grows between runs.",
  },
  { value: "off", label: "No alerts", description: "Just the Monday email." },
];

export const MAX_WIZARD_COMPETITORS = 3;

export interface CompetitorRow {
  id: string;
  name: string;
  input: string;
}

export interface WizardState {
  product: { name: string; websiteUrl: string; description: string };
  sources: {
    appStore: string;
    appStoreCountry: string;
    playStore: string;
    subreddits: string;
    keywords: string;
    /** null until the user touches the checkbox; then it is their explicit choice. */
    watchHn: boolean | null;
    trustpilot: string;
  };
  competitors: CompetitorRow[];
  team: {
    tracker: TrackerAnswer | null;
    usesSlack: boolean | null;
    /** File issues above ONBOARDING_AUTOFILE_THRESHOLD to the connected tracker. */
    autofile: boolean;
  };
  notifications: NotificationAnswers;
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

let rowCounter = 0;
export function newCompetitorRow(): CompetitorRow {
  rowCounter += 1;
  return { id: `c${Date.now().toString(36)}${rowCounter}`, name: "", input: "" };
}

export function initialWizardState(opts?: {
  timezone?: string;
  prefill?: { kind: MonitorSourceKind; input: string; country?: string } | null;
  answers?: Partial<OnboardingAnswers> | null;
  plan?: PlanId;
}): WizardState {
  // Free has no instant alerts: default to the Monday email only, so the last
  // step does not open on a locked choice.
  const alertsAllowed = hasFeature(opts?.plan ?? "free", "instant_email_alerts");
  const state: WizardState = {
    product: { name: "", websiteUrl: "", description: "" },
    sources: {
      appStore: "",
      appStoreCountry: "us",
      playStore: "",
      subreddits: "",
      keywords: "",
      watchHn: null,
      trustpilot: "",
    },
    competitors: [newCompetitorRow()],
    team: {
      tracker: opts?.answers?.team?.tracker ?? null,
      usesSlack: opts?.answers?.team?.usesSlack ?? null,
      autofile: true,
    },
    notifications: {
      digest: opts?.answers?.notifications?.digest ?? true,
      alerts: alertsAllowed ? (opts?.answers?.notifications?.alerts ?? "serious") : "off",
      timezone: opts?.answers?.notifications?.timezone ?? opts?.timezone ?? "UTC",
    },
  };
  const p = opts?.prefill;
  if (p) {
    if (p.kind === "appstore") {
      state.sources.appStore = p.input;
      if (p.country) state.sources.appStoreCountry = p.country;
    } else if (p.kind === "playstore") state.sources.playStore = p.input;
    else if (p.kind === "reddit") state.sources.subreddits = p.input;
    else if (p.kind === "trustpilot") state.sources.trustpilot = p.input;
    else if (p.kind === "hackernews") {
      state.sources.keywords = p.input;
      state.sources.watchHn = true;
    }
  }
  return state;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type FieldErrors = Partial<Record<string, string>>;

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/** Adds https:// to "acme.com" so people do not have to type it. */
export function normalizeWebsite(value: string): string {
  const v = value.trim();
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export function validateProduct(product: WizardState["product"]): FieldErrors {
  const errors: FieldErrors = {};
  const name = product.name.trim();
  if (!name) errors.name = "Enter your product's name.";
  else if (name.length > 60) errors.name = "Keep the name under 60 characters.";
  const site = normalizeWebsite(product.websiteUrl);
  if (site && !isHttpUrl(site)) errors.websiteUrl = "Enter a full web address, like https://acme.com.";
  if (product.description.trim().length > 280) errors.description = "Keep this under 280 characters.";
  return errors;
}

export interface SourceStepResult {
  drafts: Array<SourceDraft & { field: SourceField }>;
  errors: FieldErrors;
  terms: string[];
  /** Effective Hacker News choice: explicit, else on when there are keywords. */
  watchHn: boolean;
}

export type SourceField = "appStore" | "playStore" | "subreddits" | "hackernews" | "trustpilot";

/** Maximum Hacker News searches created from the wizard (one per term). */
export const MAX_HN_TERMS = 3;

export function effectiveWatchHn(sources: WizardState["sources"]): boolean {
  if (sources.watchHn !== null) return sources.watchHn;
  return parseKeywords(sources.keywords).length > 0;
}

/**
 * Turns step 2 into source drafts. Every field is optional; a filled field
 * that cannot be parsed is an error.
 */
export function buildSourceDrafts(state: WizardState): SourceStepResult {
  const s = state.sources;
  const errors: FieldErrors = {};
  const drafts: Array<SourceDraft & { field: SourceField }> = [];
  const keywords = parseKeywords(s.keywords);
  const terms = searchTerms(state.product.name, keywords);
  const own = { role: "own" as const, competitorName: null };

  if (s.appStore.trim()) {
    const config = parseAppStoreInput(s.appStore, s.appStoreCountry);
    if (config) {
      drafts.push({ ...own, field: "appStore", kind: "appstore", config, label: describeSource("appstore", config) });
    } else {
      errors.appStore = "Paste an App Store link or the numeric app ID, like 123456789.";
    }
  }

  if (s.playStore.trim()) {
    const config = parsePlayStoreInput(s.playStore);
    if (config) {
      drafts.push({ ...own, field: "playStore", kind: "playstore", config, label: describeSource("playstore", config) });
    } else {
      errors.playStore = "Paste a Google Play link or the package name, like com.acme.notes.";
    }
  }

  if (s.subreddits.trim()) {
    const { valid, invalid } = parseSubreddits(s.subreddits);
    if (invalid.length > 0) {
      errors.subreddits = `These are not subreddit names: ${invalid.slice(0, 3).join(", ")}.`;
    } else if (terms.length === 0) {
      errors.subreddits = "Add your product name or a keyword so we know which posts to read.";
    } else {
      for (const subreddit of valid) {
        const config = { mode: "subreddit" as const, subreddit, keywords: terms };
        drafts.push({ ...own, field: "subreddits", kind: "reddit", config, label: describeSource("reddit", config) });
      }
    }
  }

  const watchHn = effectiveWatchHn(s);
  if (watchHn && terms.length > 0) {
    for (const query of terms.slice(0, MAX_HN_TERMS)) {
      const config = { mode: "search" as const, query };
      drafts.push({ ...own, field: "hackernews", kind: "hackernews", config, label: describeSource("hackernews", config) });
    }
  }

  if (s.trustpilot.trim()) {
    const config = parseTrustpilotInput(s.trustpilot);
    if (config) {
      drafts.push({ ...own, field: "trustpilot", kind: "trustpilot", config, label: describeSource("trustpilot", config) });
    } else {
      errors.trustpilot = "Paste a Trustpilot link or your domain, like acme.com.";
    }
  }

  // Drop duplicates (for example the same subreddit typed twice in different forms).
  const seen = new Set<string>();
  const unique = drafts.filter((d) => {
    const key = sourceFingerprint(d.kind, d.config);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { drafts: unique, errors, terms, watchHn };
}

export interface CompetitorStepResult {
  drafts: SourceDraft[];
  errors: Record<string, { name?: string; input?: string }>;
}

export function buildCompetitorDrafts(rows: CompetitorRow[]): CompetitorStepResult {
  const drafts: SourceDraft[] = [];
  const errors: CompetitorStepResult["errors"] = {};
  for (const row of rows) {
    const name = row.name.trim();
    const input = row.input.trim();
    if (!name && !input) continue;
    const rowErrors: { name?: string; input?: string } = {};
    if (!name) rowErrors.name = "Add the competitor's name.";
    else if (name.length > 60) rowErrors.name = "Keep the name under 60 characters.";
    const detected = input ? detectSourceInput(input, { allowBareDomain: true }) : null;
    if (!input) rowErrors.input = "Paste their App Store, Google Play or Trustpilot page.";
    else if (!detected || !["appstore", "playstore", "trustpilot"].includes(detected.kind)) {
      rowErrors.input = "Use an App Store, Google Play or Trustpilot link.";
    }
    if (rowErrors.name || rowErrors.input) {
      errors[row.id] = rowErrors;
      continue;
    }
    if (detected) {
      drafts.push({
        kind: detected.kind,
        config: detected.config,
        role: "competitor",
        competitorName: name,
        label: detected.label,
      });
    }
  }
  return { drafts, errors };
}

export function hasErrors(errors: FieldErrors | Record<string, unknown>): boolean {
  return Object.values(errors).some(Boolean);
}

// ---------------------------------------------------------------------------
// Request body
// ---------------------------------------------------------------------------

export interface OnboardingRequestBody {
  product: { name: string; websiteUrl: string | null; description: string | null };
  sources: Array<{
    kind: MonitorSourceKind;
    config: SourceDraft["config"];
    role: SourceDraft["role"];
    competitorName: string | null;
  }>;
  team: { tracker: TrackerAnswer; usesSlack: boolean };
  notifications: NotificationAnswers;
  /** Present when a Linear or GitHub tracker was chosen in setup. */
  autofile?: { target: "linear" | "github"; enabled: boolean; threshold: number };
}

export const DEFAULT_TEAM: { tracker: TrackerAnswer; usesSlack: boolean } = { tracker: "other", usesSlack: false };

export function buildOnboardingPayload(
  state: WizardState,
  opts: { includeCompetitors: boolean },
): OnboardingRequestBody {
  const site = normalizeWebsite(state.product.websiteUrl);
  const own = buildSourceDrafts(state).drafts;
  const competitors = opts.includeCompetitors ? buildCompetitorDrafts(state.competitors).drafts : [];
  return {
    product: {
      name: state.product.name.trim(),
      websiteUrl: site || null,
      description: state.product.description.trim() || null,
    },
    sources: [...own, ...competitors].map((d) => ({
      kind: d.kind,
      config: d.config,
      role: d.role,
      competitorName: d.competitorName,
    })),
    team: {
      tracker: state.team.tracker ?? DEFAULT_TEAM.tracker,
      usesSlack: state.team.usesSlack ?? DEFAULT_TEAM.usesSlack,
    },
    notifications: {
      digest: state.notifications.digest,
      alerts: state.notifications.alerts,
      timezone: state.notifications.timezone || "UTC",
    },
    ...(state.team.tracker === "linear" || state.team.tracker === "github"
      ? {
          autofile: {
            target: state.team.tracker,
            enabled: state.team.autofile,
            threshold: ONBOARDING_AUTOFILE_THRESHOLD,
          },
        }
      : {}),
  };
}

/** A subreddit to suggest from the product name: "Acme Notes" -> "acmenotes". */
export function subredditSuggestion(name: string): string | null {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]/g, "");
  return slug.length >= 3 && slug.length <= 21 ? slug : null;
}

// ---------------------------------------------------------------------------
// Feedback carried over from the free analyzer
// ---------------------------------------------------------------------------

/** localStorage key holding the text a visitor analyzed on /app before signing up. */
export const CARRY_FEEDBACK_KEY = "bm-carry-feedback";
/** Carried text older than this is ignored. */
export const CARRY_FEEDBACK_TTL_MS = 24 * 60 * 60 * 1000;

export interface CarriedFeedback {
  items: string[];
  savedAt: number;
}

export function parseCarriedFeedback(raw: string | null, now: number = Date.now()): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<CarriedFeedback>;
    if (!Array.isArray(parsed.items) || typeof parsed.savedAt !== "number") return [];
    if (now - parsed.savedAt > CARRY_FEEDBACK_TTL_MS) return [];
    return parsed.items.filter((t): t is string => typeof t === "string" && t.trim().length > 0).slice(0, 500);
  } catch {
    return [];
  }
}

/** Suggests a Trustpilot page from the website, e.g. https://www.acme.com/x -> acme.com. */
export function trustpilotSuggestion(websiteUrl: string): string | null {
  const site = normalizeWebsite(websiteUrl);
  if (!site || !isHttpUrl(site)) return null;
  try {
    return new URL(site).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Time zones
// ---------------------------------------------------------------------------

const FALLBACK_ZONES = [
  "UTC",
  "Asia/Kolkata",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Madrid",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Jakarta",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
];

/** IANA zones from the runtime, with a short fallback list. Always contains `current`. */
export function timezoneOptions(current?: string): string[] {
  let zones: string[] = FALLBACK_ZONES;
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
    if (supported) zones = ["UTC", ...supported("timeZone").filter((z) => z !== "UTC")];
  } catch {
    zones = FALLBACK_ZONES;
  }
  if (current && !zones.includes(current)) zones = [current, ...zones];
  return zones;
}

export function isValidTimezone(zone: string): boolean {
  if (!zone || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
