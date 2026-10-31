"use client";

import * as React from "react";
import { Link2 } from "lucide-react";
import { SourceGlyph } from "@/components/brand/logos";
import { Button, Callout, DialogClose, Dialog, DialogContent, Field, Input, SegmentedControl, Select } from "@/components/ui";
import type { SourceDTO } from "@/lib/db/dto";
import type { PlanErrorBody } from "@/lib/plans";
import { cn } from "@/lib/utils";
import {
  PLAY_LANGUAGES,
  SOURCE_KINDS,
  SOURCE_KIND_META,
  STORE_COUNTRIES,
  detectSourceInput,
  type MonitorSourceKind,
  type SourceRole,
} from "@/components/onboarding/source-input";
import { SourceTestResult, useSourceTest } from "@/components/onboarding/useSourceTest";
import { apiRequest } from "./api";
import { configFromForm, emptySourceForm, formFromConfig, type FormField, type SourceFormState } from "./source-form";

export type SourceDialogMode = { type: "add"; role: SourceRole } | { type: "edit"; source: SourceDTO };

export interface SourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: SourceDialogMode;
  productId: string;
  productName: string;
  competitorNames: string[];
  onSaved: (source: SourceDTO, created: boolean) => void;
  onPlanError: (plan: PlanErrorBody) => void;
}

