# BuildMonday product spec

Status: binding for the "redesign-autopilot" build. The companion file `docs/BUILD_CONTRACTS.md` holds the technical contract (schema, exports, routes, env, design tokens, ownership). Where the two disagree on a technical detail, BUILD_CONTRACTS wins.

---

## 1. Positioning

**One line:** BuildMonday is always-on customer-feedback intelligence for small product teams. It listens to your app reviews, Reddit, Hacker News, Trustpilot, your website and anything you clip from the browser, every day, and turns it into a ranked list of what engineering should fix next.

**Hero promise (marketing copy, use verbatim):**

- Headline: "Know what to build on Monday."
- Subhead: "BuildMonday reads your app reviews, Reddit threads, Hacker News comments and website feedback every day, groups them into ranked engineering issues, and sends your team the list every Monday morning."
- Primary CTA: "Start free"
- Secondary CTA: "Try it without an account" (goes to `/app`)

**What it is not:** a survey tool, a support desk, a social-listening suite for marketing teams, or a roadmap voting board. It does one job: turn scattered complaints into a prioritised engineering list, keep that list current, and push it to where the team works.

**Why now / why us:** small teams already have the signal (reviews, threads, widget messages) but nobody has time to read it weekly. Enterprise tools (Productboard, Dovetail, Enterpret, Unwrap) start at hundreds of dollars a month and assume a research team. BuildMonday is priced for a five-person team, sets up in under five minutes, and works without integrating a support desk.

## 2. Ideal customer

Primary: **product teams of 1 to 25 people** shipping a consumer app or SaaS product that has public feedback surfaces.

| Persona | Situation | What they want from BuildMonday |
| --- | --- | --- |
| Indie founder / solo maker | Ships an iOS/Android app or SaaS; reads reviews when they remember to | A Monday email that says what broke and what people want, without reading 200 reviews |
| Founding PM at a seed or Series A startup | Owns prioritisation; feedback is spread across stores, Reddit and the website | Ranked issues with evidence they can paste into planning, and auto-filed Linear tickets |
| Engineering lead | Gets "users are complaining" with no data | Frequency, severity and trend per issue, filed into GitHub Issues with quotes |
| Growth / support lead at a small consumer app | Watches ratings drop after a release | An alert the same day a new serious issue appears |

Secondary market detail: the owner is in India and many early customers will be Indian startups, so pricing exists in INR and USD (Razorpay handles both).

Bad fit (do not design for): enterprises needing SSO/SAML, teams whose feedback lives only inside Zendesk/Intercom (until a support-desk integration exists), market researchers.

## 3. The problem

1. Feedback is scattered: App Store, Play Store, Reddit, Hacker News, Trustpilot, the website, support conversations, tweets.
2. Reading it is manual and irregular, so it happens after a crisis, not before.
3. Raw complaints are not decisions. Teams need grouping (which of these are the same problem), frequency, severity, churn risk, effort, and a reason for the ranking.
4. Nobody remembers last week. Without run-over-run comparison you cannot tell what is new, what is getting worse and what your fix actually resolved.
5. Insight dies in a doc. It has to land in Slack, email and the issue tracker or it does not change the sprint.

The current BuildMonday solves 3 well and 4 partially (localStorage only), and leaves 1, 2 and 5 to the user with copy and paste. This build automates 1, 2, 4 and 5.

## 4. Product surfaces

| Surface | Path | Auth | Purpose |
| --- | --- | --- | --- |
| Marketing site | `/`, `/pricing`, `/terms`, `/privacy` | public | Explain, convert |
| Free analyzer ("try it") | `/app` | none, localStorage only | Paste or fetch a URL, get ranked issues. Must keep working without login or database |
| Login | `/login` | public | GitHub, Google, email magic link |
| Onboarding wizard | `/onboarding` | session | Five questions, then the first run starts |
| Dashboard | `/dashboard` | session | This week's list, stats, source health, recent runs, competitor gaps |
| Inbox | `/inbox` | session | Every piece of feedback, triage, bulk actions, manual add |
| Issues | `/issues`, `/issues/[id]` | session | Persisted issues with trend history, evidence, PRD, file to tracker |
| Runs | `/runs`, `/runs/[id]` | session | Monitor run log with per-source results and the diff |
| Settings | `/settings/**` | session | Product, sources, alerts, integrations, team, account |
| Billing | `/billing` | session | Plan, usage, Razorpay checkout, cancel |
| Extension & widget | `/extension` | session | Extension tokens, widget snippet |
| Widget demo | `/widget-demo` | public | Shows the embeddable widget on a sample page |
| Chrome extension | `extension/` folder | extension token | Clip selections and review pages into the inbox |
| Website widget | `public/widget.js` | product public key | One script tag; visitors send feedback into the inbox |
| Emails | Resend | n/a | Magic link, alerts, Monday digest, team invites |
| Slack | incoming webhook | n/a | Alerts and a digest summary |

