"use client";

import * as React from "react";
import { ChevronDown, ClipboardCopy, Send, Settings2 } from "lucide-react";
import type { Issue, IssueStatus, PrdStub } from "@/lib/types";
import {
  buildGitHubIssueUrl,
  buildIssueMarkdown,
  buildLinearWorkspaceUrl,
  loadIntegrations,
  parseGithubRepo,
  parseLinearWorkspace,
  saveIntegrations,
} from "@/lib/integrations";
import { buildIssueHtml } from "@/lib/markdown";
import { GitHubGlyph, LinearGlyph, NotionGlyph } from "@/components/brand/logos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { toast } from "@/components/ui/toast";

type FormKind = "github" | "linear" | null;

function pasteShortcut(): string {
  if (typeof navigator === "undefined") return "Ctrl+V";
  return /Mac|iPhone|iPad/i.test(navigator.platform) ? "Cmd+V" : "Ctrl+V";
}

/**
 * Hand an analyzer issue to the team's tools without an account: a prefilled
 * GitHub issue, or the Markdown on the clipboard with Linear or Notion opened.
 * Signed-in workspaces file issues directly from the issue page instead.
 */
export function SendToMenu({
  issue,
  prd,
  status,
  onNotify,
}: {
  issue: Issue;
  prd: PrdStub | null;
  status: IssueStatus;
  /** Optional extra notification hook; a toast is always shown. */
  onNotify?: (msg: string) => void;
}) {
  const [form, setForm] = React.useState<FormKind>(null);
  const [savedRepo, setSavedRepo] = React.useState<{ owner: string; repo: string } | null>(null);
  const [savedLinear, setSavedLinear] = React.useState<string | null>(null);

  React.useEffect(() => {
    const cfg = loadIntegrations();
    if (cfg.github?.owner && cfg.github?.repo) setSavedRepo({ owner: cfg.github.owner, repo: cfg.github.repo });
    if (cfg.linear?.workspace) setSavedLinear(cfg.linear.workspace);
  }, []);

  const notify = (msg: string, kind: "success" | "error" = "success") => {
    if (kind === "error") toast.error(msg);
    else toast.success(msg);
    onNotify?.(msg);
  };

  const { title, body } = buildIssueMarkdown(issue, prd, status);
  const fullMarkdown = `# ${title}\n\n${body}\n`;

  const openGithub = (owner: string, repo: string) => {
    window.open(buildGitHubIssueUrl(owner, repo, title, body), "_blank", "noopener");
    notify(`Opened a GitHub issue draft in ${owner}/${repo}`);
  };

  const copyAndOpen = async (destUrl: string, label: string, rich = false) => {
    try {
      if (rich && typeof ClipboardItem !== "undefined" && navigator.clipboard && "write" in navigator.clipboard) {
        const html = buildIssueHtml(issue, prd, status);
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([fullMarkdown], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(fullMarkdown);
      }
      window.open(destUrl, "_blank", "noopener");
      notify(`Copied. Paste into ${label} with ${pasteShortcut()}.`);
    } catch {
      notify("Your browser blocked the clipboard. Use Copy as Markdown instead.", "error");
    }
  };

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(fullMarkdown);
      notify("Issue copied as Markdown");
    } catch {
      notify("Your browser blocked the clipboard.", "error");
    }
  };

  const onGithub = () => (savedRepo ? openGithub(savedRepo.owner, savedRepo.repo) : setForm("github"));
  const onLinear = () =>
    savedLinear ? void copyAndOpen(buildLinearWorkspaceUrl(savedLinear), "Linear") : setForm("linear");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="secondary" leftIcon={<Send aria-hidden />} rightIcon={<ChevronDown aria-hidden />}>
            Send to
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem onSelect={onGithub}>
            <GitHubGlyph className="size-4" />
            <span className="flex-1">GitHub issue</span>
            {savedRepo ? (
              <span className="max-w-[110px] truncate text-xs text-ink-muted">{savedRepo.repo}</span>
            ) : null}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onLinear}>
            <LinearGlyph className="size-4" />
            <span className="flex-1">Linear</span>
            {savedLinear ? <span className="max-w-[110px] truncate text-xs text-ink-muted">{savedLinear}</span> : null}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copyAndOpen("https://www.notion.so/new", "Notion", true)}>
            <NotionGlyph className="size-4" />
            <span className="flex-1">Notion page</span>
          </DropdownMenuItem>
          <DropdownMenuItem icon={ClipboardCopy} onSelect={() => void copyMarkdown()}>
            Copy as Markdown
          </DropdownMenuItem>
          {savedRepo || savedLinear ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Saved in this browser</DropdownMenuLabel>
              {savedRepo ? (
                <DropdownMenuItem icon={Settings2} onSelect={() => setForm("github")}>
                  Change GitHub repo
                </DropdownMenuItem>
              ) : null}
              {savedLinear ? (
                <DropdownMenuItem icon={Settings2} onSelect={() => setForm("linear")}>
                  Change Linear workspace
                </DropdownMenuItem>
              ) : null}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <GitHubRepoDialog
        open={form === "github"}
        initial={savedRepo}
        onOpenChange={(o) => setForm(o ? "github" : null)}
        onSave={(parsed) => {
          saveIntegrations({ ...loadIntegrations(), github: parsed });
          setSavedRepo(parsed);
          setForm(null);
          openGithub(parsed.owner, parsed.repo);
        }}
      />
      <LinearWorkspaceDialog
        open={form === "linear"}
        initial={savedLinear}
        onOpenChange={(o) => setForm(o ? "linear" : null)}
        onSave={(workspace) => {
          saveIntegrations({ ...loadIntegrations(), linear: { workspace } });
          setSavedLinear(workspace);
          setForm(null);
          void copyAndOpen(buildLinearWorkspaceUrl(workspace), "Linear");
        }}
      />
    </>
  );
}

