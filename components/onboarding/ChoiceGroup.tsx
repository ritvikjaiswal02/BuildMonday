"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface ChoiceGroupProps<T extends string> {
  value: T | null;
  onChange: (value: T) => void;
  options: Array<ChoiceOption<T>>;
  /** "pills" wraps compact options in a row; "list" stacks options with descriptions. */
  variant?: "pills" | "list";
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-label"?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Single-choice radiogroup. Arrow keys move and select (roving tabindex);
 * when nothing is selected yet the first option takes focus.
 */
export function ChoiceGroup<T extends string>({
  value,
  onChange,
  options,
  variant = "pills",
  disabled = false,
  className,
  ...aria
}: ChoiceGroupProps<T>) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const selectedIndex = options.findIndex((o) => o.value === value);
  const focusIndex = selectedIndex >= 0 ? selectedIndex : (enabled[0] ?? 0);

  function move(from: number, delta: number) {
    if (enabled.length === 0) return;
    const pos = enabled.indexOf(from);
    const nextPos = (pos + delta + enabled.length) % enabled.length;
    const index = enabled[nextPos];
    onChange(options[index].value);
    refs.current[index]?.focus();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        move(index, 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        move(index, -1);
        break;
      case "Home":
        event.preventDefault();
        move(enabled[0] ?? 0, 0);
        break;
      case "End":
        event.preventDefault();
        move(enabled[enabled.length - 1] ?? 0, 0);
        break;
      default:
    }
  }

  return (
    <div
      role="radiogroup"
      {...aria}
      aria-disabled={disabled || undefined}
      className={cn(
        variant === "pills" ? "flex flex-wrap gap-2" : "divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface",
        className,
      )}
    >
      {options.map((option, index) => {
        const selected = index === selectedIndex;
        const isDisabled = disabled || option.disabled;
        const common = {
          ref: (node: HTMLButtonElement | null) => {
            refs.current[index] = node;
          },
          type: "button" as const,
          role: "radio",
          "aria-checked": selected,
          tabIndex: index === focusIndex && !isDisabled ? 0 : -1,
          disabled: isDisabled,
          onClick: () => onChange(option.value),
          onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => onKeyDown(event, index),
        };

        if (variant === "list") {
          return (
            <button
              key={option.value}
              {...common}
              className={cn(
                "focus-ring flex w-full items-start gap-3 px-4 py-3 text-left",
                "transition-colors duration-120 ease-standard",
                "focus-visible:ring-inset focus-visible:ring-offset-0",
                selected ? "bg-brand-soft/60" : "hover:bg-sunken",
                isDisabled && "cursor-not-allowed opacity-60",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border",
                  selected ? "border-brand bg-brand" : "border-line-strong bg-surface",
                )}
              >
                {selected ? <span className="size-1.5 rounded-full bg-on-brand" /> : null}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{option.label}</span>
                {option.description ? (
                  <span className="mt-0.5 block text-sm text-ink-muted">{option.description}</span>
                ) : null}
              </span>
            </button>
          );
        }

        return (
          <button
            key={option.value}
            {...common}
            className={cn(
              "focus-ring inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium",
              "transition-[background-color,border-color,color] duration-120 ease-standard",
              selected
                ? "border-brand bg-brand-soft text-brand-ink"
                : "border-line-strong bg-surface text-ink-secondary hover:border-ink-faint hover:text-ink",
              isDisabled && "cursor-not-allowed opacity-60",
            )}
          >
            {selected ? <Check aria-hidden className="size-3.5" /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
