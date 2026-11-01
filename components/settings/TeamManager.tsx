"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MailPlus, UserMinus } from "lucide-react";
import { UsageMeter, useUpgradeDialog } from "@/components/billing";
import { Avatar, Badge, Button, Callout, ConfirmDialog, CopyField, EmptyState, Field, Input, Select, toast } from "@/components/ui";
import type { InviteDTO, MemberDTO } from "@/lib/db/dto";
import type { MemberRole } from "@/lib/db/schema";
import { hasFeature, isUnlimited, type PlanErrorBody, type PlanId } from "@/lib/plans";
import {
  inviteMemberAction,
  removeMemberAction,
  revokeInviteAction,
  updateMemberRoleAction,
} from "@/app/settings/team/actions";
import { formatUntil } from "./api";
import { SettingsSection } from "./SettingsSection";

export interface TeamManagerProps {
  members: MemberDTO[];
  invites: InviteDTO[];
  meId: string;
  myRole: MemberRole;
  plan: PlanId;
  seats: { used: number; max: number };
  workspaceName: string;
}

const ROLE_LABEL: Record<MemberRole, string> = { owner: "Owner", admin: "Admin", member: "Member" };

export function TeamManager({ members, invites, meId, myRole, plan, seats, workspaceName }: TeamManagerProps) {
  const router = useRouter();
  const { open: openUpgrade, dialog: upgradeDialog } = useUpgradeDialog();
  const isAdmin = myRole === "admin" || myRole === "owner";
  const canAssignAdmin = hasFeature(plan, "team_members");

  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"member" | "admin">("member");
  const [inviting, startInvite] = React.useTransition();
  const [inviteError, setInviteError] = React.useState<string | null>(null);
  const [lastInvite, setLastInvite] = React.useState<{ email: string; url: string; emailSent: boolean } | null>(null);
  const [rolePending, setRolePending] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState<MemberDTO | null>(null);
  const [revoking, setRevoking] = React.useState<InviteDTO | null>(null);

  const seatsFull = !isUnlimited(seats.max) && seats.used >= seats.max;

  const handlePlan = (p: PlanErrorBody) =>
    openUpgrade({
      feature: p.feature,
      limit: p.limit,
      requiredPlan: p.requiredPlan === "free" ? undefined : p.requiredPlan,
      reason: p.error,
    });

  function invite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setInviteError("Enter a valid email address.");
      return;
    }
    startInvite(async () => {
      const res = await inviteMemberAction(email.trim(), role);
      if (!res.ok) {
        if (res.plan) handlePlan(res.plan);
        setInviteError(res.error);
        return;
      }
      setLastInvite({ email: res.invite.email, url: res.inviteUrl, emailSent: res.emailSent });
      setEmail("");
      setRole("member");
      toast.success(res.emailSent ? `Invite sent to ${res.invite.email}` : `Invite created for ${res.invite.email}`);
      router.refresh();
    });
  }

  async function changeRole(member: MemberDTO, next: MemberRole) {
    setRolePending(member.userId);
    const res = await updateMemberRoleAction(member.userId, next);
    setRolePending(null);
    if (!res.ok) {
      if (res.plan) handlePlan(res.plan);
      else toast.error(res.error);
      return;
    }
    toast.success(`${member.name ?? member.email} is now ${ROLE_LABEL[next].toLowerCase()}`);
    router.refresh();
  }

  async function confirmRemove() {
    if (!removing) return;
    const res = await removeMemberAction(removing.userId);
    if (!res.ok) {
      toast.error(res.error);
      throw new Error(res.error);
    }
    if (res.left) {
      toast.success(`You left ${workspaceName}`);
      router.push("/dashboard");
      router.refresh();
      return;
    }
    toast.success(`${removing.name ?? removing.email} was removed`);
    router.refresh();
  }

  async function confirmRevoke() {
    if (!revoking) return;
    const res = await revokeInviteAction(revoking.id);
    if (!res.ok) {
      toast.error(res.error);
      throw new Error(res.error);
    }
    toast.success(`Invite for ${revoking.email} revoked`);
    router.refresh();
  }

  return (
    <>
      {upgradeDialog}

      <SettingsSection
        id="members"
        title="Members"
        description={`People in ${workspaceName}. Everyone sees the same list and chooses their own alerts.`}
        flush
      >
        <div className="border-b border-line px-4 py-3 sm:px-5">
          <UsageMeter label="Seats" used={seats.used} limit={seats.max} unit="seats" compact />
        </div>
        <ul className="divide-y divide-line">
          {members.map((m) => {
            const isMe = m.userId === meId;
            const editable = isAdmin && !isMe && m.role !== "owner" && !(m.role === "admin" && myRole !== "owner");
            const removable = (isAdmin && !isMe && m.role !== "owner" && !(m.role === "admin" && myRole !== "owner")) || (isMe && m.role !== "owner");
            return (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:flex-nowrap sm:px-5">
                <Avatar src={m.image} name={m.name} email={m.email} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-medium text-ink">
                    <span className="truncate">{m.name ?? m.email}</span>
                    {isMe ? (
                      <Badge tone="neutral" size="sm">
                        You
                      </Badge>
                    ) : null}
                  </p>
                  {m.name ? <p className="truncate text-xs text-ink-muted">{m.email}</p> : null}
                </div>
                <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                  {editable ? (
                    <Select
                      aria-label={`Role for ${m.name ?? m.email}`}
                      value={m.role}
                      disabled={rolePending === m.userId}
                      onChange={(e) => changeRole(m, e.target.value as MemberRole)}
                      className="w-[128px]"
                    >
                      <option value="member">Member</option>
                      <option value="admin" disabled={!canAssignAdmin && m.role !== "admin"}>
                        Admin{!canAssignAdmin ? " (Team plan)" : ""}
                      </option>
                    </Select>
                  ) : (
                    <Badge tone={m.role === "owner" ? "brand" : "neutral"} variant={m.role === "owner" ? "soft" : "outline"}>
                      {ROLE_LABEL[m.role]}
                    </Badge>
                  )}
                  {removable ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={isMe ? "Leave workspace" : `Remove ${m.name ?? m.email}`}
                      onClick={() => setRemoving(m)}
                    >
                      <UserMinus />
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </SettingsSection>

      {isAdmin ? (
        <form onSubmit={invite} noValidate>
          <SettingsSection
            id="invite"
            title="Invite someone"
            description="They get an email with a link that works for 7 days. Pending invites use a seat until they expire or you revoke them."
            footer={
              <Button type="submit" variant="primary" leftIcon={<MailPlus />} loading={inviting} disabled={seatsFull}>
                {inviting ? "Sending…" : "Send invite"}
              </Button>
            }
          >
            <div className="space-y-4">
              {seatsFull ? (
                <Callout
                  tone="warning"
                  action={
                    <Button variant="secondary" size="sm" onClick={() => openUpgrade({ limit: "seats", reason: "Add more people on Team." })}>
                      Upgrade
                    </Button>
                  }
                >
                  All {seats.max} {seats.max === 1 ? "seat is" : "seats are"} in use. Remove a member or a pending invite, or upgrade for more seats.
                </Callout>
              ) : null}
              {inviteError ? <Callout tone="danger">{inviteError}</Callout> : null}
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
                <Field label="Email" htmlFor="tm-email">
                  <Input
                    id="tm-email"
                    type="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="teammate@company.com"
                    autoComplete="off"
                    disabled={seatsFull}
                  />
                </Field>
                <Field
                  label="Role"
                  htmlFor="tm-role"
                  hint={!canAssignAdmin ? "Admins are on Team." : undefined}
                >
                  <Select
                    id="tm-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as "member" | "admin")}
                    disabled={seatsFull}
                  >
                    <option value="member">Member</option>
                    <option value="admin" disabled={!canAssignAdmin}>
                      Admin
                    </option>
                  </Select>
                </Field>
              </div>
              {lastInvite ? (
                <div className="space-y-2 rounded-lg border border-line bg-sunken/60 p-4" aria-live="polite">
                  <p className="text-sm text-ink-secondary">
                    {lastInvite.emailSent
                      ? `Invite sent to ${lastInvite.email}. You can also share this link with them; it works for 7 days.`
                      : `Email is not set up on this deployment, so send ${lastInvite.email} this link yourself. It works for 7 days.`}
                  </p>
                  <CopyField value={lastInvite.url} label="Invite link" mono />
                </div>
              ) : null}
            </div>
          </SettingsSection>
        </form>
      ) : null}

      {isAdmin ? (
        <SettingsSection id="pending" title="Pending invites" flush>
          {invites.length === 0 ? (
            <EmptyState headingLevel={3} size="sm" title="No pending invites" description="Invites you send appear here until they are accepted." />
          ) : (
            <ul className="divide-y divide-line">
              {invites.map((inv) => (
                <li key={inv.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:flex-nowrap sm:px-5">
                  <Avatar email={inv.email} name={null} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{inv.email}</p>
                    <p className="text-xs text-ink-muted">
                      {ROLE_LABEL[inv.role]}, expires {formatUntil(inv.expiresAt)}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setRevoking(inv)} className="ml-auto">
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </SettingsSection>
      ) : null}

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => (!open ? setRemoving(null) : undefined)}
        tone="danger"
        title={removing?.userId === meId ? `Leave ${workspaceName}?` : `Remove ${removing?.name ?? removing?.email ?? "member"}?`}
        description={
          removing?.userId === meId
            ? "You lose access to this workspace's list, inbox and settings. An admin can invite you again."
            : "They lose access right away. Feedback, issues and runs are not affected."
        }
        confirmLabel={removing?.userId === meId ? "Leave workspace" : "Remove member"}
        onConfirm={confirmRemove}
      />
      <ConfirmDialog
        open={Boolean(revoking)}
        onOpenChange={(open) => (!open ? setRevoking(null) : undefined)}
        title={`Revoke the invite for ${revoking?.email ?? ""}?`}
        description="The link stops working and the seat is free again."
        confirmLabel="Revoke invite"
        onConfirm={confirmRevoke}
      />
    </>
  );
}
