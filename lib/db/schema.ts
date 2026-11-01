/**
 * BuildMonday database schema (Postgres, Drizzle).
 *
 * Conventions:
 * - Enums are `text` columns typed with `.$type<...>()`; the allowed values are
 *   exported as const arrays so zod schemas can reuse them.
 * - Primary keys are text UUIDs generated in code.
 * - Timestamps are `timestamptz` read as `Date`.
 *
 * This file must stay importable by drizzle-kit, so it has no runtime imports
 * outside drizzle-orm (type-only imports are fine).
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
import type { MeteredLimitKey } from "@/lib/plans";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const PLAN_IDS = ["free", "pro", "team"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const BILLING_INTERVALS = ["month", "year"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const CURRENCIES = ["INR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const SUBSCRIPTION_STATUSES = [
  "none",
  "created",
  "authenticated",
  "active",
  "past_due",
  "cancelled",
  "completed",
  "halted",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const MEMBER_ROLES = ["owner", "admin", "member"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MONITOR_SOURCE_KINDS = ["appstore", "playstore", "reddit", "hackernews", "trustpilot"] as const;
export type MonitorSourceKind = (typeof MONITOR_SOURCE_KINDS)[number];

export const FEEDBACK_SOURCE_KINDS = [...MONITOR_SOURCE_KINDS, "widget", "extension", "manual", "import"] as const;
export type FeedbackSourceKind = (typeof FEEDBACK_SOURCE_KINDS)[number];

export const INGEST_CHANNELS = ["source", "widget", "extension", "manual", "import"] as const;
export type IngestChannel = (typeof INGEST_CHANNELS)[number];

export const SOURCE_ROLES = ["own", "competitor"] as const;
export type SourceRole = (typeof SOURCE_ROLES)[number];

export const FEEDBACK_STATUSES = ["new", "triaged", "archived", "spam"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const ISSUE_STATUSES = ["backlog", "in_progress", "shipped", "ignored"] as const;
export type IssueWorkflowStatus = (typeof ISSUE_STATUSES)[number];

export const ISSUE_TRENDS = ["new", "persistent", "worsened", "improved", "resolved"] as const;
export type IssueTrend = (typeof ISSUE_TRENDS)[number];

export const RUN_TRIGGERS = ["schedule", "manual", "onboarding"] as const;
export type RunTrigger = (typeof RUN_TRIGGERS)[number];

export const RUN_STATUSES = ["queued", "running", "succeeded", "failed", "skipped"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_STAGES = ["queued", "fetching", "storing", "clustering", "diffing", "alerting", "filing", "done"] as const;
export type RunStage = (typeof RUN_STAGES)[number];

export const INTEGRATION_KINDS = ["slack", "linear", "github"] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

export const TRACKER_TARGETS = ["linear", "github"] as const;
export type TrackerTarget = (typeof TRACKER_TARGETS)[number];

export const ALERT_KINDS = ["new_issue", "worsened", "autofiled"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export const ALERT_MODES = ["serious", "all", "off"] as const;
export type AlertMode = (typeof ALERT_MODES)[number];

// Analysis vocabulary, identical strings to lib/types.ts.
export type Severity = "Low" | "Medium" | "High";
export type ChurnRisk = "Low" | "Medium" | "High";
export type Effort = "S" | "M" | "L";
export type RecommendedAction = "fix_now" | "investigate" | "monitor";

// ---------------------------------------------------------------------------
// JSON column shapes
// ---------------------------------------------------------------------------

/** country: ISO-2 lowercase, default "us". */
export type AppStoreConfig = { appId: string; country: string };
/** Defaults: country "us", lang "en". */
export type PlayStoreConfig = { packageName: string; country: string; lang: string };
export type RedditConfig =
  | { mode: "subreddit"; subreddit: string; keywords: string[] }
  | { mode: "search"; query: string }
  | { mode: "thread"; url: string };
export type HackerNewsConfig = { mode: "search"; query: string } | { mode: "thread"; itemId: string };
export type TrustpilotConfig = { domain: string };
export type SourceConfigMap = {
  appstore: AppStoreConfig;
  playstore: PlayStoreConfig;
  reddit: RedditConfig;
  hackernews: HackerNewsConfig;
  trustpilot: TrustpilotConfig;
};
export type SourceConfig = SourceConfigMap[MonitorSourceKind];

