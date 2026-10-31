"use client";

import * as React from "react";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  ConfirmDialog,
  CopyField,
  Dialog,
  DialogContent,
  EmptyState,
  Field,
  Input,
  toast,
} from "@/components/ui";
import { formatRelativeTime } from "@/lib/utils";
import type { ExtensionTokenRow } from "@/app/api/extension/_lib/service";
import { requestJson } from "./request";
import { Section } from "./Section";

const MAX_TOKENS = 10;

export interface TokenManagerProps {
  appUrl: string;
  initialTokens: ExtensionTokenRow[];
}

export function TokenManager({ appUrl, initialTokens }: TokenManagerProps) {
  const [tokens, setTokens] = React.useState(initialTokens);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [revoking, setRevoking] = React.useState<ExtensionTokenRow | null>(null);

  React.useEffect(() => setTokens(initialTokens), [initialTokens]);

  const atLimit = tokens.length >= MAX_TOKENS;

  async function revoke(token: ExtensionTokenRow) {
    const res = await requestJson<{ ok: true }>(`/api/extension/tokens/${token.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(res.error);
      throw new Error(res.error);
    }
    setTokens((list) => list.filter((t) => t.id !== token.id));
    toast.success(`Revoked ${token.name}. The extension using it is disconnected.`);
  }

  const createButton = (
    <Button variant="primary" leftIcon={<Plus />} onClick={() => setCreateOpen(true)} disabled={atLimit}>
      Create token
    </Button>
  );

  return (
    <>
      <Section
        id="tokens"
        title="Tokens"
        description="Each token connects one browser to this workspace. Revoke a token to disconnect that browser right away."
        actions={tokens.length > 0 ? createButton : null}
        flush
      >
        {tokens.length === 0 ? (
          <EmptyState headingLevel={3}
            icon={KeyRound}
            title="No tokens yet"
            description="Create a token to connect the Chrome extension to this workspace. You will see it once, so have the extension's settings open."
            action={createButton}
          />
        ) : (
          <ul className="divide-y divide-line">
            {tokens.map((t) => (
              <li key={t.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-line bg-sunken text-ink-muted">
                    <KeyRound aria-hidden className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-ink">{t.name}</p>
                      <span className="font-mono text-xs text-ink-muted">{t.prefix}&hellip;</span>
                      {!t.mine && t.owner ? (
                        <Badge tone="neutral" variant="outline" size="sm">
                          {t.owner.name ?? t.owner.email}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      <span>Created {formatRelativeTime(t.createdAt)}</span>
                      <span aria-hidden>, </span>
                      <span>{t.lastUsedAt ? `last used ${formatRelativeTime(t.lastUsedAt)}` : "not used yet"}</span>
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<Trash2 />}
                  className="self-start text-danger hover:bg-danger-soft hover:text-danger-ink sm:self-center"
                  onClick={() => setRevoking(t)}
                  aria-label={`Revoke ${t.name}`}
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
        {atLimit ? (
          <div className="border-t border-line px-4 py-3 sm:px-5">
            <p className="text-sm text-ink-muted">
              This workspace has {MAX_TOKENS} active tokens. Revoke one you no longer use to create another.
            </p>
          </div>
        ) : null}
      </Section>

      <CreateTokenDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        appUrl={appUrl}
        onCreated={(row) => setTokens((list) => [row, ...list])}
      />

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
        title={revoking ? `Revoke ${revoking.name}?` : "Revoke token?"}
        description="The extension using this token stops working right away. Create a new token to reconnect it."
        confirmLabel="Revoke token"
        tone="danger"
        onConfirm={async () => {
          if (revoking) await revoke(revoking);
        }}
      />
    </>
  );
}

function defaultTokenName(): string {
  if (typeof navigator === "undefined") return "Chrome extension";
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Edge" : /Brave/.test(ua) ? "Brave" : /Chrome\//.test(ua) ? "Chrome" : "Browser";
  const os = /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : /CrOS/.test(ua) ? "ChromeOS" : "";
  return os ? `${browser} on ${os}` : browser;
}

function CreateTokenDialog({
  open,
  onOpenChange,
  appUrl,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appUrl: string;
  onCreated: (row: ExtensionTokenRow) => void;
}) {
  const [name, setName] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName(defaultTokenName());
      setError(null);
      setFieldError(null);
      setCreated(null);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setFieldError("Give the token a name, like the browser it is for.");
      return;
    }
    setFieldError(null);
    setError(null);
    setPending(true);
    const res = await requestJson<{ token: string; record: ExtensionTokenRow }>("/api/extension/tokens", {
      method: "POST",
      body: { name: trimmed },
    });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCreated(res.data.token);
    onCreated(res.data.record);
    toast.success("Token created. Copy it now; you will not see it again.");
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      {created ? (
        <DialogContent
          title="Copy your token"
          description="Paste it into the extension's settings with the server address below."
          footer={
            <Button variant="primary" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          }
        >
          <div className="space-y-4">
            <Callout tone="warning" title="You will not see this token again">
              Copy it now. If you lose it, revoke it and create a new one.
            </Callout>
            <CopyField value={created} label="Token" mono />
            <CopyField value={appUrl} label="Server address" mono />
          </div>
        </DialogContent>
      ) : (
        <DialogContent
          title="Create a token"
          description="Name it after the browser or computer it is for, so you know which one to revoke later."
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" form="create-token-form" loading={pending}>
                Create token
              </Button>
            </>
          }
        >
          <form id="create-token-form" onSubmit={submit} noValidate className="space-y-4">
            <Field label="Name" htmlFor="token-name" error={fieldError} hint="Up to 60 characters.">
              <Input
                id="token-name"
                value={name}
                maxLength={60}
                autoComplete="off"
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </Field>
            {error ? <Callout tone="danger">{error}</Callout> : null}
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
