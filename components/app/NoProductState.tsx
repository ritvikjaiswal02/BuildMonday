import * as React from "react";
import Link from "next/link";
import { PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

/** Shown by every product-scoped page when the workspace has no product yet. */
export function NoProductState({ title }: { title: string }) {
  return (
    <div className="space-y-8">
      <PageHeader title={title} />
      <div className="rounded-lg border border-line bg-surface shadow-xs">
        <EmptyState
          icon={PackagePlus}
          title="Add your first product"
          description="Tell BuildMonday what you are building and where your customers talk about it. The first run starts as soon as you finish."
          action={
            <Button asChild variant="primary">
              <Link href="/onboarding?new=1">Add a product</Link>
            </Button>
          }
          secondaryAction={
            <Button asChild variant="ghost">
              <Link href="/app">Try the analyzer</Link>
            </Button>
          }
        />
      </div>
    </div>
  );
}
