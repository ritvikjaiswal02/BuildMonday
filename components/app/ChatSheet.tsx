"use client";

import * as React from "react";
import { MessageSquareText } from "lucide-react";
import { useUpgradeDialog } from "@/components/billing";
import { ChatPanel } from "@/components/ChatPanel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

const PRODUCT_SUGGESTIONS = [
  "What should we fix first this week, and why?",
  "Which issues got worse since the last run?",
  "What do competitor reviews complain about that we could win on?",
  "Write a short summary of this week's list for the team channel.",
];

/** "Ask about these issues" for a product: the chat in a sheet, grounded in stored issues. */
export function ChatSheet({ productId, productName }: { productId: string; productName: string }) {
  const upgrade = useUpgradeDialog();
  return (
    <>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="secondary" leftIcon={<MessageSquareText aria-hidden />}>
            Ask about these issues
          </Button>
        </DialogTrigger>
        <DialogContent
          size="lg"
          title="Ask about these issues"
          description={`Answers use ${productName}'s issues and feedback only.`}
          className="sm:h-[min(640px,85dvh)]"
        >
          <div className="-mx-5 -mb-5 flex h-[60dvh] min-h-[360px] flex-col border-t border-line sm:-mx-6 sm:-mb-6 sm:h-full">
            <ChatPanel
              productId={productId}
              variant="embedded"
              suggestions={PRODUCT_SUGGESTIONS}
              onPlanError={(err) =>
                upgrade.open({
                  feature: err.feature,
                  limit: err.limit,
                  requiredPlan: err.requiredPlan === "free" ? "pro" : err.requiredPlan,
                  reason: err.error,
                })
              }
            />
          </div>
        </DialogContent>
      </Dialog>
      {upgrade.dialog}
    </>
  );
}
