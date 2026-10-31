"use client";

import * as React from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  THEME_STORAGE_KEY,
  applyThemePreference,
  readThemePreference,
  type ThemePreference,
} from "./theme";

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: LucideIcon }> = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

/**
 * Current theme preference with a setter. Follows OS changes while on "system"
 * and stays in sync across tabs.
 */
export function useThemePreference(): [ThemePreference, (pref: ThemePreference) => void] {
  const [pref, setPref] = React.useState<ThemePreference>("system");

  React.useEffect(() => {
    setPref(readThemePreference());
  }, []);

  React.useEffect(() => {
    if (pref !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemePreference("system", false);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [pref]);

  React.useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
      const next = readThemePreference();
      setPref(next);
      applyThemePreference(next, false);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = React.useCallback((next: ThemePreference) => {
    setPref(next);
    applyThemePreference(next);
  }, []);

  return [pref, update];
}

/** System / Light / Dark as a compact icon radiogroup. Stored in localStorage "bm-theme". */
export function ThemeToggle({ className }: { className?: string } = {}) {
  const [pref, setPref] = useThemePreference();
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % OPTIONS.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (index - 1 + OPTIONS.length) % OPTIONS.length;
    else return;
    event.preventDefault();
    setPref(OPTIONS[next]!.value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn("inline-flex items-center gap-0.5 rounded-md border border-line bg-sunken p-0.5", className)}
    >
      {OPTIONS.map((option, index) => {
        const selected = pref === option.value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            tabIndex={selected ? 0 : -1}
            onClick={() => setPref(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "focus-ring inline-flex size-6 items-center justify-center rounded transition-colors duration-120",
              selected ? "bg-surface text-ink shadow-xs" : "text-ink-muted hover:text-ink",
            )}
          >
            <Icon aria-hidden className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
