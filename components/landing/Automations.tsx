import type { ReactNode } from "react";
import { BellRing, CalendarCheck, FileInput } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DigestEmailExcerpt, LinearIssueExcerpt, SlackAlertExcerpt } from "./Excerpts";
import { Section, SectionHeading } from "./Section";

interface Row {
  icon: LucideIcon;
  title: string;
  text: string;
  points: string[];
  plan: string;
  excerpt: ReactNode;
}

const ROWS: Row[] = [
  {
    icon: BellRing,
    title: "An alert the day something breaks",
    text: "When a new issue crosses your priority threshold, or an existing one gets worse, BuildMonday posts it to Slack and emails the people who asked for alerts. You see the quotes that triggered it, not a vague score.",
    points: ["One message per run, never one per review", "Choose serious issues only, or every change", "A worsening issue alerts at most once in 72 hours"],
    plan: "Pro and Team",
    excerpt: <SlackAlertExcerpt />,
  },
  {
    icon: FileInput,
    title: "Tickets filed where engineers already work",
    text: "Pick Linear or GitHub Issues and a threshold. Issues that pass it are filed once, with the frequency, the trend and the evidence quotes in the body, and a link back to the full history.",
    points: ["Filed once, then kept linked", "Labels and team of your choosing", "File any issue by hand from its page"],
    plan: "Pro and Team",
    excerpt: <LinearIssueExcerpt />,
  },
  {
    icon: CalendarCheck,
    title: "The Monday email",
    text: "Every Monday morning: the top issues, what is new since last week, what got worse and what you fixed. It is short enough to read before standup and specific enough to plan from.",
    points: ["Top five issues with a quote each", "New, worse and resolved sections", "Feedback volume by source"],
    plan: "Every plan, including Free",
    excerpt: <DigestEmailExcerpt />,
  },
];

export function Automations() {
  return (
    <Section aria-labelledby="automations-title" tone="raised">
      <SectionHeading
        id="automations-title"
        title="What happens automatically"
        lead="The list is only useful if it reaches the people who decide the sprint. BuildMonday puts it where they already look."
      />

      <div className="mt-14 space-y-16 sm:space-y-24">
        {ROWS.map((row, i) => {
          const Icon = row.icon;
          const flipped = i % 2 === 1;
          return (
            <article key={row.title} className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-12">
              <div className={cn("lg:col-span-5", flipped && "lg:order-2 lg:col-start-8")}>
                <span className="inline-flex size-9 items-center justify-center rounded-md bg-brand-soft text-brand-ink">
                  <Icon aria-hidden className="size-4" />
                </span>
                <h3 className="mt-4 text-xl font-semibold sm:text-2xl">{row.title}</h3>
                <p className="mt-3 max-w-prose text-base text-ink-secondary">{row.text}</p>
                <ul className="mt-5 space-y-2">
                  {row.points.map((p) => (
                    <li key={p} className="flex items-start gap-2.5 text-sm text-ink-secondary">
                      <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-brand" />
                      {p}
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-xs text-ink-muted">Available on {row.plan}.</p>
              </div>
              <div className={cn("lg:col-span-7", flipped && "lg:order-1 lg:col-start-1")}>{row.excerpt}</div>
            </article>
          );
        })}
      </div>
    </Section>
  );
}
