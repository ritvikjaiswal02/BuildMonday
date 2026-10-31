"use client";

import * as React from "react";
import { ChevronDown, Download, Lock } from "lucide-react";
import { hasFeature, type PlanId } from "@/lib/plans";
import { useUpgradeDialog } from "@/components/billing";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";

/** "Export" for the issues page: CSV or JSON on Pro and Team, the upgrade dialog on Free. */
export function ExportIssuesButton({ productId, plan }: { productId: string; plan: PlanId }) {
  const upgrade = useUpgradeDialog();
  const allowed = hasFeature(plan, "export");

  if (!allowed) {
    return (
      <>
        <Button
          variant="secondary"
          leftIcon={<Lock aria-hidden />}
          onClick={() =>
            upgrade.open({ feature: "export", requiredPlan: "pro", reason: "Exporting issues is on Pro and Team." })
          }
        >
          Export
        </Button>
        {upgrade.dialog}
      </>
    );
  }

  const href = (format: "csv" | "json") =>
    `/api/issues/export?productId=${encodeURIComponent(productId)}&format=${format}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" leftIcon={<Download aria-hidden />} rightIcon={<ChevronDown aria-hidden />}>
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a href={href("csv")} download>
            CSV for spreadsheets
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={href("json")} download>
            JSON with evidence and PRDs
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
