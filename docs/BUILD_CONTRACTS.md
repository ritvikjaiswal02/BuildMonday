# BuildMonday build contracts

This is the binding contract for every builder package (F1, F2, P1 to P6). Builders run in parallel and only have this file, `docs/PRODUCT_SPEC.md` and the code. If you need something another package owns, import it exactly as written here and trust it will exist at merge time. Do not create a local copy, a shim or a "temporary" version of another package's file.

Contents:
0. Ground rules
1. Package ownership
2. Dependencies (F2 installs all of them up front)
3. Environment variables
4. Database schema
5. DTOs and shared domain types
6. Cross-package exports (exact paths, names, signatures)
7. API routes
8. Design system
9. Page layouts per route
10. UI copy and voice
11. Merge checklist

---

## 0. Ground rules

1. Work only inside the repo. Only edit paths your package owns (section 1). Reading anything is fine.
2. No state-changing git commands. No dev servers left running; use timeouts.
3. No secrets in files. Read `process.env` (through `lib/env.ts`) and document new variables in `.env.example` (F2 owns it; if you need a variable not listed in section 3, you cannot add it: use what is listed).
4. TypeScript strict. Every file you write must typecheck against the contracts here (`npx tsc --noEmit` may show errors only for imports from packages that have not landed yet).
5. `next build` must succeed with **no environment variables set**. That means: never touch the database, Razorpay, Resend or Gemini at module top level; every page or route that reads the DB or session exports `export const dynamic = "force-dynamic"`; the DB client is lazy.
6. The anonymous analyzer at `/app` must work with no login and no database: it only uses `/api/analyze`, `/api/fetch-reviews`, `/api/prd`, `/api/chat` (anonymous mode) and localStorage.
7. Server-only modules start with `import "server-only";` (package `server-only` is installed). Client components never import from `lib/db/**`, `lib/auth/**` (except `lib/auth/actions.ts` server actions), `lib/billing/**` (except `lib/billing/currency.ts`), `lib/monitor/**`, `lib/alerts/**`, `lib/digest/**`, `lib/feedback/**`.
8. Server components may read the DB directly through `db` and the schema for read-only page data. All writes go through the API routes or server actions listed here.
9. Icons: `lucide-react` only. No emoji anywhere in UI, emails, Slack messages or the extension. Brand glyphs (GitHub, Slack, Linear, App Store, ...) come from `components/brand/logos.tsx`.
10. No fake data on marketing or app pages: no testimonials, customer logos, user counts, revenue, star ratings or "trusted by". Example product content in illustrations is labelled "Example".
11. Dates in API JSON are ISO 8601 strings. IDs are UUID strings.
12. Accessibility floor: visible keyboard focus on everything interactive, labels on every input, `aria-live` for async status, dialogs trap focus, color is never the only signal, `prefers-reduced-motion` respected, works at 375px wide with no horizontal scroll.

## 1. Package ownership

File ownership is exclusive; only the owner edits a path.

