"use client";

import * as React from "react";
import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;
export const DropdownMenuGroup = MenuPrimitive.Group;

export const menuSurface = cn(
  "z-popover min-w-[200px] overflow-hidden rounded-lg border border-line bg-surface p-1 text-sm text-ink shadow-md",
  "data-[state=open]:animate-scale-in data-[state=closed]:animate-fade-out",
  "data-[side=bottom]:origin-top data-[side=top]:origin-bottom",
);

export interface DropdownMenuContentProps
  extends React.ComponentPropsWithoutRef<typeof MenuPrimitive.Content> {
  align?: "start" | "end";
}

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Content>,
  DropdownMenuContentProps
>(function DropdownMenuContent({ className, align = "start", sideOffset = 6, ...props }, ref) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(menuSurface, "max-h-[min(420px,var(--radix-dropdown-menu-content-available-height))] overflow-y-auto", className)}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
});

const itemBase = cn(
  "relative flex h-8 cursor-default select-none items-center gap-2 rounded px-2 text-sm outline-none",
  "transition-colors duration-120",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  "[&_svg]:size-4 [&_svg]:shrink-0",
);

export interface DropdownMenuItemProps
  extends React.ComponentPropsWithoutRef<typeof MenuPrimitive.Item> {
  icon?: LucideIcon;
  shortcut?: string;
  tone?: "default" | "danger";
}

export const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Item>,
  DropdownMenuItemProps
>(function DropdownMenuItem(
  { className, icon: Icon, shortcut, tone = "default", asChild, children, ...props },
  ref,
) {
  const decorate = (content: React.ReactNode) => (
    <>
      {Icon ? <Icon aria-hidden className={tone === "danger" ? "" : "text-ink-muted"} /> : null}
      <span
        className={
          typeof content === "string" || typeof content === "number"
            ? "min-w-0 flex-1 truncate"
            : "flex min-w-0 flex-1 items-center gap-2"
        }
      >
        {content}
      </span>
      {shortcut ? (
        <span className="ml-auto pl-4 font-mono text-xs text-ink-faint" aria-hidden>
          {shortcut}
        </span>
      ) : null}
    </>
  );

  // With asChild (e.g. a Next Link), inject the icon and layout into the child element itself.
  const body =
    asChild && React.isValidElement<{ children?: React.ReactNode }>(children)
      ? React.cloneElement(children, undefined, decorate(children.props.children))
      : decorate(children);

  return (
    <MenuPrimitive.Item
      ref={ref}
      asChild={asChild}
      className={cn(
        itemBase,
        tone === "danger"
          ? "text-danger data-[highlighted]:bg-danger-soft data-[highlighted]:text-danger-ink"
          : "text-ink-secondary data-[highlighted]:bg-sunken data-[highlighted]:text-ink",
        className,
      )}
      {...props}
    >
      {body}
    </MenuPrimitive.Item>
  );
});

export const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.CheckboxItem>
>(function DropdownMenuCheckboxItem({ className, children, ...props }, ref) {
  return (
    <MenuPrimitive.CheckboxItem
      ref={ref}
      className={cn(
        itemBase,
        "pl-8 text-ink-secondary data-[highlighted]:bg-sunken data-[highlighted]:text-ink",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 inline-flex size-4 items-center justify-center">
        <MenuPrimitive.ItemIndicator>
          <Check aria-hidden className="text-brand" />
        </MenuPrimitive.ItemIndicator>
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </MenuPrimitive.CheckboxItem>
  );
});

export const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;

export const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.RadioItem>
>(function DropdownMenuRadioItem({ className, children, ...props }, ref) {
  return (
    <MenuPrimitive.RadioItem
      ref={ref}
      className={cn(
        itemBase,
        "pl-8 text-ink-secondary data-[highlighted]:bg-sunken data-[highlighted]:text-ink data-[state=checked]:text-ink",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 inline-flex size-4 items-center justify-center">
        <MenuPrimitive.ItemIndicator>
          <Check aria-hidden className="text-brand" />
        </MenuPrimitive.ItemIndicator>
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </MenuPrimitive.RadioItem>
  );
});

export const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Label>
>(function DropdownMenuLabel({ className, ...props }, ref) {
  return (
    <MenuPrimitive.Label
      ref={ref}
      className={cn("px-2 pb-1 pt-2 text-xs font-medium text-ink-muted", className)}
      {...props}
    />
  );
});

export const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof MenuPrimitive.Separator>
>(function DropdownMenuSeparator({ className, ...props }, ref) {
  return <MenuPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-line", className)} {...props} />;
});
