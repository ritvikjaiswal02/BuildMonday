import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FaqItem {
  question: string;
  answer: ReactNode;
}

/**
 * Accordion built on native <details>: keyboard and screen reader support for free,
 * works without JavaScript, and in-page search can open a closed answer.
 */
export function Faq({ items, className }: { items: FaqItem[]; className?: string }) {
  return (
    <div className={cn("divide-y divide-line border-y border-line", className)}>
      {items.map((item) => (
        <details key={item.question} className="group">
          <summary
            className={cn(
              "focus-ring flex cursor-pointer list-none items-start justify-between gap-6 rounded-sm py-5",
              "text-base font-medium text-ink [&::-webkit-details-marker]:hidden",
            )}
          >
            <span>{item.question}</span>
            <ChevronDown
              aria-hidden
              className="mt-1 size-4 shrink-0 text-ink-muted transition-transform duration-180 ease-standard group-open:rotate-180"
            />
          </summary>
          <div className="max-w-prose space-y-3 pb-6 pr-10 text-base text-ink-secondary">{item.answer}</div>
        </details>
      ))}
    </div>
  );
}
