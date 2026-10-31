"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn, formatNumber } from "@/lib/utils";

type TabsVariant = "underline" | "pill";

const TabsVariantContext = React.createContext<TabsVariant>("underline");

export const Tabs = TabsPrimitive.Root;

export interface TabsListProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> {
  variant?: TabsVariant;
}

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(function TabsList({ className, variant = "underline", ...props }, ref) {
  return (
    <TabsVariantContext.Provider value={variant}>
      <TabsPrimitive.List
        ref={ref}
        className={cn(
          "scrollbar-none flex max-w-full items-center overflow-x-auto",
          variant === "underline" && "gap-5 border-b border-line",
          variant === "pill" && "inline-flex w-fit gap-1 rounded-md bg-sunken p-1",
          className,
        )}
        {...props}
      />
    </TabsVariantContext.Provider>
  );
});

export interface TabsTriggerProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  /** Renders a count chip after the label. */
  count?: number;
}

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(function TabsTrigger({ className, count, children, ...props }, ref) {
  const variant = React.useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "focus-ring group inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-medium text-ink-muted",
        "transition-colors duration-120 ease-standard hover:text-ink disabled:pointer-events-none disabled:opacity-50",
        "[&_svg]:size-4",
        variant === "underline" &&
          "relative -mb-px h-10 rounded-sm border-b-2 border-transparent data-[state=active]:border-brand data-[state=active]:text-ink",
        variant === "pill" &&
          "h-7 rounded px-3 data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-xs",
        className,
      )}
      {...props}
    >
      {children}
      {typeof count === "number" ? (
        <span
          className={cn(
            "inline-flex h-5 min-w-5 items-center justify-center rounded px-1.5 text-xs font-medium tabular-nums",
            "bg-sunken text-ink-muted group-data-[state=active]:bg-brand-soft group-data-[state=active]:text-brand-ink",
            variant === "pill" && "bg-surface group-data-[state=active]:bg-sunken group-data-[state=active]:text-ink-secondary",
          )}
        >
          {formatNumber(count)}
        </span>
      ) : null}
    </TabsPrimitive.Trigger>
  );
});

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn("focus-ring mt-5 rounded-sm data-[state=active]:animate-fade-in", className)}
      {...props}
    />
  );
});
