import type { Metadata } from "next";
import Link from "next/link";
import { CalendarX2, CircleCheck, LinkIcon, MailWarning } from "lucide-react";
import { Avatar, Button, EmptyState } from "@/components/ui";
import { signOutAction } from "@/lib/auth/actions";
import { requirePageContext } from "@/lib/auth/session";
import { AcceptInvite } from "./AcceptInvite";
import { lookupInvite, maskEmail } from "./lookup";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Join a workspace" };

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[460px] rounded-xl border border-line bg-surface shadow-sm">{children}</div>
  );
}

export default async function InvitePage({ params }: { params: { token: string } }) {
  const ctx = await requirePageContext({ onboarded: false });
  const invite = await lookupInvite(params.token);
  const goHome = ctx.user.onboardedAt ? "/dashboard" : "/onboarding";

  if (invite.status === "invalid" || invite.status === "revoked") {
    return (
      <Panel>
        <EmptyState
          size="sm"
          icon={LinkIcon}
          title="This invite is no longer valid"
          description="It may have been revoked or replaced by a newer invite. Ask the person who invited you for a new link."
          action={
            <Button asChild variant="secondary">
              <Link href={goHome}>Continue to BuildMonday</Link>
            </Button>
          }
        />
      </Panel>
    );
  }

  if (invite.status === "expired") {
    return (
      <Panel>
        <EmptyState
          size="sm"
          icon={CalendarX2}
          title="This invite expired"
          description={`Invites to ${invite.workspaceName} work for 7 days. Ask an admin to send a new one from Settings, Team.`}
          action={
            <Button asChild variant="secondary">
              <Link href={goHome}>Continue to BuildMonday</Link>
            </Button>
          }
        />
      </Panel>
    );
  }

  if (invite.status === "accepted") {
    return (
      <Panel>
        <EmptyState
          size="sm"
          icon={CircleCheck}
          title={`This invite to ${invite.workspaceName} was already used`}
          description="If it was you, the workspace is in the workspace menu at the bottom of the sidebar."
          action={
            <Button asChild variant="primary">
              <Link href="/dashboard">Open the dashboard</Link>
            </Button>
          }
        />
      </Panel>
    );
  }

  if (invite.email.toLowerCase() !== ctx.user.email.toLowerCase()) {
    return (
      <Panel>
        <EmptyState
          size="sm"
          icon={MailWarning}
          title="This invite is for a different email"
          description={
            <>
              It was sent to {maskEmail(invite.email)}. You are signed in as{" "}
              <span className="font-medium text-ink-secondary">{ctx.user.email}</span>. Sign out, then open the invite
              link again and sign in with the invited address.
            </>
          }
          action={
            <form action={signOutAction}>
              <Button type="submit" variant="primary">
                Sign out
              </Button>
            </form>
          }
        />
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="px-6 pb-6 pt-7 sm:px-8 sm:pt-8">
        <p className="text-sm text-ink-muted">Invitation</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink">Join {invite.workspaceName}</h1>
        <div className="mt-5 flex items-center gap-3 rounded-lg border border-line bg-sunken px-3 py-3">
          <Avatar name={invite.inviterName} size="md" />
          <p className="min-w-0 text-sm text-ink-secondary">
            <span className="font-medium text-ink">{invite.inviterName}</span> invited you as{" "}
            {invite.role === "admin" ? "an admin" : "a member"}.
          </p>
        </div>
        <p className="mt-5 text-sm text-ink-secondary">
          {invite.role === "admin"
            ? "Admins see everything and can change sources, alerts, integrations and the team."
            : "Members see the ranked list, the inbox and every run, and choose their own alerts."}
        </p>
        <div className="mt-6">
          <AcceptInvite token={params.token} workspaceName={invite.workspaceName} />
        </div>
        <p className="mt-4 text-xs text-ink-muted">Signed in as {ctx.user.email}.</p>
      </div>
    </Panel>
  );
}
