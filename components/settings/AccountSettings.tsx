"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { PlanBadge } from "@/components/billing";
import { timezoneOptions } from "@/components/onboarding/model";
import { Avatar, Button, Callout, Field, Input, Select, toast } from "@/components/ui";
import { signOutAction } from "@/lib/auth/actions";
import type { PlanId } from "@/lib/plans";
import { updateProfileAction, updateWorkspaceAction } from "@/app/settings/account/actions";
import { SettingRow, SettingsSection } from "./SettingsSection";

export interface AccountSettingsProps {
  user: { name: string | null; email: string; image: string | null };
  workspace: { name: string; timezone: string };
  canEditWorkspace: boolean;
  plan: PlanId;
  supportEmail: string;
}

export function AccountSettings({ user, workspace, canEditWorkspace, plan, supportEmail }: AccountSettingsProps) {
  const router = useRouter();
  const [name, setName] = React.useState(user.name ?? "");
  const [profilePending, startProfile] = React.useTransition();
  const [profileError, setProfileError] = React.useState<string | null>(null);

  const [ws, setWs] = React.useState(workspace);
  const [wsPending, startWs] = React.useTransition();
  const [wsError, setWsError] = React.useState<string | null>(null);
  const zones = React.useMemo(() => timezoneOptions(ws.timezone), [ws.timezone]);

  const profileDirty = name.trim() !== (user.name ?? "");
  const wsDirty = ws.name.trim() !== workspace.name || ws.timezone !== workspace.timezone;

  function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileError(null);
    startProfile(async () => {
      const res = await updateProfileAction({ name });
      if (!res.ok) {
        setProfileError(res.error);
        return;
      }
      toast.success("Profile saved");
      router.refresh();
    });
  }

  function saveWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setWsError(null);
    startWs(async () => {
      const res = await updateWorkspaceAction(ws);
      if (!res.ok) {
        setWsError(res.error);
        return;
      }
      toast.success("Workspace saved");
      router.refresh();
    });
  }

  return (
    <>
      <form onSubmit={saveProfile} noValidate>
        <SettingsSection
          id="profile"
          title="Profile"
          description="How you appear to your team."
          footer={
            <Button type="submit" variant="primary" loading={profilePending} disabled={!profileDirty}>
              {profilePending ? "Saving…" : "Save profile"}
            </Button>
          }
        >
          <div className="space-y-5">
            {profileError ? <Callout tone="danger">{profileError}</Callout> : null}
            <div className="flex items-center gap-3">
              <Avatar src={user.image} name={name || user.name} email={user.email} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{name || user.email}</p>
                <p className="truncate text-xs text-ink-muted">{user.email}</p>
              </div>
            </div>
            <Field label="Name" htmlFor="acc-name">
              <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
            </Field>
            <Field label="Email" htmlFor="acc-email" hint="Your sign-in address. To change it, sign in with the new address and ask an admin to invite it.">
              <Input id="acc-email" value={user.email} readOnly />
            </Field>
          </div>
        </SettingsSection>
      </form>

      <form onSubmit={saveWorkspace} noValidate>
        <SettingsSection
          id="workspace"
          title="Workspace"
          description="The name your team sees, and your time zone."
          footer={
            canEditWorkspace ? (
              <Button type="submit" variant="primary" loading={wsPending} disabled={!wsDirty}>
                {wsPending ? "Saving…" : "Save workspace"}
              </Button>
            ) : undefined
          }
        >
          <fieldset disabled={!canEditWorkspace} className="space-y-5">
            <legend className="sr-only">Workspace</legend>
            {wsError ? <Callout tone="danger">{wsError}</Callout> : null}
            <Field label="Workspace name" htmlFor="acc-ws-name">
              <Input id="acc-ws-name" value={ws.name} onChange={(e) => setWs((w) => ({ ...w, name: e.target.value }))} maxLength={60} />
            </Field>
            <Field label="Time zone" htmlFor="acc-ws-tz">
              <Select id="acc-ws-tz" value={ws.timezone} onChange={(e) => setWs((w) => ({ ...w, timezone: e.target.value }))}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </Field>
            {!canEditWorkspace ? <p className="text-xs text-ink-muted">Only admins can change the workspace.</p> : null}
          </fieldset>
        </SettingsSection>
      </form>

      <SettingsSection id="plan" title="Plan" description="Usage, invoices and plan changes live on the Billing page.">
        <SettingRow
          title="Current plan"
          control={
            <Button asChild variant="secondary" size="sm">
              <Link href="/billing">Open billing</Link>
            </Button>
          }
          description={<PlanBadge plan={plan} className="mt-1" />}
        />
      </SettingsSection>

      <SettingsSection id="session" title="Sign out and data">
        <div className="space-y-5">
          <SettingRow
            title="Sign out on this device"
            control={
              <form action={signOutAction}>
                <Button type="submit" variant="secondary" size="sm" leftIcon={<LogOut />}>
                  Sign out
                </Button>
              </form>
            }
          />
          <p className="border-t border-line pt-5 text-sm text-ink-muted">
            To delete your account and everything in your workspace, email{" "}
            <a href={`mailto:${supportEmail}`} className="focus-ring rounded-sm font-medium text-brand hover:underline">
              {supportEmail}
            </a>{" "}
            from your sign-in address. We confirm by email before anything is deleted.
          </p>
        </div>
      </SettingsSection>
    </>
  );
}
