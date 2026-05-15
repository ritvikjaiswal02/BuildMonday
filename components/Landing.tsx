"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { AnimatedText } from "@/components/ui/animated-underline-text-one";
import { SmokeBackground } from "@/components/ui/spooky-smoke-animation";

export function Landing() {
  return (
    <section className="relative isolate w-full">
      {/* Fixed fullscreen smoke background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <SmokeBackground smokeColor="#6366F1" className="h-full w-full block" />
      </div>
      <div className="pointer-events-none fixed inset-0 z-[1]">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_75%_60%_at_50%_35%,transparent_0%,rgba(2,6,23,0.2)_60%,rgba(2,6,23,0.55)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-transparent to-[#020617]" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      <div className="relative z-10">
        {/* Sticky header — flush to viewport top */}
        <header className="sticky top-0 z-40 border-b border-white/5 bg-[#020617]/70 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                if (typeof window !== "undefined")
                  window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="group cursor-pointer font-display text-[24px] font-semibold leading-none tracking-tight text-white sm:text-[28px]"
            >
              Build
              <span className="font-serif italic font-normal text-amber-200/95 transition group-hover:text-amber-200">
                monday
              </span>
            </a>
            <nav className="hidden items-center gap-6 sm:flex">
              <a
                href="#how"
                className="cursor-pointer text-sm text-white/60 transition hover:text-white"
              >
                How it works
              </a>
              <a
                href="#features"
                className="cursor-pointer text-sm text-white/60 transition hover:text-white"
              >
                Features
              </a>
            </nav>
            <div className="flex items-center gap-3">
              <Link
                href="/app"
                className="cursor-pointer rounded-lg bg-gradient-to-b from-white via-white/95 to-white/60 px-4 py-1.5 text-sm font-semibold text-black transition hover:scale-[1.03] active:scale-95"
              >
                Try it free →
              </Link>
            </div>
          </div>
        </header>

        {/* Hero */}
        <div className="mx-auto mt-20 flex max-w-5xl flex-col items-center px-4 text-center sm:mt-28">
          {/* Direct value-prop headline */}
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="font-display text-[2.6rem] font-medium leading-[1.04] tracking-[-0.035em] sm:text-[4rem] lg:text-[4.8rem]"
            style={{
              backgroundImage:
                "linear-gradient(to bottom, #ffffff 0%, #ffffff 55%, rgba(255,255,255,0.55) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Turn customer complaints into a{" "}
            <span
              className="font-serif italic font-normal"
              style={{
                backgroundImage:
                  "linear-gradient(to right, #fde68a, #fcd34d, #fef3c7)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              ranked
            </span>{" "}
            build plan.
          </motion.h1>

          {/* Single sub-caption with refined underline animation */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="mt-20 sm:mt-24"
          >
            <AnimatedText
              text="Evidence-backed PRDs, ready to ship Monday morning."
              textClassName="text-lg sm:text-xl lg:text-[22px] font-normal text-white/75 tracking-tight leading-snug max-w-3xl px-2"
              underlineClassName="text-amber-300"
              underlinePath="M 4,12 C 75,4 225,4 296,12"
              underlineHoverPath="M 4,10 C 75,16 225,16 296,10"
              underlineDuration={2.2}
            />
          </motion.div>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="mt-14 flex flex-wrap items-center justify-center gap-3"
          >
            <Link
              href="/app"
              className="cursor-pointer rounded-lg bg-gradient-to-b from-white via-white/95 to-white/60 px-7 py-3.5 text-sm font-semibold text-black transition hover:scale-[1.03] active:scale-95"
            >
              Try it with your data →
            </Link>
            <a
              href="#how"
              className="cursor-pointer rounded-lg border border-white/15 bg-white/[0.04] px-7 py-3.5 text-sm font-medium text-white/85 backdrop-blur transition hover:border-white/25 hover:bg-white/[0.07]"
            >
              How it works ↓
            </a>
          </motion.div>

          {/* Trust strip — small inline text, not boxes */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-white/45"
          >
            <span className="flex items-center gap-1.5">
              <CheckMini />
              No login
            </span>
            <span className="text-white/15">·</span>
            <span className="flex items-center gap-1.5">
              <CheckMini />
              No data stored
            </span>
            <span className="text-white/15">·</span>
            <span className="flex items-center gap-1.5">
              <CheckMini />
              Open source
            </span>
          </motion.div>

          {/* Editorial quote — large, floating */}
          <motion.figure
            initial={{ opacity: 0, y: 20 }}
            animate={{
              opacity: 1,
              y: [0, -6, 0],
            }}
            transition={{
              opacity: { duration: 0.9, delay: 0.7 },
              y: {
                duration: 6,
                delay: 1.2,
                ease: "easeInOut",
                repeat: Infinity,
              },
            }}
            className="relative mx-auto mt-16 max-w-3xl px-6 sm:mt-20"
          >
            <span
              aria-hidden
              className="absolute -left-2 -top-8 font-serif text-[7rem] leading-none text-amber-300/30 sm:text-[9rem]"
            >
              “
            </span>
            <span
              aria-hidden
              className="absolute -right-2 -bottom-16 font-serif text-[7rem] leading-none text-amber-300/30 sm:text-[9rem]"
            >
              ”
            </span>
            <blockquote className="relative z-10 font-serif text-2xl italic leading-snug text-white/90 sm:text-3xl lg:text-4xl">
              Founders already know their customers are unhappy. The hard part
              is choosing what to ship Monday morning.
            </blockquote>
          </motion.figure>
        </div>

        {/* Dashboard preview mockup with glow */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.45 }}
          className="relative mx-auto mt-20 max-w-5xl px-4 pb-12 sm:mt-28"
        >
          <div
            className="pointer-events-none absolute inset-x-0 -top-32 -z-10 h-[420px] opacity-70"
            aria-hidden
            style={{
              background:
                "radial-gradient(ellipse 60% 100% at 50% 50%, rgba(99,102,241,0.35), transparent 60%), radial-gradient(ellipse 40% 70% at 20% 60%, rgba(245,158,11,0.18), transparent 70%), radial-gradient(ellipse 40% 70% at 80% 40%, rgba(96,165,250,0.18), transparent 70%)",
              filter: "blur(20px)",
            }}
          />
          <DashboardPreview />
        </motion.div>

        {/* How it works — graphical flow */}
        <section
          id="how"
          className="mx-auto mt-20 max-w-6xl px-4 pt-12 scroll-mt-24 sm:mt-28"
        >
          <div className="mb-12 text-center">
            <span className="text-xs uppercase tracking-[0.32em] text-white/40">
              How it works
            </span>
            <h2 className="mt-2 font-display text-3xl font-medium tracking-tight text-white sm:text-5xl">
              From scattered complaints to a{" "}
              <span className="font-serif italic font-normal text-amber-200">
                shipping plan
              </span>
              .
            </h2>
          </div>

          <HowItWorksFlow />
        </section>

        {/* Bento features */}
        <section
          id="features"
          className="mx-auto mt-24 max-w-6xl px-4 pt-12 scroll-mt-24 sm:mt-32"
        >
          <div className="mb-10 border-b border-white/10 pb-6">
            <span className="text-xs uppercase tracking-[0.32em] text-white/40">
              Features
            </span>
            <h2 className="mt-2 font-display text-3xl font-medium tracking-tight text-white sm:text-5xl">
              Built for{" "}
              <span className="font-serif italic font-normal text-amber-200">
                shipping
              </span>
              .
            </h2>
          </div>

          <BentoFeatures />
        </section>

        {/* Footer */}
        <footer className="relative mt-32 overflow-hidden border-t border-white/10 sm:mt-40">
          {/* Ambient radial glow */}
          <div
            className="pointer-events-none absolute inset-0 -z-10"
            aria-hidden
            style={{
              background:
                "radial-gradient(ellipse 70% 80% at 50% 60%, rgba(99,102,241,0.22), transparent 65%), radial-gradient(ellipse 40% 60% at 80% 30%, rgba(245,158,11,0.12), transparent 70%), radial-gradient(ellipse 40% 60% at 20% 70%, rgba(96,165,250,0.12), transparent 70%)",
            }}
          />
          {/* Subtle dotted grid */}
          <div
            className="pointer-events-none absolute inset-0 -z-10 opacity-[0.05]"
            aria-hidden
            style={{
              backgroundImage:
                "radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />

          {/* Giant ghost wordmark — full viewport width, behind everything */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-12 -z-10 flex select-none justify-center"
          >
            <div
              className="whitespace-nowrap text-center font-display font-bold leading-[0.9] tracking-[-0.06em]"
              style={{
                fontSize: "clamp(4rem, 15vw, 14rem)",
                backgroundImage:
                  "linear-gradient(to bottom, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.08) 55%, rgba(255,255,255,0.02) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              build
              <span className="font-serif italic font-normal">monday</span>
            </div>
          </div>

          <div className="relative mx-auto max-w-5xl px-4 py-28 text-center sm:py-36">

            {/* Decorative eyebrow line */}
            <motion.div
              initial={{ opacity: 0, scaleX: 0 }}
              whileInView={{ opacity: 1, scaleX: 1 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ duration: 0.8 }}
              className="mx-auto mb-7 flex items-center justify-center gap-4"
            >
              <span className="h-px w-12 bg-amber-200/40" />
              <span className="font-serif text-base italic tracking-wide text-amber-200/85 sm:text-lg">
                One last thing
              </span>
              <span className="h-px w-12 bg-amber-200/40" />
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.7 }}
              className="mx-auto max-w-3xl font-display text-4xl font-medium leading-[1.04] tracking-[-0.035em] sm:text-6xl lg:text-[4.5rem]"
              style={{
                backgroundImage:
                  "linear-gradient(to bottom, #ffffff 0%, #ffffff 55%, rgba(255,255,255,0.6) 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Are you ready to{" "}
              <span
                className="font-serif italic font-normal"
                style={{
                  backgroundImage:
                    "linear-gradient(to right, #fde68a, #fcd34d, #fef3c7)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                build
              </span>
              ?
            </motion.h2>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="relative mt-12"
            >
              <Link
                href="/app"
                className="group relative inline-flex cursor-pointer items-center rounded-lg bg-gradient-to-b from-white via-white/95 to-white/60 px-9 py-4 text-sm font-semibold text-black transition hover:scale-[1.04] active:scale-95"
              >
                <span className="absolute -inset-1 -z-10 rounded-lg bg-gradient-to-r from-amber-300/40 via-indigo-400/40 to-amber-300/40 opacity-0 blur-xl transition group-hover:opacity-100" />
                Try it now →
              </Link>
            </motion.div>
          </div>

          <div className="relative border-t border-white/5">
            <div className="mx-auto flex max-w-6xl items-center justify-center px-4 py-6">
              <div className="text-[11px] text-white/30">
                © {new Date().getFullYear()} BuildMonday. All rights reserved.
              </div>
            </div>
          </div>
        </footer>
      </div>
    </section>
  );
}

function CheckMini() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="text-emerald-400/70"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function HowItWorksFlow() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      className="flex flex-col items-stretch gap-4 md:flex-row md:gap-3"
    >
      <motion.div variants={item} className="flex-1">
        <FlowStep
          n="01"
          label="Paste"
          title="Drop in raw text."
          body="Reviews, tickets, tweets — or fetch them live by URL."
        >
          <PasteVisual />
        </FlowStep>
      </motion.div>

      <FlowConnector />

      <motion.div variants={item} className="flex-1">
        <FlowStep
          n="02"
          label="Cluster"
          title="AI groups & ranks."
          body="Every complaint gets read, grouped with its duplicates, and scored by impact."
        >
          <ClusterFlowVisual />
        </FlowStep>
      </motion.div>

      <FlowConnector />

      <motion.div variants={item} className="flex-1">
        <FlowStep
          n="03"
          label="Ship"
          title="One click → PRD."
          body="Send to Linear, Notion, or copy as Markdown."
        >
          <PRDFlowVisual />
        </FlowStep>
      </motion.div>
    </motion.div>
  );
}

function FlowStep({
  n,
  label,
  title,
  body,
  children,
}: {
  n: string;
  label: string;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a0d18]/75 p-5 backdrop-blur-md transition hover:border-white/20 hover:bg-[#0a0d18]/90">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse 90% 70% at 50% 0%, rgba(99,102,241,0.15), transparent 60%)",
        }}
      />

      <div className="flex items-center justify-between">
        <span className="font-serif text-3xl italic text-white/35">{n}</span>
        <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-200">
          {label}
        </span>
      </div>

      <div className="mt-4 font-display text-lg font-semibold tracking-tight text-white">
        {title}
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-white/55">{body}</p>

      <div className="mt-5 flex-1">{children}</div>
    </div>
  );
}

function FlowConnector() {
  return (
    <div className="flex items-center justify-center md:px-1">
      {/* Mobile: down arrow */}
      <svg
        className="text-amber-300/60 md:hidden"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <polyline points="5 12 12 19 19 12" />
      </svg>
      {/* Desktop: animated right arrow */}
      <motion.svg
        className="hidden text-amber-300/70 md:block"
        width="44"
        height="20"
        viewBox="0 0 44 20"
        fill="none"
        aria-hidden
        initial={{ opacity: 0, x: -8 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.3 }}
      >
        <path
          d="M 0 10 L 32 10"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="3 4"
        />
        <path
          d="M 30 4 L 40 10 L 30 16"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </motion.svg>
    </div>
  );
}

/* ===== Flow step inline visuals ===== */

function PasteVisual() {
  return (
    <div className="rounded-xl border border-white/10 bg-black/35 p-3">
      <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
        <span className="font-mono text-[9px] uppercase tracking-wider text-white/35">
          complaints.txt
        </span>
        <span className="font-mono text-[9px] text-white/30">42 lines</span>
      </div>
      <div className="mt-2 space-y-1 font-mono text-[10px] leading-relaxed text-white/60">
        <div className="truncate">› Pay button just spins on iPhone</div>
        <div className="truncate">› Can't login after the update</div>
        <div className="truncate">› Settings page text is unreadable</div>
        <div className="truncate text-white/35">› Crashes on iOS 17.4…</div>
        <div className="flex items-center gap-1 pt-1 text-amber-300/60">
          <span className="inline-block h-2.5 w-1 animate-pulse bg-amber-300/60" />
        </div>
      </div>
    </div>
  );
}

function ClusterFlowVisual() {
  const rows: Array<{
    raw: string;
    issue: string;
    score: string;
    sev: "HIGH" | "MED";
  }> = [
    { raw: "“Pay button just spins…”", issue: "Checkout fails", score: "9.4", sev: "HIGH" },
    { raw: "“Can't login after update”", issue: "Auth break", score: "8.1", sev: "HIGH" },
    { raw: "“Settings text unreadable”", issue: "UI contrast", score: "5.3", sev: "MED" },
  ];
  return (
    <div className="rounded-xl border border-white/10 bg-black/35 p-3">
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -6 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.5, delay: 0.15 + i * 0.12 }}
            className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"
          >
            <span className="truncate font-mono text-[9px] italic text-white/45">
              {r.raw}
            </span>
            <svg
              width="14"
              height="8"
              viewBox="0 0 14 8"
              className="text-amber-300/70"
              aria-hidden
            >
              <path
                d="M 0 4 L 10 4"
                stroke="currentColor"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <path
                d="M 8 1 L 13 4 L 8 7"
                stroke="currentColor"
                strokeWidth="1"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
            <div className="flex items-center justify-between gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-1">
              <span className="truncate font-display text-[10px] font-semibold text-white">
                {r.issue}
              </span>
              <span className="flex items-center gap-1">
                <span
                  className={`rounded-full px-1 py-[1px] text-[7px] font-semibold ${
                    r.sev === "HIGH"
                      ? "bg-rose-500/20 text-rose-200"
                      : "bg-amber-500/20 text-amber-200"
                  }`}
                >
                  {r.sev}
                </span>
                <span className="font-mono text-[9px] tabular-nums text-white/75">
                  {r.score}
                </span>
              </span>
            </div>
          </motion.div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-white/5 pt-1.5 text-[9px] text-white/40">
        <span>42 lines</span>
        <span className="font-mono">→ 3 ranked issues</span>
      </div>
    </div>
  );
}

function PRDFlowVisual() {
  return (
    <div className="rounded-xl border border-white/10 bg-black/35 p-3">
      <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
        <span className="font-mono text-[9px] uppercase tracking-wider text-white/35">
          prd-checkout-safari.md
        </span>
        <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-emerald-200">
          Ready
        </span>
      </div>
      <div className="mt-2 space-y-1 text-[10px] leading-snug text-white/55">
        <div className="text-white/80">## Problem</div>
        <div className="truncate">iOS Safari users abandon at payment…</div>
        <div className="text-white/80">## Success metric</div>
        <div className="truncate">+15% iOS checkout conversion</div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[8px] text-white/55">
          Linear
        </span>
        <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[8px] text-white/55">
          Notion
        </span>
        <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[8px] text-white/55">
          MD
        </span>
      </div>
    </div>
  );
}

function DashboardPreview() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a0d18]/85 shadow-[0_30px_100px_-30px_rgba(99,102,241,0.4)] backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] text-white/50">
          buildmonday.app/dashboard
        </div>
        <div className="w-12" />
      </div>

      <div className="grid gap-5 p-6 sm:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-display text-sm font-semibold text-white">
                Ranked engineering issues
              </div>
              <div className="text-[11px] text-white/45">
                6 clusters · sorted by priority
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/60">
                Priority
              </span>
              <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/60">
                Severity
              </span>
            </div>
          </div>

          <PreviewIssue
            rank={1}
            title="Checkout fails on Safari iOS 17"
            score={9.4}
            severity="HIGH"
            sevClass="bg-rose-500/20 text-rose-200 border-rose-500/30"
            freq={42}
            sources={["appstore", "reddit"]}
          />
          <PreviewIssue
            rank={2}
            title="Onboarding skips email verification"
            score={8.1}
            severity="HIGH"
            sevClass="bg-rose-500/20 text-rose-200 border-rose-500/30"
            freq={28}
            sources={["appstore", "hn"]}
          />
          <PreviewIssue
            rank={3}
            title="Dark mode contrast on settings page"
            score={5.3}
            severity="MED"
            sevClass="bg-amber-500/20 text-amber-200 border-amber-500/30"
            freq={14}
            sources={["reddit"]}
          />
        </div>

        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex items-center justify-between">
            <span className="font-display text-xs font-semibold text-white">
              PRD stub
            </span>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-200">
              Ready
            </span>
          </div>
          <div className="text-[11px] leading-relaxed text-white/55">
            <span className="font-semibold text-white/80">Problem:</span> iOS
            Safari users abandon checkout at the payment step…
          </div>
          <div className="text-[11px] leading-relaxed text-white/55">
            <span className="font-semibold text-white/80">Hypothesis:</span>{" "}
            ApplePay sheet timing race with our overlay…
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] text-white/50">
              Copy as MD
            </span>
            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] text-white/50">
              Send to Linear
            </span>
            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] text-white/50">
              Send to Notion
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewIssue({
  rank,
  title,
  score,
  severity,
  sevClass,
  freq,
  sources,
}: {
  rank: number;
  title: string;
  score: number;
  severity: string;
  sevClass: string;
  freq: number;
  sources: string[];
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-3 transition hover:border-white/20">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-gradient-to-br from-indigo-500/20 to-amber-500/10 font-display text-sm font-semibold text-white">
        {rank}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-sm font-semibold text-white">
          {title}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-white/45">
          <span>{freq} mentions</span>
          <span className="text-white/20">·</span>
          <span>{sources.join(" + ")}</span>
        </div>
      </div>
      <div className="text-right">
        <div className="font-display text-base font-semibold text-white">
          {score.toFixed(1)}
        </div>
        <span
          className={`mt-0.5 inline-block rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${sevClass}`}
        >
          {severity}
        </span>
      </div>
    </div>
  );
}

const container = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};
const item = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 110, damping: 14 },
  },
};

