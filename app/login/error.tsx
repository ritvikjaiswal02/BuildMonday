"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { Button, Callout } from "@/components/ui";

export default function LoginError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center px-4">
      <Callout
        tone="danger"
        title="Sign-in could not load"
        action={
          <Button variant="secondary" size="sm" leftIcon={<RotateCcw />} onClick={reset}>
            Try again
          </Button>
        }
      >
        Something went wrong on our side. You can still{" "}
        <Link href="/app" className="font-medium text-brand underline-offset-2 hover:underline">
          use the free analyzer
        </Link>
        .
      </Callout>
    </main>
  );
}
