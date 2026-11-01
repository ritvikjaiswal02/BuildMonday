"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { MessageSquareText, Puzzle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui";
import type { ProductDTO } from "@/lib/db/dto";
import type { PlanId } from "@/lib/plans";
import type { ExtensionTokenRow } from "@/app/api/extension/_lib/service";
import type { ProductActivity } from "../_lib/data";
import { ExtensionPanel } from "./ExtensionPanel";
import { WidgetPanel } from "./WidgetPanel";

export type ExtensionTab = "extension" | "widget";

export interface ExtensionTabsProps {
  initialTab: ExtensionTab;
  appUrl: string;
  plan: PlanId;
  isAdmin: boolean;
  tokens: ExtensionTokenRow[];
  clips: { used: number; max: number };
  products: ProductDTO[];
  activeProductId: string | null;
  activity: ProductActivity;
  extensionId?: string | null;
}

export function ExtensionTabs({
  initialTab,
  appUrl,
  plan,
  isAdmin,
  tokens,
  clips,
  products,
  activeProductId,
  activity,
  extensionId = null,
}: ExtensionTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = React.useState<ExtensionTab>(initialTab);

  function onTabChange(value: string) {
    const next: ExtensionTab = value === "widget" ? "widget" : "extension";
    setTab(next);
    router.replace(next === "widget" ? `${pathname}?tab=widget` : pathname, { scroll: false });
  }

  return (
    <Tabs value={tab} onValueChange={onTabChange}>
      <TabsList aria-label="Ways to collect feedback">
        <TabsTrigger value="extension">
          <Puzzle aria-hidden />
          Chrome extension
        </TabsTrigger>
        <TabsTrigger value="widget">
          <MessageSquareText aria-hidden />
          Website widget
        </TabsTrigger>
      </TabsList>
      <TabsContent value="extension" className="mt-6">
        <ExtensionPanel
          appUrl={appUrl}
          plan={plan}
          initialTokens={tokens}
          clips={clips}
          hasProducts={products.length > 0}
          extensionId={extensionId}
        />
      </TabsContent>
      <TabsContent value="widget" className="mt-6">
        <WidgetPanel
          appUrl={appUrl}
          plan={plan}
          isAdmin={isAdmin}
          products={products}
          activeProductId={activeProductId}
          activity={activity}
        />
      </TabsContent>
    </Tabs>
  );
}
