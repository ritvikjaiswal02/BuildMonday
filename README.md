# BuildMonday

**Always-on customer-feedback intelligence for small product teams.**

BuildMonday watches the places your customers complain (App Store, Google Play, Reddit, Hacker News, Trustpilot, your own website and anything you clip in the browser), groups the feedback into ranked engineering issues, and tells you every Monday what changed: what is new, what is getting worse and what went away. Serious issues reach email and Slack the day they appear, and issues above your threshold are filed to Linear or GitHub without anyone copying anything.

You sign up, answer three short questions, and it runs on its own. The original paste-and-analyze tool still works without an account at `/app`.

## How it works

1. **Sign up** with GitHub, Google or an email link. Every new workspace gets **14 days of Pro, no card**.
2. **Set up in three steps** (Free) or four (Pro and Team, which add competitors):
   - **Your product:** name, website and one sentence about it.
   - **Sources:** BuildMonday looks your app up in the App Store and offers it as a one-click suggestion, suggests `r/<your product>`, fills the search keywords with your product name, and suggests your Trustpilot page from the website. Every field is optional and has a Test button.
   - **Competitors** (Pro and Team): their App Store, Google Play or Trustpilot pages.
   - **Notify me:** the Monday email, instant alerts, your time zone, and the tools your team uses. Slack, Linear and GitHub connect right there, with one click when the one-click apps are configured, or by pasting a webhook, key or token. "Auto-file issues above 80" is one switch.
3. **The first run starts by itself** as soon as there is something to read (a source, or the feedback you analyzed on `/app` before signing up, which comes with you).
4. **BuildMonday runs on a schedule** (weekly on Free, daily on Pro and Team):
   - fetches new feedback from every enabled source into the inbox (the same review is never stored twice);
   - tags and clusters it with Gemini into ranked issues, each with evidence, effort, churn risk and a one-line reason for its rank;
   - matches the issues to the previous run with embeddings and marks them new, worsening, improving or resolved;
   - sends alerts for issues above your threshold, and auto-files them to Linear or GitHub when that is on.
5. **Every Monday** each member gets the digest email (and Slack, on paid plans).

Between runs, feedback that arrives from the widget, the extension or a paste is **matched to existing issues on arrival** (embedding similarity of 0.72 or more), so the inbox shows "Matches: <issue>" immediately and the dashboard shows how many new reports are waiting. After a paste or capture of 10 or more new items, "Group now" starts a run straight away.

After setup, the dashboard's **Finish setting up** list walks through what makes it run on its own: a source, Slack alerts, auto-filing, the website widget, the Chrome extension and a teammate.

### Where feedback comes from

- **Monitored sources:** App Store, Google Play, subreddits (filtered by your keywords), Hacker News searches and Trustpilot.
- **The website widget:** one script tag with a per-product public key, isolated in a shadow DOM, works on any site.
  ```html
  <script src="https://<your-app>/widget.js" data-key="pk_..." async></script>
  ```
  Limit it to your own sites under **Extension and widget**. Widget messages have their own daily allowance (about 40% of the monthly quota spread over 30 days), so a flood through a copied key can never use up the quota your sources need, and link spam is stored without using quota. A live example runs at `/widget-demo` (key `demo`, nothing is stored).
