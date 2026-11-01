"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import type { SourceRole } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import {
  DEFAULT_ISSUE_FILTERS,
  ISSUE_STATUS_FILTER_OPTIONS as STATUS_OPTIONS,
  ISSUE_TREND_FILTER_OPTIONS as TREND_OPTIONS,
  isDefaultIssueFilters,
  type IssueFilterValues,
} from "./issue-filters";

/** Filter row for /issues. Every change is written to the URL so views can be shared and survive reloads. */
export function IssueFilters({ value, counts }: { value: IssueFilterValues; counts: Record<SourceRole, number> }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = React.useState(value.q);
  const [pending, startTransition] = React.useTransition();
  const ids = { status: React.useId(), trend: React.useId(), sort: React.useId(), q: React.useId() };

  React.useEffect(() => setQ(value.q), [value.q]);

  const update = React.useCallback(
    (patch: Partial<IssueFilterValues>) => {
      const next = new URLSearchParams(searchParams?.toString() ?? "");
      for (const [k, v] of Object.entries(patch)) {
        const def = DEFAULT_ISSUE_FILTERS[k as keyof IssueFilterValues];
        if (v === undefined || v === "" || v === def) next.delete(k);
        else next.set(k, String(v));
      }
      const qs = next.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [pathname, router, searchParams],
  );

  // Debounced search.
  React.useEffect(() => {
    if (q === value.q) return;
    const t = window.setTimeout(() => update({ q: q.trim() }), 300);
    return () => window.clearTimeout(t);
  }, [q, value.q, update]);

  return (
    <div className="space-y-4" aria-busy={pending || undefined}>
      <SegmentedControl
        aria-label="Whose issues"
        value={value.scope}
        onChange={(scope) => update({ scope })}
        options={[
          { value: "own", label: `Your product (${counts.own})` },
          { value: "competitor", label: `Competitors (${counts.competitor})` },
        ]}
      />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_200px_160px_160px_auto] lg:items-end">
        <div>
          <label htmlFor={ids.q} className="sr-only">
            Search issues
          </label>
          <Input
            id={ids.q}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search titles, segments, categories"
            leftIcon={<Search aria-hidden className="size-4" />}
          />
        </div>
        <div>
          <label htmlFor={ids.status} className="sr-only">
            Status
          </label>
          <Select
            id={ids.status}
            value={value.status}
            onChange={(e) => update({ status: e.target.value as IssueFilterValues["status"] })}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor={ids.trend} className="sr-only">
            Trend
          </label>
          <Select
            id={ids.trend}
            value={value.trend}
            onChange={(e) => update({ trend: e.target.value as IssueFilterValues["trend"] })}
          >
            {TREND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor={ids.sort} className="sr-only">
            Sort
          </label>
          <Select
            id={ids.sort}
            value={value.sort}
            onChange={(e) => update({ sort: e.target.value as IssueFilterValues["sort"] })}
          >
            <option value="priority">Sort by priority</option>
            <option value="frequency">Sort by reports</option>
            <option value="recent">Sort by last seen</option>
          </Select>
        </div>
        {!isDefaultIssueFilters(value) ? (
          <Button
            variant="ghost"
            leftIcon={<X aria-hidden />}
            onClick={() => {
              setQ("");
              update({ status: DEFAULT_ISSUE_FILTERS.status, trend: "all", sort: "priority", q: "" });
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}
