"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { pluralize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { apiFetch, ApiError, errorMessage } from "../api";
import { parsePastedFeedback } from "./inbox-utils";

interface IngestResult {
  inserted: number;
  duplicates: number;
  rejected: number;
  quotaExceeded: boolean;
  matched?: number;
}

/** From this many new items, offer to group them now instead of waiting for the next scheduled run. */
export const GROUP_NOW_THRESHOLD = 10;

export function resultMessage(r: IngestResult): string {
  const parts = [`Added ${pluralize(r.inserted, "item")}`];
  if (r.matched && r.matched > 0) parts.push(`${r.matched} matched to existing issues`);
  if (r.duplicates > 0) parts.push(`${r.duplicates} already in the inbox`);
  if (r.rejected > 0) parts.push(`${r.rejected} too short or too long`);
  return parts.join(", ");
}

/** Starts a manual run so new feedback is grouped now; sends people to the run page. */
async function groupNow(productId: string, onPlanError: (err: unknown) => void) {
  try {
    const res = await apiFetch<{ run: { id: string } }>("/api/runs", { method: "POST", json: { productId } });
    window.location.assign(`/runs/${encodeURIComponent(res.run.id)}`);
  } catch (err) {
    if (err instanceof ApiError && err.plan) {
      onPlanError(err);
      return;
    }
    if (err instanceof ApiError && err.status === 409) {
      toast.info("A run is already going. Your new feedback is included in the next one.");
      return;
    }
    toast.error(errorMessage(err, "The run could not start."));
  }
}

/** "Add feedback": one item with details, or many lines pasted at once. */
export function AddFeedbackDialog({
  productId,
  onAdded,
  onPlanError,
  open: controlledOpen,
  onOpenChange,
  trigger = true,
}: {
  productId: string;
  onAdded: () => void;
  onPlanError: (err: unknown) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: boolean;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [mode, setMode] = React.useState<"single" | "list">("single");
  const [text, setText] = React.useState("");
  const [author, setAuthor] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [rating, setRating] = React.useState("");
  const [raw, setRaw] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const pasted = React.useMemo(() => parsePastedFeedback(raw), [raw]);

  const reset = () => {
    setText("");
    setAuthor("");
    setUrl("");
    setRating("");
    setRaw("");
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    let body: Record<string, unknown>;
    if (mode === "single") {
      const t = text.trim();
      if (t.length < 3) {
        setError("Write at least a few words.");
        return;
      }
      if (url.trim() && !/^https?:\/\//i.test(url.trim())) {
        setError("The link should start with http:// or https://.");
        return;
      }
      body = {
        productId,
        items: [
          {
            text: t,
            ...(author.trim() ? { author: author.trim() } : {}),
            ...(url.trim() ? { url: url.trim() } : {}),
            ...(rating ? { rating: Number(rating) } : {}),
          },
        ],
      };
    } else {
      if (pasted.lines.length === 0) {
        setError("Paste at least one line of feedback.");
        return;
      }
      body = { productId, raw: pasted.lines.join("\n") };
    }

    setSaving(true);
    try {
      const result = await apiFetch<IngestResult>("/api/feedback", { method: "POST", json: body });
      if (result.quotaExceeded && result.inserted === 0) {
        setError("This month's feedback limit is used up, so nothing was saved. Upgrade or wait for the 1st.");
        return;
      }
      if (result.inserted - (result.matched ?? 0) >= GROUP_NOW_THRESHOLD) {
        toast.success(resultMessage(result), {
          description: "Group them into issues now, or wait for the next scheduled run.",
          duration: 12_000,
          action: { label: "Group now", onClick: () => void groupNow(productId, onPlanError) },
        });
      } else {
        toast.success(resultMessage(result));
      }
      reset();
      setOpen(false);
      onAdded();
    } catch (err) {
      if (err instanceof ApiError && err.plan) {
        onPlanError(err);
        return;
      }
      setError(errorMessage(err, "The feedback could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setError(null);
      }}
    >
      {trigger ? (
        <DialogTrigger asChild>
          <Button variant="primary" leftIcon={<Plus aria-hidden />}>
            Add feedback
          </Button>
        </DialogTrigger>
      ) : null}
      <DialogContent
        size="md"
        title="Add feedback"
        description="For support emails, call notes or anything that does not come from a watched source. Items that match an existing issue are linked right away."
      >
        <form onSubmit={submit} className="space-y-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as "single" | "list")}>
            <TabsList variant="pill" aria-label="How to add">
              <TabsTrigger value="single">One item</TabsTrigger>
              <TabsTrigger value="list">Paste a list</TabsTrigger>
            </TabsList>

            <TabsContent value="single" className="space-y-4">
              <Field label="Feedback" htmlFor="add-fb-text" hint="What the customer said, in their words.">
                <Textarea
                  id="add-fb-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={5}
                  maxLength={4000}
                  placeholder="Exporting to PDF cuts off the last page every time."
                  autoFocus
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="From" htmlFor="add-fb-author" optional>
                  <Input
                    id="add-fb-author"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="Name or company"
                    maxLength={120}
                  />
                </Field>
                <Field label="Rating" htmlFor="add-fb-rating" optional>
                  <Select id="add-fb-rating" value={rating} onChange={(e) => setRating(e.target.value)}>
                    <option value="">No rating</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} of 5
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="Link to the original" htmlFor="add-fb-url" optional>
                <Input
                  id="add-fb-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://"
                  maxLength={2000}
                />
              </Field>
            </TabsContent>

            <TabsContent value="list" className="space-y-2">
              <Field
                label="Feedback, one item per line"
                htmlFor="add-fb-raw"
                hint={
                  raw.trim()
                    ? `${pluralize(pasted.lines.length, "item")} ready${pasted.skipped > 0 ? `, ${pasted.skipped} too short or long` : ""}${
                        pasted.truncated ? ", only the first 500 are added" : ""
                      }.`
                    : "Up to 500 lines. Duplicates already in the inbox are skipped."
                }
              >
                <Textarea
                  id="add-fb-raw"
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                  rows={9}
                  placeholder={"The app logs me out every day.\nSearch ignores accents.\nI was charged twice in March."}
                />
              </Field>
            </TabsContent>
          </Tabs>

          {error ? <Callout tone="danger">{error}</Callout> : null}

          <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving}>
              {mode === "list" && pasted.lines.length > 0 ? `Add ${pluralize(pasted.lines.length, "item")}` : "Add feedback"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
