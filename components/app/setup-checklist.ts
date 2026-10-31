/** Pure model for the dashboard "Finish setting up" panel. Client-safe. */

export type SetupItemId = "source" | "slack" | "autofile" | "widget" | "extension" | "teammate";

export interface SetupItem {
  id: SetupItemId;
  label: string;
  description: string;
  href: string;
  done: boolean;
}

export interface SetupChecklist {
  items: SetupItem[];
  done: number;
  total: number;
}

export interface SetupFacts {
  sources: number;
  slack: boolean;
  trackerConnected: boolean;
  autofileOn: boolean;
  widgetFeedback: number;
  extensionTokens: number;
  members: number;
}

export function buildSetupChecklist(f: SetupFacts): SetupChecklist | null {
  const items: SetupItem[] = [
    {
      id: "source",
      label: "Add a source",
      description: "An app store, subreddit, Hacker News search or Trustpilot page to check on a schedule.",
      href: "/settings/sources",
      done: f.sources > 0,
    },
    {
      id: "slack",
      label: "Send alerts to Slack",
      description: "Serious new issues reach your channel the day they appear.",
      href: "/settings/integrations",
      done: f.slack,
    },
    {
      id: "autofile",
      label: "Auto-file to Linear or GitHub",
      description: "Issues above your threshold become tickets with the quotes attached.",
      href: f.trackerConnected ? "/settings/alerts" : "/settings/integrations",
      done: f.trackerConnected && f.autofileOn,
    },
    {
      id: "widget",
      label: "Add the website widget",
      description: "One script tag. Messages land in your inbox.",
      href: "/extension?tab=widget",
      done: f.widgetFeedback > 0,
    },
    {
      id: "extension",
      label: "Install the Chrome extension",
      description: "Clip reviews and threads from any page.",
      href: "/extension",
      done: f.extensionTokens > 0,
    },
    {
      id: "teammate",
      label: "Invite a teammate",
      description: "They get the Monday email and can triage with you.",
      href: "/settings/team",
      done: f.members > 1,
    },
  ];
  const done = items.filter((i) => i.done).length;
  if (done === items.length) return null;
  return { items, done, total: items.length };
}
