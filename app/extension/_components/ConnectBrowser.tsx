"use client";

import * as React from "react";
import { CheckCircle2, PlugZap } from "lucide-react";
import { Button } from "@/components/ui";
import { requestJson } from "./request";

type ChromeRuntime = {
  sendMessage: (extensionId: string, message: unknown, callback: (response: unknown) => void) => void;
  lastError?: { message?: string };
};

function runtime(): ChromeRuntime | null {
  const chromeGlobal = (globalThis as unknown as { chrome?: { runtime?: ChromeRuntime } }).chrome;
  return chromeGlobal?.runtime && typeof chromeGlobal.runtime.sendMessage === "function" ? chromeGlobal.runtime : null;
}

function send<T>(extensionId: string, message: unknown): Promise<T | null> {
  const rt = runtime();
  if (!rt) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      rt.sendMessage(extensionId, message, (response) => {
        // Reading lastError marks it handled; a missing extension lands here.
        if (rt.lastError) resolve(null);
        else resolve((response as T) ?? null);
      });
    } catch {
      resolve(null);
    }
  });
}

type State =
  | { kind: "checking" }
  | { kind: "missing" }
  | { kind: "ready"; connected: boolean }
  | { kind: "connecting" }
  | { kind: "done"; workspace: string | null }
  | { kind: "error"; message: string };

/**
 * "Connect this browser": when the extension (with this deployment in its
 * externally_connectable list) is installed, creates a token and hands it to
 * the extension directly, so nothing has to be copied or pasted.
 */
export function ConnectBrowser({ extensionId, appUrl }: { extensionId: string; appUrl: string }) {
  const [state, setState] = React.useState<State>({ kind: "checking" });

  React.useEffect(() => {
    let cancelled = false;
    void send<{ ok?: boolean; connected?: boolean }>(extensionId, { type: "bm:ping" }).then((res) => {
      if (cancelled) return;
      setState(res?.ok ? { kind: "ready", connected: Boolean(res.connected) } : { kind: "missing" });
    });
    return () => {
      cancelled = true;
    };
  }, [extensionId]);

  async function connect() {
    setState({ kind: "connecting" });
    const created = await requestJson<{ token: string }>("/api/extension/tokens", {
      method: "POST",
      body: { name: `This browser, ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` },
    });
    if (!created.ok) {
      setState({ kind: "error", message: created.error });
      return;
    }
    const res = await send<{ ok?: boolean; workspace?: string | null; error?: string }>(extensionId, {
      type: "bm:connect",
      token: created.data.token,
      server: appUrl,
    });
    if (res?.ok) setState({ kind: "done", workspace: res.workspace ?? null });
    else setState({ kind: "error", message: res?.error ?? "The extension did not answer. Reload this page and try again." });
  }

  if (state.kind === "checking" || state.kind === "missing") return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-sunken px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-sm" aria-live="polite">
        {state.kind === "done" ? (
          <p className="flex items-center gap-2 font-medium text-ink">
            <CheckCircle2 aria-hidden className="size-4 text-success" />
            Connected{state.workspace ? ` to ${state.workspace}` : ""}. Clips from this browser go to your inbox.
          </p>
        ) : state.kind === "error" ? (
          <p className="text-danger-ink">{state.message}</p>
        ) : (
          <>
            <p className="font-medium text-ink">
              {state.kind === "ready" && state.connected ? "The extension is installed and connected" : "The extension is installed in this browser"}
            </p>
            <p className="text-ink-muted">Connect it to this workspace in one click. No token to copy.</p>
          </>
        )}
      </div>
      {state.kind !== "done" ? (
        <Button
          variant="primary"
          leftIcon={<PlugZap />}
          onClick={() => void connect()}
          loading={state.kind === "connecting"}
          className="shrink-0"
        >
          {state.kind === "ready" && state.connected ? "Reconnect this browser" : "Connect this browser"}
        </Button>
      ) : null}
    </div>
  );
}