function BentoFeatures() {
  return (
    <motion.div
      variants={container}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
      className="grid auto-rows-[200px] grid-cols-1 gap-4 md:grid-cols-4"
    >
      <motion.div variants={item} className="md:col-span-2 md:row-span-2">
        <BentoCard
          eyebrow="Cluster engine"
          title="Group noisy text into real issues."
          body="A two-pass LLM tags every complaint, then clusters them by underlying engineering problem."
        >
          <ClusterViz />
        </BentoCard>
      </motion.div>

      <motion.div variants={item} className="md:col-span-2">
        <BentoCard
          eyebrow="Priority"
          title="Score and rank, automatically."
          body="Frequency × severity × churn signal → one priority score per cluster."
          compact
        >
          <PriorityViz />
        </BentoCard>
      </motion.div>

      <motion.div variants={item} className="md:col-span-2">
        <BentoCard
          eyebrow="PRD stubs"
          title="One click to a draft."
          body="Problem, hypothesis, success metrics — generated per issue."
          compact
        >
          <PRDViz />
        </BentoCard>
      </motion.div>

      <motion.div variants={item} className="md:col-span-2">
        <BentoCard
          eyebrow="Sources"
          title="Plug in any channel."
          body="App Store · Reddit · HN · paste your own text."
          compact
        >
          <SourcesViz />
        </BentoCard>
      </motion.div>

      <motion.div variants={item} className="md:col-span-2">
        <BentoCard
          eyebrow="Evidence"
          title="Every cluster shows its receipts."
          body="See the raw complaints behind each ranked issue."
          compact
        >
          <EvidenceViz />
        </BentoCard>
      </motion.div>
    </motion.div>
  );
}

