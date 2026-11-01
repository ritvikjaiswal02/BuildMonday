import Link from "next/link";
import { Wordmark } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#how-it-works", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
      { href: "/app", label: "Analyzer" },
      { href: "/widget-demo", label: "Widget demo" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/login?next=/onboarding", label: "Start free" },
      { href: "/login", label: "Sign in" },
      { href: "/dashboard", label: "Dashboard" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="container-marketing grid gap-10 py-12 sm:py-16 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Link href="/" className="focus-ring -mx-1 inline-flex rounded-md px-1 py-1" aria-label="BuildMonday home">
            <Wordmark />
          </Link>
          <p className="mt-3 max-w-[36ch] text-sm text-ink-muted">
            Customer feedback in, a ranked engineering list out. Every Monday.
          </p>
        </div>

        <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-8 lg:justify-items-end">
          {COLUMNS.map((col) => (
            <div key={col.title} className="min-w-[140px]">
              <p className="text-xs font-medium text-ink-muted">{col.title}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="focus-ring rounded-sm text-sm text-ink-secondary transition-colors duration-120 hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className="border-t border-line">
        <div className="container-marketing flex flex-col gap-3 py-5 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {new Date().getFullYear()} BuildMonday. Prices shown in INR or USD, billed through Razorpay.</p>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