| Package | Runs | Owns |
| --- | --- | --- |
| F1 Design system + app shell | first | `tailwind.config.ts`, `app/globals.css`, `app/layout.tsx`, `components/ui/**` (DELETE `sparkles.tsx`, `spooky-smoke-animation.tsx`, `animated-underline-text-one.tsx` and replace with a real primitive set: button, input, textarea, select, card, badge, tabs, dialog, dropdown, tooltip, toast, skeleton, empty-state, page-header, stat), `components/brand/**` (new logo/wordmark), `components/shell/**` (app shell: sidebar/topbar, product switcher slot), `components/AppHeader.tsx`, `lib/utils.ts` |
| F2 Platform: auth, database, plans, billing lib, deps | first | `package.json`, `package-lock.json` (add next-auth@beta, @auth/drizzle-adapter, drizzle-orm, postgres, drizzle-kit, resend, zod, lucide-react, vitest + @vitejs/plugin-react + jsdom for tests, and anything else the spec lists; remove @tsparticles/*), `auth.ts`, `middleware.ts` (protect app routes but NOT /app anonymous mode, /api/ingest, /api/extension, /api/webhooks, /api/cron, marketing pages), `app/api/auth/**`, `lib/db/**` (client + full schema from the spec), `drizzle.config.ts`, `drizzle/**` (generate migration), `lib/env.ts`, `lib/plans.ts`, `lib/billing/**` (Razorpay REST via fetch, webhook HMAC verify), `lib/auth/**` (session helpers, requireUser, product ownership checks, hashed API tokens, encryption for stored integration secrets), `.env.example` (rename/replace .env.local.example), `vercel.json` (cron), `vitest.config.ts`, `tests/lib/**` |
| P1 Marketing site + pricing | after F1/F2 | `app/page.tsx`, `components/Landing.tsx` (replace), `components/landing/**` (new), `app/pricing/**`, `app/terms/**`, `app/privacy/**` |
| P2 Login, onboarding wizard, settings | after F1/F2 | `app/login/**`, `app/onboarding/**`, `app/settings/**`, `components/onboarding/**`, `components/settings/**`, `app/api/onboarding/**`, `app/api/products/**` (product CRUD), `app/api/sources/**` (monitored source CRUD + "test this source" preview), `app/api/integrations/**` (Slack webhook, Linear, GitHub config save/test), tests for these |
| P3 Automation engine: sources, monitor runs, alerts, digest, ingest | after F1/F2 | `lib/sources/**` (move the fetchers out of app/api/fetch-reviews/route.ts into reusable, tested modules with dedupe keys), `app/api/fetch-reviews/**`, `app/api/analyze/**`, `app/api/chat/**`, `app/api/prd/**`, `lib/gemini.ts`, `lib/prompts.ts`, `lib/embeddings.ts`, `lib/integrations.ts`, `lib/types.ts`, `lib/monitor/**` (scheduled run: fetch -> dedupe -> store feedback -> cluster -> diff vs previous run -> persist issues -> alerts -> auto-file), `lib/alerts/**` (Resend email + Slack webhook), `lib/digest/**` (Monday digest email), `lib/feedback/**` (shared ingest function used by widget and extension), `app/api/cron/**` (CRON_SECRET), `app/api/ingest/**` (public widget endpoint: per-product public key, CORS, rate limit, size limits, spam guard), `app/api/runs/**`, `app/api/issues/**` (status updates, export), `app/api/feedback/**` (inbox list/update), `tests/**` for these modules |
| P4 App UI: analyzer, dashboard, inbox, issues, runs | after F1/F2 | `app/app/**` (anonymous analyzer, must keep working without login), `app/dashboard/**`, `app/inbox/**`, `app/issues/**`, `app/runs/**`, `components/{AddMoreComplaints,Badges,ChatPanel,DiffBadge,FilterBar,InputPanel,IssueCard,LoadingStages,PrdSection,SendToMenu,SourceMixBadge,StatusSelector,SummaryBar,TrendsChart}.tsx`, `components/app/**` (new), `lib/storage.ts`, `lib/share.ts`, `lib/markdown.ts`, `lib/demo-data.ts` |
| P5 Billing API + UI | after F1/F2 | `app/api/billing/**`, `app/api/webhooks/razorpay/**`, `app/billing/**`, `components/billing/**` (UpgradeDialog, PlanBadge, UsageMeter, PaywallGate — exact names/props from the spec), tests for billing routes |
| P6 Chrome extension + website widget | after F1/F2 | `extension/**` (MV3: manifest, service worker, context-menu "Clip to BuildMonday", content scripts for common review sites, popup, options; README with load-unpacked steps), `public/widget.js` (embeddable feedback widget, framework-free, shadow DOM, accessible, < 15 KB), `app/api/extension/**` (token-authenticated clip endpoint calling the shared ingest function from the spec), `app/extension/**` (page to create/revoke extension tokens and copy the widget snippet), `app/widget-demo/**` (demo page showing the widget), tests for the extension API |

Clarifications (do not change ownership, they resolve overlaps):
- Test directories: F1 `tests/ui/**`; F2 `tests/lib/**`; P1 `tests/landing/**`; P2 `tests/onboarding/**`, `tests/settings/**`; P3 `tests/sources/**`, `tests/monitor/**`, `tests/feedback/**`, `tests/alerts/**`, `tests/digest/**`, `tests/api/ingest/**`, `tests/api/issues/**`, `tests/api/runs/**`, `tests/api/feedback/**`, `tests/api/analyze/**`; P5 `tests/billing/**`; P6 `tests/extension/**`. P4 may add `tests/app/**` for pure helpers.
- `README.md` is not owned by any builder; the orchestrator updates it.
- `.env.local.example` is deleted by F2 and replaced by `.env.example`.
- F2's `lib/auth/**` includes `actions.ts` (server actions used by the F1 shell), `mailer.ts`, `rate-limit.ts`, `crypto.ts`, `tokens.ts`, `http.ts`, `session.ts`, `workspace.ts`.
- F2's `lib/db/**` includes `dto.ts` (DTO types + row mappers).
- P2 team-member management uses server actions in `app/settings/team/actions.ts`; invite acceptance is `app/onboarding/invite/[token]/page.tsx`. Both are inside P2's paths.
- Route-group layouts: each package writes the `layout.tsx` for its own route folders (`app/dashboard/layout.tsx` is P4, `app/settings/layout.tsx` is P2, `app/billing/layout.tsx` is P5, `app/extension/layout.tsx` is P6). Each one renders `<AppFrame>` from F1 (section 6.1).

## 2. Dependencies

F2 installs all of these in one go and removes `@tsparticles/engine`, `@tsparticles/react`, `@tsparticles/slim`. Keep `framer-motion`, `lz-string`, `clsx`, `tailwind-merge`, `@google/generative-ai`, `next@14.2.15`, `react@^18.3.1`. Do not upgrade Next or React.

Runtime `dependencies`:

| Package | Version | Used by |
| --- | --- | --- |
| `next-auth` | `5.0.0-beta.32` (exact) | F2 auth |
| `@auth/drizzle-adapter` | `^1.11.3` | F2 auth |
| `drizzle-orm` | `^0.45.4` | everyone server-side |
| `postgres` | `^3.4.9` | F2 db client (do not use 4.x) |
| `resend` | `^6.37.0` | F2 mailer |
| `zod` | `^3.25.76` (v3 API, `import { z } from "zod"`) | all API routes |
| `lucide-react` | `^0.577.0` (0.x line) | all UI |
| `@radix-ui/react-dialog` | `^1.1.0` | F1 |
| `@radix-ui/react-dropdown-menu` | `^2.1.0` | F1 |
| `@radix-ui/react-tooltip` | `^1.1.0` | F1 |
| `@radix-ui/react-tabs` | `^1.1.0` | F1 |
| `@radix-ui/react-switch` | `^1.1.0` | F1 |
| `@radix-ui/react-popover` | `^1.1.0` | F1 |
| `@radix-ui/react-slot` | `^1.1.0` | F1 (`asChild`) |
| `class-variance-authority` | `^0.7.1` | F1 |
| `sonner` | `^2.0.0` | F1 toast |
| `@vercel/functions` | `^2.2.13` | P3 (`waitUntil` from `@vercel/functions`) |
| `server-only` | `^0.0.1` | all server modules |

`devDependencies`:

| Package | Version |
| --- | --- |
| `drizzle-kit` | `^0.31.11` |
| `vitest` | `^3.2.4` |
| `@vitejs/plugin-react` | `^5.1.4` |
| `jsdom` | `^26.1.0` |
| `@testing-library/react` | `^16.3.0` |
| `@testing-library/jest-dom` | `^6.6.0` |
| `dotenv` | `^16.4.0` (drizzle.config.ts) |

If an exact version fails to resolve, F2 picks the nearest compatible version and records it in `package.json`; the major versions above are binding.

`package.json` scripts (F2):

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:push": "drizzle-kit push",
  "db:studio": "drizzle-kit studio"
}
```

`tsconfig.json` must exclude `extension/**` (plain JS, not part of the Next build). F2 owns that edit even though `tsconfig.json` is not in the table; it is a one-line `exclude` change required by P6.

`vitest.config.ts` (F2): `environment: "node"` by default, `@` alias to repo root, `include: ["tests/**/*.test.{ts,tsx}"]`, `setupFiles: ["tests/setup.ts"]` (F2 writes `tests/setup.ts`, which imports `@testing-library/jest-dom/vitest`). Component tests opt into jsdom with a `// @vitest-environment jsdom` first-line comment. Tests never need a real database: mock `@/lib/db` with `vi.mock` or test pure functions.

## 3. Environment variables

`lib/env.ts` (F2) is the only place that reads `process.env` for these, except `NEXT_PUBLIC_*` in client code. Missing optional variables disable the feature gracefully; they never crash the build.

| Name | Required | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | yes (analysis) | Gemini generation and embeddings |
| `GEMINI_MODEL` | optional, default `gemini-2.5-flash` | Generation model id |
| `GEMINI_EMBEDDING_MODEL` | optional, default `gemini-embedding-001` | Embedding model id (P3 falls back to `text-embedding-004` on 404) |
| `DATABASE_URL` | yes (platform) | Postgres connection string (Neon, Supabase or Vercel Postgres). Without it everything except `/app` and marketing shows "not configured" |
| `AUTH_SECRET` | yes (platform) | Auth.js JWT/cookie secret (`npx auth secret`) |
| `AUTH_TRUST_HOST` | optional, `true` on Vercel | Auth.js host trust |
| `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` | optional | GitHub OAuth provider; hidden if missing |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | optional | Google OAuth provider; hidden if missing |
| `RESEND_API_KEY` | optional (needed for magic link and all email) | Resend API key used by the Auth.js Resend provider and `sendEmail` |
| `EMAIL_FROM` | optional, default `BuildMonday <onboarding@resend.dev>` | From address |
| `NEXT_PUBLIC_APP_URL` | yes in production, default `http://localhost:3000` | Absolute links in email, Slack, widget snippet, extension default |
| `CRON_SECRET` | yes in production | Bearer secret Vercel cron sends; `/api/cron/*` rejects without it |
| `ENCRYPTION_KEY` | yes (integrations) | 32 bytes base64 (`openssl rand -base64 32`) for AES-256-GCM of stored integration secrets |
| `RAZORPAY_KEY_ID` | optional (billing) | Razorpay key id (returned to checkout) |
| `RAZORPAY_KEY_SECRET` | optional (billing) | Razorpay API secret (Basic auth, checkout signature) |
| `RAZORPAY_WEBHOOK_SECRET` | optional (billing) | Webhook HMAC secret |
| `RAZORPAY_PLAN_PRO_MONTHLY_INR` | optional (billing) | Razorpay plan id |
| `RAZORPAY_PLAN_PRO_YEARLY_INR` | optional (billing) | Razorpay plan id |
| `RAZORPAY_PLAN_TEAM_MONTHLY_INR` | optional (billing) | Razorpay plan id |
| `RAZORPAY_PLAN_TEAM_YEARLY_INR` | optional (billing) | Razorpay plan id |
| `RAZORPAY_PLAN_PRO_MONTHLY_USD` | optional (billing) | Razorpay plan id |
| `RAZORPAY_PLAN_PRO_YEARLY_USD` | optional (billing) | Razorpay plan id |
| `RAZORPAY_PLAN_TEAM_MONTHLY_USD` | optional (billing) | Razorpay plan id |
| `RAZORPAY_PLAN_TEAM_YEARLY_USD` | optional (billing) | Razorpay plan id |

`.env.example` lists all of these with empty values and a one-line comment each.

`vercel.json` (F2):

```json
{
  "crons": [
    { "path": "/api/cron/monitor", "schedule": "0 5 * * *" },
    { "path": "/api/cron/digest", "schedule": "30 3 * * 1" }
  ]
}
```

## 4. Database schema

Postgres via Drizzle (`drizzle-orm/pg-core`), client `postgres` (postgres-js). One file: `lib/db/schema.ts` (F2). Enums are `text` columns typed with `.$type<...>()` (no pg enums, simpler migrations). Primary keys are `text` UUIDs with `.$defaultFn(() => crypto.randomUUID())`. Timestamps are `timestamp(..., { withTimezone: true, mode: "date" })`. JSON columns are `jsonb` typed with `.$type<...>()`. F2 generates the migration into `drizzle/` with `drizzle-kit generate` (no DB needed).

The four Auth.js tables keep the exact TypeScript property names and column names the Drizzle adapter expects.

```ts
// ---- enums (exported const arrays + types) ----
export const PLAN_IDS = ["free", "pro", "team"] as const;               export type PlanId = (typeof PLAN_IDS)[number];
export const BILLING_INTERVALS = ["month", "year"] as const;            export type BillingInterval = (typeof BILLING_INTERVALS)[number];
export const CURRENCIES = ["INR", "USD"] as const;                      export type Currency = (typeof CURRENCIES)[number];
export const SUBSCRIPTION_STATUSES = ["none", "created", "authenticated", "active", "past_due", "cancelled", "completed", "halted"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export const MEMBER_ROLES = ["owner", "admin", "member"] as const;      export type MemberRole = (typeof MEMBER_ROLES)[number];
export const MONITOR_SOURCE_KINDS = ["appstore", "playstore", "reddit", "hackernews", "trustpilot"] as const;
export type MonitorSourceKind = (typeof MONITOR_SOURCE_KINDS)[number];
export const FEEDBACK_SOURCE_KINDS = [...MONITOR_SOURCE_KINDS, "widget", "extension", "manual", "import"] as const;
export type FeedbackSourceKind = (typeof FEEDBACK_SOURCE_KINDS)[number];
export const INGEST_CHANNELS = ["source", "widget", "extension", "manual", "import"] as const;
export type IngestChannel = (typeof INGEST_CHANNELS)[number];
export const SOURCE_ROLES = ["own", "competitor"] as const;             export type SourceRole = (typeof SOURCE_ROLES)[number];
export const FEEDBACK_STATUSES = ["new", "triaged", "archived", "spam"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export const ISSUE_STATUSES = ["backlog", "in_progress", "shipped", "ignored"] as const;
export type IssueWorkflowStatus = (typeof ISSUE_STATUSES)[number];
export const ISSUE_TRENDS = ["new", "persistent", "worsened", "improved", "resolved"] as const;
export type IssueTrend = (typeof ISSUE_TRENDS)[number];
export const RUN_TRIGGERS = ["schedule", "manual", "onboarding"] as const; export type RunTrigger = (typeof RUN_TRIGGERS)[number];
export const RUN_STATUSES = ["queued", "running", "succeeded", "failed", "skipped"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export const RUN_STAGES = ["queued", "fetching", "storing", "clustering", "diffing", "alerting", "filing", "done"] as const;
export type RunStage = (typeof RUN_STAGES)[number];
export const INTEGRATION_KINDS = ["slack", "linear", "github"] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];
export const TRACKER_TARGETS = ["linear", "github"] as const;           export type TrackerTarget = (typeof TRACKER_TARGETS)[number];
export const ALERT_KINDS = ["new_issue", "worsened", "autofiled"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];
export const ALERT_MODES = ["serious", "all", "off"] as const;          export type AlertMode = (typeof ALERT_MODES)[number];
// Analysis vocab, identical strings to lib/types.ts:
export type Severity = "Low" | "Medium" | "High";
export type ChurnRisk = "Low" | "Medium" | "High";
export type Effort = "S" | "M" | "L";
export type RecommendedAction = "fix_now" | "investigate" | "monitor";

// ---- source configs (jsonb in sources.config) ----
export type AppStoreConfig   = { appId: string; country: string };                  // country: ISO-2 lowercase, default "us"
export type PlayStoreConfig  = { packageName: string; country: string; lang: string }; // defaults "us", "en"
export type RedditConfig     = { mode: "subreddit"; subreddit: string; keywords: string[] }
                             | { mode: "search"; query: string }
                             | { mode: "thread"; url: string };
export type HackerNewsConfig = { mode: "search"; query: string } | { mode: "thread"; itemId: string };
export type TrustpilotConfig = { domain: string };
export type SourceConfigMap = { appstore: AppStoreConfig; playstore: PlayStoreConfig; reddit: RedditConfig; hackernews: HackerNewsConfig; trustpilot: TrustpilotConfig };
export type SourceConfig = SourceConfigMap[MonitorSourceKind];

export type WidgetSettings = { position: "bottom-right" | "bottom-left"; prompt: string; askEmail: boolean; accent: string | null; buttonLabel: string };
export const DEFAULT_WIDGET_SETTINGS: WidgetSettings = { position: "bottom-right", prompt: "What could be better?", askEmail: true, accent: null, buttonLabel: "Feedback" };

export type OnboardingAnswers = {
  team: { role: "founder" | "pm" | "engineer" | "designer" | "support" | "other"; size: "1" | "2-5" | "6-20" | "21-50" | "50+"; tracker: "linear" | "github" | "jira" | "other"; usesSlack: boolean };
  notifications: { digest: boolean; alerts: AlertMode; timezone: string };
  completedAt: string;
};

export type FeedbackTags = { category: string; severity: Severity; churn_signal: ChurnRisk; affected_segment: string; urgency_keywords: string[] };

export type RunSourceResult = { sourceId: string; label: string; kind: MonitorSourceKind; role: SourceRole; fetched: number; inserted: number; duplicates: number; error: string | null; pausedByPlan: boolean };
export type RunStats = {
  stage: RunStage;
  fetched: number; inserted: number; duplicates: number; analyzed: number;
  issuesNew: number; issuesWorsened: number; issuesImproved: number; issuesPersistent: number; issuesResolved: number;
  alertsSent: number; filed: number; quotaReached: boolean; skippedReason: string | null;
  perSource: RunSourceResult[];
  newIssueIds: string[]; worsenedIssueIds: string[]; improvedIssueIds: string[]; resolvedIssueIds: string[];
};
export const EMPTY_RUN_STATS: RunStats; // all zeros/empty, stage "queued", skippedReason null, quotaReached false

// ---- Auth.js tables ----
users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(uuid),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("emailVerified", { mode: "date", withTimezone: true }),
  image: text("image"),
  activeWorkspaceId: text("active_workspace_id"),            // no FK (avoid cycle); validated in code
  onboardedAt: timestamp("onboarded_at", tz),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
});
accounts = pgTable("accounts", {
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").$type<AdapterAccountType>().notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("providerAccountId").notNull(),
  refresh_token: text("refresh_token"), access_token: text("access_token"),
  expires_at: integer("expires_at"), token_type: text("token_type"), scope: text("scope"),
  id_token: text("id_token"), session_state: text("session_state"),
}, (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })]);
sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
});
verificationTokens = pgTable("verification_tokens", {
  identifier: text("identifier").notNull(), token: text("token").notNull(),
  expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
}, (t) => [primaryKey({ columns: [t.identifier, t.token] })]);

// ---- tenancy ----
workspaces = pgTable("workspaces", {
  id, name: text("name").notNull(), slug: text("slug").notNull().unique(),
  ownerId: text("owner_id").notNull().references(() => users.id),
  plan: text("plan").$type<PlanId>().notNull().default("free"),
  planInterval: text("plan_interval").$type<BillingInterval>(),
  planCurrency: text("plan_currency").$type<Currency>(),
  planStatus: text("plan_status").$type<SubscriptionStatus>().notNull().default("none"),
  currentPeriodEnd: timestamp("current_period_end", tz),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  razorpaySubscriptionId: text("razorpay_subscription_id"),
  timezone: text("timezone").notNull().default("UTC"),
  onboardingAnswers: jsonb("onboarding_answers").$type<OnboardingAnswers>(),
  createdAt, updatedAt,
});
workspaceMembers = pgTable("workspace_members", {
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").$type<MemberRole>().notNull().default("member"),
  notifyDigest: boolean("notify_digest").notNull().default(true),
  alertMode: text("alert_mode").$type<AlertMode>().notNull().default("serious"),
  createdAt,
}, (t) => [primaryKey({ columns: [t.workspaceId, t.userId] })]);
workspaceInvites = pgTable("workspace_invites", {
  id, workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  email: text("email").notNull(), role: text("role").$type<MemberRole>().notNull().default("member"),
  tokenHash: text("token_hash").notNull().unique(),
  invitedBy: text("invited_by").notNull().references(() => users.id),
  expiresAt: timestamp("expires_at", tz).notNull(), acceptedAt: timestamp("accepted_at", tz), revokedAt: timestamp("revoked_at", tz),
  createdAt,
}, (t) => [index("workspace_invites_ws_idx").on(t.workspaceId)]);

// ---- billing ----
subscriptions = pgTable("subscriptions", {
  id, workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  razorpaySubscriptionId: text("razorpay_subscription_id").notNull().unique(),
  razorpayPlanId: text("razorpay_plan_id").notNull(),
  plan: text("plan").$type<PlanId>().notNull(), interval: text("interval").$type<BillingInterval>().notNull(),
  currency: text("currency").$type<Currency>().notNull(),
  status: text("status").$type<SubscriptionStatus>().notNull().default("created"),
  currentPeriodStart: timestamp("current_period_start", tz), currentPeriodEnd: timestamp("current_period_end", tz),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  lastPaymentId: text("last_payment_id"),
  createdAt, updatedAt,
});
billingEvents = pgTable("billing_events", {
  id, eventId: text("event_id").notNull().unique(),               // x-razorpay-event-id
  type: text("type").notNull(), workspaceId: text("workspace_id"),
  payload: jsonb("payload").$type<unknown>().notNull(),
  processedAt: timestamp("processed_at", tz), createdAt,
});
usageCounters = pgTable("usage_counters", {
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  period: text("period").notNull(),                                // "2026-11" (UTC month)
  metric: text("metric").$type<MeteredLimitKey>().notNull(),
  count: integer("count").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.workspaceId, t.period, t.metric] })]);
rateLimits = pgTable("rate_limits", {
  key: text("key").notNull(), windowStart: timestamp("window_start", tz).notNull(), count: integer("count").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.key, t.windowStart] })]);

// ---- product data ----
products = pgTable("products", {
  id, workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(), websiteUrl: text("website_url"), description: text("description"),
  publicKey: text("public_key").notNull().unique(),                // "pk_" + 24 base62 chars
  monitoringEnabled: boolean("monitoring_enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at", tz), nextRunAt: timestamp("next_run_at", tz),
  alertThreshold: integer("alert_threshold").notNull().default(70),
  autofileEnabled: boolean("autofile_enabled").notNull().default(false),
  autofileTarget: text("autofile_target").$type<TrackerTarget>(),
  autofileThreshold: integer("autofile_threshold").notNull().default(80),
  widgetSettings: jsonb("widget_settings").$type<WidgetSettings>().notNull().default(DEFAULT_WIDGET_SETTINGS),
  allowedOrigins: jsonb("allowed_origins").$type<string[]>().notNull().default([]),
  archivedAt: timestamp("archived_at", tz),
  createdAt, updatedAt,
}, (t) => [index("products_ws_idx").on(t.workspaceId), index("products_next_run_idx").on(t.nextRunAt)]);
sources = pgTable("sources", {
  id, workspaceId, productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  kind: text("kind").$type<MonitorSourceKind>().notNull(),
  config: jsonb("config").$type<SourceConfig>().notNull(),
  label: text("label").notNull(),
  role: text("role").$type<SourceRole>().notNull().default("own"),
  competitorName: text("competitor_name"),
  enabled: boolean("enabled").notNull().default(true),
  lastFetchedAt: timestamp("last_fetched_at", tz), lastSuccessAt: timestamp("last_success_at", tz),
  lastError: text("last_error"), lastItemCount: integer("last_item_count"),
  createdAt, updatedAt,
}, (t) => [index("sources_product_idx").on(t.productId)]);
feedback = pgTable("feedback", {
  id, workspaceId, productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  sourceId: text("source_id").references(() => sources.id, { onDelete: "set null" }),
  channel: text("channel").$type<IngestChannel>().notNull(),
  sourceKind: text("source_kind").$type<FeedbackSourceKind>().notNull(),
  role: text("role").$type<SourceRole>().notNull().default("own"),
  competitorName: text("competitor_name"),
  externalId: text("external_id"),
  dedupeKey: text("dedupe_key").notNull(),
  text: text("text").notNull(), title: text("title"), author: text("author"), authorEmail: text("author_email"),
  rating: integer("rating"), url: text("url"),
  postedAt: timestamp("posted_at", tz), ingestedAt: timestamp("ingested_at", tz).notNull().defaultNow(),
  status: text("status").$type<FeedbackStatus>().notNull().default("new"),
  issueId: text("issue_id").references(() => issues.id, { onDelete: "set null" }),
  tags: jsonb("tags").$type<FeedbackTags>(),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),   // pageUrl, userAgent, site, clippedBy
}, (t) => [
  uniqueIndex("feedback_product_dedupe_uq").on(t.productId, t.dedupeKey),
  index("feedback_product_ingested_idx").on(t.productId, t.ingestedAt),
  index("feedback_issue_idx").on(t.issueId),
]);
issues = pgTable("issues", {
  id, workspaceId, productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
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
  rank: integer("rank"),                                           // rank in latest run, 1-based
  evidence: jsonb("evidence").$type<string[]>().notNull().default([]),
  sourceMix: jsonb("source_mix").$type<Partial<Record<FeedbackSourceKind, number>>>().notNull().default({}),
  status: text("status").$type<IssueWorkflowStatus>().notNull().default("backlog"),
  trend: text("trend").$type<IssueTrend>().notNull().default("new"),
  embedding: jsonb("embedding").$type<number[]>(),
  prd: jsonb("prd").$type<PrdStub>(),                              // PrdStub from lib/types.ts shape, redeclared in schema
  prdGeneratedAt: timestamp("prd_generated_at", tz),
  externalTarget: text("external_target").$type<TrackerTarget>(), externalId: text("external_id"),
  externalUrl: text("external_url"), filedAt: timestamp("filed_at", tz),
  firstSeenRunId: text("first_seen_run_id"), lastSeenRunId: text("last_seen_run_id"),
  firstSeenAt: timestamp("first_seen_at", tz).notNull().defaultNow(), lastSeenAt: timestamp("last_seen_at", tz).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", tz),
  createdAt, updatedAt,
}, (t) => [index("issues_product_idx").on(t.productId, t.status)]);
issueSnapshots = pgTable("issue_snapshots", {
  id, issueId: text("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
  runId: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull(),
  frequency: integer("frequency").notNull(), priorityScore: integer("priority_score").notNull(),
  rank: integer("rank"), trend: text("trend").$type<IssueTrend>().notNull(),
  createdAt,
}, (t) => [uniqueIndex("issue_snapshots_issue_run_uq").on(t.issueId, t.runId), index("issue_snapshots_product_idx").on(t.productId, t.createdAt)]);
runs = pgTable("runs", {
  id, workspaceId, productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  trigger: text("trigger").$type<RunTrigger>().notNull(),
  status: text("status").$type<RunStatus>().notNull().default("queued"),
  stats: jsonb("stats").$type<RunStats>().notNull().default(EMPTY_RUN_STATS),
  error: text("error"),
  startedAt: timestamp("started_at", tz), finishedAt: timestamp("finished_at", tz),
  createdAt,
}, (t) => [index("runs_product_idx").on(t.productId, t.createdAt)]);
integrations = pgTable("integrations", {
  id, workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  kind: text("kind").$type<IntegrationKind>().notNull(),
  config: jsonb("config").$type<IntegrationConfig>().notNull(),
  secretEncrypted: text("secret_encrypted").notNull(),            // encryptSecret(webhookUrl | apiKey | token)
  secretHint: text("secret_hint").notNull(),                       // last 4 chars, e.g. "x9Qa"
  status: text("status").$type<"connected" | "error">().notNull().default("connected"),
  lastError: text("last_error"),
  createdAt, updatedAt,
}, (t) => [uniqueIndex("integrations_ws_kind_uq").on(t.workspaceId, t.kind)]);
export type IntegrationConfig =
  | { kind: "slack"; channelName: string | null }
  | { kind: "linear"; teamId: string; teamName: string; teamKey: string; labelName: string | null }
  | { kind: "github"; owner: string; repo: string; labels: string[] };
alerts = pgTable("alerts", {
  id, workspaceId, productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  issueId: text("issue_id").notNull().references(() => issues.id, { onDelete: "cascade" }),
  runId: text("run_id").references(() => runs.id, { onDelete: "set null" }),
  kind: text("kind").$type<AlertKind>().notNull(),
  channels: jsonb("channels").$type<Array<"email" | "slack">>().notNull().default([]),
  createdAt,
}, (t) => [uniqueIndex("alerts_issue_kind_run_uq").on(t.issueId, t.kind, t.runId)]);
digestSends = pgTable("digest_sends", {
  id, workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  weekKey: text("week_key").notNull(),                             // ISO week "2026-W45"
  recipients: integer("recipients").notNull().default(0),
  sentAt: timestamp("sent_at", tz).notNull().defaultNow(),
}, (t) => [uniqueIndex("digest_sends_ws_week_uq").on(t.workspaceId, t.weekKey)]);
apiTokens = pgTable("api_tokens", {
  id, workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),               // sha256 hex of the full token
  prefix: text("prefix").notNull(),                                // first 12 chars, e.g. "bm_ext_A1b2C"
  lastUsedAt: timestamp("last_used_at", tz), revokedAt: timestamp("revoked_at", tz),
  createdAt,
});
```

`MeteredLimitKey` is imported type-only from `@/lib/plans` (`import type { MeteredLimitKey } from "@/lib/plans"`); `lib/plans.ts` in turn type-imports `PlanId`, `BillingInterval`, `Currency` from the schema. Type-only cycles are fine; neither file imports runtime values from the other. `AdapterAccountType` comes from `next-auth/adapters`.

Shorthands above: `id` = `text("id").primaryKey().$defaultFn(() => crypto.randomUUID())`; `tz` = `{ withTimezone: true, mode: "date" }`; `workspaceId` (where written bare) = `text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" })`; `createdAt`/`updatedAt` = `timestamp("created_at"|"updated_at", tz).notNull().defaultNow()` (`updatedAt` also `.$onUpdate(() => new Date())`). `PrdStub` is redeclared in the schema file with the same fields as `lib/types.ts` (`problem_statement`, `affected_users`, `acceptance_criteria`, `edge_cases`, `success_metrics`, `implementation_notes`, `estimated_complexity`), exported as `PrdStubJson`.

Row types exported from `lib/db/schema.ts`: `User`, `Workspace`, `WorkspaceMember`, `WorkspaceInvite`, `Subscription`, `Product`, `Source`, `Feedback`, `Issue`, `IssueSnapshot`, `Run`, `Integration`, `Alert`, `ApiToken` (each `typeof table.$inferSelect`) and `NewProduct`, `NewSource`, `NewFeedback`, `NewIssue`, `NewRun` (`$inferInsert`). Note `Issue` here collides with `lib/types.ts` `Issue`; import with an alias (`import type { Issue as IssueRow } from "@/lib/db/schema"`).

## 5. DTOs and shared domain types

### 5.1 `lib/db/dto.ts` (F2)

JSON shapes returned by APIs and passed to client components. Dates become ISO strings. Secrets and embeddings are never included. Each has a mapper `toXDTO(row)`.

```ts
export interface ProductDTO { id: string; name: string; websiteUrl: string | null; description: string | null; publicKey: string;
  monitoringEnabled: boolean; lastRunAt: string | null; nextRunAt: string | null; alertThreshold: number;
  autofileEnabled: boolean; autofileTarget: TrackerTarget | null; autofileThreshold: number;
  widgetSettings: WidgetSettings; allowedOrigins: string[]; createdAt: string }
export interface SourceDTO { id: string; productId: string; kind: MonitorSourceKind; config: SourceConfig; label: string; role: SourceRole;
  competitorName: string | null; enabled: boolean; lastFetchedAt: string | null; lastSuccessAt: string | null; lastError: string | null;
  lastItemCount: number | null; createdAt: string }
export interface FeedbackDTO { id: string; productId: string; sourceId: string | null; channel: IngestChannel; sourceKind: FeedbackSourceKind;
  role: SourceRole; competitorName: string | null; text: string; title: string | null; author: string | null; authorEmail: string | null;
  rating: number | null; url: string | null; postedAt: string | null; ingestedAt: string; status: FeedbackStatus; issueId: string | null;
  issueTitle: string | null; tags: FeedbackTags | null; site: string | null /* meta.site */ }
export interface IssueDTO { id: string; productId: string; scope: SourceRole; competitorName: string | null; title: string; rankingReason: string | null;
  category: string | null; severity: Severity; churnRisk: ChurnRisk; effort: Effort; affectedSegment: string; recommendedAction: RecommendedAction;
  priorityScore: number; frequency: number; rank: number | null; evidence: string[]; sourceMix: Partial<Record<FeedbackSourceKind, number>>;
  status: IssueWorkflowStatus; trend: IssueTrend; prd: PrdStubJson | null; prdGeneratedAt: string | null;
  externalTarget: TrackerTarget | null; externalUrl: string | null; filedAt: string | null;
  firstSeenAt: string; lastSeenAt: string; resolvedAt: string | null; updatedAt: string }
export interface IssueSnapshotDTO { runId: string; createdAt: string; frequency: number; priorityScore: number; rank: number | null; trend: IssueTrend }
export interface RunDTO { id: string; productId: string; trigger: RunTrigger; status: RunStatus; stats: RunStats; error: string | null;
  startedAt: string | null; finishedAt: string | null; createdAt: string; durationMs: number | null }
export interface IntegrationDTO { kind: IntegrationKind; status: "connected" | "error"; config: IntegrationConfig; secretHint: string;
  lastError: string | null; connectedAt: string }
export interface ApiTokenDTO { id: string; name: string; prefix: string; lastUsedAt: string | null; createdAt: string; revokedAt: string | null }
export interface MemberDTO { userId: string; email: string; name: string | null; image: string | null; role: MemberRole;
  notifyDigest: boolean; alertMode: AlertMode; joinedAt: string }
export interface InviteDTO { id: string; email: string; role: MemberRole; expiresAt: string; createdAt: string }
export function toProductDTO(r: Product): ProductDTO;
export function toSourceDTO(r: Source): SourceDTO;
export function toFeedbackDTO(r: Feedback, issueTitle?: string | null): FeedbackDTO;
export function toIssueDTO(r: IssueRow): IssueDTO;
export function toRunDTO(r: Run): RunDTO;
export function toIntegrationDTO(r: Integration): IntegrationDTO;
export function toApiTokenDTO(r: ApiToken): ApiTokenDTO;
```

`lib/db/dto.ts` contains only types and pure mappers (no DB access), so client components may import its types with `import type`.

### 5.2 `lib/types.ts` (P3) changes

Keep every existing export and shape (anonymous mode depends on them). Changes:

```ts
export type Source = "appstore" | "playstore" | "reddit" | "hn" | "trustpilot" | "widget" | "extension" | "manual";
export const SOURCES: Source[] = ["appstore", "playstore", "reddit", "hn", "trustpilot", "widget", "extension", "manual"];
export const SOURCE_LABELS: Record<Source, string> = { appstore: "App Store", playstore: "Google Play", reddit: "Reddit", hn: "Hacker News",
  trustpilot: "Trustpilot", widget: "Website widget", extension: "Extension", manual: "Pasted" };
export function feedbackKindToSource(kind: FeedbackSourceKind): Source; // hackernews -> hn, import -> manual, others identical
export function sourceToFeedbackKind(source: Source): FeedbackSourceKind; // hn -> hackernews
// Issue gains one optional field (anonymous analyze returns it, UI may ignore it):
export interface Issue { /* existing fields */ member_indices?: number[] }  // 1-based indices into the analyzed items
```

## 6. Cross-package exports

Everything below is a promise by the owner. Signatures are exact.

### 6.1 F1: design system and shell

`lib/utils.ts`

```ts
export function cn(...inputs: ClassValue[]): string;
export function formatRelativeTime(date: string | Date, now?: Date): string;   // "just now", "5 min ago", "3 h ago", "yesterday", "12 Oct"
export function formatNumber(n: number): string;                              // Intl, "1,234"; "12.3k" at >= 10,000
export function pluralize(count: number, singular: string, plural?: string): string; // "1 issue", "3 issues"
export function truncate(text: string, max: number): string;                  // adds "…"
```

`components/ui/*` (each file is `"use client"` where it uses state or Radix; all props extend the native element props unless stated). Also `components/ui/index.ts` re-exporting everything below.

| File | Exports and props |
| --- | --- |
| `button.tsx` | `Button` props `ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" \| "secondary" \| "ghost" \| "outline" \| "danger" \| "link"; size?: "sm" \| "md" \| "lg" \| "icon"; loading?: boolean; asChild?: boolean; leftIcon?: ReactNode; rightIcon?: ReactNode }` (forwardRef; `loading` shows a spinner, sets `aria-busy`, disables). `buttonVariants(opts)` (cva). Default variant `secondary`, size `md`. |
| `input.tsx` | `Input` (`InputHTMLAttributes & { invalid?: boolean; leftIcon?: ReactNode }`, forwardRef). `Label` (`LabelHTMLAttributes & { optional?: boolean }` renders "Optional" in muted text). `Field` (`{ label: string; htmlFor: string; hint?: ReactNode; error?: string \| null; optional?: boolean; children: ReactNode; className?: string }`; wires `aria-describedby` ids `${htmlFor}-hint` and `${htmlFor}-error`). |
| `textarea.tsx` | `Textarea` (`TextareaHTMLAttributes & { invalid?: boolean; autoGrow?: boolean }`, forwardRef). |
| `select.tsx` | `Select` native styled `<select>` (`SelectHTMLAttributes & { invalid?: boolean }`, forwardRef) with a chevron icon. |
| `card.tsx` | `Card` (`HTMLAttributes<HTMLDivElement> & { variant?: "default" \| "sunken" \| "outline"; padding?: "none" \| "sm" \| "md" \| "lg"; as?: "div" \| "section" \| "article" \| "li" }`), `CardHeader`, `CardTitle` (renders `h3` by default, `as` prop for level), `CardDescription`, `CardContent`, `CardFooter`. |
| `badge.tsx` | `Badge` (`HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" \| "brand" \| "success" \| "warning" \| "danger"; variant?: "soft" \| "outline" \| "solid"; dot?: boolean; size?: "sm" \| "md"; icon?: LucideIcon }`). |
| `tabs.tsx` | Radix: `Tabs`, `TabsList` (`{ variant?: "underline" \| "pill" }`), `TabsTrigger` (`{ count?: number }` renders a count chip), `TabsContent`. |
| `dialog.tsx` | `Dialog`, `DialogTrigger`, `DialogClose` (Radix re-exports); `DialogContent` (`{ title: string; description?: ReactNode; size?: "sm" \| "md" \| "lg"; children: ReactNode; footer?: ReactNode; hideTitle?: boolean }`); `DialogFooter`; `ConfirmDialog` (`{ open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: ReactNode; confirmLabel: string; cancelLabel?: string; tone?: "default" \| "danger"; onConfirm: () => void \| Promise<void> }`, shows loading on the confirm button while the promise runs). On mobile (< 640px) dialogs render as bottom sheets. |
| `dropdown.tsx` | Radix: `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent` (`{ align?: "start" \| "end" }`), `DropdownMenuItem` (`{ icon?: LucideIcon; shortcut?: string; tone?: "default" \| "danger" }`), `DropdownMenuCheckboxItem`, `DropdownMenuLabel`, `DropdownMenuSeparator`. |
| `popover.tsx` | Radix: `Popover`, `PopoverTrigger`, `PopoverContent` (`{ align?: "start" \| "center" \| "end"; className?: string }`). |
| `tooltip.tsx` | `TooltipProvider` (mounted once in root layout), `Tooltip` (`{ content: ReactNode; side?: "top" \| "right" \| "bottom" \| "left"; children: ReactElement; delayDuration?: number }`). |
| `toast.tsx` | `Toaster` (sonner, styled with tokens; mounted in root layout by F1), `toast` (re-export of sonner `toast`: `toast(msg)`, `toast.success(msg)`, `toast.error(msg)`, `toast.promise(...)`). |
| `skeleton.tsx` | `Skeleton` (`{ className?: string }`), `SkeletonText` (`{ lines?: number; className?: string }`), `SkeletonRows` (`{ rows?: number }` list-row placeholder). |
| `empty-state.tsx` | `EmptyState` (`{ icon?: LucideIcon; title: string; description?: ReactNode; action?: ReactNode; secondaryAction?: ReactNode; size?: "sm" \| "md"; className?: string }`). Left-aligned on wide containers, centered only inside narrow cards (size `sm`). |
| `page-header.tsx` | `PageHeader` (`{ title: string; description?: ReactNode; actions?: ReactNode; breadcrumb?: Array<{ label: string; href?: string }>; meta?: ReactNode }`). Renders the page `h1`. |
| `stat.tsx` | `Stat` (`{ label: string; value: ReactNode; delta?: { value: string; direction: "up" \| "down" \| "flat"; tone?: "good" \| "bad" \| "neutral" }; hint?: string; icon?: LucideIcon; loading?: boolean }`). `StatGroup` (`{ children }`) a bordered row that divides stats with hairlines instead of separate cards. |
| `switch.tsx` | `Switch` (Radix; `{ checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; id?: string; "aria-label"?: string }`). |
| `segmented.tsx` | `SegmentedControl<T extends string>` (`{ value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string; icon?: LucideIcon }>; size?: "sm" \| "md"; "aria-label": string }`), radiogroup semantics with arrow-key support. |
| `spinner.tsx` | `Spinner` (`{ size?: "sm" \| "md"; className?: string; label?: string }`). |
| `callout.tsx` | `Callout` (`{ tone?: "neutral" \| "brand" \| "success" \| "warning" \| "danger"; title?: string; children?: ReactNode; icon?: LucideIcon; action?: ReactNode }`) for inline errors, notices and quota banners. Uses `role="alert"` when tone is danger. |
| `copy-field.tsx` | `CopyField` (`{ value: string; label?: string; multiline?: boolean; mono?: boolean; secret?: boolean; onCopied?: () => void }`), copy button with "Copied" confirmation for 1.5s. |
| `kbd.tsx` | `Kbd` (`{ children }`). |
| `avatar.tsx` | `Avatar` (`{ src?: string \| null; name?: string \| null; email?: string; size?: "sm" \| "md" }`), initials fallback. |
| `meter.tsx` | `PriorityMeter` (`{ score: number; className?: string }`, 5 segments, `aria-label="Priority 82 of 100"`), `ProgressBar` (`{ value: number; max: number; tone?: "brand" \| "warning" \| "danger"; label?: string }`). |
| `sparkline.tsx` | `Sparkline` (`{ values: number[]; width?: number; height?: number; className?: string; "aria-label": string }`), SVG polyline using `currentColor`, last point dotted. |

`components/brand/*`

| File | Exports |
| --- | --- |
| `logo.tsx` | `LogoMark` (`{ size?: number; className?: string }`), `Wordmark` (`{ className?: string; showMark?: boolean }`; text "BuildMonday" in the display font, one weight, no split styling). |
| `logos.tsx` | Monochrome `currentColor` SVG glyphs, each `({ className?: string; title?: string }) => JSX.Element`: `GitHubGlyph`, `SlackGlyph`, `LinearGlyph`, `NotionGlyph`, `AppStoreGlyph`, `PlayStoreGlyph`, `RedditGlyph`, `HackerNewsGlyph`, `TrustpilotGlyph`, `ChromeGlyph`, `G2Glyph`, `XGlyph`. Plus `SourceGlyph` (`{ kind: string; className?: string }`) mapping `appstore`, `playstore`, `reddit`, `hackernews` and `hn`, `trustpilot`, `widget` (lucide `MessageSquareText`), `extension` (lucide `Puzzle`), `manual` and `import` (lucide `ClipboardPaste`), `g2`, `x`; unknown kinds fall back to lucide `MessageSquare`. |

`components/shell/*`

```ts
// components/shell/AppFrame.tsx  (server component, NOT "use client")
export async function AppFrame(props: { children: React.ReactNode }): Promise<JSX.Element>;
// Calls requirePageContext() (redirects to /login or /onboarding), listProducts(ws), getActiveProduct(ctx), getWorkspacePlan(ws),
// listUserWorkspaces(userId), then renders <AppShell>. Every authenticated route-group layout renders <AppFrame>{children}</AppFrame>.

// components/shell/AppShell.tsx ("use client")
export interface ShellUser { id: string; name: string | null; email: string; image: string | null }
export interface ShellProduct { id: string; name: string }
export interface ShellWorkspace { id: string; name: string }
export function AppShell(props: {
  children: React.ReactNode;
  user: ShellUser;
  workspace: ShellWorkspace;
  workspaces: ShellWorkspace[];
  products: ShellProduct[];
  activeProductId: string | null;
  plan: PlanId;
}): JSX.Element;

// components/shell/ProductSwitcher.tsx ("use client")
export function ProductSwitcher(props: { products: ShellProduct[]; activeProductId: string | null; canAddProduct?: boolean }): JSX.Element;
// Selecting calls setActiveProductAction(id) then router.refresh(). "Add product" links to /onboarding?new=1.

// components/shell/ThemeToggle.tsx ("use client")
export function ThemeToggle(): JSX.Element;  // System / Light / Dark, stored in localStorage "bm-theme", sets class "dark" on <html>

// components/shell/nav.ts
export const APP_NAV: Array<{ href: string; label: string; icon: LucideIcon; group: "main" | "workspace" }>;
// main: Dashboard /dashboard (LayoutDashboard), Inbox /inbox (Inbox), Issues /issues (ListOrdered), Runs /runs (History), Analyzer /app (FlaskConical)
// workspace: Settings /settings (Settings), Extension & widget /extension (Puzzle), Billing /billing (CreditCard)
```

`components/AppHeader.tsx` (F1), used only by `/app` and other public tool pages:

```ts
export function AppHeader(props: { actions?: React.ReactNode }): JSX.Element;
// Left: Wordmark linking to "/". Middle (>= sm): "Analyzer" (/app), "Pricing" (/pricing).
// Right: props.actions, then a session-aware link: fetches /api/auth/session once on mount;
// signed in -> "Open dashboard" (/dashboard); signed out -> "Sign in" (/login) + primary "Start free" (/login?next=/onboarding).
// Must render correctly when /api/auth/session fails or auth is not configured (treat as signed out).
```

`app/layout.tsx` (F1): next/font variables on `<html>`, inline no-flash theme script, `TooltipProvider`, `Toaster`, metadata `{ title: { default: "BuildMonday: know what to build on Monday", template: "%s | BuildMonday" }, description: "BuildMonday turns app reviews, Reddit threads, Hacker News comments and website feedback into a ranked list of engineering issues, every week.", metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000") }`. The root layout does not render any header; pages and route layouts do.

### 6.2 F2: platform

`lib/env.ts`

```ts
export const env: {
  readonly GEMINI_API_KEY: string | undefined; readonly GEMINI_MODEL: string; readonly GEMINI_EMBEDDING_MODEL: string;
  readonly DATABASE_URL: string | undefined; readonly AUTH_SECRET: string | undefined;
  readonly AUTH_GITHUB_ID: string | undefined; readonly AUTH_GITHUB_SECRET: string | undefined;
  readonly AUTH_GOOGLE_ID: string | undefined; readonly AUTH_GOOGLE_SECRET: string | undefined;
  readonly RESEND_API_KEY: string | undefined; readonly EMAIL_FROM: string;
  readonly APP_URL: string;  // NEXT_PUBLIC_APP_URL without trailing slash, default http://localhost:3000
  readonly CRON_SECRET: string | undefined; readonly ENCRYPTION_KEY: string | undefined;
  readonly RAZORPAY_KEY_ID: string | undefined; readonly RAZORPAY_KEY_SECRET: string | undefined; readonly RAZORPAY_WEBHOOK_SECRET: string | undefined;
};  // getters, read lazily
export function requireEnv(name: keyof typeof env): string;  // throws HttpError(503, "not_configured", "<NAME> is not set")
export function isDbConfigured(): boolean;
export function isAuthConfigured(): boolean;            // DATABASE_URL && AUTH_SECRET && (any provider)
export function authProviders(): Array<"github" | "google" | "email">;
export function isEmailConfigured(): boolean;           // RESEND_API_KEY
export function isBillingConfigured(): boolean;         // key id + secret + webhook secret + all 8 plan ids
export function absoluteUrl(path: string): string;      // env.APP_URL + path
```

`lib/db/index.ts`

```ts
export type Db = PostgresJsDatabase<typeof schema>;
export function getDb(): Db;   // lazy singleton; throws HttpError(503, "not_configured", "Database is not configured") if DATABASE_URL missing
export const db: Db;           // Proxy that calls getDb() on first property access (safe to import at module top)
export * as schema from "./schema";
```

postgres-js options: `{ prepare: false, max: 5 }` (works with pgbouncer/Neon pooled URLs).

`auth.ts` (repo root)

```ts
export const { handlers, auth, signIn, signOut } = NextAuth({ ... });
// adapter: DrizzleAdapter(db, { usersTable: users, accountsTable: accounts, sessionsTable: sessions, verificationTokensTable: verificationTokens })
// session: { strategy: "jwt" }; callbacks.jwt puts user.id on token.sub; callbacks.session sets session.user.id = token.sub
// providers: GitHub, Google, Resend({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM }) — each only when configured
// pages: { signIn: "/login", verifyRequest: "/login?check=email", error: "/login" }
// events.createUser: ensurePersonalWorkspace(user.id)
// trustHost: true
```

Type augmentation (in `auth.ts` or `types/next-auth.d.ts`, F2): `Session["user"]` has `id: string`.

`app/api/auth/[...nextauth]/route.ts`: `export const { GET, POST } = handlers;` with `export const runtime = "nodejs"`.

`middleware.ts`: cookie-presence check only (edge-safe, no DB, no auth import). If neither `authjs.session-token` nor `__Secure-authjs.session-token` cookie is present, redirect to `/login?next=<path+search>`. `matcher: ["/dashboard/:path*", "/inbox/:path*", "/issues/:path*", "/runs/:path*", "/settings/:path*", "/billing/:path*", "/extension/:path*", "/onboarding/:path*"]`. It never matches `/`, `/app`, `/pricing`, `/terms`, `/privacy`, `/login`, `/widget-demo`, or any `/api/**` route. API routes authenticate themselves.

`lib/auth/http.ts`

```ts
export type ErrorCode = "unauthorized" | "forbidden" | "not_found" | "invalid_request" | "plan_required" | "limit_reached"
  | "rate_limited" | "conflict" | "payload_too_large" | "unsupported_origin" | "source_unreachable" | "upstream_failed"
  | "not_configured" | "internal";
export class HttpError extends Error { constructor(status: number, code: ErrorCode, message: string, extra?: Record<string, unknown>); status: number; code: ErrorCode; extra?: Record<string, unknown> }
export function json<T>(data: T, init?: number | ResponseInit): Response;   // NextResponse.json
export function errorResponse(status: number, code: ErrorCode, message: string, extra?: Record<string, unknown>, headers?: HeadersInit): Response;
// body: { error: message, code, ...extra }
export function handleRouteError(err: unknown): Response;  // HttpError/PlanError -> their status; ZodError -> 400 invalid_request with { issues }; else 500 internal (logs)
export function withRoute<C = { params: Record<string, string> }>(handler: (req: Request, ctx: C) => Promise<Response>): (req: Request, ctx: C) => Promise<Response>;
export async function parseJson<T>(req: Request, schema: z.ZodType<T>, opts?: { maxBytes?: number }): Promise<T>; // default maxBytes 64 KB, 413 payload_too_large, 400 on bad JSON
export function corsHeaders(origin: string | null, opts?: { allowOrigin?: string; methods?: string; headers?: string }): Record<string, string>;
```

Standard error body everywhere: `{ "error": "<human message>", "code": "<ErrorCode>", ...extra }`. `error` stays a string so existing `/app` client code (`data.error`) keeps working.

`lib/auth/session.ts` (server-only)

```ts
export interface SessionUser { id: string; email: string; name: string | null; image: string | null; onboardedAt: Date | null }
export interface SessionContext { user: SessionUser; workspace: Workspace; role: MemberRole }
export const ACTIVE_PRODUCT_COOKIE = "bm_product";
export async function getSessionContext(): Promise<SessionContext | null>;   // null if no session, DB not configured, or user missing
export async function requireUser(): Promise<SessionContext>;                 // API routes: throws HttpError(401, "unauthorized", "Sign in to continue.")
export async function requirePageContext(opts?: { onboarded?: boolean }): Promise<SessionContext>;
// pages: no session -> redirect("/login?next=" + current path); opts.onboarded !== false && !onboardedAt -> redirect("/onboarding")
export function requireRole(ctx: SessionContext, min: "admin" | "owner"): void;  // throws 403 forbidden
export async function requireProduct(ctx: SessionContext, productId: string): Promise<Product>; // 404 unless product in ctx.workspace and not archived
export async function listProducts(workspaceId: string): Promise<Product[]>;   // not archived, oldest first
export async function getActiveProduct(ctx: SessionContext): Promise<Product | null>; // cookie bm_product if valid, else first product
export async function listUserWorkspaces(userId: string): Promise<Array<{ id: string; name: string; role: MemberRole }>>;
```

`lib/auth/workspace.ts` (server-only)

```ts
export async function ensurePersonalWorkspace(userId: string): Promise<Workspace>; // idempotent; creates workspace + owner membership, sets activeWorkspaceId
export async function getMembers(workspaceId: string): Promise<MemberDTO[]>;
export async function countSeats(workspaceId: string): Promise<number>;          // members + pending (not expired/revoked/accepted) invites
export async function getWorkspaceRecipients(workspaceId: string, kind: "digest" | "alerts"): Promise<Array<{ email: string; name: string | null; alertMode: AlertMode }>>;
// digest: notifyDigest = true; alerts: alertMode !== "off"
```

`lib/auth/actions.ts` (`"use server"`)

```ts
export async function setActiveProductAction(productId: string): Promise<{ ok: boolean }>;   // validates ownership, sets cookie (1 year, lax, httpOnly false)
export async function switchWorkspaceAction(workspaceId: string): Promise<{ ok: boolean }>;  // validates membership, updates users.activeWorkspaceId, clears bm_product
export async function signOutAction(): Promise<void>;                                         // signOut({ redirectTo: "/" })
```

`lib/auth/crypto.ts` (server-only)

```ts
export function encryptSecret(plain: string): string;      // AES-256-GCM with ENCRYPTION_KEY; output "v1:<iv b64>:<tag b64>:<cipher b64>"
export function decryptSecret(payload: string): string;    // throws HttpError(500,"internal") on tamper
export function sha256Hex(input: string): string;
export function randomToken(bytes?: number): string;       // base62, default 24 bytes
export function timingSafeEqualStr(a: string, b: string): boolean;
export function hmacSha256Hex(secret: string, data: string): string;
export function secretHint(secret: string): string;        // last 4 chars
```

`lib/auth/tokens.ts` (server-only)

```ts
export const EXTENSION_TOKEN_PREFIX = "bm_ext_";
export async function createApiToken(args: { workspaceId: string; userId: string; name: string }): Promise<{ token: string; record: ApiTokenDTO }>;
// token = "bm_ext_" + randomToken(24); stores sha256Hex(token) and prefix = token.slice(0, 12)
export async function listApiTokens(workspaceId: string): Promise<ApiTokenDTO[]>;  // excludes revoked
export async function revokeApiToken(workspaceId: string, id: string): Promise<boolean>;
export async function authenticateBearer(req: Request): Promise<{ token: ApiToken; workspace: Workspace; userId: string } | null>;
// reads "Authorization: Bearer bm_ext_...", not revoked, updates lastUsedAt (at most once per minute)
export function generatePublicKey(): string;  // "pk_" + 24 base62 chars
export function generateInviteToken(): { token: string; hash: string };
```

`lib/auth/rate-limit.ts` (server-only)

```ts
export async function rateLimit(key: string, opts: { limit: number; windowSec: number }): Promise<{ ok: boolean; remaining: number; resetAt: Date }>;
// fixed window; DB-backed upsert on rate_limits when DB configured, in-memory Map otherwise; never throws (fails open on DB error)
export function clientIp(req: Request): string;    // x-forwarded-for first entry, x-real-ip, else "unknown"
export function rateLimitHeaders(r: { remaining: number; resetAt: Date }): Record<string, string>; // Retry-After, X-RateLimit-Remaining
```

`lib/auth/mailer.ts` (server-only)

```ts
export async function sendEmail(args: { to: string | string[]; subject: string; html: string; text: string; replyTo?: string; tags?: Array<{ name: string; value: string }> }): Promise<{ id: string | null; skipped: boolean }>;
// Resend SDK; if RESEND_API_KEY missing: console.info and return { id: null, skipped: true }; throws on Resend API error
```

`lib/plans.ts` (pure, client-safe; no imports from db/auth)

```ts
export type { PlanId, BillingInterval, Currency } from "@/lib/db/schema";   // type-only re-export
export type FeatureKey = "daily_runs" | "instant_email_alerts" | "slack_alerts" | "auto_file" | "competitor_tracking" | "export" | "widget_unbranded" | "team_members" | "priority_support";
export type LimitKey = "products" | "sources_per_product" | "competitors" | "feedback_items_per_month" | "manual_runs_per_month" | "prds_per_month" | "chat_messages_per_month" | "extension_clips_per_month" | "seats" | "history_days";
export type MeteredLimitKey = "feedback_items_per_month" | "manual_runs_per_month" | "prds_per_month" | "chat_messages_per_month" | "extension_clips_per_month";
export const UNLIMITED = -1;
export interface Plan {
  id: PlanId; name: string; tagline: string;
  prices: Record<Currency, Record<BillingInterval, number>>;   // major units: { INR: { month: 1499, year: 14990 }, USD: { month: 19, year: 190 } }
  limits: Record<LimitKey, number>;                            // UNLIMITED = -1
  features: Record<FeatureKey, boolean>;
  runIntervalHours: number;                                    // 168 | 24
  highlights: string[];                                        // pricing bullets, plain sentences
}
export const PLANS: Record<PlanId, Plan>;                      // values exactly as PRODUCT_SPEC section 8
export const PLAN_ORDER: PlanId[];                             // ["free", "pro", "team"]
export const FEATURE_LABELS: Record<FeatureKey, string>;       // "Slack alerts", "Auto-file to Linear and GitHub", ...
export const LIMIT_LABELS: Record<LimitKey, string>;           // "Products", "Sources per product", "Feedback items per month", ...
export function getPlan(id: PlanId | null | undefined): Plan;  // unknown -> free
export function hasFeature(plan: PlanId, key: FeatureKey): boolean;
export function limitFor(plan: PlanId, key: LimitKey): number;
export function isUnlimited(n: number): boolean;
export function formatLimit(n: number): string;                // "Unlimited" or formatted number
export function minimumPlanFor(key: FeatureKey | LimitKey, needed?: number): PlanId; // cheapest plan that has the feature / limit >= needed
export function formatPrice(amount: number, currency: Currency): string; // "₹1,499", "$19"
export function computeNextRunAt(plan: PlanId, from: Date): Date;
// pro/team: from + 24 h. free: the next Sunday 05:00 UTC strictly after `from` (so the Monday 03:30 UTC digest has a fresh run).
// Used by P2 (onboarding/product create sets nextRunAt) and P3 (end of every run).
export interface PlanErrorBody { error: string; code: "plan_required" | "limit_reached"; feature?: FeatureKey; limit?: LimitKey; used?: number; max?: number; requiredPlan: PlanId }
export function parsePlanError(body: unknown): PlanErrorBody | null;  // for clients handling 402
```

`lib/billing/entitlements.ts` (server-only; the DB-backed plan functions)

```ts
export interface WorkspacePlanState { plan: Plan; status: SubscriptionStatus; interval: BillingInterval | null; currency: Currency | null;
  currentPeriodEnd: Date | null; cancelAtPeriodEnd: boolean; isPaid: boolean }
export class PlanError extends HttpError {}  // status 402, code plan_required | limit_reached, extra per PlanErrorBody
export async function getWorkspacePlan(workspaceId: string): Promise<WorkspacePlanState>;
// effective plan: paid plan while status active/authenticated, or past_due/cancelled until currentPeriodEnd + 3 days; else free
export async function getUserPlan(userId: string): Promise<Plan>;           // plan of the user's active workspace
export async function assertFeature(workspaceId: string, key: FeatureKey): Promise<void>;   // throws PlanError plan_required
export async function assertWithinLimit(workspaceId: string, key: LimitKey, current: number, adding?: number): Promise<void>;
// for count limits (products, sources_per_product, competitors, seats): throws limit_reached if current + (adding ?? 1) > max
export async function getUsage(workspaceId: string, metric: MeteredLimitKey, period?: string): Promise<number>;
export async function consumeUsage(workspaceId: string, metric: MeteredLimitKey, amount?: number): Promise<{ allowed: number; used: number; max: number }>;
// atomic: grants min(amount, remaining) and increments by that; allowed = 0 when exhausted. Unlimited -> allowed = amount.
export async function assertAndConsume(workspaceId: string, metric: MeteredLimitKey, amount?: number): Promise<void>; // all-or-nothing; throws limit_reached
export interface UsageSummary { period: string; metrics: Record<MeteredLimitKey, { used: number; max: number }>;
  counts: { products: { used: number; max: number }; seats: { used: number; max: number } } }
export async function getUsageSummary(workspaceId: string): Promise<UsageSummary>;
export function currentPeriod(date?: Date): string;   // "2026-11"
```

`lib/billing/razorpay.ts` (server-only, REST via fetch with Basic auth, base `https://api.razorpay.com/v1`)

```ts
export interface RazorpaySubscription { id: string; plan_id: string; status: string; current_start: number | null; current_end: number | null;
  charge_at: number | null; total_count: number; paid_count: number; short_url?: string; notes: Record<string, string> }
export function getRazorpayPlanId(plan: Exclude<PlanId, "free">, interval: BillingInterval, currency: Currency): string; // throws not_configured
export function planFromRazorpayPlanId(planId: string): { plan: Exclude<PlanId, "free">; interval: BillingInterval; currency: Currency } | null;
export async function createSubscription(args: { workspaceId: string; userId: string; plan: Exclude<PlanId, "free">; interval: BillingInterval; currency: Currency }): Promise<RazorpaySubscription>;
// total_count: 120 monthly / 10 yearly; customer_notify: 1; notes: { workspace_id, user_id, plan, interval, currency }
export async function fetchSubscription(id: string): Promise<RazorpaySubscription>;
export async function cancelSubscription(id: string, atCycleEnd: boolean): Promise<RazorpaySubscription>;
export function verifyCheckoutSignature(args: { paymentId: string; subscriptionId: string; signature: string }): boolean; // HMAC(key_secret, paymentId + "|" + subscriptionId)
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean;                            // HMAC(webhook_secret, rawBody)
```

`lib/billing/sync.ts` (server-only)

```ts
export async function recordPendingSubscription(args: { workspaceId: string; sub: RazorpaySubscription; plan: PlanId; interval: BillingInterval; currency: Currency }): Promise<void>;
export async function syncSubscription(sub: RazorpaySubscription, opts?: { paymentId?: string; eventStatus?: SubscriptionStatus }): Promise<{ workspaceId: string; plan: PlanId; status: SubscriptionStatus } | null>;
// upserts subscriptions row, then updates workspaces.plan/planInterval/planCurrency/planStatus/currentPeriodEnd/cancelAtPeriodEnd/razorpaySubscriptionId.
// Status mapping: active|authenticated -> paid plan; pending -> past_due; halted|cancelled|completed -> keep plan until currentPeriodEnd + 3 days (getWorkspacePlan handles the fallback).
export async function enforcePlanLimits(workspaceId: string): Promise<void>;
// after a downgrade: disables monitoring on products beyond the limit (newest first), disables autofile if feature lost. Never deletes data.
```

`lib/billing/currency.ts` (pure, client-safe)

```ts
export function currencyFromCountry(country: string | null | undefined): Currency;   // "IN" -> "INR", else "USD"
export function detectCurrency(headers: Headers): Currency;                          // x-vercel-ip-country
```

### 6.3 P3: engine

`lib/sources/index.ts` (server-only)

```ts
export interface RawFeedbackItem { externalId: string | null; text: string; title?: string; author?: string; rating?: number | null; url?: string; postedAt?: string | null }
export interface FetchResult { items: RawFeedbackItem[]; label: string; warnings: string[]; via: "direct" | "proxy" }
export interface DetectedSource { kind: MonitorSourceKind; config: SourceConfig; label: string }
export async function fetchSource(kind: MonitorSourceKind, config: SourceConfig, opts?: { since?: Date | null; limit?: number; lowRatingOnly?: boolean }): Promise<FetchResult>;
// default limit 50 (monitor passes 100); lowRatingOnly defaults true for appstore/playstore/trustpilot (1 to 3 stars); throws SourceError with a user-facing message
export class SourceError extends Error {}
export async function previewSource(kind: MonitorSourceKind, config: SourceConfig): Promise<{ ok: true; label: string; count: number; sample: RawFeedbackItem[] } | { ok: false; error: string }>;
export function detectSourceFromUrl(input: string): DetectedSource | null;
// handles every URL form the old /api/fetch-reviews handled, plus play.google.com/store/apps/details?id=..., bare package names (com.x.y),
// trustpilot.com/review/<domain>, bare domains when hinted, news.ycombinator.com/item?id=, r/<sub>, reddit URLs
export function validateSourceConfig(kind: MonitorSourceKind, config: unknown): { ok: true; config: SourceConfig } | { ok: false; error: string }; // zod
export function sourceLabel(kind: MonitorSourceKind, config: SourceConfig): string;  // "App Store (US) 123456789", "r/acme: acme notes", "HN search: acme"
export function normalizeText(text: string): string;
export function dedupeKey(productId: string, kind: FeedbackSourceKind, item: { externalId?: string | null; text: string }): string; // sha256 hex
```

One module per adapter: `lib/sources/appstore.ts`, `playstore.ts`, `reddit.ts`, `hackernews.ts`, `trustpilot.ts`, `detect.ts`, `util.ts`. HN search uses `https://hn.algolia.com/api/v1/search_by_date?query=<q>&tags=(story,comment)&numericFilters=created_at_i><since>`. Play Store uses the public `batchexecute` reviews RPC (best effort, clear error on failure).

`lib/feedback/ingest.ts` (server-only)

```ts
export interface IngestItem { text: string; title?: string | null; author?: string | null; authorEmail?: string | null; rating?: number | null;
  url?: string | null; postedAt?: string | Date | null; externalId?: string | null; sourceKind: FeedbackSourceKind;
  role?: SourceRole; competitorName?: string | null; meta?: Record<string, unknown> }
export interface IngestResult { inserted: number; duplicates: number; rejected: number; ids: string[]; quotaExceeded: boolean }
export async function ingestFeedback(args: { workspaceId: string; productId: string; channel: IngestChannel; sourceId?: string | null;
  items: IngestItem[]; enforceQuota?: boolean /* default true */; quotaMetric?: "feedback_items_per_month" | "extension_clips_per_month" }): Promise<IngestResult>;
// trims, rejects text < 3 or > 4000 chars (counted in rejected), computes dedupeKey, consumes quota (feedback_items_per_month always; the
// extension route additionally passes quotaMetric "extension_clips_per_month"), inserts with ON CONFLICT DO NOTHING
```

`lib/monitor/index.ts` (server-only)

```ts
export async function startRun(productId: string, trigger: RunTrigger): Promise<Run>;        // inserts queued run; throws HttpError 409 conflict if one is running (< 10 min old)
export async function executeRun(runId: string): Promise<Run>;                              // the full pipeline, updates stats.stage as it goes; never throws (failures stored)
export async function runProduct(productId: string, trigger: RunTrigger): Promise<Run>;     // startRun + executeRun
export async function runDueProducts(opts: { budgetMs: number }): Promise<{ processed: string[]; remaining: number }>;
export async function analyzeItems(items: Array<{ text: string; source: Source }>, ctx?: { productName?: string; productDescription?: string }): Promise<{ tagged: TaggedComplaint[]; issues: Issue[] }>;
export async function computeDiff(current: Issue[], prior: Issue[], priorRunDate: string): Promise<AnalysisDiff>;  // moved from the analyze route, same behaviour
export async function fileIssue(issueId: string, target: TrackerTarget): Promise<{ externalId: string; externalUrl: string }>; // 402 without auto_file, 400 if integration missing
```

`lib/alerts/index.ts` (server-only)

```ts
export async function postSlackMessage(webhookUrl: string, message: { text: string; blocks?: unknown[] }): Promise<void>; // throws HttpError 502 upstream_failed with Slack's response text
export async function sendRunAlerts(run: Run): Promise<number>;  // returns alerts sent; respects plan features and member alertMode
export function isValidSlackWebhook(url: string): boolean;      // https://hooks.slack.com/services/...
```

`lib/digest/index.ts` (server-only)

```ts
export async function sendWeeklyDigests(opts?: { now?: Date; workspaceId?: string }): Promise<{ sent: number; skipped: number }>;
export function renderDigestEmail(data: DigestData): { subject: string; html: string; text: string };
export function isoWeekKey(date: Date): string;                  // "2026-W45"
```

`lib/integrations.ts` (P3, client-safe: keep every existing export; add pure fetch clients that take secrets as arguments)

```ts
export async function listLinearTeams(apiKey: string): Promise<Array<{ id: string; name: string; key: string }>>;   // GraphQL https://api.linear.app/graphql
export async function createLinearIssue(args: { apiKey: string; teamId: string; title: string; description: string; labelName?: string | null }): Promise<{ id: string; identifier: string; url: string }>;
export async function verifyGitHubRepo(token: string, owner: string, repo: string): Promise<{ fullName: string; private: boolean }>;
export async function createGitHubIssue(args: { token: string; owner: string; repo: string; title: string; body: string; labels?: string[] }): Promise<{ number: number; url: string }>;
// all throw Error with a user-facing message on non-2xx
```

`lib/gemini.ts` keeps `callGeminiJson<T>(prompt)` and `callGeminiChat(...)`, adds one retry on malformed JSON and reads model ids from `env`. `lib/prompts.ts`: `PASS_1_PROMPT(items, ctx?)`, `PASS_2_PROMPT(tagged, ctx?)` (returns `member_indices`), `PRD_PROMPT(args)`. Same exported names; the new `ctx` argument is optional.

### 6.4 P5: billing components (client)

All in `components/billing/`, `"use client"`, re-exported from `components/billing/index.ts`.

```ts
export function PlanBadge(props: { plan: PlanId; size?: "sm" | "md"; className?: string }): JSX.Element;
// Free: neutral outline; Pro: brand soft; Team: ink solid. Text "Free" | "Pro" | "Team".

export function UsageMeter(props: { label: string; used: number; limit: number; unit?: string; compact?: boolean; className?: string }): JSX.Element;
// limit -1 => "Unlimited" with no bar. Bar tone: brand < 80%, warning 80 to 99%, danger at 100%. Text "412 of 500 feedback items".

export function UpgradeDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; feature?: FeatureKey; limit?: LimitKey;
  requiredPlan?: Exclude<PlanId, "free">; reason?: string }): JSX.Element;
// Shows what is locked, compares current vs required plan (prices in detected currency), primary "Upgrade to Pro" links to
// /billing?plan=<plan>&interval=month; secondary "Compare plans" links to /pricing.

export function PaywallGate(props: { feature: FeatureKey; plan: PlanId; children: React.ReactNode; fallback?: React.ReactNode;
  mode?: "replace" | "overlay" | "inline"; title?: string; description?: string }): JSX.Element;
// hasFeature(plan, feature) -> children. Otherwise "replace" (default): a Callout with lock icon + "Upgrade" button opening UpgradeDialog;
// "overlay": children rendered inert + dimmed under a small panel; "inline": a one-line note with an Upgrade link.

export function useUpgradeDialog(): { open: (opts: { feature?: FeatureKey; limit?: LimitKey; requiredPlan?: Exclude<PlanId, "free">; reason?: string }) => void; dialog: JSX.Element };
// Render {dialog} once; call open() when an API returns 402 (use parsePlanError on the body).
```

### 6.5 Where pages get data

- Server components in P2, P4, P5, P6 may query `db` directly (read-only) and must scope every query by `ctx.workspace.id` and, where relevant, `productId` validated with `requireProduct`.
- Client mutations call the API routes in section 7.
- The active product for app pages: `getActiveProduct(ctx)`. If it returns null, the page shows an `EmptyState` "Add your first product" with a link to `/onboarding?new=1`.

## 7. API routes

Conventions: JSON in and out; validation with zod via `parseJson`; errors use the standard body (section 6.2). "session" = `requireUser()` (401 if missing); "admin" = session + `requireRole(ctx, "admin")` (403). All route files set `export const runtime = "nodejs"` and `export const dynamic = "force-dynamic"`. Every product-scoped route validates the product with `requireProduct`. Plan errors are 402.

### 7.1 Anonymous analyzer (P3, no auth, rate-limited per IP)

| Method, path | Request | Response | Limits and errors |
| --- | --- | --- | --- |
| POST `/api/analyze` | `{ complaints?: string; complaintsTagged?: Array<{ text: string; source: Source }>; priorIssues?: Issue[]; priorRunDate?: string }` (max 300 items, 256 KB) | `{ issues: Issue[]; diff: AnalysisDiff \| null }` | 10/IP/day. 400 invalid_request, 413, 429 rate_limited `{ retryAfter }`, 500 |
| POST `/api/fetch-reviews` | `{ url: string }` | `{ reviews: string[]; totalFetched: number; sourceLabel: string; source: MonitorSourceKind; sourceCode: Source }` | 30/IP/day. 400 unrecognised URL, 502 source_unreachable `{ error }` |
| POST `/api/prd` | `{ title, evidence: string[], affected_segment?, severity? }` | `{ prd: PrdStub }` | 20/IP/day |
| POST `/api/chat` | anonymous: `{ messages: ChatMessage[]; issues: Issue[] }`; signed in: `{ messages; productId }` | `{ reply: string }` | anonymous 30/IP/day; signed in: `chat_messages_per_month` (402) |

### 7.2 Onboarding, products, sources, integrations (P2, session)

| Method, path | Auth | Request | Response |
| --- | --- | --- | --- |
| POST `/api/onboarding` | session | `{ product: { name: string; websiteUrl?: string \| null; description?: string \| null }; sources: Array<{ kind: MonitorSourceKind; config: SourceConfig; role: SourceRole; competitorName?: string \| null }>; team: OnboardingAnswers["team"]; notifications: OnboardingAnswers["notifications"] }` | 201 `{ productId: string; sources: SourceDTO[]; skipped: Array<{ kind: MonitorSourceKind; label: string; reason: "limit" \| "plan" \| "invalid"; message: string }> }`. Sources over the plan limit are saved with `enabled: false` and listed in `skipped` with reason `limit`; competitor sources on Free are not saved (reason `plan`). Also sets `onboardedAt`, `onboardingAnswers`, timezone, member prefs, `bm_product` cookie. Product limit -> 402 (only when `?new=1` adds a second product). |
| GET `/api/products` | session | | `{ products: ProductDTO[] }` |
| POST `/api/products` | admin | `{ name, websiteUrl?, description? }` | 201 `{ product: ProductDTO }`; 402 limit_reached `products` |
| GET `/api/products/[id]` | session | | `{ product: ProductDTO; sources: SourceDTO[]; counts: { feedback: number; openIssues: number; newFeedback: number } }` |
| PATCH `/api/products/[id]` | admin | any of `{ name, websiteUrl, description, monitoringEnabled, alertThreshold (0-100), autofileEnabled, autofileTarget, autofileThreshold (50-100), widgetSettings (partial), allowedOrigins: string[] (max 10, origins) }` | `{ product: ProductDTO }`; `autofileEnabled: true` needs `auto_file` (402) and a connected integration for the target (400) |
| DELETE `/api/products/[id]` | admin | | `{ ok: true }` (sets `archivedAt`, disables monitoring) |
| POST `/api/products/[id]/rotate-key` | admin | | `{ publicKey: string }` |
| GET `/api/sources?productId=` | session | | `{ sources: SourceDTO[] }` |
| POST `/api/sources` | admin | `{ productId; kind; config; role?: SourceRole; competitorName?: string }` or `{ productId; url: string; role?; competitorName? }` (detected) | 201 `{ source: SourceDTO }`; 400 invalid config; 402 `sources_per_product`, `competitor_tracking`, `competitors` |
| PATCH `/api/sources/[id]` | admin | `{ config?; enabled?; label? }` | `{ source: SourceDTO }`; enabling beyond the limit -> 402 |
| DELETE `/api/sources/[id]` | admin | | `{ ok: true }` (feedback keeps `sourceId` null) |
| POST `/api/sources/test` | session | `{ kind; config }` or `{ url }` | 200 `{ ok: true; kind; config; label; count; sample: RawFeedbackItem[] }` (max 5 samples) or 422 `{ error, code: "source_unreachable" }`; 30/user/hour |
| GET `/api/integrations` | session | | `{ slack: IntegrationDTO \| null; linear: IntegrationDTO \| null; github: IntegrationDTO \| null }` |
| PUT `/api/integrations/slack` | admin | `{ webhookUrl: string; channelName?: string \| null }` | `{ integration: IntegrationDTO }` after a successful test post ("BuildMonday is connected. Alerts for <workspace> will post here."); 402 `slack_alerts`; 400 bad URL; 502 Slack rejected |
| POST `/api/integrations/linear/teams` | admin | `{ apiKey: string }` | `{ teams: Array<{ id; name; key }> }`; 502 on bad key |
| PUT `/api/integrations/linear` | admin | `{ apiKey: string; teamId: string; labelName?: string \| null }` | `{ integration }`; 402 `auto_file` |
| PUT `/api/integrations/github` | admin | `{ token: string; repo: string /* owner/name or URL */; labels?: string[] }` | `{ integration }` after `verifyGitHubRepo`; 402 `auto_file` |
| POST `/api/integrations/[kind]/test` | admin | | `{ ok: true }` or 502 `{ error }` (updates status/lastError) |
| DELETE `/api/integrations/[kind]` | admin | | `{ ok: true }`; also sets `autofileEnabled = false` on products targeting it |

Team management is server actions (`app/settings/team/actions.ts`), not API routes: `inviteMemberAction(email, role)`, `revokeInviteAction(id)`, `removeMemberAction(userId)`, `updateMemberRoleAction(userId, role)`, `updateMyNotificationsAction({ notifyDigest, alertMode })`. Invites: seats via `assertWithinLimit("seats", countSeats)`; the `admin` role needs `team_members`; email subject "<inviter> invited you to <workspace> on BuildMonday", link `/onboarding/invite/<token>` valid 7 days.

### 7.3 Engine (P3)

| Method, path | Auth | Request | Response |
| --- | --- | --- | --- |
| GET `/api/cron/monitor` | `Authorization: Bearer ${CRON_SECRET}` | | `{ ok: true; processed: string[]; remaining: number }`; 401 otherwise. `maxDuration = 300`, budget 240 s, self-chains once if `remaining > 0` |
| GET `/api/cron/digest` | cron secret | | `{ ok: true; sent: number; skipped: number }` |
| POST `/api/runs` | session | `{ productId: string }` | 202 `{ run: RunDTO }` immediately; pipeline continues via `waitUntil(executeRun(id))`. Consumes `manual_runs_per_month` unless it is the product's first run (then trigger `onboarding`). 409 conflict if running. 402 limit |
| GET `/api/runs?productId=&limit=20&cursor=` | session | | `{ runs: RunDTO[]; nextCursor: string \| null }` |
| GET `/api/runs/[id]` | session | | `{ run: RunDTO; product: { id; name }; issues?: { new: IssueDTO[]; worsened: IssueDTO[]; improved: IssueDTO[]; resolved: IssueDTO[] } }` (issues only when status succeeded) |
| GET `/api/issues?productId=&status=&trend=&scope=own&q=&sort=priority\|frequency\|recent` | session | | `{ issues: IssueDTO[] }` (max 200) |
| GET `/api/issues/[id]` | session | | `{ issue: IssueDTO; snapshots: IssueSnapshotDTO[] (oldest first, max 26); feedback: FeedbackDTO[] (max 50, newest first) }` |
| PATCH `/api/issues/[id]` | session | `{ status?: IssueWorkflowStatus; title?: string }` | `{ issue: IssueDTO }` |
| POST `/api/issues/[id]/prd` | session | `{}` | `{ issue: IssueDTO }` with `prd` set; consumes `prds_per_month` (402) |
| POST `/api/issues/[id]/file` | session | `{ target: TrackerTarget }` | `{ issue: IssueDTO }` with external fields; 402 `auto_file`; 400 `{ code: "invalid_request", error: "Connect Linear in Settings first." }`; 409 if already filed |
| GET `/api/issues/export?productId=&format=csv\|json` | session | | file download (`Content-Disposition: attachment; filename="buildmonday-issues-<product>-<date>.csv"`); 402 `export` |
| GET `/api/feedback?productId=&status=new&sourceKind=&issueId=&q=&cursor=&limit=50` | session | | `{ items: FeedbackDTO[]; nextCursor: string \| null; counts: Record<FeedbackStatus, number>; quota: { used: number; max: number } }` |
| PATCH `/api/feedback` | session | `{ ids: string[] (1-200); status?: FeedbackStatus; issueId?: string \| null }` | `{ updated: number }` |
| POST `/api/feedback` | session | `{ productId: string; items?: Array<{ text: string; author?: string; url?: string; rating?: number }>; raw?: string /* newline separated */ }` (max 500 items) | 201 `IngestResult` (channel `manual` for items, `import` for raw) |
| POST `/api/ingest` | public key in body | `{ key: string; text: string (3-4000); email?: string; name?: string; pageUrl?: string; rating?: 1-5; meta?: object (<= 2 KB JSON); website?: string /* honeypot, must be empty */ }` (max 16 KB) | 201 `{ ok: true }`; 202 `{ ok: true; stored: false }` when over quota; key `"demo"` returns 201 `{ ok: true; demo: true }` without storing. Errors: 400, 403 `unsupported_origin` (allowedOrigins non-empty and Origin not listed), 404 unknown key, 413, 429 (10 per IP per product per 10 min; 300 per product per hour). Honeypot filled -> 201 `{ ok: true }` but not stored. More than 3 URLs in text -> stored with status `spam`. |
| OPTIONS `/api/ingest` | public | | 204 with `Access-Control-Allow-Origin: <request origin or *>`, `Allow-Methods: POST, OPTIONS`, `Allow-Headers: Content-Type`, `Max-Age: 86400` |
| GET `/api/ingest/config?key=` | public, CORS | | `{ productName: string; prompt: string; askEmail: boolean; accent: string \| null; position: "bottom-right" \| "bottom-left"; buttonLabel: string; showBranding: boolean }`; key `"demo"` returns a demo config |

### 7.4 Billing (P5)

| Method, path | Auth | Request | Response |
| --- | --- | --- | --- |
| GET `/api/billing/status` | session | | `{ plan: PlanId; status: SubscriptionStatus; interval: BillingInterval \| null; currency: Currency \| null; currentPeriodEnd: string \| null; cancelAtPeriodEnd: boolean; usage: UsageSummary; billingEnabled: boolean; suggestedCurrency: Currency; canManage: boolean }` |
| POST `/api/billing/checkout` | owner/admin | `{ plan: "pro" \| "team"; interval: BillingInterval; currency: Currency }` | `{ subscriptionId: string; keyId: string; name: "BuildMonday"; description: string /* "Pro, billed monthly" */; prefill: { email: string; name: string \| null }; notes: Record<string,string> }`; 503 not_configured; 409 conflict when an active paid subscription exists for the same plan/interval (switching plan: the UI cancels first, then subscribes) |
| POST `/api/billing/verify` | session | `{ razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }` | `{ ok: true; plan: PlanId }` after `verifyCheckoutSignature`, `fetchSubscription`, `syncSubscription`; 400 bad signature |
| POST `/api/billing/cancel` | owner/admin | `{}` | `{ ok: true; cancelAtPeriodEnd: true; currentPeriodEnd: string \| null }` |
| POST `/api/webhooks/razorpay` | `X-Razorpay-Signature` HMAC | raw body | 200 `{ received: true }`. Reads raw text, verifies, dedupes on `X-Razorpay-Event-Id` via `billing_events`, handles `subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`, `subscription.updated`, `payment.failed` (log only). Calls `syncSubscription` then `enforcePlanLimits`. 400 bad signature. Returns 200 for unknown events. |

Checkout client flow (P5, `/billing`): load `https://checkout.razorpay.com/v1/checkout.js` with `next/script`, open `new Razorpay({ key: keyId, subscription_id, name, description, prefill, theme: { color: "#2340D9" }, handler })`, `handler` posts to `/api/billing/verify`, then `router.refresh()` and toast "You are on Pro now." If billing is not configured, the page shows plans read-only with a Callout "Payments are not set up on this deployment."

### 7.5 Extension (P6)

| Method, path | Auth | Request | Response |
| --- | --- | --- | --- |
| GET `/api/extension/me` | `Authorization: Bearer bm_ext_...` | | `{ user: { email: string; name: string \| null }; workspace: { id: string; name: string; plan: PlanId }; products: Array<{ id: string; name: string }> }`; 401 `{ error: "This token is not valid. Create a new one in BuildMonday under Extension & widget." }` |
| POST `/api/extension/clip` | bearer | `{ productId: string; items: Array<{ text: string (3-4000); url?: string; title?: string; author?: string; rating?: number \| null; postedAt?: string \| null; externalId?: string \| null; site?: string /* "playstore" \| "appstore" \| "reddit" \| "hackernews" \| "trustpilot" \| "g2" \| "producthunt" \| "x" \| "other" */ }> (1-100) }` (max 256 KB) | 201 `{ inserted: number; duplicates: number; rejected: number; inboxUrl: string }`. `sourceKind` = site if it is a `MonitorSourceKind`, else `"extension"`; `meta.site` = site; channel `extension`; quotaMetric `extension_clips_per_month`. 402 when quota exhausted and nothing inserted; 60 requests/token/min (429) |
| OPTIONS `/api/extension/*` | public | | 204 CORS allowing `Authorization, Content-Type` from `chrome-extension://*` origins |
| GET `/api/extension/tokens` | session | | `{ tokens: ApiTokenDTO[] }` |
| POST `/api/extension/tokens` | session | `{ name: string (1-60) }` | 201 `{ token: string; record: ApiTokenDTO }` (plaintext shown once); max 10 active tokens per workspace (409) |
| DELETE `/api/extension/tokens/[id]` | session | | `{ ok: true }` |

### 7.6 Auth (F2)

`GET|POST /api/auth/[...nextauth]`: Auth.js. `GET /api/auth/session` returns `{ user: { id, name, email, image }, expires }` or `null`/`{}` when signed out.

## 8. Design system

### 8.1 Direction

BuildMonday's subject is a work queue: complaints in, a ranked Monday list out. The identity is "the Monday list": a calm, cool, precise workspace in the spirit of a well-kept engineering ledger, with one strong colour, Monday Cobalt, used for rank, priority and primary actions. It must not look like ResumeLens (warm paper, pastel tool tints, Fraunces) and must not look like the old BuildMonday (black, particles, indigo glows, amber italics).

The one memorable thing: the ranked list itself. Rank numbers set large in the display face, a five-segment priority meter, and a week strip (Mon to Sun cells showing feedback volume) appear in the marketing hero, the dashboard and the digest email. Everything around them stays quiet.

Banned: particle, sparkle, smoke or noise backgrounds; gradient blobs and glows; rainbow or purple-to-pink gradients; glassmorphism and backdrop blur (except the sticky topbar, which may use a solid surface at 92% opacity with no blur); emoji; gradient text; text with a single accented word in a different colour, italic or font; all-caps tracked eyebrow labels; middle-dot meta strings (use separate elements or commas); arrows appended to button labels; walls of identical cards; centred-everything layouts; fake ratings.

### 8.2 Color tokens

Defined in `app/globals.css` as RGB channel triplets so Tailwind alpha works (`rgb(var(--brand) / <alpha-value>)`). Light is the default; dark applies when `<html class="dark">` (set by the inline theme script from `localStorage["bm-theme"]`, falling back to the system preference). Marketing pages use the same tokens and must look right in both themes; P1 checks the hero artifact in both.

| Token | Tailwind name | Light | Dark | Use |
| --- | --- | --- | --- | --- |
| `--canvas` | `canvas` | `#F6F7F9` | `#0D0F13` | Page background |
| `--surface` | `surface` | `#FFFFFF` | `#15181E` | Cards, panels, sidebar, inputs |
| `--sunken` | `sunken` | `#EEF0F3` | `#101318` | Wells, code blocks, table headers, hover rows |
| `--line` | `line` | `#E2E5EA` | `#252A32` | Default borders, dividers |
| `--line-strong` | `line-strong` | `#C9CFD8` | `#363C47` | Input borders, emphasized dividers |
| `--ink` | `ink` | `#0F1419` | `#ECEEF1` | Primary text, solid dark buttons |
| `--ink-secondary` | `ink-secondary` | `#404854` | `#B6BCC6` | Body text, secondary text |
| `--ink-muted` | `ink-muted` | `#69717E` | `#8A919D` | Captions, meta, placeholders (meets 4.5:1 on surface) |
| `--ink-faint` | `ink-faint` | `#9AA1AC` | `#5D6470` | Disabled, decorative only |
| `--brand` | `brand` | `#2340D9` | `#7189FF` | Monday Cobalt: primary buttons, links, rank, priority, focus |
| `--brand-hover` | `brand-hover` | `#1B33B8` | `#8C9FFF` | Primary hover |
| `--brand-soft` | `brand-soft` | `#ECEFFE` | `#1A2150` | Soft badges, selected rows |
| `--brand-ink` | `brand-ink` | `#1A2C9E` | `#BAC6FF` | Text on brand-soft |
| `--on-brand` | `on-brand` | `#FFFFFF` | `#0D0F13` | Text on brand fill |
| `--danger` | `danger` | `#C8251B` | `#F47067` | Fix now, worsened, High severity, destructive |
| `--danger-soft` | `danger-soft` | `#FDECEA` | `#3A1715` | |
| `--danger-ink` | `danger-ink` | `#9A1C14` | `#FFB3AC` | |
| `--warning` | `warning` | `#B25E09` | `#F2A93B` | Investigate, Medium severity, quota near |
| `--warning-soft` | `warning-soft` | `#FEF3E2` | `#3A2A0E` | |
| `--warning-ink` | `warning-ink` | `#7A3F05` | `#FFD597` | |
| `--success` | `success` | `#0B7A4B` | `#4FCB8D` | Improved, resolved, shipped, connected |
| `--success-soft` | `success-soft` | `#E6F6EE` | `#0F2E20` | |
| `--success-ink` | `success-ink` | `#075C38` | `#A6EBC7` | |

Source colours (data only: source mix bars, source dots, charts). Tailwind `source-<kind>`:

| Kind | Light | Dark |
| --- | --- | --- |
| `appstore` | `#2340D9` | `#7189FF` |
| `playstore` | `#0E8A7D` | `#3CC7B6` |
| `reddit` | `#D4561C` | `#F28A55` |
| `hn` / `hackernews` | `#B25E09` | `#F2A93B` |
| `trustpilot` | `#0B7A4B` | `#4FCB8D` |
| `widget` | `#7048E8` | `#A58BFF` |
| `extension` | `#5B6472` | `#9AA3B2` |
| `manual` / `import` | `#9AA1AC` | `#6B7280` |

Semantic mapping (P4 and everyone showing issues must follow):
- Recommended action: `fix_now` danger, `investigate` warning, `monitor` neutral.
- Trend: `new` brand, `worsened` danger, `improved` success, `resolved` success outline, `persistent` neutral (often not shown).
- Severity and churn: High danger, Medium warning, Low neutral.
- Issue status: `backlog` neutral, `in_progress` brand, `shipped` success, `ignored` neutral with faint text.
- Run status: `succeeded` success, `running`/`queued` brand with a spinner, `failed` danger, `skipped` neutral.
- Priority: `PriorityMeter` fills `ceil(score / 20)` of 5 segments in brand; empty segments `line`.

Always pair colour with a word or icon.

### 8.3 Typography

Loaded with `next/font/google` in `app/layout.tsx`, exposed as CSS variables:

| Role | Family | Settings | Variable | Tailwind |
| --- | --- | --- | --- | --- |
| Display (headings, rank numbers, big numbers, wordmark) | Bricolage Grotesque (`Bricolage_Grotesque`) | `subsets: ["latin"]`, `weight: ["500", "600", "700"]`, `display: "swap"` | `--font-display` | `font-display` |
| UI and body | Instrument Sans (`Instrument_Sans`) | `subsets: ["latin"]`, `weight: ["400", "500", "600"]`, `display: "swap"` | `--font-sans` | `font-sans` (default on body) |
| Code (tokens, snippets, API keys only) | JetBrains Mono (`JetBrains_Mono`) | `subsets: ["latin"]`, `weight: ["400", "500"]`, `display: "swap"` | `--font-mono` | `font-mono` |

All three families are present in the installed Next 14.2.15 font data (verified). Email HTML and `public/widget.js` use system font stacks, not these fonts.

Type scale (Tailwind `fontSize` overrides, `[size, { lineHeight, letterSpacing }]`):

| Token | Size / line height | Tracking | Use |
| --- | --- | --- | --- |
| `text-xs` | 12 / 16 | 0 | Badges, captions, table meta |
| `text-sm` | 13 / 20 | 0 | Default app UI text, inputs, buttons |
| `text-base` | 15 / 24 | 0 | Body text in app, descriptions |
| `text-lg` | 17 / 28 | -0.005em | Marketing body, lead paragraphs in app |
| `text-xl` | 20 / 28 | -0.01em | Card titles, section titles in app |
| `text-2xl` | 24 / 30 | -0.015em | Page titles (app `h1`) in display font |
| `text-3xl` | 32 / 38 | -0.02em | Marketing section headings, big stats |
| `text-4xl` | 44 / 48 | -0.025em | Marketing page titles |
| `text-5xl` | 60 / 62 | -0.03em | Marketing hero (40 / 44 below 640px) |

Rules: headings use `font-display font-semibold` (600); body never above 600 weight; numbers use `tabular-nums`; marketing body line length max 68ch, app descriptions max 72ch; sentence case everywhere; no all-caps labels (use `text-xs font-medium text-ink-muted`).

### 8.4 Spacing, radius, shadow, layout grid

- Spacing: Tailwind 4 px scale. Use only 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32. Component internal padding: compact 8/12, default 12/16, roomy 20/24. Vertical rhythm between page sections in the app: `space-y-8`; marketing sections: `py-20 sm:py-28`.
- Page gutters: `px-4 sm:px-6 lg:px-8`. App content max width `max-w-[1200px]`; settings and onboarding forms `max-w-[720px]`; marketing container `max-w-[1160px]`.
- Radius (Tailwind `borderRadius` override): `rounded-sm` 4 px (checkbox, kbd, meter segments), `rounded` and `rounded-md` 8 px (buttons, inputs, badges are `rounded-full` only for pills/dots), `rounded-lg` 12 px (cards, popovers), `rounded-xl` 16 px (dialogs, marketing panels), `rounded-full`. Nested radius = outer minus padding; never put a 12 px card inside a 12 px card.
- Shadows (Tailwind `boxShadow` override; colour from ink at low alpha, dark mode uses black at higher alpha via CSS vars `--shadow-color`):
  - `shadow-xs`: `0 1px 2px rgb(var(--shadow-color) / 0.06)`: cards (with a border)
  - `shadow-sm`: `0 1px 3px rgb(var(--shadow-color) / 0.08), 0 1px 2px rgb(var(--shadow-color) / 0.04)`: raised buttons, sticky bars
  - `shadow-md`: `0 8px 24px -6px rgb(var(--shadow-color) / 0.14), 0 2px 6px rgb(var(--shadow-color) / 0.06)`: popovers, dropdowns, toasts
  - `shadow-lg`: `0 24px 56px -12px rgb(var(--shadow-color) / 0.24)`: dialogs, the hero artifact
  - Light `--shadow-color: 15 20 25`; dark `--shadow-color: 0 0 0`.
- Borders: 1 px `border-line` everywhere; inputs `border-line-strong`; no 2 px borders except the Pro pricing column top (`border-t-2 border-brand`) and the focus ring.
- Focus: utility `.focus-ring` = `outline-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface`. Every interactive primitive applies it.
- Z-index: topbar 30, sidebar drawer 40, popover/dropdown 50, dialog 60, toast 70.

Tailwind config (F1): `darkMode: "class"`, `content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"]`, colours as above, `fontFamily.sans = ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"]`, `display`, `mono` likewise, keyframes `fade-in`, `slide-up-sm` (4 px), `scale-in` (0.98 to 1), `shimmer` (skeleton) and matching `animation` entries.

### 8.5 Motion

- Durations: 120 ms (hover, press), 180 ms (menus, popovers, tooltips), 240 ms (dialogs, sheets, panels). Easing: `cubic-bezier(0.2, 0, 0, 1)` standard; `cubic-bezier(0.16, 1, 0.3, 1)` for entrances.
- One orchestrated moment per page at most. Marketing: the hero list sorts itself into ranked order once on load (framer-motion `layout`), then rests. App: the dashboard list animates reordering only after a run completes.
- Allowed continuous motion: spinner while loading, the running-run status dot (opacity pulse, 2 s), skeleton shimmer.
- Not allowed: scroll-triggered fade-ups on every section, hover lift on every card, parallax, auto-playing carousels, typing effects.
- `prefers-reduced-motion: reduce`: disable layout animations, shimmer and pulse; keep instant state changes.

### 8.6 Component patterns

- Buttons: primary = brand fill, `on-brand` text; secondary = surface fill + `border-line-strong`; ghost = no border, sunken on hover; danger = danger fill. Heights: sm 30, md 36, lg 44 px. Label is a verb phrase. Icon left, 16 px.
- Lists over cards: issues, feedback, runs, sources and tokens are rows inside one bordered container with hairline dividers (`divide-y divide-line`), not separate cards.
- Rank cell: `font-display text-2xl font-semibold tabular-nums text-ink` (`text-brand` for ranks 1 to 3), 40 px column.
- Tables on mobile collapse to stacked rows: title first, then a wrap of badges; no horizontal page scroll (a table may scroll inside its own container only for the export preview).
- Forms: label above input, hint below in `text-xs text-ink-muted`, error below in `text-xs text-danger` with an icon; settings sections are two-column on `lg` (title + description left 1/3, controls right 2/3) and stacked below.
- Empty states: icon (24 px, `text-ink-muted`) + title + one sentence + one primary action. Never a blank panel.
- Loading: skeletons shaped like the content for page loads; inline `Spinner` + verb ("Saving…") for actions; long jobs (runs) show the stage list.
- Errors: inline `Callout tone="danger"` near the thing that failed, with what happened and what to do; toasts only for background results.
- Sidebar: 240 px, `bg-surface`, `border-r border-line`; items 32 px tall, icon 16 px, active item `bg-brand-soft text-brand-ink`; workspace + plan pill at the bottom; below `lg` it becomes a left drawer opened from a menu button in the topbar.
- Topbar: 56 px, `bg-surface/92 border-b border-line`, left: menu button (mobile), `ProductSwitcher`; right: "Run now" slot is page-level, not in the topbar; user menu (Avatar) with Settings, Billing, theme, Sign out.

## 9. Page layouts per route

| Route | Owner | Layout |
| --- | --- | --- |
| `/` | P1 | Sticky site header (Wordmark left, links "How it works", "Pricing", "Analyzer" centre-right, "Sign in" + primary "Start free" right; mobile menu). Hero: two columns on `lg` (copy 5/12 left-aligned, artifact 7/12): headline, subhead, two CTAs, a one-line note "Free plan, no card needed." Artifact = "The Monday list" panel: example product "Example: a note-taking app", a week strip (Mon to Sun volume bars), five ranked issues with rank, title, trend badge, frequency, priority meter, source glyphs; labelled "Example". Then: "Where it listens" (source glyph row with one sentence each, not cards); "How it works" (3-step sequence: Connect your sources, BuildMonday reads them every day, Your team gets the list; numbering is fine because it is a sequence); "What happens automatically" (alternating text + small UI excerpt rows: alerts in Slack, auto-filed Linear issue, Monday email preview); "Collect it yourself" (widget + extension, with the real snippet); "Try it now" band linking to `/app`; pricing summary (three columns, link to `/pricing`); FAQ (accordion, 6 to 8 real questions: data sources, privacy, Reddit reliability, what counts as a feedback item, cancel anytime, INR/USD); footer (Wordmark, links: Pricing, Analyzer, Terms, Privacy, GitHub repo). |
| `/pricing` | P1 | Title "Pricing", one sentence. Controls row: `SegmentedControl` Monthly/Yearly ("Yearly: 2 months free" as text next to it), currency `SegmentedControl` INR/USD defaulting from `detectCurrency(headers())`. Three plan columns in one bordered container (not three floating cards), Pro column with `border-t-2 border-brand`. Then the full comparison table from `PLANS` (limits + features, check icons with sr-only text). FAQ. CTA buttons: signed out -> `/login?next=/billing?plan=pro&interval=year`, signed in -> `/billing?plan=...`. |
| `/terms`, `/privacy` | P1 | Single column 68ch prose, `h1` + last-updated date, plain-language sections. Privacy must describe: what is stored (account, feedback text, integration secrets encrypted), processors (Vercel, the Postgres host, Google Gemini, Resend, Razorpay), retention by plan (`history_days`), deletion on request by email. Placeholder contact uses `support@` + the configured domain from `NEXT_PUBLIC_APP_URL` host. |
| `/login` | P2 | Split on `lg`: left form column (Wordmark, "Sign in to BuildMonday", provider buttons with brand glyphs, divider "or", email field + "Email me a sign-in link"), right sunken panel with a short "What happens next" sequence. `?check=email` shows "Check your inbox" state with the address. Errors from `?error=` mapped to readable messages. |
| `/onboarding` | P2 | No sidebar. Minimal top bar (Wordmark, "Sign out"). Left step list (desktop), form column `max-w-[640px]`. See PRODUCT_SPEC section 5. |
| `/onboarding/invite/[token]` | P2 | Card centered in a narrow column (exception allowed): "Join <workspace>", inviter name, "Join workspace" button; invalid/expired state. |
| `/settings/*` | P2 | `AppFrame`; `PageHeader` "Settings"; sub-nav (Tabs on mobile, left list on `lg`): Product (`/settings`), Sources (`/settings/sources`), Alerts and filing (`/settings/alerts`), Integrations (`/settings/integrations`), Team (`/settings/team`), Account (`/settings/account`). Sources page: list rows with `SourceGlyph`, label, health (last fetched, item count, error), enable switch, menu (Edit, Test, Remove); "Add source" dialog with URL smart-paste + per-kind fields + Test preview; competitors section below (PaywallGate). |
| `/dashboard` | P4 | `AppFrame`; `PageHeader` = product name, meta "Last run 3 h ago, next run Mon 05:00 UTC", actions: "Run now" (primary), "Ask about these issues" (secondary, opens chat sheet). `?first=1` shows the run stage list in place of the content. Grid on `lg`: main 8/12: `StatGroup` (Feedback this week with delta vs last week, Open issues, New this run, Resolved in 30 days), "This week's list" (top 10 issues as rows: rank, title + ranking reason, trend badge, frequency + sparkline, priority meter, status select), "Competitor gaps" (if any). Side 4/12: Week strip (feedback per day, last 7 days), Source health, Recent runs (5). Empty: no sources -> EmptyState "Add a source to start monitoring" (to `/settings/sources`); no runs -> "Run your first check". Quota banner Callout when `feedback_items_per_month` >= 90%. |
| `/inbox` | P4 | `AppFrame`; `PageHeader` "Inbox", actions "Add feedback" (dialog: paste lines or single item) and "Export" (Pro). Tabs by status with counts. Filter row: source select, issue select, search input. List rows: checkbox, `SourceGlyph`, text (2-line clamp, expand on click), author, rating (as "2 of 5"), relative time, linked issue chip, open-original link. Bulk bar appears when rows are selected: "Mark triaged", "Archive", "Mark as spam", "Link to issue". Keyboard: `j`/`k` move, `x` select, `e` archive, `/` focus search. Infinite "Load more" button (cursor). |
| `/issues` | P4 | `PageHeader` "Issues", actions "Export" (PaywallGate inline). Segmented: Your product / Competitors. Filters: status, trend, sort. Rows as on the dashboard plus status column and filed link. |
| `/issues/[id]` | P4 | Breadcrumb Issues / title. Header: rank, title, badges (action, trend, severity, churn, effort), status select, actions "File to Linear/GitHub" (dropdown, PaywallGate), "Copy as Markdown". Two columns on `lg`: left: "Why it ranks here" (ranking reason), Evidence (quotes as blockquotes with source glyph), PRD section (Generate PRD / view / copy), linked feedback list; right: trend chart (frequency per run from snapshots, SVG), source mix bar, facts list (first seen, last seen, affected segment, filed). |
| `/runs` | P4 | `PageHeader` "Runs", action "Run now". List rows: status badge, trigger, started relative time, duration, fetched/new/issues summary as separate small figures, error text when failed. |
| `/runs/[id]` | P4 | Header with status and timing. Stage list (for running runs, polls every 2 s). Per-source results table. Diff sections: New, Getting worse, Improving, Resolved, each a list of issue rows linking to `/issues/[id]`. |
| `/app` | P4 | Public. `AppHeader`. Container `max-w-[960px]`. Before results: left-aligned `h1` "Find out what is bothering your users most", one sentence, the input panel (Tabs "Paste text" / "Fetch from a link", textarea, demo dataset buttons, "Analyze complaints" primary button with a count "24 complaints ready"). During analysis: stage list skeleton. Results: summary `StatGroup`, filter row, ranked issue rows (expand for evidence, PRD, send-to), resolved-since-last-run list, chat panel, "Add more complaints", and the "Watch this every day" Callout (brand tone) with "Start free". Header actions when results exist: Share, Copy Markdown, Download, Start over (secondary/ghost buttons). Rate-limit 429 shows Callout with "Start free". |
| `/billing` | P5 | `AppFrame`; `PageHeader` "Billing". Current plan panel (PlanBadge, price, renewal or end date, Cancel link), Usage panel (UsageMeter for each metered limit plus products and seats), plan chooser (interval + currency controls, Pro and Team, "Upgrade to Pro" / "Switch to Team"), invoices note "Receipts are emailed by Razorpay." `?plan=&interval=` preselects and scrolls to the chooser. Owner/admin only actions; members see read-only. |
| `/extension` | P6 | `AppFrame`; `PageHeader` "Extension and widget". Tabs: "Chrome extension" (install steps as a numbered sequence for load-unpacked, token list rows with Revoke, "Create token" dialog showing the token once in `CopyField`), "Website widget" (product select, snippet `CopyField multiline mono`, settings form: button label, prompt, position, ask for email, accent colour, allowed origins; live preview frame; branding note on Free with PaywallGate inline). |
| `/widget-demo` | P6 | Public. A plain sample page ("Example product page") with explanatory copy and the real widget mounted with `data-key="demo"`; a note that demo submissions are not stored. |

Authenticated route-group layouts (`app/dashboard/layout.tsx`, `app/inbox/layout.tsx`, `app/issues/layout.tsx`, `app/runs/layout.tsx`, `app/settings/layout.tsx`, `app/billing/layout.tsx`, `app/extension/layout.tsx`) each export `dynamic = "force-dynamic"` and render `<AppFrame>{children}</AppFrame>`. Each page also has a `loading.tsx` with skeletons and an `error.tsx` with a Callout and "Try again".

When the platform is not configured (`isDbConfigured()` false), `requirePageContext` redirects to `/login`, and `/login` shows "Sign-in is not set up on this deployment yet. You can still use the free analyzer." with a link to `/app`.

## 10. UI copy and voice

- Plain, specific, second person, sentence case. Short sentences. No exclamation marks, no emoji, no "AI-powered", "magic", "supercharge", "unlock", "seamless", "revolutionize".
- Name things the way users think: "sources", "feedback", "issues", "runs", "the Monday list", "alerts", "Monday email". Not "ingestion", "clusters", "pipeline", "webhook config" (except in Settings where the field is literally a Slack webhook URL).
- Buttons are verbs and keep their name through the flow: "Run now" -> toast "Run started" -> "Run finished: 3 new issues". "Connect Slack" -> "Slack connected". "Create token" -> "Token created. Copy it now; you will not see it again."
- Errors say what happened and what to do, never apologise: "Reddit blocked this request. Try again later or paste the thread text into the inbox." "That Slack URL did not accept our test message. Check the webhook is still active in Slack."
- Empty states invite action: "No feedback yet. Add a source, install the widget, or paste feedback to get started."
- Numbers are concrete: "12 complaints mention checkout failing" not "many users".
- Plan gates are factual: "Slack alerts are on Pro and Team." with "Upgrade" (no guilt, no countdowns).
- Dates: relative for under 7 days ("3 h ago"), otherwise "12 Oct". Times in UTC are labelled "UTC".
- Email and Slack copy follow the same rules. Email subject lines from PRODUCT_SPEC section 6.

## 11. Merge checklist (every package, before reporting done)

1. `npx tsc --noEmit` passes for your files, apart from imports of not-yet-landed contract files.
2. `npx vitest run <your test dirs>` passes.
3. No file outside your ownership was edited.
4. No `@tsparticles`, `sparkles`, `SmokeBackground`, `AnimatedUnderline` imports remain in your files.
5. No hard-coded hex colours in components except inside `components/brand/logos.tsx`, `public/widget.js`, `extension/**` and email HTML (which cannot use CSS variables; they use the light token hex values from section 8.2).
6. Every page you own has loading, empty and error states and works at 375 px.
7. Every new env var you rely on is in section 3.