## 5. Onboarding (exact copy)

The wizard lives at `/onboarding`. It is a single page with five steps, a left-aligned step list on desktop (vertical, showing step titles with a check when done) and a top progress bar on mobile. Every step has "Back" and a primary button. Steps 2 to 5 have "Skip for now". Answers are kept in client state and submitted once at the end (`POST /api/onboarding`), except "Test" calls which hit `/api/sources/test`.

If the URL has `?source=<url>` (sent from the `/app` "Watch this source every day" CTA), step 2 is pre-filled by running `detectSourceFromUrl` on it.

### Step 1: "What are you building?"

Intro: "We use this to name your workspace and to give the analysis context."

| Field | Label | Placeholder | Help text | Validation |
| --- | --- | --- | --- | --- |
| `product.name` | Product name | Acme Notes | | required, 1 to 60 chars |
| `product.websiteUrl` | Website | https://acme.com | Optional. We use it to suggest a Trustpilot page. | optional valid http(s) URL |
| `product.description` | What does it do, in one sentence? | A note-taking app for students that syncs across devices. | Helps BuildMonday tell product complaints apart from noise. | optional, max 280 chars |

Primary button: "Continue".

### Step 2: "Where do your customers talk about you?"

Intro: "Add the places you want BuildMonday to check every day. Paste a link or an ID. You can add more later."

| Field | Label | Placeholder | Help text |
| --- | --- | --- | --- |
| App Store | App Store app | apps.apple.com/us/app/acme/id123456789 or 123456789 | "We read 1 to 3 star reviews. Pick the country store your users are in." + country select (default from link, else "us") |
| Google Play | Google Play app | play.google.com/store/apps/details?id=com.acme.notes or com.acme.notes | "We read recent low-star reviews." |
| Reddit | Subreddits | r/acme, r/productivity | "Comma separated. We read new posts that mention your keywords." |
| Keywords | Words people use when they mention you | acme notes, acmenotes | "Used for Reddit and Hacker News search. Your product name is included automatically." |
| Hacker News | Search Hacker News | (checkbox, default on when keywords exist) "Watch Hacker News for these keywords" | |
| Trustpilot | Trustpilot page | trustpilot.com/review/acme.com or acme.com | |

Each source row has a "Test" button (secondary, small). Result states, inline under the row:
- Loading: "Checking…" with spinner.
- Success: "Found 24 recent items. Example: "<first 120 chars of the first sample>"" in success tone.
- Failure: the error message from the API, in danger tone, plus "You can still save it; we will retry on every run."

Primary button: "Continue". If zero sources are added, the button reads "Continue without sources" and step 5 explains the widget and extension.

Plan limit note (Free): shown under the list when more than 3 sources are filled: "The free plan watches 3 sources. Extra sources are saved but paused until you upgrade."

### Step 3: "Who do you compete with?"

Intro: "Optional. We watch competitors' reviews and show you the complaints you could win on."

Repeating group (max 3 in the wizard), "Add competitor":
- Competitor name (placeholder "Notion")
- Their App Store app, Google Play app or Trustpilot page (one input, auto-detected by `detectSourceFromUrl`)

On the Free plan, this step shows the inputs disabled with a `PaywallGate` inline message: "Competitor tracking is on Pro and Team. You can skip this and add competitors later." Primary button: "Continue".

### Step 4: "How does your team work?"

| Field | Label | Options |
| --- | --- | --- |
| `team.role` | Your role | Founder, Product manager, Engineer, Designer, Support or success, Other |
| `team.size` | Team size | Just me, 2 to 5, 6 to 20, 21 to 50, More than 50 |
| `team.tracker` | Where do you track engineering work? | Linear, GitHub Issues, Jira, Something else |
| `team.usesSlack` | Does your team use Slack? | Yes / No (segmented control) |

Help text under tracker: "We can file issues there for you once they cross a priority you choose. You will connect it in Settings." For Jira: "We do not file to Jira yet. You will still get the Monday email and can copy issues as Markdown."

### Step 5: "When should we tell you?"

