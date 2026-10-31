"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const SIZES = {
  sm: "sm:max-w-[440px]",
  md: "sm:max-w-[560px]",
  lg: "sm:max-w-[760px]",
} as const;

export interface DialogContentProps
  extends Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, "title" | "children"> {
  title: string;
  description?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Keeps the title for screen readers but hides it visually. */
  hideTitle?: boolean;
}

/**
 * Centered dialog on >= 640px, bottom sheet below. Focus is trapped by Radix and restored on close.
 */
export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(function DialogContent(
  { title, description, size = "md", children, footer, hideTitle = false, className, ...props },
  ref,
) {
  const hasBody = React.Children.count(children) > 0;
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className={cn(
          "fixed inset-0 z-dialog bg-ink/40 dark:bg-black/60",
          "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
        )}
      />
      {/* Positioning wrapper: bottom sheet on mobile, centered from 640px. Clicks here count as "outside". */}
      <div className="fixed inset-0 z-dialog flex items-end justify-center sm:items-center sm:p-4">
        <DialogPrimitive.Content
          ref={ref}
          {...(description ? {} : { "aria-describedby": undefined })}
          className={cn(
            "relative flex w-full flex-col bg-surface text-ink shadow-lg outline-none",
            "max-h-[90dvh] rounded-t-xl border-t border-line",
            "data-[state=open]:animate-sheet-in data-[state=closed]:animate-fade-out",
            "sm:max-h-[85dvh] sm:rounded-xl sm:border sm:data-[state=open]:animate-scale-in",
            SIZES[size],
            className,
          )}
          {...props}
        >
          <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line-strong sm:hidden" aria-hidden />
          <div
            className={cn(
              "flex shrink-0 items-start justify-between gap-4 pl-5 pr-12 pt-3 sm:pl-6 sm:pt-5",
              !hasBody && "pb-5",
              hideTitle && "sr-only",
            )}
          >
            <div className="min-w-0 space-y-1">
              <DialogPrimitive.Title className="font-display text-xl font-semibold text-ink">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="text-sm text-ink-secondary">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
          </div>
          <DialogPrimitive.Close
            className={cn(
              "focus-ring absolute right-3 top-3 inline-flex size-8 items-center justify-center rounded-md text-ink-muted",
              "transition-colors duration-120 hover:bg-sunken hover:text-ink sm:right-4 sm:top-4",
            )}
            aria-label="Close"
          >
            <X className="size-4" aria-hidden />
          </DialogPrimitive.Close>
          {hasBody ? (
            <div
              className={cn(
                "scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6",
                hideTitle ? "pt-5" : "pt-4",
              )}
            >
              {children}
            </div>
          ) : null}
          {footer ? <DialogFooter>{footer}</DialogFooter> : null}
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Portal>
  );
});

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col-reverse gap-2 border-t border-line bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:rounded-b-xl sm:px-6",
        "[&>*]:w-full sm:[&>*]:w-auto",
        className,
      )}
      {...props}
    />
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void | Promise<void>;
}

/** Confirmation for destructive or irreversible actions. Shows a spinner while `onConfirm` resolves. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "default",
  onConfirm,
}: ConfirmDialogProps) {
  const [pending, setPending] = React.useState(false);

  async function handleConfirm() {
    try {
      setPending(true);
      await onConfirm();
      onOpenChange(false);
    } catch {
      // The caller reports the error (toast or callout); keep the dialog open so the user can retry.
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent
        title={title}
        description={description}
        size="sm"
        footer={
          <>
            <DialogClose asChild>
              <Button variant="secondary" disabled={pending}>
                {cancelLabel}
              </Button>
            </DialogClose>
            <Button
              variant={tone === "danger" ? "danger" : "primary"}
              loading={pending}
              onClick={handleConfirm}
            >
              {confirmLabel}
            </Button>
          </>
        }
      >
        {null}
      </DialogContent>
    </Dialog>
  );
}