export type WidgetSettings = {
  position: "bottom-right" | "bottom-left";
  prompt: string;
  askEmail: boolean;
  accent: string | null;
  buttonLabel: string;
};

export const DEFAULT_WIDGET_SETTINGS: WidgetSettings = {
  position: "bottom-right",
  prompt: "What could be better?",
  askEmail: true,
  accent: null,
  buttonLabel: "Feedback",
};

export type OnboardingAnswers = {
  team: {
    /** Asked in older versions of onboarding; no longer collected. */
    role?: "founder" | "pm" | "engineer" | "designer" | "support" | "other";
    /** Asked in older versions of onboarding; no longer collected. */
    size?: "1" | "2-5" | "6-20" | "21-50" | "50+";
    tracker: "linear" | "github" | "jira" | "other";
    usesSlack: boolean;
  };
  notifications: { digest: boolean; alerts: AlertMode; timezone: string };
  completedAt: string;
  /** Set when an admin hides the dashboard "Finish setting up" checklist. */
  checklistHiddenAt?: string;
};

export type FeedbackTags = {
  category: string;
  severity: Severity;
  churn_signal: ChurnRisk;
  affected_segment: string;
  urgency_keywords: string[];
};

export type RunSourceResult = {
  sourceId: string;
  label: string;
  kind: MonitorSourceKind;
  role: SourceRole;
  fetched: number;
  inserted: number;
  duplicates: number;
  error: string | null;
  pausedByPlan: boolean;
};

export type RunStats = {
  stage: RunStage;
  fetched: number;
  inserted: number;
  duplicates: number;
  analyzed: number;
  issuesNew: number;
  issuesWorsened: number;
  issuesImproved: number;
  issuesPersistent: number;
  issuesResolved: number;
  alertsSent: number;
  filed: number;
  quotaReached: boolean;
  skippedReason: string | null;
  perSource: RunSourceResult[];
  newIssueIds: string[];
  worsenedIssueIds: string[];
  improvedIssueIds: string[];
  resolvedIssueIds: string[];
};

export const EMPTY_RUN_STATS: RunStats = {
  stage: "queued",
  fetched: 0,
  inserted: 0,
  duplicates: 0,
  analyzed: 0,
  issuesNew: 0,
  issuesWorsened: 0,
  issuesImproved: 0,
  issuesPersistent: 0,
  issuesResolved: 0,
  alertsSent: 0,
  filed: 0,
  quotaReached: false,
  skippedReason: null,
  perSource: [],
  newIssueIds: [],
  worsenedIssueIds: [],
  improvedIssueIds: [],
  resolvedIssueIds: [],
};

/** Same fields as `PrdStub` in lib/types.ts. */
export type PrdStubJson = {
  problem_statement: string;
  affected_users: string[];
  acceptance_criteria: string[];
  edge_cases: string[];
  success_metrics: string[];
  implementation_notes: string;
  estimated_complexity: Effort;
};

export type IntegrationConfig =
  | { kind: "slack"; channelName: string | null; auth?: "webhook" | "oauth" }
  | {
      kind: "linear";
      teamId: string;
      teamName: string;
      teamKey: string;
      labelName: string | null;
      /** "key": a pasted personal API key; "oauth": the secret is a JSON token set from Linear OAuth. */
      auth?: "key" | "oauth";
    }
  | {
      kind: "github";
      owner: string;
      repo: string;
      labels: string[];
      /** "token": a pasted fine-grained token; "app": the BuildMonday GitHub App installation. */
      auth?: "token" | "app";
      installationId?: number;
    };

// ---------------------------------------------------------------------------
// Column helpers
// ---------------------------------------------------------------------------

const tz = { withTimezone: true, mode: "date" } as const;

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", tz).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", tz)
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const workspaceIdRef = () =>
  text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" });

