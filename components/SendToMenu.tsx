"use client";
import { useEffect, useRef, useState } from "react";
import type { Issue, IssueStatus, PrdStub } from "@/lib/types";
import {
  buildGitHubIssueUrl,
  buildIssueMarkdown,
  loadIntegrations,
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
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowGithubForm(false);
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
  };

  const openGithub = (o: string, r: string) => {
    const url = buildGitHubIssueUrl(o, r, title, body);
    window.open(url, "_blank", "noopener");
    onNotify(`Opening GitHub issue draft in ${o}/${r}`);
    close();
  };

  const handleGithub = () => {
    const cfg = loadIntegrations();
    if (cfg.github?.owner && cfg.github?.repo) {
      openGithub(cfg.github.owner, cfg.github.repo);
      return;
    }
    setShowGithubForm(true);
  };

  const submitGithubForm = () => {
    const o = owner.trim();
    const r = repo.trim();
    if (!o || !r) return;
    saveIntegrations({ github: { owner: o, repo: r } });
    openGithub(o, r);
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
                  <span className="text-[10px] uppercase tracking-wide text-emerald-300/80">
                    One-click
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
              <li className="border-t border-white/10 px-3 py-2 text-[11px] leading-snug text-white/40">
                GitHub deep-links the full draft. Linear &amp; Notion don't support URL prefill — we copy markdown and open the tab.
              </li>
            </ul>
          ) : (
            <div className="space-y-2 p-3">
              <div className="text-xs font-medium text-white/80">
                GitHub repo
              </div>
              <div className="text-[11px] leading-snug text-white/50">
                Format <code className="rounded bg-white/10 px-1">owner/repo</code>. Saved for next time.
              </div>
              <div className="flex items-center gap-1">
                <input
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  placeholder="owner"
                  className="w-full rounded border border-white/15 bg-black/30 px-2 py-1 text-xs text-white outline-none focus:border-indigo-500/50"
                  autoFocus
                />
                <span className="text-white/40">/</span>
                <input
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  placeholder="repo"
                  className="w-full rounded border border-white/15 bg-black/30 px-2 py-1 text-xs text-white outline-none focus:border-indigo-500/50"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitGithubForm();
                  }}
                />
              </div>
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
