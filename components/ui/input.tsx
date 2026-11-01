import * as React from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shared field chrome for Input, Textarea and Select. */
export const fieldBase = cn(
  "w-full rounded-md border border-line-strong bg-surface text-sm text-ink shadow-xs",
  "transition-[border-color,box-shadow] duration-120 ease-standard",
  "placeholder:text-ink-muted",
  "hover:border-ink-faint",
  "focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25",
  "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-muted disabled:opacity-70",
  "read-only:bg-sunken",
);

export const fieldInvalid =
  "border-danger hover:border-danger focus-visible:border-danger focus-visible:ring-danger/25";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  leftIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, leftIcon, type = "text", ...props },
  ref,
) {
  const input = (
    <input
      ref={ref}
      type={type}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      className={cn(
        fieldBase,
        "h-9 px-3",
        leftIcon && "pl-9",
        type === "search" && "[&::-webkit-search-cancel-button]:hidden",
        invalid && fieldInvalid,
        className,
      )}
      {...props}
    />
  );

  if (!leftIcon) return input;

  return (
    <div className="relative w-full">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-muted [&_svg]:size-4"
      >
        {leftIcon}
      </span>
      {input}
    </div>
  );
});

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  /** Renders a muted "Optional" after the label text. */
  optional?: boolean;
}

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { className, optional, children, ...props },
  ref,
) {
  return (
    <label
      ref={ref}
      className={cn("inline-flex items-baseline gap-1.5 text-sm font-medium text-ink", className)}
      {...props}
    >
      {children}
      {optional ? <span className="text-xs font-normal text-ink-muted">Optional</span> : null}
    </label>
  );
});

export interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: React.ReactNode;
  error?: string | null;
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Label above, control, hint below, error below the hint.
 * Wires `aria-describedby` (`${htmlFor}-hint`, `${htmlFor}-error`) and `aria-invalid` onto a single child control.
 */
export function Field({ label, htmlFor, hint, error, optional, children, className }: FieldProps) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control = React.isValidElement<Record<string, unknown>>(children)
    ? React.cloneElement(children, {
        "aria-describedby":
          [children.props["aria-describedby"] as string | undefined, describedBy]
            .filter(Boolean)
            .join(" ") || undefined,
        ...(error
          ? typeof children.type === "string"
            ? { "aria-invalid": true }
            : { "aria-invalid": true, invalid: children.props.invalid ?? true }
          : {}),
      })
    : children;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} optional={optional}>
        {label}
      </Label>
      {control}
      {hint ? (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-xs text-danger">
          <AlertCircle aria-hidden className="mt-px size-3.5 shrink-0" />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
