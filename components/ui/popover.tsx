"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

export interface PopoverContentProps
  extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
  align?: "start" | "center" | "end";
  className?: string;
}

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(function PopoverContent({ className, align = "center", sideOffset = 6, ...props }, ref) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          "z-popover w-72 max-w-[calc(100vw-16px)] rounded-lg border border-line bg-surface p-4 text-sm text-ink shadow-md outline-none",
          "data-[state=open]:animate-scale-in data-[state=closed]:animate-fade-out",
          "data-[side=bottom]:origin-top data-[side=top]:origin-bottom",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
});
