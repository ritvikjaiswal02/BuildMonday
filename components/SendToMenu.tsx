"use client";
import { useEffect, useRef, useState } from "react";
import type { Issue, IssueStatus, PrdStub } from "@/lib/types";
import {
  buildGitHubIssueUrl,
  buildIssueMarkdown,
  loadIntegrations,
  parseGithubRepo,
  saveIntegrations,
} from "@/lib/integrations";

export function SendToMenu({
  issue,
  prd,
  status,
  onNotify,
}: {
  issue: Issue;
  prd: PrdStub | null;
  status: IssueStatus;
  onNotify: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showGithubForm, setShowGithubForm] = useState(false);
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [savedRepo, setSavedRepo] = useState<{ owner: string; repo: string } | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const cfg = loadIntegrations();
    if (cfg.github?.owner && cfg.github?.repo) {
      setSavedRepo({ owner: cfg.github.owner, repo: cfg.github.repo });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowGithubForm(false);
        setFormError(null);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const { title, body } = buildIssueMarkdown(issue, prd, status);
  const fullMarkdown = `# ${title}\n\n${body}\n`;

  const close = () => {
    setOpen(false);
    setShowGithubForm(false);
    setFormError(null);
  };

  const openGithub = (o: string, r: string) => {
    const url = buildGitHubIssueUrl(o, r, title, body);
    window.open(url, "_blank", "noopener");
    onNotify(`Opening GitHub issue draft in ${o}/${r}`);
    close();
  };

  const handleGithub = () => {
    if (savedRepo) {
      openGithub(savedRepo.owner, savedRepo.repo);
      return;
    }
    setShowGithubForm(true);
  };

  const handleChangeRepo = () => {
    setOwner(savedRepo?.owner ?? "");
    setRepo(savedRepo?.repo ?? "");
    setFormError(null);
    setShowGithubForm(true);
  };

  const submitGithubForm = () => {
    const parsed = parseGithubRepo(owner, repo);
    if (!parsed) {
      setFormError(
        "Couldn't read that. Try owner + repo separately (e.g. acme + storefront), or paste a github.com URL into either field."
      );
      return;
    }
    saveIntegrations({ github: parsed });
    setSavedRepo(parsed);
    setFormError(null);
    openGithub(parsed.owner, parsed.repo);
  };

  const copyAndOpen = async (destUrl: string, label: string) => {
    try {
      await navigator.clipboard.writeText(fullMarkdown);
      window.open(destUrl, "_blank", "noopener");
      onNotify(`Markdown copied · paste into ${label}`);
    } catch {
      onNotify("Copy failed — try Copy PRD instead");
    }
    close();
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-medium text-white/80 transition hover:bg-white/10"
      >
        Send to ↓
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-lg border border-white/15 bg-[#161618] shadow-xl">
          {!showGithubForm ? (
            <ul className="py-1 text-sm">
              <li>
                <button
                  type="button"
                  onClick={handleGithub}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-white/90 transition hover:bg-white/[0.06]"
                >
                  <span>GitHub Issue</span>
                  <span
                    className={
                      savedRepo
                        ? "max-w-[140px] truncate text-[10px] text-indigo-300/90"
                        : "text-[10px] uppercase tracking-wide text-emerald-300/80"
                    }
                    title={savedRepo ? `${savedRepo.owner}/${savedRepo.repo}` : undefined}
                  >
                    {savedRepo ? `→ ${savedRepo.owner}/${savedRepo.repo}` : "One-click"}
                  </span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => copyAndOpen("https://linear.app/", "Linear")}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-white/90 transition hover:bg-white/[0.06]"
                >
                  <span>Linear</span>
                  <span className="text-[10px] uppercase tracking-wide text-white/40">
                    Copy + open
                  </span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => copyAndOpen("https://www.notion.so/new", "Notion")}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-white/90 transition hover:bg-white/[0.06]"
                >
                  <span>Notion</span>
                  <span className="text-[10px] uppercase tracking-wide text-white/40">
                    Copy + open
                  </span>
                </button>
              </li>
              <li className="space-y-1 border-t border-white/10 px-3 py-2 text-[11px] leading-snug text-white/40">
                <div>
                  GitHub deep-links the full draft. Linear &amp; Notion don't support URL prefill — we copy markdown and open the tab.
                </div>
                {savedRepo && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-white/50">
                      Saved: <code className="rounded bg-white/10 px-1 text-white/70">{savedRepo.owner}/{savedRepo.repo}</code>
                    </span>
                    <button
                      type="button"
                      onClick={handleChangeRepo}
                      className="shrink-0 font-medium text-indigo-300 hover:text-indigo-200"
                    >
                      Change
                    </button>
                  </div>
                )}
              </li>
            </ul>
          ) : (
            <div className="space-y-2 p-3">
              <div className="text-xs font-medium text-white/80">
                GitHub repo
              </div>
              <div className="text-[11px] leading-snug text-white/50">
                Format <code className="rounded bg-white/10 px-1">owner/repo</code>, or paste a github.com URL. Saved for next time.
              </div>
              <div className="flex items-center gap-1">
                <input
                  value={owner}
                  onChange={(e) => {
                    setOwner(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="owner"
                  className="w-full rounded border border-white/15 bg-black/30 px-2 py-1 text-xs text-white outline-none focus:border-indigo-500/50"
                  autoFocus
                />
                <span className="text-white/40">/</span>
                <input
                  value={repo}
                  onChange={(e) => {
                    setRepo(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="repo"
                  className="w-full rounded border border-white/15 bg-black/30 px-2 py-1 text-xs text-white outline-none focus:border-indigo-500/50"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitGithubForm();
                  }}
                />
              </div>
              {formError && (
                <div className="rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] leading-snug text-red-200">
                  {formError}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowGithubForm(false)}
                  className="rounded px-2 py-1 text-xs text-white/60 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitGithubForm}
                  disabled={!owner.trim() || !repo.trim()}
                  className="rounded bg-indigo-500 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Save + open
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