function GitHubRepoDialog({
  open,
  initial,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  initial: { owner: string; repo: string } | null;
  onOpenChange: (open: boolean) => void;
  onSave: (repo: { owner: string; repo: string }) => void;
}) {
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setValue(initial ? `${initial.owner}/${initial.repo}` : "");
      setError(null);
    }
  }, [open, initial]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    const [owner = "", repo = ""] = trimmed.includes("github.com") ? [trimmed, ""] : trimmed.split("/");
    const parsed = parseGithubRepo(owner, repo);
    if (!parsed) {
      setError("Use owner/repo, for example acme/storefront, or paste the repository URL.");
      return;
    }
    onSave(parsed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        title="Which GitHub repository?"
        description="We open a new issue there with the title and body filled in. Saved in this browser for next time."
      >
        <form onSubmit={submit} className="space-y-4">
          <Field label="Repository" htmlFor="send-github-repo" error={error}>
            <Input
              id="send-github-repo"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              placeholder="acme/storefront"
              autoFocus
              invalid={!!error}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!value.trim()}>
              Open issue draft
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LinearWorkspaceDialog({
  open,
  initial,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  initial: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (workspace: string) => void;
}) {
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setValue(initial ?? "");
      setError(null);
    }
  }, [open, initial]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseLinearWorkspace(value);
    if (!parsed) {
      setError("Paste your Linear workspace URL, for example linear.app/acme, or just the workspace name.");
      return;
    }
    onSave(parsed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        title="Which Linear workspace?"
        description="We copy the issue to your clipboard and open Linear so you can paste it into a new issue."
      >
        <form onSubmit={submit} className="space-y-4">
          <Field label="Workspace" htmlFor="send-linear-ws" error={error}>
            <Input
              id="send-linear-ws"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              placeholder="linear.app/acme"
              autoFocus
              invalid={!!error}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!value.trim()}>
              Copy and open Linear
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