| Field | Label | Default | Copy |
| --- | --- | --- | --- |
| `notifications.digest` | Monday digest | on | "Every Monday at 9:00 in your time zone: the ranked list, what is new, what got worse, what you fixed." |
| `notifications.alerts` | Alerts | "serious" | Radio: "Only new serious issues" (serious), "Every new or worsening issue" (all), "No alerts" (off) |
| `notifications.timezone` | Time zone | browser `Intl.DateTimeFormat().resolvedOptions().timeZone` | select of IANA zones |

Below, a quiet panel: "Also collect feedback directly. Add a feedback button to your website with one script tag, or clip reviews from any page with the Chrome extension. Both are in Settings after setup."

Primary button: "Start monitoring". On submit: `POST /api/onboarding`, then redirect to `/dashboard?first=1`, which shows the first run in progress (it calls `POST /api/runs` once and polls). Error state: inline danger callout above the button with the API message; nothing is lost.

## 6. Automation flows (end to end)

### 6.1 Sign up

1. Visitor clicks "Start free" (marketing) or "Watch this source every day" (`/app` results) and lands on `/login` (with `next`).
2. `/login` offers "Continue with GitHub", "Continue with Google" and "Email me a sign-in link". Providers whose env vars are missing are hidden. If no provider is configured at all, the page says "Sign-in is not set up on this deployment yet." with a link to `/app`.
3. Auth.js creates the user; the `createUser` event creates a personal workspace ("<first name>'s workspace", plan free) and an owner membership, and sets `users.activeWorkspaceId`.
4. Users without `onboardedAt` are redirected to `/onboarding` by `requirePageContext`.

### 6.2 Onboarding to first list

1. Wizard (section 5) posts everything once.
2. The API creates the product (with a widget public key), validated sources (role own or competitor), stores the answers in `workspaces.onboardingAnswers`, sets the workspace timezone, sets member notification prefs and `users.onboardedAt`, and sets the `bm_product` cookie.
3. `/dashboard?first=1` calls `POST /api/runs` (trigger `onboarding`, does not count toward the manual run quota) and polls `GET /api/runs/[id]` every 2 seconds, showing the stage list: "Fetching sources", "Saving new feedback", "Grouping into issues", "Comparing with last run", "Sending alerts". On success the list renders in place.

### 6.3 Scheduled monitor run

Trigger: Vercel cron calls `GET /api/cron/monitor` daily at 05:00 UTC (Hobby-safe). The endpoint processes every product whose `nextRunAt <= now()` and `monitoringEnabled` is true and whose workspace plan allows monitoring. It works through products one at a time within a 240-second budget; if products remain, it fires one follow-up request to itself (same secret) and returns. Users can also press "Run now" (manual quota) at any time.

Per product (`runProduct`):
1. **Create run** row: status `running`, stage `fetching`.
2. **Fetch** every enabled source within the plan's source limit (oldest `createdAt` first; sources beyond the limit are skipped and reported as `paused_by_plan`). Each adapter returns raw items with an `externalId` when the platform has one. Per-source errors are recorded on the source (`lastError`) and in run stats; one failing source never fails the run.
3. **Dedupe and store** (stage `storing`) through `ingestFeedback` with channel `source`. Dedupe key = sha256 of `productId + sourceKind + (externalId or normalised text)`; unique index `(productId, dedupeKey)` makes inserts idempotent. Monthly feedback quota is enforced here; when exhausted, the run continues on stored feedback and the run is flagged `quotaReached`.
4. **Skip check:** if no feedback was inserted since the previous successful run (from any channel) and that run exists, the run ends as `skipped` with reason "No new feedback since last run". Next run is still scheduled.
5. **Cluster** (stage `clustering`): take the analysis window, the product's `own` feedback not marked archived or spam with `coalesce(postedAt, ingestedAt)` in the last 30 days, newest first, capped at 400 items. Run the two Gemini passes (tag, then cluster). Pass 2 now also returns `member_indices` so every cluster knows which feedback rows belong to it. The product name and description are given to both prompts as context. Competitor feedback (role `competitor`) is clustered in a separate pass per run (cap 200 items) and produces issues with scope `competitor`.
6. **Diff and persist** (stage `diffing`): embed each new cluster signature (title + first three evidence quotes) and compare against the product's stored issues (same scope, status not `ignored`, last seen within 60 days) by cosine similarity, one-to-one greedy match, threshold 0.72.
   - Matched: update the stored issue's fields, frequency and embedding; trend becomes `worsened` if frequency rose by at least max(2, 25% of the previous frequency), `improved` if it fell by at least that much, else `persistent`.
   - Unmatched cluster: create a new issue (status `backlog`, trend `new`).
   - Stored issue seen in the previous run but not matched now: trend `resolved`, `resolvedAt = now`.
   - Write one `issue_snapshots` row per issue in this run (frequency, priority, rank, trend), link the member feedback rows (`feedback.issueId`) and mark them `triaged`.