- **The Chrome extension** (Manifest V3, no build step): clip selected text from any page (support inboxes, email, docs), or capture a page of reviews on Google Play, the App Store, Reddit, Hacker News, Trustpilot, G2, Product Hunt and X. See [Chrome extension](#chrome-extension).
- **Manual import:** paste one item, or up to 500 lines, in the inbox.

## Plans

| | Free | Pro | Team |
| --- | --- | --- | --- |
| Price per month | 0 | ₹1,499 or $19 | ₹4,999 or $59 |
| Products | 1 | 3 | 10 |
| Sources per product | 3 | 10 | 25 |
| Feedback items per month | 500 | 5,000 | 25,000 |
| Checks | Weekly (Sunday 05:00 UTC) | Daily (05:00 UTC) | Daily (05:00 UTC) |
| Alerts | Monday email | Email and Slack, same day | Email and Slack, same day |
| Auto-file to Linear or GitHub | No | Yes | Yes |
| Competitors per product | 0 | 2 | 10 |
| Seats | 1 | 2 | 10 |
| History | 30 days | 1 year | 2 years |
| Support | Email | Email | Email, reply within one business day |

- **Reverse trial:** a new workspace is on Pro for 14 days with no card (`workspaces.trialEndsAt`). The sidebar shows "Pro trial, N days left", an email goes to owners and admins two days before the end, and when it ends unpaid the workspace moves to Free under the normal downgrade rules: products beyond the limit stop monitoring, auto-filing turns off, runs move to the weekly slot. Nothing is deleted.
- **Yearly** billing costs ten times the monthly price. Prices show in INR or USD by the visitor's country; a manual choice is remembered in the `bm-currency` cookie so `/` and `/pricing` render it on the server.
- A visitor who picks a paid plan on `/pricing` before having an account signs up, sets up their product, and lands on the dashboard with a "Finish upgrading to Pro" prompt that opens checkout preselected.
- The catalog lives in [`lib/plans.ts`](lib/plans.ts); limits are enforced on the server in [`lib/billing/entitlements.ts`](lib/billing/entitlements.ts). Count limits (products, sources, competitors, seats) are checked and written under a per-workspace advisory lock, so double submits cannot exceed them. The free tools at `/app` also count against a signed-in workspace's chat and PRD allowances.

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 14 (App Router), React 18, TypeScript |
| Styling | Tailwind CSS with design tokens in `app/globals.css`, Radix primitives, lucide icons |
| Auth | Auth.js (next-auth v5): GitHub, Google, and an email magic link through Resend |
| Database | Postgres with Drizzle ORM (`lib/db/schema.ts`, migrations in `drizzle/`) |
| AI | Google Gemini for tagging, clustering, PRDs and chat; Gemini embeddings for run-over-run matching and matching on arrival |
| Email | Resend |
| Billing | Razorpay Subscriptions |
| Scheduling | Vercel cron (`vercel.json`), fanning out to one function invocation per product |
| Tests | Vitest with jsdom and Testing Library |

## Getting started

Prerequisites: Node.js 18.17 or newer, a Postgres database (Neon, Supabase or Vercel Postgres all work), and a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).

```bash
git clone https://github.com/ritvikjaiswal02/BuildMonday.git
cd BuildMonday
npm install
cp .env.example .env.local
```

Fill in `.env.local`, then:

```bash
npx auth secret                 # writes AUTH_SECRET
openssl rand -base64 32         # paste as ENCRYPTION_KEY
openssl rand -hex 32            # paste as CRON_SECRET
npm run db:migrate              # applies drizzle/0000_init.sql and 0001_trial_and_oauth.sql
npm run dev
```

Every variable is optional for `npm run build`. A missing variable switches its feature off instead of crashing, so the anonymous analyzer at `/app` runs with only `GEMINI_API_KEY`.

### Environment variables

Each one is documented in [`.env.example`](.env.example).

