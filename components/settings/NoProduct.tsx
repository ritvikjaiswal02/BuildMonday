import Link from "next/link";
import { PackagePlus } from "lucide-react";
import { Button, EmptyState } from "@/components/ui";

/** Shown by product-scoped settings pages when the workspace has no product yet. */
export function NoProduct({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface shadow-xs">
      <EmptyState
        icon={PackagePlus}
        title="Add your first product"
        description={
          isAdmin
            ? "Products hold your sources, feedback and issues. Add one and BuildMonday starts checking it."
            : "An admin needs to add a product to this workspace before these settings apply."
        }
        action={
          isAdmin ? (
            <Button asChild variant="primary">
              <Link href="/onboarding?new=1">Add a product</Link>
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}

/** Quiet note for members, who can view but not change workspace settings. */
export function ReadOnlyNote({ children }: { children?: React.ReactNode }) {
  return (
    <p className="rounded-md border border-line bg-sunken px-3 py-2 text-sm text-ink-muted">
      {children ?? "Only workspace admins can change these settings. You can see them here."}
    </p>
  );
}