function KindPicker({
  value,
  onChange,
  disabled,
}: {
  value: MonitorSourceKind;
  onChange: (kind: MonitorSourceKind) => void;
  disabled?: boolean;
}) {
  const refs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const index = SOURCE_KINDS.indexOf(value);
  function onKeyDown(e: React.KeyboardEvent, i: number) {
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % SOURCE_KINDS.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + SOURCE_KINDS.length) % SOURCE_KINDS.length;
    if (next < 0) return;
    e.preventDefault();
    onChange(SOURCE_KINDS[next]);
    refs.current[next]?.focus();
  }
  return (
    <div role="radiogroup" aria-label="Source type" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {SOURCE_KINDS.map((kind, i) => {
        const selected = kind === value;
        return (
          <button
            key={kind}
            ref={(n) => {
              refs.current[i] = n;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={i === index ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(kind)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "focus-ring flex h-10 items-center gap-2 rounded-md border px-2.5 text-sm font-medium",
              "transition-[background-color,border-color,color] duration-120 ease-standard",
              selected
                ? "border-brand bg-brand-soft text-brand-ink"
                : "border-line-strong bg-surface text-ink-secondary hover:border-ink-faint hover:text-ink",
            )}
          >
            <SourceGlyph kind={kind} className="size-4" />
            <span className="truncate">{SOURCE_KIND_META[kind].short}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SourceDialog({
  open,
  onOpenChange,
  mode,
  productId,
  productName,
  competitorNames,
  onSaved,
  onPlanError,
}: SourceDialogProps) {
  const isEdit = mode.type === "edit";
  const role: SourceRole = mode.type === "edit" ? mode.source.role : mode.role;

  const initialForm = React.useCallback((): SourceFormState => {
    if (mode.type === "edit") return formFromConfig(mode.source.kind, mode.source.config, emptySourceForm(mode.source.kind, productName));
    return emptySourceForm("appstore", productName);
  }, [mode, productName, role]);

  const [form, setForm] = React.useState<SourceFormState>(initialForm);
  const [paste, setPaste] = React.useState("");
  const [pasteNote, setPasteNote] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [competitorName, setCompetitorName] = React.useState(mode.type === "edit" ? (mode.source.competitorName ?? "") : "");
  const [fieldError, setFieldError] = React.useState<{ field: FormField | "competitor"; error: string } | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const { state: testState, run: runTest, reset: resetTest } = useSourceTest();

  // Reset only when the dialog opens, not on every parent render while it is open.
  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    const opening = open && !wasOpen.current;
    wasOpen.current = open;
    if (opening) {
      setForm(initialForm());
      setPaste("");
      setPasteNote(null);
      setCompetitorName(mode.type === "edit" ? (mode.source.competitorName ?? "") : "");
      setFieldError(null);
      setSaveError(null);
      resetTest();
    }
  }, [open, initialForm, mode, resetTest]);

  const set = (patch: Partial<SourceFormState>) => {
    setForm((f) => ({ ...f, ...patch }));
    setFieldError(null);
    resetTest();
  };

  function onPaste(value: string) {
    setPaste(value);
    if (!value.trim()) {
      setPasteNote(null);
      return;
    }
    const detected = detectSourceInput(value, { allowBareDomain: true });
    if (!detected) {
      setPasteNote({ ok: false, text: "We do not recognise this link yet. Pick the type below and fill in the fields." });
      return;
    }
    setForm((f) => formFromConfig(detected.kind, detected.config, { ...f, kind: detected.kind }));
    setPasteNote({ ok: true, text: `Recognised: ${detected.label}` });
    setFieldError(null);
    resetTest();
  }

  function errFor(field: FormField): string | null {
    return fieldError && fieldError.field === field ? fieldError.error : null;
  }

  function test() {
    const result = configFromForm(form);
    if (!result.ok) {
      setFieldError({ field: result.field, error: result.error });
      return;
    }
    void runTest({ kind: form.kind, config: result.config });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const result = configFromForm(form);
    if (!result.ok) {
      setFieldError({ field: result.field, error: result.error });
      return;
    }
    if (role === "competitor" && !competitorName.trim()) {
      setFieldError({ field: "competitor", error: "Add the competitor's name." });
      return;
    }
    setSaving(true);
    setSaveError(null);
    const res =
      mode.type === "edit"
        ? await apiRequest<{ source: SourceDTO }>(`/api/sources/${mode.source.id}`, {
            method: "PATCH",
            body: { config: result.config },
          })
        : await apiRequest<{ source: SourceDTO }>("/api/sources", {
            method: "POST",
            body: {
              productId,
              kind: form.kind,
              config: result.config,
              role,
              competitorName: role === "competitor" ? competitorName.trim() : null,
            },
          });
    setSaving(false);
    if (!res.ok) {
      if (res.plan) {
        onOpenChange(false);
        onPlanError(res.plan);
        return;
      }
      setSaveError(res.error);
      return;
    }
    onSaved(res.data.source, !isEdit);
    onOpenChange(false);
  }

  const kindMeta = SOURCE_KIND_META[form.kind];
  const title = isEdit
    ? `Edit ${kindMeta.name} source`
    : role === "competitor"
      ? "Add a competitor source"
      : "Add a source";

  return (
    <Dialog open={open} onOpenChange={(v) => (saving ? undefined : onOpenChange(v))}>
      <DialogContent
        title={title}
        description={
          isEdit
            ? "Changes apply from the next run. Feedback already collected stays in your inbox."
            : role === "competitor"
              ? "We read this competitor's low-star reviews and show you the complaints you could win on."
              : "BuildMonday checks this source on every run and adds new feedback to your inbox."
        }
        size="lg"
      >
        <form id="source-form" onSubmit={save} noValidate className="space-y-6">
          {saveError ? <Callout tone="danger">{saveError}</Callout> : null}

          {!isEdit ? (
            <Field
              label="Paste a link"
              htmlFor="sd-paste"
              optional
              hint={
                pasteNote ? (
                  <span className={pasteNote.ok ? "text-success-ink" : undefined}>{pasteNote.text}</span>
                ) : (
                  "An App Store, Google Play, Reddit, Hacker News or Trustpilot link. We fill in the rest."
                )
              }
            >
              <Input
                id="sd-paste"
                value={paste}
                onChange={(e) => onPaste(e.target.value)}
                leftIcon={<Link2 />}
                placeholder="https://play.google.com/store/apps/details?id=com.acme.notes"
                autoFocus
              />
            </Field>
          ) : null}

          {role === "competitor" ? (
            <Field label="Competitor" htmlFor="sd-competitor" error={fieldError?.field === "competitor" ? fieldError.error : null}>
              <Input
                id="sd-competitor"
                value={competitorName}
                onChange={(e) => {
                  setCompetitorName(e.target.value);
                  setFieldError(null);
                }}
                placeholder="Notion"
                maxLength={60}
                list="sd-competitor-names"
                disabled={isEdit}
              />
            </Field>
          ) : null}
          <datalist id="sd-competitor-names">
            {competitorNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>

          <div className="space-y-2">
            <p className="text-sm font-medium text-ink">Type</p>
            <KindPicker
              value={form.kind}
              onChange={(kind) => set({ kind })}
              disabled={isEdit}
            />
            <p className="text-xs text-ink-muted">{kindMeta.description}</p>
          </div>

          <div className="space-y-4 rounded-lg border border-line bg-sunken/50 p-4">
            {form.kind === "appstore" ? (
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
                <Field label="App Store app" htmlFor="sd-app" error={errFor("appInput")}>
                  <Input
                    id="sd-app"
                    value={form.appInput}
                    onChange={(e) => {
                      const v = e.target.value;
                      const c = /apps\.apple\.com\/([a-z]{2})\//i.exec(v)?.[1]?.toLowerCase();
                      set({ appInput: v, ...(c ? { appCountry: c } : {}) });
                    }}
                    placeholder="apps.apple.com/us/app/acme/id123456789 or 123456789"
                  />
                </Field>
                <Field label="Country store" htmlFor="sd-app-country">
                  <Select id="sd-app-country" value={form.appCountry} onChange={(e) => set({ appCountry: e.target.value })}>
                    {STORE_COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            ) : null}

            {form.kind === "playstore" ? (
              <>
                <Field label="Google Play app" htmlFor="sd-play" error={errFor("playInput")}>
                  <Input
                    id="sd-play"
                    value={form.playInput}
                    onChange={(e) => set({ playInput: e.target.value })}
                    placeholder="play.google.com/store/apps/details?id=com.acme.notes or com.acme.notes"
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Country" htmlFor="sd-play-country">
                    <Select id="sd-play-country" value={form.playCountry} onChange={(e) => set({ playCountry: e.target.value })}>
                      {STORE_COUNTRIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Review language" htmlFor="sd-play-lang">
                    <Select id="sd-play-lang" value={form.playLang} onChange={(e) => set({ playLang: e.target.value })}>
                      {PLAY_LANGUAGES.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </>
            ) : null}

            {form.kind === "reddit" ? (
              <>
                <SegmentedControl
                  aria-label="What to read on Reddit"
                  size="sm"
                  value={form.redditMode}
                  onChange={(redditMode) => set({ redditMode })}
                  options={[
                    { value: "subreddit", label: "Subreddit" },
                    { value: "search", label: "Search" },
                    { value: "thread", label: "One thread" },
                  ]}
                />
                {form.redditMode === "subreddit" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Subreddit" htmlFor="sd-sub" error={errFor("subreddit")}>
                      <Input id="sd-sub" value={form.subreddit} onChange={(e) => set({ subreddit: e.target.value })} placeholder="r/productivity" />
                    </Field>
                    <Field
                      label="Only posts that mention"
                      htmlFor="sd-sub-kw"
                      hint="Comma separated."
                      error={errFor("redditKeywords")}
                    >
                      <Input
                        id="sd-sub-kw"
                        value={form.redditKeywords}
                        onChange={(e) => set({ redditKeywords: e.target.value })}
                        placeholder="acme notes, acmenotes"
                      />
                    </Field>
                  </div>
                ) : null}
                {form.redditMode === "search" ? (
                  <Field label="Search all of Reddit for" htmlFor="sd-rq" error={errFor("redditQuery")}>
                    <Input id="sd-rq" value={form.redditQuery} onChange={(e) => set({ redditQuery: e.target.value })} placeholder="acme notes" />
                  </Field>
                ) : null}
                {form.redditMode === "thread" ? (
                  <Field
                    label="Thread link"
                    htmlFor="sd-rt"
                    hint="We read new comments in this thread on every run."
                    error={errFor("redditThread")}
                  >
                    <Input
                      id="sd-rt"
                      value={form.redditThread}
                      onChange={(e) => set({ redditThread: e.target.value })}
                      placeholder="https://www.reddit.com/r/acme/comments/abc123/..."
                    />
                  </Field>
                ) : null}
              </>
            ) : null}

            {form.kind === "hackernews" ? (
              <>
                <SegmentedControl
                  aria-label="What to read on Hacker News"
                  size="sm"
                  value={form.hnMode}
                  onChange={(hnMode) => set({ hnMode })}
                  options={[
                    { value: "search", label: "Search" },
                    { value: "thread", label: "One discussion" },
                  ]}
                />
                {form.hnMode === "search" ? (
                  <Field label="Search for" htmlFor="sd-hq" hint="Stories and comments that mention this." error={errFor("hnQuery")}>
                    <Input id="sd-hq" value={form.hnQuery} onChange={(e) => set({ hnQuery: e.target.value })} placeholder="acme notes" />
                  </Field>
                ) : (
                  <Field label="Discussion link" htmlFor="sd-ht" error={errFor("hnThread")}>
                    <Input
                      id="sd-ht"
                      value={form.hnThread}
                      onChange={(e) => set({ hnThread: e.target.value })}
                      placeholder="https://news.ycombinator.com/item?id=12345678"
                    />
                  </Field>
                )}
              </>
            ) : null}

            {form.kind === "trustpilot" ? (
              <Field label="Trustpilot page" htmlFor="sd-tp" error={errFor("trustpilot")}>
                <Input
                  id="sd-tp"
                  value={form.trustpilot}
                  onChange={(e) => set({ trustpilot: e.target.value })}
                  placeholder="trustpilot.com/review/acme.com or acme.com"
                />
              </Field>
            ) : null}

            <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-start">
              <Button variant="secondary" size="sm" onClick={test} loading={testState.status === "loading"} className="shrink-0">
                Test this source
              </Button>
              <SourceTestResult state={testState} className="min-w-0 pt-1" />
            </div>
            {testState.status === "ok" && testState.sample.length > 1 ? (
              <ul className="space-y-2">
                {testState.sample.slice(1, 3).map((item, i) => (
                  <li key={item.externalId ?? i} className="border-l-2 border-line-strong pl-3 text-sm text-ink-secondary">
                    <span className="line-clamp-2">{item.text}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </form>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button variant="secondary" disabled={saving}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" form="source-form" variant="primary" loading={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : role === "competitor" ? "Add competitor source" : "Add source"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
