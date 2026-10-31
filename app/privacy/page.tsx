import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, supportEmail, type LegalSection } from "@/components/landing/LegalPage";
import { PLANS } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What BuildMonday stores, which services process it, how long it is kept and how to have it deleted.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  const email = supportEmail();
  const mail = <a href={`mailto:${email}`}>{email}</a>;

  const sections: LegalSection[] = [
    {
      id: "what-we-store",
      title: "What we store",
      body: (
        <>
          <p>When you create an account and use BuildMonday, we store:</p>
          <ul>
            <li>
              <strong>Your account:</strong> your name, email address and profile picture from GitHub or Google, or
              just your email address if you sign in with a link.
            </li>
            <li>
              <strong>Your workspace:</strong> product names and descriptions, the sources you monitor, your answers
              to the setup questions, your time zone, your alert and email preferences, and the people you invite.
            </li>
            <li>
              <strong>Feedback:</strong> the text of reviews, posts and comments fetched from the sources you
              configured, with the public author name, rating, date and link where the source provides them.
              Messages sent through your website widget, including an email address if the visitor chose to give
              one, the page they were on and their browser type. Text you clip with the extension or paste into
              the inbox.
            </li>
            <li>
              <strong>Analysis:</strong> the issues BuildMonday builds from that feedback, their history from run
              to run, generated PRDs and chat messages.
            </li>
            <li>
              <strong>Integration secrets:</strong> Slack webhook URLs and Linear or GitHub tokens. These are
              encrypted with AES-256-GCM before they are saved and are only decrypted to send an alert or file an
              issue.
            </li>
            <li>
              <strong>Extension tokens:</strong> stored only as a one-way hash. We cannot show you a token again
              after you create it.
            </li>
            <li>
              <strong>Billing:</strong> your plan, subscription status and Razorpay subscription and payment IDs.
              Card and bank details go directly to Razorpay; we never see or store them.
            </li>
            <li>
              <strong>Usage counters:</strong> monthly counts used to apply plan limits, and short-lived
              rate-limit counters keyed by IP address.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "analyzer",
      title: "The free analyzer",
      body: (
        <>
          <p>
            The analyzer at <Link href="/app">/app</Link> works without an account. Text you paste or fetch is sent
            to our server and to Google Gemini to be analyzed, and the result is returned to your browser. We do
            not save it to our database. Your past analyses are kept in your browser&apos;s local storage, and
            share links carry the results inside the link itself.
          </p>
          <p>We count requests per IP address for a short time to stop abuse.</p>
        </>
      ),
    },
    {
      id: "processors",
      title: "Services that process your data",
      body: (
        <>
          <p>BuildMonday relies on these services to run. Each one only receives what it needs for its job.</p>
          <ul>
            <li>
              <strong>Vercel</strong> hosts the application and runs the scheduled checks.
            </li>
            <li>
              <strong>Our Postgres database host</strong> stores the data described above.
            </li>
            <li>
              <strong>Google Gemini</strong> receives feedback text, your product name and description to group,
              rank and summarise it, and to answer chat questions. Google processes it under the Gemini API terms.
            </li>
            <li>
              <strong>Resend</strong> sends sign-in links, alerts, invitations and the Monday email, so it receives
              recipient addresses and the email content.
            </li>
            <li>
              <strong>Razorpay</strong> processes payments and manages subscriptions.
            </li>
            <li>
              <strong>GitHub and Google</strong> confirm your identity when you sign in with them.
            </li>
            <li>
              <strong>Slack, Linear and GitHub</strong> receive issue titles, summaries and evidence quotes, but
              only if you connect them.
            </li>
          </ul>
          <p>
            To fetch feedback we read public pages and APIs of the App Store, Google Play, Reddit, Hacker News and
            Trustpilot. Those services see requests from our servers, not from you.
          </p>
        </>
      ),
    },
    {
      id: "how-we-use-it",
      title: "How we use it",
      body: (
        <>
          <p>
            We use your data to run the product for you: fetch and rank feedback, send the emails and alerts you
            asked for, file issues you configured, and bill your subscription. We may email you about changes to
            the service or your account.
          </p>
          <p>
            We do not sell your data, show ads or use third-party analytics or tracking scripts. We do not use your
            feedback to train models.
          </p>
        </>
      ),
    },
    {
      id: "cookies",
      title: "Cookies and local storage",
      body: (
        <ul>
          <li>A sign-in session cookie and the short-lived cookies the sign-in flow needs.</li>
          <li>A cookie remembering which of your products is selected.</li>
          <li>
            Local storage in your browser for your theme, a chosen pricing currency and analyzer history. This never
            leaves your browser.
          </li>
        </ul>
      ),
    },
    {
      id: "retention",
      title: "How long we keep it",
      body: (
        <>
          <p>Feedback, issues and run history are kept for the history window of your plan:</p>
          <ul>
            <li>Free: {PLANS.free.limits.history_days} days</li>
            <li>Pro: {PLANS.pro.limits.history_days} days</li>
            <li>Team: {PLANS.team.limits.history_days} days</li>
          </ul>
          <p>
            A daily job deletes older feedback, runs and issues from your workspace. Account and workspace settings are kept while your account
            exists. If you downgrade, data beyond the new plan&apos;s limits is paused, not deleted, until the
            history window passes. Billing records are kept for as long as tax law requires.
          </p>
        </>
      ),
    },
    {
      id: "deletion",
      title: "Deleting your data",
      body: (
        <>
          <p>
            You can remove sources, integrations and team members from Settings, and delete feedback from the inbox
            (select it, then Delete), at any time. To delete
            your account and everything in your workspaces, email {mail} from the address you sign in with. We
            confirm the request and delete the data within 30 days, apart from billing records we must keep.
          </p>
          <p>
            You can also ask for a copy of your data, or for something to be corrected, at the same address.
          </p>
        </>
      ),
    },
    {
      id: "feedback-authors",
      title: "If your words appear in someone's inbox",
      body: (
        <p>
          BuildMonday collects public reviews and posts on behalf of the product team that set up monitoring. If
          you wrote something that ended up in a workspace and want it removed, email {mail} with a link to the
          original and we will pass the request to that team and remove it.
        </p>
      ),
    },
    {
      id: "security",
      title: "Security",
      body: (
        <p>
          Traffic is encrypted with HTTPS. Integration secrets are encrypted at rest, extension tokens are hashed,
          and every request is checked against the workspace it belongs to. If you find a security problem, please
          email {mail}.
        </p>
      ),
    },
    {
      id: "changes",
      title: "Changes and contact",
      body: (
        <p>
          If we change this policy in a way that matters, we will email account owners before it takes effect.
          Questions go to {mail}.
        </p>
      ),
    },
  ];

  return (
    <LegalPage
      title="Privacy"
      intro={
        <p>
          BuildMonday reads customer feedback so you do not have to. This page explains, in plain language, what we
          store, who processes it and how to have it removed.
        </p>
      }
      sections={sections}
    />
  );
}