7. **Alerts** (stage `alerting`), per section 6.6.
8. **Auto-file**, per section 6.7.
9. **Finish:** status `succeeded`, stats saved, `products.lastRunAt = now`, `products.nextRunAt` = now + `plan.runIntervalHours` for paid plans; for Free it is the next Sunday 05:00 UTC, so the Monday digest always has a fresh run behind it (the digest cron runs Monday 03:30 UTC, before the daily monitor cron).
10. Any thrown error: status `failed`, `error` message saved, `nextRunAt` still advanced (so a broken product does not block the queue), and an alert-free failure is shown on the dashboard.

### 6.4 Website widget

1. Owner copies the snippet from `/extension` (Widget tab): `<script src="https://<app>/widget.js" data-key="pk_..." async></script>`.
2. The script adds a small "Feedback" button (position configurable). Clicking opens a panel in a shadow root: a textarea ("What could be better?" by default), optional email field, "Send feedback" button. Keyboard accessible, Escape closes, focus is trapped while open and restored on close.
3. Submit posts to `POST /api/ingest`. The server validates the key, checks the origin allow-list if the owner set one, rate-limits by IP and key, rejects honeypot submissions, flags link spam, enforces size limits, then calls `ingestFeedback` with channel `widget`.
4. Success shows "Thanks. Your feedback went straight to the team." Failure shows "That did not send. Check your connection and try again."
5. If the workspace is over its monthly feedback quota, the end user still sees success (the server answers `202 {ok:true, stored:false}`), and the owner sees a quota banner in the inbox.
6. Free plan widgets show "Feedback by BuildMonday" in the panel footer; Pro and Team remove it (`widget_unbranded`).
7. Widget feedback is clustered on the next run. If alerts are set to "all", nothing extra happens immediately; clustering happens on runs only.

### 6.5 Chrome extension

1. User creates a token at `/extension` ("Create token", shown once), opens the extension options page, pastes the server URL (default the production URL) and the token, and clicks "Connect". The options page calls `GET /api/extension/me` and shows "Connected as <email> to <workspace>".
2. Clipping a selection: select text on any page, right-click, "Clip to BuildMonday". The service worker sends `{text, url, title}` to `POST /api/extension/clip` for the default product chosen in the popup. A notification (or badge) confirms "Clipped to <product>".
3. Capturing a review page: on Play Store, App Store, Reddit, Hacker News, Trustpilot, G2, Product Hunt and X pages, the popup shows "Capture N reviews on this page". A content script extracts visible reviews (text, author, rating, date, permalink where available) and sends them as one batch (max 100).
4. Unsupported page with no selection: the popup says "Select some text on the page, or open a review page on one of the supported sites."
5. The extension never stores the token anywhere except `chrome.storage.local`.

### 6.6 Alerts

Evaluated at the end of every run, per product.

Alert-worthy events:
- `new_issue`: a new issue with `priorityScore >= products.alertThreshold` (default 70) or `recommendedAction = fix_now`.
- `worsened`: an issue whose trend is `worsened` and whose priority is at or above the threshold.
- In "all" mode (member preference `alerts = all`), any new or worsened issue regardless of threshold.

Delivery:
- **Email** (Pro and Team: `instant_email_alerts`) to members whose `alertMode` is not `off` (`serious` members get only threshold-crossing issues, `all` members get every new or worsened issue). One email per run listing all alert-worthy issues. Subject: "New issue in <Product>: <top issue title>" or, for several, "<N> issues need attention in <Product>".
- **Slack** (Pro and Team: `slack_alerts`) via the workspace's incoming webhook: one message per run with a header line, up to five issues (title, trend, frequency, priority, first evidence quote), and a "View in BuildMonday" link.
- Dedupe: unique `(issueId, kind, runId)` in `alerts`; the same issue does not alert as `new_issue` twice; a `worsened` alert for an issue is suppressed if one was sent in the previous 72 hours.
- Free plan: no instant alerts. The Monday digest still covers everything.

### 6.7 Auto-file to Linear or GitHub

