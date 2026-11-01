import { Section, SectionHeading } from "./Section";

const STEPS = [
  {
    title: "Connect your sources",
    text: "Sign up, name your product and paste your App Store link, subreddits, keywords and Trustpilot page. Five short questions, and you can test each source before you save it.",
    detail: ["App Store and Google Play links or IDs", "Subreddits and search keywords", "Competitors to watch, on Pro and Team"],
  },
  {
    title: "BuildMonday reads them every day",
    text: "New feedback is fetched, deduplicated and grouped into issues. Each issue gets a frequency, severity, churn risk and a priority score, then it is compared with the last run. Pro and Team check daily; Free checks every Sunday.",
    detail: ["New, worse, improving and resolved", "Evidence quotes on every issue", "The same review is never stored twice"],
  },
  {
    title: "Your team gets the list",
    text: "The ranked list lands in your inbox every Monday morning. Serious new issues reach Slack the same day, and issues over your threshold are filed to Linear or GitHub.",
    detail: ["The Monday email on every plan", "Slack and email alerts on Pro and Team", "Auto-filed tickets with the quotes"],
  },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works" aria-labelledby="how-title">
      <SectionHeading
        id="how-title"
        title="How it works"
        lead="Set it up once. After that the list keeps itself current and comes to you."
      />
      <ol className="mt-12 grid gap-10 lg:grid-cols-3 lg:gap-8">
        {STEPS.map((step, i) => (
          <li key={step.title} className="relative border-t border-line-strong pt-6">
            <span
              aria-hidden
              className="absolute -top-px left-0 h-0.5 w-12 bg-brand"
            />
            <p className="font-display text-3xl font-semibold tabular-nums text-brand">
              <span className="sr-only">Step </span>
              {i + 1}
            </p>
            <h3 className="mt-3 text-xl font-semibold">{step.title}</h3>
            <p className="mt-2 max-w-prose text-base text-ink-secondary">{step.text}</p>
            <ul className="mt-5 space-y-2">
              {step.detail.map((d) => (
                <li key={d} className="flex items-start gap-2.5 text-sm text-ink-muted">
                  <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-ink-faint" />
                  {d}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </Section>
  );
}
