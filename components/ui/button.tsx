import * as React from "react";
import { Slot, Slottable } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

export const buttonVariants = cva(
  [
    "focus-ring relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium",
    "transition-[background-color,border-color,color,box-shadow] duration-120 ease-standard",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    "[&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary: "bg-brand text-on-brand shadow-xs hover:bg-brand-hover active:bg-brand-hover",
        secondary:
          "border border-line-strong bg-surface text-ink shadow-xs hover:bg-sunken active:bg-sunken",
        outline: "border border-line-strong bg-transparent text-ink hover:bg-sunken",
        ghost: "bg-transparent text-ink-secondary hover:bg-sunken hover:text-ink",
        danger: "bg-danger text-on-brand shadow-xs hover:bg-danger/90",
        link: "h-auto rounded-sm px-0 text-brand underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-[30px] px-2.5 text-sm",
        md: "h-9 px-3.5 text-sm",
        lg: "h-11 px-5 text-base",
        icon: "size-9 p-0",
      },
    },
    compoundVariants: [
      { variant: "link", size: ["sm", "md", "lg"], className: "h-auto px-0" },
    ],
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  variant?: "primary" | "secondary" | "ghost" | "outline" | "danger" | "link";
  size?: "sm" | "md" | "lg" | "icon";
  /** Shows a spinner in place of the left icon, sets aria-busy and disables the button. */
  loading?: boolean;
  /** Render the single child element (e.g. a Next `Link`) with button styling. */
  asChild?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant,
    size,
    loading = false,
    asChild = false,
    leftIcon,
    rightIcon,
    disabled,
    children,
    type,
    ...props
  },
  ref,
) {
  const Comp = asChild ? Slot : "button";
  const isDisabled = disabled || loading;
  const leading = loading ? <Spinner size="sm" /> : leftIcon;

  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      aria-busy={loading || undefined}
      {...(asChild
        ? { "aria-disabled": isDisabled || undefined }
        : { disabled: isDisabled, type: type ?? "button" })}
      {...props}
    >
      {leading}
      <Slottable>{children}</Slottable>
      {rightIcon}
    </Comp>
  );
});