// ---------------------------------------------------------------------------
// Auth.js tables (property and column names the Drizzle adapter expects)
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: id(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date", withTimezone: true }),
  image: text("image"),
  /** No foreign key (avoids a cycle with workspaces); validated in code. */
  activeWorkspaceId: text("active_workspace_id"),
  onboardedAt: timestamp("onboarded_at", tz),
  createdAt: createdAt(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  plan: text("plan").$type<PlanId>().notNull().default("free"),
  planInterval: text("plan_interval").$type<BillingInterval>(),
  planCurrency: text("plan_currency").$type<Currency>(),
  planStatus: text("plan_status").$type<SubscriptionStatus>().notNull().default("none"),
  currentPeriodEnd: timestamp("current_period_end", tz),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  razorpaySubscriptionId: text("razorpay_subscription_id"),
  /** End of the 14-day Pro reverse trial every new workspace gets; null for no trial. */
  trialEndsAt: timestamp("trial_ends_at", tz),
  /** When the "trial ends in 2 days" email went out. */
  trialReminderSentAt: timestamp("trial_reminder_sent_at", tz),
  /** When the trial-expiry downgrade rules were applied. */
  trialEndedAt: timestamp("trial_ended_at", tz),
  timezone: text("timezone").notNull().default("UTC"),
  onboardingAnswers: jsonb("onboarding_answers").$type<OnboardingAnswers>(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<MemberRole>().notNull().default("member"),
    notifyDigest: boolean("notify_digest").notNull().default(true),
    alertMode: text("alert_mode").$type<AlertMode>().notNull().default("serious"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), index("workspace_members_user_idx").on(t.userId)],
);

export const workspaceInvites = pgTable(
  "workspace_invites",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").$type<MemberRole>().notNull().default("member"),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at", tz).notNull(),
    acceptedAt: timestamp("accepted_at", tz),
    revokedAt: timestamp("revoked_at", tz),
    createdAt: createdAt(),
  },
  (t) => [index("workspace_invites_ws_idx").on(t.workspaceId)],
);

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    razorpaySubscriptionId: text("razorpay_subscription_id").notNull().unique(),
    razorpayPlanId: text("razorpay_plan_id").notNull(),
    plan: text("plan").$type<PlanId>().notNull(),
    interval: text("interval").$type<BillingInterval>().notNull(),
    currency: text("currency").$type<Currency>().notNull(),
    status: text("status").$type<SubscriptionStatus>().notNull().default("created"),
    currentPeriodStart: timestamp("current_period_start", tz),
    currentPeriodEnd: timestamp("current_period_end", tz),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    lastPaymentId: text("last_payment_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("subscriptions_ws_idx").on(t.workspaceId)],
);

export const billingEvents = pgTable("billing_events", {
  id: id(),
  /** x-razorpay-event-id */
  eventId: text("event_id").notNull().unique(),
  type: text("type").notNull(),
  workspaceId: text("workspace_id"),
  payload: jsonb("payload").$type<unknown>().notNull(),
  processedAt: timestamp("processed_at", tz),
  createdAt: createdAt(),
});

export const usageCounters = pgTable(
  "usage_counters",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** UTC month, "2026-11". */
    period: text("period").notNull(),
    metric: text("metric").$type<MeteredLimitKey>().notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.period, t.metric] })],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", tz).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] }), index("rate_limits_window_idx").on(t.windowStart)],
);

// ---------------------------------------------------------------------------
// Product data
// ---------------------------------------------------------------------------

export const products = pgTable(
  "products",
  {
    id: id(),
    workspaceId: workspaceIdRef(),
    name: text("name").notNull(),
    websiteUrl: text("website_url"),
    description: text("description"),
    /** "pk_" + 24 base62 chars */
    publicKey: text("public_key").notNull().unique(),
    monitoringEnabled: boolean("monitoring_enabled").notNull().default(true),
    lastRunAt: timestamp("last_run_at", tz),
    nextRunAt: timestamp("next_run_at", tz),
    alertThreshold: integer("alert_threshold").notNull().default(70),
    autofileEnabled: boolean("autofile_enabled").notNull().default(false),
    autofileTarget: text("autofile_target").$type<TrackerTarget>(),
    autofileThreshold: integer("autofile_threshold").notNull().default(80),
    widgetSettings: jsonb("widget_settings").$type<WidgetSettings>().notNull().default(DEFAULT_WIDGET_SETTINGS),
    allowedOrigins: jsonb("allowed_origins").$type<string[]>().notNull().default([]),
    archivedAt: timestamp("archived_at", tz),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("products_ws_idx").on(t.workspaceId), index("products_next_run_idx").on(t.nextRunAt)],
);

