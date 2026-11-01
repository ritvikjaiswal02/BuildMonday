"use client";

import * as React from "react";
import { MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui";

interface BuildMondayWidgetApi {
  open: () => void;
  close: () => void;
  toggle: () => void;
  destroy: () => void;
}

declare global {
  interface Window {
    BuildMonday?: BuildMondayWidgetApi;
  }
}

/** Mounts the real widget script with the demo key and removes it on navigation. */
export function DemoWidget() {
  React.useEffect(() => {
    const script = document.createElement("script");
    script.src = "/widget.js";
    script.async = true;
    script.dataset.key = "demo";
    document.body.appendChild(script);
    return () => {
      window.BuildMonday?.destroy();
      script.remove();
    };
  }, []);
  return null;
}

/** Opens the widget once the script has loaded; disabled until then. */
export function OpenWidgetButton() {
  const [state, setState] = React.useState<"loading" | "ready" | "failed">("loading");

  React.useEffect(() => {
    if (window.BuildMonday) {
      setState("ready");
      return;
    }
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (window.BuildMonday) {
        setState("ready");
        window.clearInterval(timer);
      } else if (tries > 50) {
        setState("failed");
        window.clearInterval(timer);
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="primary"
        size="lg"
        leftIcon={<MessageSquareText />}
        loading={state === "loading"}
        disabled={state !== "ready"}
        onClick={() => window.BuildMonday?.open()}
      >
        {state === "loading" ? "Loading the widget" : "Open the widget"}
      </Button>
      {state === "failed" ? (
        <p role="alert" className="text-xs text-danger">
          The widget did not load. Check your connection and reload the page.
        </p>
      ) : null}
    </div>
  );
}