- Setup in `/settings/integrations`: Linear (personal API key, team picker, optional label) or GitHub (fine-grained token with Issues read/write, `owner/repo`, optional labels). Secrets are encrypted at rest (AES-256-GCM).
- Product setting in `/settings/alerts`: "File issues automatically" switch, target (Linear or GitHub), threshold slider (50 to 100, default 80).
- During a run, every issue in scope `own` with `priorityScore >= autofileThreshold`, status not `ignored`/`shipped`, and no `externalId` is filed once. The body is the existing `buildIssueMarkdown` output plus a link back to the issue page. `externalTarget`, `externalId`, `externalUrl`, `filedAt` are saved and an `autofiled` alert row is written (Slack message includes the link).
- Manual filing from the issue page ("File to Linear" / "File to GitHub") uses the same code path.
- Plan gate: `auto_file` (Pro and Team).

### 6.8 Monday digest

- Cron `GET /api/cron/digest` runs once on Mondays at 03:30 UTC (09:00 IST); Vercel Hobby allows at most daily crons, so there is no per-timezone send in this build. It sends to every workspace that has at least one product with a successful run in the last 14 days and has not received a digest for this ISO week (`digest_sends` unique `(workspaceId, weekKey)`). The digest copy says "Monday" in all zones; members' timezone is stored for a future per-zone send.
- Recipients: members with `notifyDigest = true`.
- Content per product: subject "Your Monday list for <Product>: <N> new, <M> worse"; sections "Top issues this week" (up to 5, with trend, frequency, priority, one quote), "New since last week", "Getting worse", "Resolved" (issues resolved in the last 7 days, celebrating `shipped` ones), "Feedback this week" (count by source), and a "Open your list" button. Plain-text alternative included.
- Slack (Pro and Team): a short version to the webhook if Slack is connected.
- Free plan gets the digest.

### 6.9 Free analyzer (`/app`), unchanged behaviour

- Paste text, fetch a URL, or load a demo dataset; results, PRD, chat, share link, Markdown export and send-to links keep working with localStorage only.
- Anonymous API use is rate-limited per IP (see contracts). When limited, the UI says "You have used today's free analyses. Create a free account to keep going." with "Start free".
- After results, a quiet panel offers "Watch this every day": "Sign up free and BuildMonday will re-check this source every week, keep the history and email you the list." If the input came from a URL, the CTA carries it: `/login?next=/onboarding?source=<encoded url>`.

## 7. Feature list mapped to packages

| Feature | Package |
| --- | --- |
| Design tokens, fonts, Tailwind config, UI primitives, logo, app shell, theme toggle, `/app` header | F1 |
| Auth.js (GitHub, Google, magic link), session helpers, middleware, workspaces, DB client and schema, migrations, plan catalog, entitlement checks, usage counters, rate limiter, mailer, encryption, API tokens, Razorpay client and subscription sync, env validation, vitest config, cron config | F2 |
| Landing page, pricing page (INR/USD and monthly/yearly toggles, comparison table, FAQ), terms, privacy | P1 |
| Login page, onboarding wizard, invite acceptance, settings (product, sources, alerts, integrations, team, account), product/source/integration APIs, source test preview | P2 |
| Source adapters (App Store, Play Store, Reddit, HN, Trustpilot), URL detection, `/api/fetch-reviews`, `/api/analyze`, `/api/chat`, `/api/prd`, monitor engine, diffing, alerts (email + Slack), auto-file, Monday digest, shared ingest, widget ingest API, runs/issues/feedback APIs, Gemini prompt changes | P3 |
| `/app` analyzer redesign, dashboard, inbox, issues list and detail, runs list and detail, all existing feature components restyled, localStorage/share/markdown/demo libs | P4 |
| Billing page, checkout, verify, cancel, status API, Razorpay webhook, `UpgradeDialog`, `PlanBadge`, `UsageMeter`, `PaywallGate` | P5 |
| Chrome extension (MV3), `public/widget.js`, extension API (me, clip, tokens), `/extension` page, `/widget-demo` | P6 |

## 8. Pricing

Billing through Razorpay Subscriptions. INR shown to visitors whose `x-vercel-ip-country` is `IN`, USD to everyone else; the pricing page has a manual currency toggle. Yearly is ten times the monthly price (two months free).

| | Free | Pro | Team |
| --- | --- | --- | --- |
| For | Trying it on one product | A founder or PM who wants it running daily | A product team that wants it in their tools |
| Monthly, INR | ₹0 | ₹1,499 / month | ₹4,999 / month |
| Monthly, USD | $0 | $19 / month | $59 / month |
| Yearly, INR | ₹0 | ₹14,990 / year | ₹49,990 / year |
| Yearly, USD | $0 | $190 / year | $590 / year |

