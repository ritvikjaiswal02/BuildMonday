"use client";

/**
 * Connect forms for Slack, Linear and GitHub, shared by Settings > Integrations
 * and the onboarding "Notify me" step.
 *
 * When the deployment has the one-click apps configured, the primary action is
 * "Add to Slack", "Connect Linear" or "Install the GitHub App". The paste flows
 * (webhook URL, personal API key, fine-grained token) stay behind an
 * "Advanced" toggle as the fallback.
 *
 * These render no <form>: onboarding already wraps each step in one, and nested
 * forms are invalid. Enter in a field submits the connect action instead.
 */
import * as React from "react";
import { ChevronDown, ExternalLink, KeyRound } from "lucide-react";
import { GitHubGlyph, LinearGlyph, SlackGlyph } from "@/components/brand/logos";
import { apiRequest } from "@/components/settings/api";
import { Button, Callout, Field, Input, Select } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { IntegrationDTO } from "@/lib/db/dto";
import type { IntegrationKind } from "@/lib/db/schema";
import type { PlanErrorBody } from "@/lib/plans";

export type OAuthAvailability = Record<IntegrationKind, boolean>;

export const NO_OAUTH: OAuthAvailability = { slack: false, linear: false, github: false };

export function oauthStartHref(kind: IntegrationKind, returnTo: string): string {
  return `/api/integrations/${kind}/oauth?returnTo=${encodeURIComponent(returnTo)}`;
}

export interface ConnectFormProps {
  existing: IntegrationDTO | null;
  oauth: boolean;
  /** Where the one-click flow sends the browser back to. */
  returnTo: string;
  onConnected: (integration: IntegrationDTO) => void;
  onPlanError?: (plan: PlanErrorBody) => void;
  /** Shows a Cancel button next to the connect action (dialogs). */
  onCancel?: () => void;
  autoFocus?: boolean;
  /** Smaller spacing for inline use. */
  compact?: boolean;
}

function submitOnEnter(run: () => void) {
  return (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      run();
    }
  };
}

function useConnect(kind: IntegrationKind, props: ConnectFormProps) {
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  async function save(body: unknown) {
    setSaving(true);
    setError(null);
    const res = await apiRequest<{ integration: IntegrationDTO }>(`/api/integrations/${kind}`, { method: "PUT", body });
    setSaving(false);
    if (!res.ok) {
      if (res.plan && props.onPlanError) {
        props.onPlanError(res.plan);
        return;
      }
      setError(res.error);
      return;
    }
    props.onConnected(res.data.integration);
  }
  return { saving, error, setError, save };
}

function OneClick({
  kind,
  href,
  label,
  glyph,
  note,
}: {
  kind: IntegrationKind;
  href: string;
  label: string;
  glyph: React.ReactNode;
  note: string;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <Button asChild variant="primary" leftIcon={glyph}>
        <a href={href} data-integration={kind}>
          {label}
        </a>
      </Button>
      <p className="text-xs text-ink-muted">{note}</p>
    </div>
  );
}

function Advanced({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="focus-ring inline-flex items-center gap-1 rounded-sm text-xs font-medium text-ink-secondary hover:text-ink"
    >
      <ChevronDown
        aria-hidden
        className={cn("size-3.5 transition-transform duration-120 ease-standard", open && "rotate-180")}
      />
      {label}
    </button>
  );
}

