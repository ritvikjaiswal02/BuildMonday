import type { ReactNode } from "react";
import Link from "next/link";
import { PLANS, formatLimit, formatPrice } from "@/lib/plans";
import type { FaqItem } from "./Faq";

function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="focus-ring rounded-sm text-brand underline decoration-brand/40 underline-offset-2 hover:decoration-brand">
      {children}
    </Link>
  );
}

const free = PLANS.free;
const pro = PLANS.pro;
const team = PLANS.team;

export const LANDING_FAQ: FaqItem[] = [
  {
    question: "Which sources can BuildMonday read?",
    answer: (
      <>
        <p>
          App Store and Google Play reviews, Reddit posts in the subreddits you choose, Hacker News stories and
          comments that match your keywords, and your Trustpilot page. On top of that, anything sent through the
          website widget, clipped with the Chrome extension or pasted into the inbox.
        </p>
        <p>
          We do not connect to support desks such as Zendesk or Intercom yet. You can paste or clip those
          conversations in the meantime.
        </p>
      </>
    ),
  },
  {
    question: "What counts as a feedback item?",
    answer: (
      <p>
        One review, one post or comment, one widget message or one clipped selection. Items already in your inbox
        are recognised and not counted again, so a review that stays on the App Store for months counts once. The
        Free plan includes {formatLimit(free.limits.feedback_items_per_month)} new items a month, Pro{" "}
        {formatLimit(pro.limits.feedback_items_per_month)} and Team {formatLimit(team.limits.feedback_items_per_month)}.
      </p>
    ),
  },
  {
    question: "How reliable is Reddit?",
    answer: (
      <p>
        Less reliable than the other sources. Reddit sometimes blocks automated requests from cloud servers. When
        that happens the run notes the error on that source, carries on with the others and tries Reddit again on
        the next run. If a thread matters, clip it with the extension or paste it into the inbox.
      </p>
    ),
  },
  {
    question: "What happens to my data?",
    answer: (
      <>
        <p>
          Feedback is stored in your workspace and sent to Google Gemini to be grouped and ranked. Tokens for Slack,
          Linear and GitHub are encrypted before they are saved. We do not sell data or use third-party analytics.
        </p>
        <p>
          The <A href="/privacy">privacy policy</A> lists every service involved and how long data is kept.
        </p>
      </>
    ),
  },
  {
    question: "Can I try it before signing up?",
    answer: (
      <p>
        Yes. The <A href="/app">analyzer</A> works without an account: paste feedback or a link and you get the
        ranked list, evidence and a PRD draft. Sign up when you want it to run on its own and remember last week.
      </p>
    ),
  },
  {
    question: "Can I cancel anytime?",
    answer: (
      <p>
        Yes, from the Billing page. Paid features stay on until the end of the period you paid for, then the
        workspace moves to Free. Nothing is deleted: products over the Free limit are paused, not removed.
      </p>
    ),
  },
  {
    question: "Why do I see prices in rupees or dollars?",
    answer: (
      <p>
        Payments go through Razorpay, which bills in INR and USD. Visitors from India see rupees (Pro is{" "}
        {formatPrice(pro.prices.INR.month, "INR")} a month), everyone else sees dollars (
        {formatPrice(pro.prices.USD.month, "USD")} a month). You can switch currency on the{" "}
        <A href="/pricing">pricing page</A>.
      </p>
    ),
  },
  {
    question: "Does it work for a team?",
    answer: (
      <p>
        Pro includes {pro.limits.seats} seats and Team includes {team.limits.seats}, with admin roles on Team.
        Everyone on the workspace can get the Monday email and choose their own alert level.
      </p>
    ),
  },
];

export const PRICING_FAQ: FaqItem[] = [
  {
    question: "How does billing work?",
    answer: (
      <p>
        Pro and Team are subscriptions through Razorpay, billed monthly or yearly in INR or USD. Yearly costs ten
        times the monthly price, so you get two months free. Receipts are emailed by Razorpay.
      </p>
    ),
  },
  {
    question: "What happens when I reach a limit?",
    answer: (
      <>
        <p>
          Nothing breaks. When the monthly feedback allowance runs out, runs continue on the feedback you already
          have and new items wait for next month or an upgrade. Visitors using your website widget still see their
          message sent.
        </p>
        <p>Limits reset on the first day of each month. The Billing page shows how much you have used.</p>
      </>
    ),
  },
  {
    question: "Can I change plans or cancel?",
    answer: (
      <p>
        Yes, from the Billing page. Cancelling keeps paid features until the end of the period you paid for. To
        switch between Pro and Team, cancel the current plan and choose the new one.
      </p>
    ),
  },
  {
    question: "What happens to my data if I downgrade?",
    answer: (
      <p>
        It stays. Products and sources over the Free limits are paused rather than deleted, and saved integrations
        stay configured but unused. Upgrade again and they pick up where they left off.
      </p>
    ),
  },
  {
    question: "What if a payment fails?",
    answer: (
      <p>
        Razorpay retries the charge. Your paid features keep working for three days after the period ends while
        it does, so a declined card does not stop your alerts overnight.
      </p>
    ),
  },
  {
    question: "Is there a free trial of Pro?",
    answer: (
      <p>
        Every new workspace gets 14 days of Pro, no card. After that you keep the Free plan unless you upgrade, and
        nothing you collected is deleted. The <A href="/app">analyzer</A> lets you test the ranking without an
        account at all.
      </p>
    ),
  },
];
