"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Lock, Plus } from "lucide-react";
import { setActiveProductAction } from "@/lib/auth/actions";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import type { ShellProduct } from "./types";

export interface ProductSwitcherProps {
  products: ShellProduct[];
  activeProductId: string | null;
  /** False when the plan's product limit is reached; "Add product" then points to Billing. */
  canAddProduct?: boolean;
}

/** Square monogram for a product, derived from its name. */
export function ProductMonogram({ name, className }: { name: string; className?: string }) {
  const letter = name.trim().charAt(0).toUpperCase() || "P";
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-line bg-sunken",
        "font-display text-xs font-semibold text-ink-secondary",
        className,
      )}
    >
      {letter}
    </span>
  );
}

export function ProductSwitcher({ products, activeProductId, canAddProduct = true }: ProductSwitcherProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const active =
    products.find((p) => p.id === (pendingId ?? activeProductId)) ?? products[0] ?? null;

  function select(id: string) {
    if (id === active?.id) return;
    setPendingId(id);
    startTransition(async () => {
      try {
        const result = await setActiveProductAction(id);
        if (!result.ok) {
          toast.error("Could not switch product. Refresh the page and try again.");
          setPendingId(null);
          return;
        }
        router.refresh();
      } catch {
        toast.error("Could not switch product. Check your connection and try again.");
        setPendingId(null);
      }
    });
  }

  // Clear the optimistic selection once the server confirms it.
  React.useEffect(() => {
    if (!isPending && pendingId && pendingId === activeProductId) setPendingId(null);
  }, [isPending, pendingId, activeProductId]);

  if (products.length === 0) {
    return (
      <Link
        href="/onboarding?new=1"
        className={cn(
          "focus-ring inline-flex h-9 items-center gap-2 rounded-md px-2 text-sm font-medium text-ink-secondary",
          "transition-colors duration-120 hover:bg-sunken hover:text-ink",
        )}
      >
        <Plus aria-hidden className="size-4" />
        Add your product
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "focus-ring group inline-flex h-9 min-w-0 max-w-[240px] items-center gap-2 rounded-md pl-1.5 pr-2 text-left",
          "transition-colors duration-120 hover:bg-sunken data-[state=open]:bg-sunken",
        )}
        aria-label={active ? `Product: ${active.name}. Switch product` : "Switch product"}
      >
        <ProductMonogram name={active?.name ?? "Product"} />
        <span className="min-w-0 truncate text-sm font-medium text-ink">{active?.name}</span>
        {isPending ? (
          <Spinner size="sm" className="text-ink-muted" label="Switching product" />
        ) : (
          <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[260px]">
        <DropdownMenuLabel>Products</DropdownMenuLabel>
        {products.map((product) => {
          const selected = product.id === active?.id;
          return (
            <DropdownMenuItem
              key={product.id}
              onSelect={() => select(product.id)}
              aria-current={selected ? "true" : undefined}
              className="pl-1.5"
            >
              <span className="flex min-w-0 items-center gap-2">
                <ProductMonogram name={product.name} className="size-5 text-[10px]" />
                <span className={cn("truncate", selected && "font-medium text-ink")}>{product.name}</span>
              </span>
              {selected ? <Check aria-hidden className="ml-auto size-4 text-brand" /> : null}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        {canAddProduct ? (
          <DropdownMenuItem asChild icon={Plus}>
            <Link href="/onboarding?new=1">Add product</Link>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild icon={Lock}>
            <Link href="/billing">Product limit reached. See plans</Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