function BentoCard({
  eyebrow,
  title,
  body,
  children,
  compact = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a0d18]/70 p-5 backdrop-blur-md transition hover:border-white/20 hover:bg-[#0a0d18]/85">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        style={{
          background:
            "radial-gradient(ellipse 70% 100% at 50% 0%, rgba(99,102,241,0.12), transparent 60%)",
        }}
      />
      <div className="text-[10px] uppercase tracking-[0.2em] text-white/45">
        {eyebrow}
      </div>
      <div
        className={`mt-1 font-display font-medium tracking-tight text-white ${
          compact ? "text-lg" : "text-xl sm:text-2xl"
        }`}
      >
        {title}
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-white/55">{body}</p>
      {children && <div className="mt-auto pt-4">{children}</div>}
    </div>
  );
}

function ClusterViz() {
  return (
    <div className="relative h-32 w-full overflow-hidden rounded-xl border border-white/5 bg-black/30 p-3">
      <svg
        viewBox="0 0 320 110"
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {[
          [20, 20],
          [40, 60],
          [60, 85],
          [80, 30],
          [100, 75],
          [120, 45],
        ].map(([x, y], i) => (
          <circle
            key={`l${i}`}
            cx={x}
            cy={y}
            r={3.5}
            fill="rgba(255,255,255,0.35)"
          />
        ))}
        <path
          d="M 140 55 L 200 55"
          stroke="rgba(245,158,11,0.6)"
          strokeWidth="1"
          strokeDasharray="2 3"
        />
        <text
          x="170"
          y="48"
          fill="rgba(245,158,11,0.9)"
          fontSize="9"
          textAnchor="middle"
          fontFamily="serif"
          fontStyle="italic"
        >
          group
        </text>
        <circle
          cx="240"
          cy="30"
          r="22"
          fill="rgba(99,102,241,0.18)"
          stroke="rgba(99,102,241,0.4)"
        />
        <circle cx="240" cy="30" r="3" fill="rgba(165,180,252,0.9)" />
        <circle cx="232" cy="38" r="3" fill="rgba(165,180,252,0.8)" />
        <circle cx="248" cy="35" r="3" fill="rgba(165,180,252,0.7)" />
        <circle
          cx="290"
          cy="78"
          r="26"
          fill="rgba(245,158,11,0.14)"
          stroke="rgba(245,158,11,0.4)"
        />
        <circle cx="290" cy="78" r="3" fill="rgba(252,211,77,0.9)" />
        <circle cx="282" cy="86" r="3" fill="rgba(252,211,77,0.8)" />
        <circle cx="298" cy="84" r="3" fill="rgba(252,211,77,0.7)" />
        <circle cx="280" cy="72" r="3" fill="rgba(252,211,77,0.7)" />
      </svg>
    </div>
  );
}

