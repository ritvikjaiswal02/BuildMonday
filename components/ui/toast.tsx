"use client";

import * as React from "react";
import { Toaster as Sonner, toast } from "sonner";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { Spinner } from "./spinner";

export { toast };

/**
 * Sonner styled with the design tokens. Follows the `dark` class on <html>
 * so it matches the in-app theme toggle, not just the OS preference.
 */
export function Toaster() {
  const [theme, setTheme] = React.useState<"light" | "dark">("light");

  React.useEffect(() => {
    const root = document.documentElement;
    const sync = () => setTheme(root.classList.contains("dark") ? "dark" : "light");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      gap={8}
      visibleToasts={4}
      offset={16}
      mobileOffset={16}
      containerAriaLabel="Notifications"
      style={{ zIndex: 70 }}
      icons={{
        success: <CheckCircle2 className="size-4 text-success" aria-hidden />,
        error: <XCircle className="size-4 text-danger" aria-hidden />,
        warning: <AlertTriangle className="size-4 text-warning" aria-hidden />,
        info: <Info className="size-4 text-brand" aria-hidden />,
        loading: <Spinner size="sm" className="text-ink-muted" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "group pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-line bg-surface p-3 pr-4 text-sm text-ink shadow-md sm:w-[356px]",
          title: "font-medium text-ink",
          description: "mt-0.5 text-sm text-ink-muted",
          icon: "mt-0.5 flex size-4 shrink-0 items-center justify-center",
          content: "min-w-0 flex-1",
          actionButton:
            "focus-ring ml-auto h-[30px] shrink-0 rounded-md bg-brand px-2.5 text-sm font-medium text-on-brand hover:bg-brand-hover",
          cancelButton:
            "focus-ring ml-auto h-[30px] shrink-0 rounded-md border border-line-strong bg-surface px-2.5 text-sm font-medium text-ink hover:bg-sunken",
          closeButton:
            "focus-ring !border-line !bg-surface !text-ink-muted hover:!text-ink",
        },
      }}
    />
  );
}