function Actions({
  onCancel,
  saving,
  disabled,
  onSubmit,
  label,
  busyLabel,
}: {
  onCancel?: () => void;
  saving: boolean;
  disabled: boolean;
  onSubmit: () => void;
  label: string;
  busyLabel: string;
}) {
  return (
    <div className={cn("flex flex-col-reverse gap-2 sm:flex-row", onCancel ? "sm:justify-end" : "sm:justify-start")}>
      {onCancel ? (
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      ) : null}
      <Button variant={onCancel ? "primary" : "secondary"} onClick={onSubmit} loading={saving} disabled={disabled}>
        {saving ? busyLabel : label}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slack
// ---------------------------------------------------------------------------

export function SlackConnectForm(props: ConnectFormProps) {
  const { existing, oauth, returnTo, onCancel, autoFocus, compact } = props;
  const [manual, setManual] = React.useState(!oauth);
  const [webhookUrl, setWebhookUrl] = React.useState("");
  const [channelName, setChannelName] = React.useState(
    existing?.config.kind === "slack" ? (existing.config.channelName ?? "") : "",
  );
  const { saving, error, save } = useConnect("slack", props);
  const id = React.useId();
  const canSubmit = webhookUrl.trim().length > 0;
  const submit = () => {
    if (canSubmit && !saving) void save({ webhookUrl: webhookUrl.trim(), channelName: channelName.trim() || null });
  };

  return (
    <div className={compact ? "space-y-3" : "space-y-5"}>
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {oauth ? (
        <OneClick
          kind="slack"
          href={oauthStartHref("slack", returnTo)}
          label={existing ? "Reconnect with Slack" : "Add to Slack"}
          glyph={<SlackGlyph />}
          note="Pick a channel in Slack. We post a short test message there."
        />
      ) : null}
      {oauth ? (
        <Advanced open={manual} onToggle={() => setManual((v) => !v)} label="Advanced: paste a webhook URL" />
      ) : null}
      {manual ? (
        <div className={compact ? "space-y-3" : "space-y-4"}>
          <Field
            label="Incoming webhook URL"
            htmlFor={`${id}-webhook`}
            hint={
              <>
                In Slack, create an app with Incoming Webhooks on, add it to a channel and copy the URL.{" "}
                <a
                  href="https://api.slack.com/messaging/webhooks"
                  target="_blank"
                  rel="noreferrer"
                  className="focus-ring inline-flex items-center gap-1 rounded-sm font-medium text-brand hover:underline"
                >
                  Slack&apos;s guide
                  <ExternalLink aria-hidden className="size-3" />
                </a>
              </>
            }
          >
            <Input
              id={`${id}-webhook`}
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              onKeyDown={submitOnEnter(submit)}
              placeholder="https://hooks.slack.com/services/..."
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-xs"
              autoFocus={autoFocus && !oauth}
            />
          </Field>
          {!compact ? (
            <Field
              label="Channel name"
              htmlFor={`${id}-channel`}
              optional
              hint="Only shown here, so you remember where alerts go."
            >
              <Input
                id={`${id}-channel`}
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                onKeyDown={submitOnEnter(submit)}
                placeholder="#product-feedback"
              />
            </Field>
          ) : null}
          <Actions
            onCancel={onCancel}
            saving={saving}
            disabled={!canSubmit}
            onSubmit={submit}
            label="Connect Slack"
            busyLabel="Sending a test message…"
          />
        </div>
      ) : onCancel ? (
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Linear
// ---------------------------------------------------------------------------

type Team = { id: string; name: string; key: string };

export function LinearConnectForm(props: ConnectFormProps) {
  const { existing, oauth, returnTo, onCancel, autoFocus, compact } = props;
  const [manual, setManual] = React.useState(!oauth);
  const [apiKey, setApiKey] = React.useState("");
  const [teams, setTeams] = React.useState<Team[] | null>(null);
  const [teamId, setTeamId] = React.useState(existing?.config.kind === "linear" ? existing.config.teamId : "");
  const [labelName, setLabelName] = React.useState(
    existing?.config.kind === "linear" ? (existing.config.labelName ?? "") : "",
  );
  const [loadingTeams, setLoadingTeams] = React.useState(false);
  const { saving, error, setError, save } = useConnect("linear", props);
  const id = React.useId();

  async function loadTeams() {
    if (apiKey.trim().length < 10 || loadingTeams) return;
    setLoadingTeams(true);
    setError(null);
    const res = await apiRequest<{ teams: Team[] }>("/api/integrations/linear/teams", {
      method: "POST",
      body: { apiKey: apiKey.trim() },
    });
    setLoadingTeams(false);
    if (!res.ok) {
      setError(res.error);
      setTeams(null);
      return;
    }
    setTeams(res.data.teams);
    if (res.data.teams.length > 0 && !res.data.teams.some((t) => t.id === teamId)) setTeamId(res.data.teams[0].id);
    if (res.data.teams.length === 0) setError("This API key cannot see any teams.");
  }

  const canSubmit = apiKey.trim().length > 0 && Boolean(teamId) && Boolean(teams);
  const submit = () => {
    if (canSubmit && !saving) void save({ apiKey: apiKey.trim(), teamId, labelName: labelName.trim() || null });
  };

  return (
    <div className={compact ? "space-y-3" : "space-y-5"}>
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {oauth ? (
        <OneClick
          kind="linear"
          href={oauthStartHref("linear", returnTo)}
          label={existing ? "Reconnect Linear" : "Connect Linear"}
          glyph={<LinearGlyph />}
          note="Approve BuildMonday in Linear, then pick the team issues go to."
        />
      ) : null}
      {oauth ? (
        <Advanced open={manual} onToggle={() => setManual((v) => !v)} label="Advanced: use a personal API key" />
      ) : null}
      {manual ? (
        <div className={compact ? "space-y-3" : "space-y-4"}>
          <Field
            label="Personal API key"
            htmlFor={`${id}-key`}
            hint="In Linear, open Settings, then Security & access, and create a personal API key. It is stored encrypted."
          >
            <div className="flex gap-2">
              <Input
                id={`${id}-key`}
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTeams(null);
                }}
                onKeyDown={submitOnEnter(() => (teams ? submit() : void loadTeams()))}
                placeholder="lin_api_..."
                autoComplete="off"
                leftIcon={<KeyRound />}
                autoFocus={autoFocus && !oauth}
              />
              <Button
                variant="secondary"
                onClick={() => void loadTeams()}
                loading={loadingTeams}
                disabled={apiKey.trim().length < 10}
                className="shrink-0"
              >
                Load teams
              </Button>
            </div>
          </Field>
          {teams && teams.length > 0 ? (
            <>
              <Field label="Team" htmlFor={`${id}-team`}>
                <Select id={`${id}-team`} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.key})
                    </option>
                  ))}
                </Select>
              </Field>
              {!compact ? (
                <Field
                  label="Label"
                  htmlFor={`${id}-label`}
                  optional
                  hint="Added to every issue BuildMonday files, if it exists in the team."
                >
                  <Input
                    id={`${id}-label`}
                    value={labelName}
                    onChange={(e) => setLabelName(e.target.value)}
                    onKeyDown={submitOnEnter(submit)}
                    placeholder="From users"
                  />
                </Field>
              ) : null}
            </>
          ) : null}
          <Actions
            onCancel={onCancel}
            saving={saving}
            disabled={!canSubmit}
            onSubmit={submit}
            label="Connect Linear"
            busyLabel="Checking…"
          />
        </div>
      ) : onCancel ? (
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

export function GitHubConnectForm(props: ConnectFormProps) {
  const { existing, oauth, returnTo, onCancel, autoFocus, compact } = props;
  const [manual, setManual] = React.useState(!oauth);
  const c = existing?.config.kind === "github" ? existing.config : null;
  const [token, setToken] = React.useState("");
  const [repo, setRepo] = React.useState(c ? `${c.owner}/${c.repo}` : "");
  const [labels, setLabels] = React.useState(c ? c.labels.join(", ") : "from-users");
  const { saving, error, save } = useConnect("github", props);
  const id = React.useId();
  const canSubmit = token.trim().length > 0 && repo.trim().length > 0;
  const submit = () => {
    if (!canSubmit || saving) return;
    void save({
      token: token.trim(),
      repo: repo.trim(),
      labels: labels
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean),
    });
  };

  return (
    <div className={compact ? "space-y-3" : "space-y-5"}>
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {oauth ? (
        <OneClick
          kind="github"
          href={oauthStartHref("github", returnTo)}
          label={existing ? "Reinstall the GitHub App" : "Install the GitHub App"}
          glyph={<GitHubGlyph />}
          note="Choose the repository in GitHub. The app can only open issues there."
        />
      ) : null}
      {oauth ? (
        <Advanced open={manual} onToggle={() => setManual((v) => !v)} label="Advanced: use a fine-grained token" />
      ) : null}
      {manual ? (
        <div className={compact ? "space-y-3" : "space-y-4"}>
          <Field
            label="Fine-grained token"
            htmlFor={`${id}-token`}
            hint="Create it in GitHub under Settings, Developer settings, with Issues read and write access to this repository. It is stored encrypted."
          >
            <Input
              id={`${id}-token`}
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={submitOnEnter(submit)}
              placeholder="github_pat_..."
              autoComplete="off"
              leftIcon={<KeyRound />}
              autoFocus={autoFocus && !oauth}
            />
          </Field>
          <Field label="Repository" htmlFor={`${id}-repo`} hint="owner/name, or the repository link.">
            <Input
              id={`${id}-repo`}
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              onKeyDown={submitOnEnter(submit)}
              placeholder="acme/notes"
              spellCheck={false}
            />
          </Field>
          {!compact ? (
            <Field label="Labels" htmlFor={`${id}-labels`} optional hint="Comma separated, up to 5.">
              <Input
                id={`${id}-labels`}
                value={labels}
                onChange={(e) => setLabels(e.target.value)}
                onKeyDown={submitOnEnter(submit)}
                placeholder="from-users, bug"
              />
            </Field>
          ) : null}
          <Actions
            onCancel={onCancel}
            saving={saving}
            disabled={!canSubmit}
            onSubmit={submit}
            label="Connect GitHub"
            busyLabel="Checking…"
          />
        </div>
      ) : onCancel ? (
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export const CONNECT_FORMS: Record<IntegrationKind, (props: ConnectFormProps) => React.ReactElement> = {
  slack: SlackConnectForm,
  linear: LinearConnectForm,
  github: GitHubConnectForm,
};

// ---------------------------------------------------------------------------
// Changing the destination of a saved connection
// ---------------------------------------------------------------------------

/**
 * "Files to: <team or repo>" with an inline picker that loads the options the
 * saved connection can see and saves the choice. For Linear (any auth) and
 * GitHub App connections.
 */
export function TrackerDestination({
  integration,
  canEdit,
  onChanged,
}: {
  integration: IntegrationDTO;
  canEdit: boolean;
  onChanged: (integration: IntegrationDTO) => void;
}) {
  const c = integration.config;
  const kind = integration.kind;
  const [editing, setEditing] = React.useState(false);
  const [options, setOptions] = React.useState<Array<{ value: string; label: string }> | null>(null);
  const [value, setValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const id = React.useId();

  const pickable = c.kind === "linear" || (c.kind === "github" && c.auth === "app");
  const current = c.kind === "linear" ? `${c.teamName} (${c.teamKey})` : c.kind === "github" ? `${c.owner}/${c.repo}` : "";

  async function open() {
    setEditing(true);
    setError(null);
    setBusy(true);
    if (c.kind === "linear") {
      const res = await apiRequest<{ teams: Team[] }>("/api/integrations/linear/teams");
      setBusy(false);
      if (!res.ok) return setError(res.error);
      setOptions(res.data.teams.map((t) => ({ value: t.id, label: `${t.name} (${t.key})` })));
      setValue(c.teamId);
    } else if (c.kind === "github") {
      const res = await apiRequest<{ repos: Array<{ fullName: string }> }>("/api/integrations/github/repos");
      setBusy(false);
      if (!res.ok) return setError(res.error);
      setOptions(res.data.repos.map((r) => ({ value: r.fullName, label: r.fullName })));
      setValue(`${c.owner}/${c.repo}`);
    }
  }

  async function saveChoice() {
    setBusy(true);
    setError(null);
    const res = await apiRequest<{ integration: IntegrationDTO }>(`/api/integrations/${kind}`, {
      method: "PATCH",
      body: c.kind === "linear" ? { teamId: value } : { repo: value },
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setEditing(false);
    onChanged(res.data.integration);
  }

  if (!pickable) return null;

  return (
    <div className="mt-2 space-y-2">
      {!editing ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-secondary">
          <span>
            Files to <span className="font-medium text-ink">{current}</span>
          </span>
          {canEdit ? (
            <button
              type="button"
              onClick={() => void open()}
              className="focus-ring rounded-sm font-medium text-brand hover:underline"
            >
              Change
            </button>
          ) : null}
        </p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor={`${id}-dest`} className="sr-only">
            {c.kind === "linear" ? "Linear team" : "Repository"}
          </label>
          <Select
            id={`${id}-dest`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={busy || !options}
            className="sm:max-w-[280px]"
          >
            {options ? (
              options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))
            ) : (
              <option value={value}>Loading…</option>
            )}
          </Select>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={() => void saveChoice()} loading={busy && Boolean(options)} disabled={!options || !value}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy && Boolean(options)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error ? <p className="text-xs text-danger-ink">{error}</p> : null}
    </div>
  );
}
