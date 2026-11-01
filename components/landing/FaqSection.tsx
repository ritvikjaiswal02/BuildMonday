import { Faq, type FaqItem } from "./Faq";
import { Section } from "./Section";

export function FaqSection({ items, title = "Questions" }: { items: FaqItem[]; title?: string }) {
  return (
    <Section aria-labelledby="faq-title">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <h2 id="faq-title" className="text-2xl font-semibold sm:text-3xl">
            {title}
          </h2>
          <p className="mt-3 max-w-[36ch] text-base text-ink-secondary">
            Something else? Open an issue on GitHub or email the address in the privacy policy.
          </p>
        </div>
        <Faq items={items} className="lg:col-span-8" />
      </div>
    </Section>
  );
}
