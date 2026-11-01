"use client";

import * as React from "react";
import { Button, Callout } from "@/components/ui";
import { acceptInviteAction } from "./actions";

export function AcceptInvite({ token, workspaceName }: { token: string; workspaceName: string }) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div className="space-y-4">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      <Button
        variant="primary"
        size="lg"
        className="w-full justify-center"
        loading={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await acceptInviteAction(token);
            // On success the action redirects; a returned value is always an error.
            if (result && !result.ok) setError(result.error);
          });
        }}
      >
        {pending ? `Joining ${workspaceName}…` : "Join workspace"}
      </Button>
    </div>
  );
}
