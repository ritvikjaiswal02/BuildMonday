import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutDashboard, Lock, Users } from "lucide-react";
import { OnboardingWizard, type OnboardingPrefill } from "@/components/onboarding/OnboardingWizard";
import { Button, Callout, EmptyState } from "@/components/ui";
import { dashboardAfterOnboarding, onboardingThen } from "@/lib/auth/cookies";
import { requirePageContext } from "@/lib/auth/session";
import { getWorkspacePlan } from "@/lib/billing/entitlements";
import { digestTimingCopy, parseDigestMode } from "@/lib/digest/schedule";
import { env } from "@/lib/env";
import { oauthAvailability } from "@/lib/oauth/providers";
import { listIntegrations } from "@/app/api/integrations/_lib/service";
import { formatLimit, isUnlimited, limitFor, minimumPlanFor } from "@/lib/plans";
import { detectSourceFromUrl } from "@/lib/sources";
import { countActiveProducts } from "@/app/api/products/_lib/service";
import { finishMemberOnboardingAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Set up BuildMonday" };

type SearchParams = {
  new?: string | string[];
  source?: string | string[];
  then?: string | string[];
  connected?: string | string[];
  integration_error?: string | string[];
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Turns `?source=<url>` (from the free analyzer) into a step 2 prefill. */
function prefillFromSource(raw: string | undefined): OnboardingPrefill | null {
  if (!raw || raw.length > 2048) return null;
  let detected: ReturnType<typeof detectSourceFromUrl> = null;
  try {
    detected = detectSourceFromUrl(raw);
  } catch {
    detected = null;
  }
  if (!detected) return null;
  const { kind, config, label } = detected;
  switch (kind) {
    case "appstore": {
      const c = config as { appId: string; country: string };
      return { kind, input: c.appId, country: c.country, label };
    }
    case "playstore":
      return { kind, input: (config as { packageName: string }).packageName, label };
    case "trustpilot":
      return { kind, input: (config as { domain: string }).domain, label };
    case "reddit": {
      const c = config as { mode: string; subreddit?: string; url?: string };
      if (c.mode === "subreddit" && c.subreddit) return { kind, input: `r/${c.subreddit}`, label };
      const sub = c.url ? /\/r\/([^/]+)/i.exec(c.url)?.[1] : undefined;
      return sub ? { kind, input: `r/${sub}`, label } : null;
    }
    case "hackernews": {
      const c = config as { mode: string; query?: string };
      return c.mode === "search" && c.query ? { kind, input: c.query, label } : null;
    }
    default:
      return null;
  }
}

export default async function OnboardingPage({ searchParams }: { searchParams: SearchParams }) {
  const ctx = await requirePageContext({ onboarded: false });
  const isNew = first(searchParams.new) === "1";
  if (ctx.user.onboardedAt && !isNew) redirect("/dashboard");

  if (ctx.role === "member") {
    return (
      <div className="mx-auto max-w-[560px] rounded-lg border border-line bg-surface shadow-xs">
        <EmptyState
          icon={Users}
          title={`You are a member of ${ctx.workspace.name}`}
          description="Admins add products and sources for this workspace. Your dashboard already shows the team's list."
          action={
            <form action={finishMemberOnboardingAction}>
              <Button type="submit" variant="primary" leftIcon={<LayoutDashboard />}>
                Open the dashboard
              </Button>
            </form>
          }
        />
      </div>
    );
  }

  const [planState, productCount, integrations] = await Promise.all([
    getWorkspacePlan(ctx.workspace.id),
    countActiveProducts(ctx.workspace.id),
    listIntegrations(ctx.workspace.id),
  ]);
  // A visitor who chose a paid plan before signing up continues to it after setup.
  const then = onboardingThen(first(searchParams.then));
  const returnParams = new URLSearchParams();
  if (isNew) returnParams.set("new", "1");
  if (then) returnParams.set("then", then);
  const returnQuery = returnParams.toString();
  const returnTo = `/onboarding${returnQuery ? `?${returnQuery}` : ""}`;
  const integrationError = first(searchParams.integration_error);
  const plan = planState.plan.id;
  const productLimit = limitFor(plan, "products");

  if ((isNew || productCount > 0) && !isUnlimited(productLimit) && productCount >= productLimit) {
    const needed = minimumPlanFor("products", productCount + 1);
    return (
      <div className="mx-auto max-w-[560px] rounded-lg border border-line bg-surface shadow-xs">
        <EmptyState
          icon={Lock}
          title="Your plan is full"
          description={`Your plan includes ${formatLimit(productLimit)} ${productLimit === 1 ? "product" : "products"}. Upgrade to watch another one, or archive a product in Settings.`}
          action={
            <Button asChild variant="primary">
              <Link href={`/billing?plan=${needed === "free" ? "pro" : needed}&interval=month`}>See plans</Link>
            </Button>
          }
          secondaryAction={
            <Button asChild variant="ghost">
              <Link href="/dashboard">Back to the dashboard</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <>
      {integrationError ? (
        <Callout tone="danger" title="That connection did not finish" className="mx-auto mb-8 max-w-[880px]">
          {integrationError.slice(0, 300)}
        </Callout>
      ) : null}
      <OnboardingWizard
        mode={isNew ? "new" : "first"}
        plan={plan}
        prefill={prefillFromSource(first(searchParams.source))}
        initialAnswers={ctx.workspace.onboardingAnswers ?? null}
        afterSetupHref={isNew ? "/dashboard?first=1" : dashboardAfterOnboarding(then)}
        integrations={integrations}
        oauth={oauthAvailability()}
        digestCopy={digestTimingCopy(parseDigestMode(env.DIGEST_SCHEDULE))}
        returnTo={returnTo}
      />
    </>
  );
}
