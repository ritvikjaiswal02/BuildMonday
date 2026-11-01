"use client";

import * as React from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip } from "./tooltip";

export interface CopyFieldProps {
  value: string;
  label?: string;
  multiline?: boolean;
  mono?: boolean;
  /** Masks the value until the user reveals it. Copy still copies the real value. */
  secret?: boolean;
  onCopied?: () => void;
  className?: string;
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path (e.g. insecure context, denied permission).
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

/** Read-only value with a copy button that confirms "Copied" for 1.5 s. */
export function CopyField({
  value,
  label,
  multiline = false,
  mono = true,
  secret = false,
  onCopied,
  className,
}: CopyFieldProps) {
  const id = React.useId();
  const [copied, setCopied] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [revealed, setRevealed] = React.useState(!secret);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    const ok = await writeClipboard(value);
    setFailed(!ok);
    setCopied(ok);
    if (ok) onCopied?.();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setCopied(false);
      setFailed(false);
    }, 1500);
  }

  const shown = revealed ? value : maskSecret(value);
  const valueClass = cn(
    "min-w-0 flex-1 bg-transparent text-sm text-ink outline-none",
    mono && "font-mono text-[12.5px]",
  );

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
      ) : null}
      <div
        className={cn(
          "flex gap-2 rounded-md border border-line-strong bg-sunken pl-3 pr-1.5",
          multiline ? "items-start py-1.5" : "h-9 items-center",
        )}
      >
        {multiline ? (
          <textarea
            id={id}
            readOnly
            value={shown}
            rows={Math.min(8, Math.max(2, shown.split("\n").length))}
            onFocus={(e) => e.currentTarget.select()}
            className={cn(valueClass, "scrollbar-thin resize-none whitespace-pre py-1 leading-5")}
            spellCheck={false}
          />
        ) : (
          <input
            id={id}
            readOnly
            value={shown}
            onFocus={(e) => e.currentTarget.select()}
            className={cn(valueClass, "truncate")}
            spellCheck={false}
            aria-label={label ? undefined : "Value to copy"}
          />
        )}
        <div className="flex shrink-0 items-center gap-1">
          {secret ? (
            <Tooltip content={revealed ? "Hide" : "Show"}>
              <button
                type="button"
                onClick={() => setRevealed((r) => !r)}
                aria-label={revealed ? "Hide value" : "Show value"}
                aria-pressed={revealed}
                className="focus-ring inline-flex size-7 items-center justify-center rounded text-ink-muted transition-colors duration-120 hover:bg-surface hover:text-ink"
              >
                {revealed ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
              </button>
            </Tooltip>
          ) : null}
          <button
            type="button"
            onClick={copy}
            className={cn(
              "focus-ring inline-flex h-7 items-center gap-1.5 rounded border border-line bg-surface px-2 text-xs font-medium",
              "transition-colors duration-120 hover:bg-canvas",
              copied ? "text-success" : failed ? "text-danger" : "text-ink-secondary",
            )}
          >
            {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            <span aria-live="polite">{copied ? "Copied" : failed ? "Copy failed" : "Copy"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function maskSecret(value: string): string {
  if (value.length <= 12) return "•".repeat(value.length);
  return `${value.slice(0, 7)}${"•".repeat(Math.min(24, value.length - 11))}${value.slice(-4)}`;
}