function PriorityViz() {
  return (
    <div className="space-y-1.5">
      {[
        { label: "Checkout fails", score: 92, color: "from-rose-400 to-amber-300" },
        { label: "Email verify", score: 78, color: "from-amber-300 to-amber-200" },
        { label: "Dark mode bug", score: 53, color: "from-emerald-400 to-cyan-300" },
      ].map((row, i) => (
        <div
          key={i}
          className="flex items-center gap-2 text-[10px] text-white/60"
        >
          <span className="w-28 shrink-0 truncate">{row.label}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${row.color}`}
              style={{ width: `${row.score}%` }}
            />
          </div>
          <span className="w-8 text-right tabular-nums text-white/70">
            {(row.score / 10).toFixed(1)}
          </span>
        </div>
      ))}
    </div>
  );
}

function PRDViz() {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-2.5 text-[10px] leading-snug text-white/55">
      <div className="font-mono text-[9px] uppercase tracking-wider text-white/35">
        prd-stub.md
      </div>
      <div className="mt-1.5 text-white/75">## Problem</div>
      <div>iOS Safari users abandon checkout at payment.</div>
      <div className="mt-1 text-white/75">## Hypothesis</div>
      <div>ApplePay sheet races with overlay close.</div>
    </div>
  );
}

function SourcesViz() {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {["App Store", "Reddit", "HN", "Tweets", "Tickets", "Paste"].map((s) => (
        <span
          key={s}
          className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-white/70"
        >
          {s}
        </span>
      ))}
    </div>
  );
}

function EvidenceViz() {
  return (
    <div className="space-y-1.5 text-[10px]">
      <div className="rounded-md border-l-2 border-amber-400/60 bg-white/[0.03] px-2 py-1 text-white/65">
        "Pay button just spins forever on iPhone."
      </div>
      <div className="rounded-md border-l-2 border-indigo-400/60 bg-white/[0.03] px-2 py-1 text-white/65">
        "Stuck after entering card details, app crashes."
      </div>
    </div>
  );
}
