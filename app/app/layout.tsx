import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Analyzer",
  description:
    "Paste complaints or fetch reviews from a link. BuildMonday groups them into issues and ranks them by impact. Free, no account needed.",
};

export default function AnalyzerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