Pricing-page taglines (verbatim):
- Free: "Watch one product, get the Monday email."
- Pro: "Daily monitoring, instant alerts and auto-filed issues."
- Team: "More products, more sources, your whole team on the list."

Pro is the highlighted plan ("Most teams start here" label is not used; the highlight is visual only: a brand-coloured top border and the primary button).

### 8.1 Plan limits (source of truth for `lib/plans.ts`)

`-1` means unlimited.

| Limit key | Free | Pro | Team |
| --- | --- | --- | --- |
| `products` | 1 | 3 | 10 |
| `sources_per_product` | 3 | 10 | 25 |
| `competitors` (distinct competitor names per product) | 0 | 2 | 10 |
| `feedback_items_per_month` | 500 | 5,000 | 25,000 |
| `manual_runs_per_month` | 4 | 60 | 300 |
| `prds_per_month` (persisted issues) | 3 | -1 | -1 |
| `chat_messages_per_month` (signed-in, product chat) | 20 | -1 | -1 |
| `extension_clips_per_month` (items) | 100 | -1 | -1 |
| `seats` | 1 | 2 | 10 |
| `history_days` | 30 | 365 | 730 |

| Run cadence (`runIntervalHours`) | 168 (weekly, runs Sunday 05:00 UTC) | 24 (daily) | 24 (daily) |

### 8.2 Feature keys

| Feature key | Free | Pro | Team | Gate location |
| --- | --- | --- | --- | --- |
| `daily_runs` | no | yes | yes | scheduler sets `nextRunAt` from plan cadence |
| `instant_email_alerts` | no | yes | yes | lib/alerts |
| `slack_alerts` | no | yes | yes | Slack integration save, alert send, digest Slack |
| `auto_file` | no | yes | yes | Linear/GitHub integration save, auto-file, manual file route |
| `competitor_tracking` | no | yes | yes | competitor source create, onboarding step 3 |
| `export` | no | yes | yes | `GET /api/issues/export` |
| `widget_unbranded` | no | yes | yes | `/api/ingest/config` `showBranding` |
| `team_members` | no | no | yes | admin role assignment in `/settings/team` |
| `priority_support` | no | no | yes | shown on pricing only |

Clarification for `team_members`: inviting is allowed on any plan while `seats` has room (Pro: one invite). The `team_members` feature gates assigning the `admin` role and the "Team" section's role controls.

### 8.3 Gating behaviour

- Server is the source of truth. Every gated API returns `402` with `{ error, code: "plan_required", feature, requiredPlan }` or `{ error, code: "limit_reached", limit, used, max, requiredPlan }`.
- UI pre-empts with `PaywallGate` and opens `UpgradeDialog` on a 402.
- Downgrade or lapse: data is kept; products beyond the limit get `monitoringEnabled = false`, sources beyond the limit are skipped by the monitor, integrations stay saved but unused. Nothing is deleted.
- Grace period: a `past_due` subscription keeps paid features for 3 days after `currentPeriodEnd`.

## 9. Success metrics

Instrument with server-side counts (no third-party analytics in this build). Targets are goals, not claims, and never appear on marketing pages.

| Metric | Definition | Target (first 90 days) |
| --- | --- | --- |
| Try-to-signup | `/app` analyses followed by a signup from the same browser within 7 days | 8% |
| Activation | New workspaces with a succeeded first run within 24 hours of signup | 60% |
| Time to first list | Signup to first succeeded run, median | under 5 minutes |
| Weekly active workspaces | Workspaces with a dashboard, inbox or issue view in the week | 40% of activated |
| Digest engagement | Workspaces that click through a digest at least twice in 4 weeks | 30% |
| Free to paid | Paid workspaces / activated workspaces at day 30 | 4% |
| Paid retention | Paid workspaces still active after 3 months | 80% |
| Automation depth | Paid workspaces with Slack or auto-file connected | 50% |
| Run reliability | Succeeded runs / scheduled runs | 97% |
| Source health | Source fetches without error | 90% (Reddit excluded) |

## 10. Non-goals for this build

Jira filing, Zendesk/Intercom ingestion, SSO, per-timezone digest scheduling, public API, mobile apps, multi-language analysis tuning, Chrome Web Store submission (load-unpacked only), data import from the old localStorage history.
