"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";
import { Button, Skeleton } from "@/components/ui";
import { previewDocument, type PreviewSettings } from "../_lib/snippet";

/**
 * The real widget script in preview mode inside a sandboxed frame. It reloads
 * a moment after the settings stop changing, and never sends anything.
 */
export function WidgetPreview({ settings }: { settings: PreviewSettings }) {
  const [origin, setOrigin] = React.useState<string | null>(null);
  const [doc, setDoc] = React.useState<string | null>(null);
  const [version, setVersion] = React.useState(0);
  const serialized = JSON.stringify(settings);

  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  React.useEffect(() => {
    if (!origin) return;
    const t = setTimeout(() => setDoc(previewDocument(origin, JSON.parse(serialized) as PreviewSettings)), 300);
    return () => clearTimeout(t);
  }, [origin, serialized]);

  return (
    <div>
      <div className="relative h-[500px] overflow-hidden bg-sunken">
        {doc ? (
          <iframe
            key={`${version}:${doc.length}:${serialized}`}
            title="Widget preview"
            srcDoc={doc}
            sandbox="allow-scripts"
            className="block h-full w-full border-0"
          />
        ) : (
          <div className="space-y-3 p-4" aria-hidden>
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 sm:px-5">
        <p className="text-xs text-ink-muted">Preview uses your saved and unsaved settings.</p>
        <Button variant="ghost" size="sm" leftIcon={<RotateCcw />} onClick={() => setVersion((v) => v + 1)}>
          Reset preview
        </Button>
      </div>
    </div>
  );
}