export const sources = pgTable(
  "sources",
  {
    id: id(),
    workspaceId: workspaceIdRef(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    kind: text("kind").$type<MonitorSourceKind>().notNull(),
    config: jsonb("config").$type<SourceConfig>().notNull(),
    label: text("label").notNull(),
    role: text("role").$type<SourceRole>().notNull().default("own"),
    competitorName: text("competitor_name"),
    enabled: boolean("enabled").notNull().default(true),
    lastFetchedAt: timestamp("last_fetched_at", tz),
    lastSuccessAt: timestamp("last_success_at", tz),
    lastError: text("last_error"),
    lastItemCount: integer("last_item_count"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sources_product_idx").on(t.productId)],
);

export const feedback = pgTable(
  "feedback",
  {
    id: id(),
    workspaceId: workspaceIdRef(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sourceId: text("source_id").references(() => sources.id, { onDelete: "set null" }),
    channel: text("channel").$type<IngestChannel>().notNull(),
    sourceKind: text("source_kind").$type<FeedbackSourceKind>().notNull(),
    role: text("role").$type<SourceRole>().notNull().default("own"),
    competitorName: text("competitor_name"),
    externalId: text("external_id"),
    dedupeKey: text("dedupe_key").notNull(),
    text: text("text").notNull(),
    title: text("title"),
    author: text("author"),
    authorEmail: text("author_email"),
    rating: integer("rating"),
    url: text("url"),
    postedAt: timestamp("posted_at", tz),
    ingestedAt: timestamp("ingested_at", tz).notNull().defaultNow(),
    status: text("status").$type<FeedbackStatus>().notNull().default("new"),
    issueId: text("issue_id").references(() => issues.id, { onDelete: "set null" }),
    tags: jsonb("tags").$type<FeedbackTags>(),
    /** pageUrl, userAgent, site, clippedBy */
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    uniqueIndex("feedback_product_dedupe_uq").on(t.productId, t.dedupeKey),
    index("feedback_product_ingested_idx").on(t.productId, t.ingestedAt),
    index("feedback_issue_idx").on(t.issueId),
  ],
);

export const issues = pgTable(
  "issues",
  {
    id: id(),
    workspaceId: workspaceIdRef(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    scope: text("scope").$type<SourceRole>().notNull().default("own"),
    competitorName: text("competitor_name"),
    title: text("title").notNull(),
    rankingReason: text("ranking_reason"),
    category: text("category"),
    severity: text("severity").$type<Severity>().notNull(),
    churnRisk: text("churn_risk").$type<ChurnRisk>().notNull(),
    effort: text("effort").$type<Effort>().notNull(),
    affectedSegment: text("affected_segment").notNull().default(""),
    recommendedAction: text("recommended_action").$type<RecommendedAction>().notNull(),
    priorityScore: integer("priority_score").notNull().default(0),
    frequency: integer("frequency").notNull().default(0),
    /** Rank in the latest run, 1-based. */
    rank: integer("rank"),
    evidence: jsonb("evidence").$type<string[]>().notNull().default([]),
    sourceMix: jsonb("source_mix").$type<Partial<Record<FeedbackSourceKind, number>>>().notNull().default({}),
    status: text("status").$type<IssueWorkflowStatus>().notNull().default("backlog"),
    trend: text("trend").$type<IssueTrend>().notNull().default("new"),
    embedding: jsonb("embedding").$type<number[]>(),
    prd: jsonb("prd").$type<PrdStubJson>(),
    prdGeneratedAt: timestamp("prd_generated_at", tz),
    externalTarget: text("external_target").$type<TrackerTarget>(),
    externalId: text("external_id"),
    externalUrl: text("external_url"),
    filedAt: timestamp("filed_at", tz),
    firstSeenRunId: text("first_seen_run_id"),
    lastSeenRunId: text("last_seen_run_id"),
    firstSeenAt: timestamp("first_seen_at", tz).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", tz).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", tz),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("issues_product_idx").on(t.productId, t.status)],
);

export const issueSnapshots = pgTable(
  "issue_snapshots",
  {
    id: id(),
    issueId: text("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull(),
    frequency: integer("frequency").notNull(),
    priorityScore: integer("priority_score").notNull(),
    rank: integer("rank"),
    trend: text("trend").$type<IssueTrend>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("issue_snapshots_issue_run_uq").on(t.issueId, t.runId),
    index("issue_snapshots_product_idx").on(t.productId, t.createdAt),
  ],
);

export const runs = pgTable(
  "runs",
  {
    id: id(),
    workspaceId: workspaceIdRef(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    trigger: text("trigger").$type<RunTrigger>().notNull(),
    status: text("status").$type<RunStatus>().notNull().default("queued"),
    stats: jsonb("stats").$type<RunStats>().notNull().default(EMPTY_RUN_STATS),
    error: text("error"),
    startedAt: timestamp("started_at", tz),
    finishedAt: timestamp("finished_at", tz),
    createdAt: createdAt(),
  },
  (t) => [index("runs_product_idx").on(t.productId, t.createdAt)],
);

export const integrations = pgTable(
  "integrations",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    kind: text("kind").$type<IntegrationKind>().notNull(),
    config: jsonb("config").$type<IntegrationConfig>().notNull(),
    /** encryptSecret(webhookUrl | apiKey | token) */
    secretEncrypted: text("secret_encrypted").notNull(),
    /** Last 4 characters, e.g. "x9Qa". */
    secretHint: text("secret_hint").notNull(),
    status: text("status").$type<"connected" | "error">().notNull().default("connected"),
    lastError: text("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("integrations_ws_kind_uq").on(t.workspaceId, t.kind)],
);

export const alerts = pgTable(
  "alerts",
  {
    id: id(),
    workspaceId: workspaceIdRef(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    issueId: text("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    runId: text("run_id").references(() => runs.id, { onDelete: "set null" }),
    kind: text("kind").$type<AlertKind>().notNull(),
    channels: jsonb("channels").$type<Array<"email" | "slack">>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("alerts_issue_kind_run_uq").on(t.issueId, t.kind, t.runId)],
);

export const digestSends = pgTable(
  "digest_sends",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** ISO week, "2026-W45". */
    weekKey: text("week_key").notNull(),
    recipients: integer("recipients").notNull().default(0),
    sentAt: timestamp("sent_at", tz).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("digest_sends_ws_week_uq").on(t.workspaceId, t.weekKey)],
);

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** sha256 hex of the full token. */
    tokenHash: text("token_hash").notNull().unique(),
    /** First 12 characters, e.g. "bm_ext_A1b2C". */
    prefix: text("prefix").notNull(),
    lastUsedAt: timestamp("last_used_at", tz),
    revokedAt: timestamp("revoked_at", tz),
    createdAt: createdAt(),
  },
  (t) => [index("api_tokens_ws_idx").on(t.workspaceId)],
);

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type WorkspaceInvite = typeof workspaceInvites.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type BillingEvent = typeof billingEvents.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Source = typeof sources.$inferSelect;
export type Feedback = typeof feedback.$inferSelect;
export type Issue = typeof issues.$inferSelect;
export type IssueSnapshot = typeof issueSnapshots.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type Integration = typeof integrations.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
export type DigestSend = typeof digestSends.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;

export type NewWorkspace = typeof workspaces.$inferInsert;
export type NewProduct = typeof products.$inferInsert;
export type NewSource = typeof sources.$inferInsert;
export type NewFeedback = typeof feedback.$inferInsert;
export type NewIssue = typeof issues.$inferInsert;
export type NewRun = typeof runs.$inferInsert;
export type NewIntegration = typeof integrations.$inferInsert;
export type NewAlert = typeof alerts.$inferInsert;
