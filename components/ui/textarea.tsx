"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { fieldBase, fieldInvalid } from "./input";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  /** Grows with its content; cap it with a `max-h-*` class to scroll beyond that. */
  autoGrow?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, autoGrow = false, onChange, rows = 4, ...props },
  forwardedRef,
) {
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null);

  const setRefs = React.useCallback(
    (node: HTMLTextAreaElement | null) => {
      innerRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );

  const resize = React.useCallback(() => {
    const el = innerRef.current;
    if (!el || !autoGrow) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [autoGrow]);

  // Resize when a controlled value changes from outside (e.g. "Load demo").
  useIsomorphicLayoutEffect(() => {
    resize();
  }, [resize, props.value]);

  return (
    <textarea
      ref={setRefs}
      rows={rows}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      onChange={(event) => {
        onChange?.(event);
        resize();
      }}
      className={cn(
        fieldBase,
        "min-h-[80px] px-3 py-2 leading-5 scrollbar-thin",
        autoGrow ? "resize-none overflow-y-auto" : "resize-y",
        invalid && fieldInvalid,
        className,
      )}
      {...props}
    />
  );
});
