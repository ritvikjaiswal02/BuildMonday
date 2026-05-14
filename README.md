# BuildMonday

AI Product Intelligence Copilot. Paste raw customer complaints, get a ranked dashboard of engineering issues and on-demand PRD stubs.

> Founders already know customers are unhappy. The hard part is deciding what engineering should build Monday morning.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- Gemini 2.5 Flash via `@google/generative-ai`
- No DB, no auth. State in React + `localStorage`.

## Setup

```bash
cp .env.local.example .env.local
# put your Gemini API key in .env.local
npm install
npm run dev
```

Open http://localhost:3000.

## Environment

- `GEMINI_API_KEY` — get one at https://aistudio.google.com/app/apikey

## How it works

1. **Pass 1 (tag):** every complaint → `{ category, severity, churn_signal, affected_segment, urgency_keywords }`.
2. **Pass 2 (cluster + rank):** tagged complaints → ranked issues with `priority_score`, evidence, recommended action.
3. **PRD stub on-demand:** click "Generate PRD →" on a card to get a structured PRD you can copy as Markdown.

## Deploy to Vercel

1. Push to GitHub.
2. Import the repo in Vercel.
3. Set the `GEMINI_API_KEY` env var in the Vercel project.
4. Deploy.

## Demo datasets

Three preloaded datasets (E-commerce, SaaS Tool, Food Delivery) are available via the demo buttons on the input screen.
