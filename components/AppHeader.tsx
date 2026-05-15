"use client";

import Link from "next/link";

export function AppHeader({
  right,
}: {
  right?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#020617]/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link
          href="/"
          className="group cursor-pointer font-display text-[22px] font-semibold leading-none tracking-tight text-white sm:text-[26px]"
          aria-label="BuildMonday — back to home"
        >
          Build
          <span className="font-serif italic font-normal text-amber-200/95 transition group-hover:text-amber-200">
            monday
          </span>
        </Link>
        <div className="flex items-center gap-2">{right}</div>
      </div>
    </header>
  );
}
