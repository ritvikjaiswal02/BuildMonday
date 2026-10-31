import type { Metadata } from "next";
import { AccountSettings } from "@/components/settings/AccountSettings";
import { env } from "@/lib/env";
import { loadSettingsContext } from "../_lib/data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Account" };

function supportAddress(): string {
  try {
    return `support@${new URL(env.APP_URL).hostname.replace(/^www\./, "")}`;
  } catch {
    return "support@localhost";
  }
}

export default async function AccountSettingsPage() {
  const { ctx, plan, isAdmin } = await loadSettingsContext();
  return (
    <AccountSettings
      user={{ name: ctx.user.name, email: ctx.user.email, image: ctx.user.image }}
      workspace={{ name: ctx.workspace.name, timezone: ctx.workspace.timezone }}
      canEditWorkspace={isAdmin}
      plan={plan}
      supportEmail={supportAddress()}
    />
  );
}