| Group | Variables | Notes |
| --- | --- | --- |
| Analysis | `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_EMBEDDING_MODEL` | Models default to `gemini-2.5-flash` and `gemini-embedding-001`. |
| Platform | `DATABASE_URL`, `AUTH_SECRET`, `AUTH_TRUST_HOST`, `AUTH_URL`, `NEXT_PUBLIC_APP_URL` | `NEXT_PUBLIC_APP_URL` is used for links in emails and Slack, the widget snippet, the cron fan-out, OAuth redirects and the extension download. Email sign-in links are always built on it, never on the request's Host header. Set `AUTH_URL` to the same value and `AUTH_TRUST_HOST=true` on Vercel. |
| Sign-in | `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Each sign-in button only shows when its variables are set. |
| Email | `RESEND_API_KEY`, `EMAIL_FROM` | Needed for the email sign-in link, alerts, invites, the trial reminder and the Monday digest. Without it, invites still work through a link you copy from Settings, Team. |
| Automation | `CRON_SECRET`, `ENCRYPTION_KEY`, `DIGEST_SCHEDULE` | Vercel cron sends `CRON_SECRET` as a bearer token. `ENCRYPTION_KEY` (32 bytes, base64) encrypts stored Slack, Linear and GitHub secrets with AES-256-GCM. See [Monday digest timing](#monday-digest-timing) for `DIGEST_SCHEDULE`. |
| One-click integrations | `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `LINEAR_CLIENT_ID`, `LINEAR_CLIENT_SECRET`, `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY` | Optional. Each turns on "Add to Slack", "Connect Linear" or "Install the GitHub App". Without them, the paste flows are used. |
| Extension | `EXTENSION_PUBLIC_KEY`, `NEXT_PUBLIC_EXTENSION_ID` | Optional. Fix the extension id so the Extension page can offer "Connect this browser". |
| Billing | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PLAN_{PRO,TEAM}_{MONTHLY,YEARLY}_{INR,USD}` | Without them `/billing` shows the plans read-only. |

### Sign-in providers

- GitHub OAuth app callback: `<NEXT_PUBLIC_APP_URL>/api/auth/callback/github`. BuildMonday asks for `read:user user:email` and only links a GitHub sign-in to an existing account when GitHub lists that email as **verified**.
- Google OAuth client callback: `<NEXT_PUBLIC_APP_URL>/api/auth/callback/google`.
- Provider access, refresh and id tokens are not stored; BuildMonday never calls GitHub or Google on your behalf after sign-in.
- The email link is limited to 10 requests per IP and 3 per address every 15 minutes, and the per-address limit is also enforced where the email is sent, so posting to `/api/auth/signin/resend` directly cannot skip it.

### Slack, Linear and GitHub

Every integration works with a pasted secret out of the box. To offer one-click connections, register these apps and set their variables:

| Integration | Register | Redirect / callback URL | Scopes |
| --- | --- | --- | --- |
| Slack ("Add to Slack") | A Slack app at api.slack.com/apps | `<APP_URL>/api/integrations/slack/oauth/callback` | `incoming-webhook` (Slack asks the user to pick a channel and returns a webhook for it) |
| Linear ("Connect Linear") | An OAuth application in Linear, Settings, API | `<APP_URL>/api/integrations/linear/oauth/callback` | `read`, `issues:create`; issues are created as the app (`actor=application`) |
| GitHub ("Install the GitHub App") | A GitHub App with Repository permissions: Issues read and write, Metadata read | Callback URL **and** Setup URL: `<APP_URL>/api/integrations/github/oauth/callback`; turn on "Request user authorization (OAuth) during installation" | The app mints a one-hour installation token per call; nothing long-lived is stored |

The connect flows are protected by a signed, ten-minute `state` bound to the user, the workspace and an httpOnly cookie. For the GitHub App, the user authorization code is used to confirm that the installation belongs to the person connecting it. After connecting, the Linear team and the GitHub repository can be changed in Settings, Integrations without reconnecting. Pasted secrets stay as the "Advanced" option.

Issues filed to trackers carry the evidence quotes as plain text: line breaks, `@mentions`, links, images and HTML in review text are neutralised, so a review cannot ping people in your GitHub or inject markdown. Filing claims the issue first, so a double click or a manual file during an auto-file run never creates two tickets.

### Razorpay

1. Create eight plans in the Razorpay dashboard (Pro and Team, monthly and yearly, INR and USD) and put their ids in the `RAZORPAY_PLAN_*` variables.
2. Add a webhook pointing at `<NEXT_PUBLIC_APP_URL>/api/webhooks/razorpay`, with `RAZORPAY_WEBHOOK_SECRET` as its secret, for these events: `subscription.authenticated`, `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`, `subscription.updated` and `payment.failed`.

When a customer switches plans, the new subscription takes over the workspace and every other live subscription is cancelled immediately, from both the Checkout verify call and the webhook (so it also happens when the customer closes the tab). The unused part of the old period is refunded to the last payment, once per subscription (recorded in `billing_events` as `credit_<subscription id>`). If a cancel fails, the webhook answers 500 and Razorpay retries it.

### Scheduled jobs

`vercel.json` registers two crons. Both reject requests without `Authorization: Bearer <CRON_SECRET>`.

| Path | Schedule (UTC) | What it does |
| --- | --- | --- |
| `/api/cron/monitor` | Daily at 05:00 | Claims up to 10 due products (with a 15-minute lease) and hands each to its own invocation of `/api/cron/monitor/run`, which has 300 seconds for that one product. A product whose hand-off fails is released. While products remain due it calls itself again (up to 20 hops, about 200 products a day). The first hop also starts `/api/cron/maintenance`. |
| `/api/cron/digest` | Mondays at 03:30 | Sends the weekly digest email (and Slack on paid plans), once per workspace per week, within a 240-second budget, and calls itself again while workspaces are left. |

`/api/cron/maintenance` runs daily through the monitor cron (you can also schedule it on its own): it sends the trial reminder, applies the downgrade when a trial ends unpaid, and deletes feedback, runs and issues older than the plan's history window. Admins can also delete feedback by hand from the inbox.

Daily runs are aligned to the 05:00 UTC cron slot: a run that finishes at 05:03 is due again at the next day's 05:00 tick, never 48 hours later.

#### Monday digest timing

- `DIGEST_SCHEDULE` unset or `weekly` (default): everyone gets the digest at the Monday 03:30 UTC cron (9:00 in India). This works on Vercel Hobby, which only allows daily-or-slower crons. The app says so in onboarding.
- `DIGEST_SCHEDULE=local`: each workspace gets it at 9:00 on Monday in its own time zone. Call `/api/cron/digest` every hour on Sundays and Mondays first: on Vercel Pro change its schedule to `30 * * * 0,1`, or create an Upstash QStash schedule that calls it with the cron secret. A missed hour is caught up later the same local Monday.

## Chrome extension

The extension lives in [`extension/`](extension/README.md) and needs no build step.

1. In the app, open **Extension and widget** and click **Download extension**. A download made while signed in is already connected to your workspace: the zip carries a token named "Downloaded <date>" (listed on the same page, revocable any time).
2. Open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and choose the unzipped folder. Its settings open and show the workspace it is connected to.

To connect a copy installed some other way, create a token on the same page and paste it in the extension's settings. With `EXTENSION_PUBLIC_KEY` and `NEXT_PUBLIC_EXTENSION_ID` set, the page instead shows **Connect this browser**, which hands a fresh token to the installed extension directly (the downloaded manifest allows your deployment's origin in `externally_connectable`, and the extension checks the page's origin matches the server).

To pin the id: generate a key pair, put the base64 public key (DER, SubjectPublicKeyInfo) in `EXTENSION_PUBLIC_KEY`, download the extension once, load it, and copy the id Chrome shows into `NEXT_PUBLIC_EXTENSION_ID`.

After a capture of 10 or more new reviews, the popup offers **Group now**, which starts a run (one manual run from the plan's allowance) and opens it.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Run the Vitest suite once |
| `npm run db:generate` | Generate a migration from `lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run db:push` | Push the schema without a migration (development) |
| `npm run db:studio` | Open Drizzle Studio |

## Project layout

```text
app/
  page.tsx, pricing/, terms/, privacy/   marketing site
  app/                                   anonymous analyzer (no account, localStorage)
  login/, onboarding/                    sign-in and the setup wizard
  dashboard/, inbox/, issues/, runs/     the signed-in product
  settings/, billing/, extension/        sources, alerts, integrations, team, plan, widget and extension
  widget-demo/                           public widget example
  api/                                   route handlers (docs/BUILD_CONTRACTS.md, section 7)
    cron/monitor, cron/monitor/run       scheduler and per-product worker
    cron/digest, cron/maintenance        Monday digest; trials and retention
    integrations/*/oauth                 one-click Slack, Linear and GitHub App flows
    sources/suggest                      App Store lookup for onboarding
components/
  ui/, shell/, brand/                    design system, app shell, logos
  landing/, onboarding/, settings/, app/, billing/, integrations/
lib/
  db/          schema, lazy Postgres client, DTOs
  auth/        session, workspaces, tokens, crypto, rate limits, mail
  billing/     entitlements (plans, trial, locks), Razorpay client, subscription sync and credits
  oauth/       signed state, provider clients, tracker credentials
  sources/     App Store, Google Play, Reddit, Hacker News and Trustpilot adapters
  monitor/     run pipeline: fetch, ingest, analyze, diff, persist, alert, auto-file; scheduler
  feedback/    ingest, matching on arrival, the widget endpoints
  alerts/, digest/, maintenance/
extension/   Chrome extension (load unpacked)
public/widget.js
drizzle/     SQL migrations
tests/       Vitest suites, one folder per area
docs/        PRODUCT_SPEC.md and BUILD_CONTRACTS.md
```

## Anonymous analyzer

`/app` keeps the original flow with no account and no database: paste complaints or fetch them from an App Store, Google Play, Reddit, Hacker News or Trustpilot link, analyze them, compare with the previous analysis in this browser, write PRDs, chat about the results, and send issues to GitHub, Linear or Notion. Pasted text is sent to Google Gemini for analysis and not stored; results stay in the browser (`buildmonday:state`, `buildmonday:statuses`, `buildmonday:history`, `buildmonday:last-source` in `localStorage`), and share links carry their data in the URL. Requests are rate-limited per IP per day.

"Get this list every Monday" leads to sign-up and carries both the source (prefilled in onboarding) and the analyzed text (added to the new product's inbox, so the first run has data even with no sources).

## Known limitations

- Google Play is read through an unofficial endpoint, and Reddit often blocks datacenter IPs (the Reddit adapter falls back to a reader proxy). A failing source is recorded on that source and never fails the whole run.
- The extension's review-page readers are best effort, because those sites change their markup often. Selecting text and clipping it works on any page.
- Matching on arrival compares feedback text with issue embeddings; it links clear matches and leaves the rest for the next run's full grouping.
- Jira is not a filing target yet; teams on Jira get the Monday email and can copy issues as Markdown.

## Author

**Ritvik Jaiswal**: [github.com/ritvikjaiswal02](https://github.com/ritvikjaiswal02)
