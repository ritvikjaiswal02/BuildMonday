/**
 * Illustration content for the marketing pages. Every surface that renders it
 * is labelled "Example"; none of it describes a real customer or real numbers.
 */

export type ExampleTrend = "new" | "worsened" | "improved" | "persistent" | "resolved";

export interface ExampleIssue {
  id: string;
  rank: number;
  title: string;
  reason: string;
  trend: ExampleTrend;
  mentions: number;
  priority: number;
  sources: string[];
  quote: string;
}

export const EXAMPLE_PRODUCT = "Acme Notes";

export const EXAMPLE_ISSUES: ExampleIssue[] = [
  {
    id: "sync",
    rank: 1,
    title: "Notes edited offline disappear after sync",
    reason: "Data loss, mentioned in every source, up from 29 mentions last week.",
    trend: "worsened",
    mentions: 41,
    priority: 92,
    sources: ["appstore", "playstore", "reddit"],
    quote: "Wrote two pages on the train, opened my laptop and they were gone.",
  },
  {
    id: "search",
    rank: 2,
    title: "Search misses text inside attached PDFs",
    reason: "New this week and concentrated among paying users.",
    trend: "new",
    mentions: 27,
    priority: 78,
    sources: ["appstore", "hn"],
    quote: "Search is useless for my lecture slides, it only finds the file name.",
  },
  {
    id: "widget",
    rank: 3,
    title: "Android home screen widget freezes after 4.2",
    reason: "Started with the 4.2 release, Android only.",
    trend: "new",
    mentions: 19,
    priority: 71,
    sources: ["playstore", "widget"],
    quote: "The widget shows yesterday's list until I restart my phone.",
  },
  {
    id: "export",
    rank: 4,
    title: "Markdown export flattens nested lists",
    reason: "Steady for a month, blocks people moving their notes elsewhere.",
    trend: "persistent",
    mentions: 15,
    priority: 58,
    sources: ["reddit", "hn", "extension"],
    quote: "Exported my outline and every sub-bullet came out at the top level.",
  },
  {
    id: "pricing",
    rank: 5,
    title: "Trial ends without showing the annual price",
    reason: "Falling since the pricing page change.",
    trend: "improved",
    mentions: 9,
    priority: 44,
    sources: ["trustpilot", "appstore"],
    quote: "I was charged before I ever saw what the yearly plan costs.",
  },
];

/** The order the issues "arrived" in before ranking; the hero list sorts from this once on load. */
export const EXAMPLE_ARRIVAL_ORDER = ["export", "search", "pricing", "sync", "widget"];

export const EXAMPLE_WEEK = [
  { label: "Mon", value: 38, title: "Monday" },
  { label: "Tue", value: 31, title: "Tuesday" },
  { label: "Wed", value: 44, title: "Wednesday" },
  { label: "Thu", value: 27, title: "Thursday" },
  { label: "Fri", value: 35, title: "Friday" },
  { label: "Sat", value: 18, title: "Saturday" },
  { label: "Sun", value: 21, title: "Sunday" },
];

export const EXAMPLE_WEEK_TOTAL = EXAMPLE_WEEK.reduce((sum, d) => sum + d.value, 0);
