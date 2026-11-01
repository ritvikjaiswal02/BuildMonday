import type { Metadata } from "next";
import { Landing } from "@/components/Landing";
import { requestCurrency, requestSignedIn } from "@/components/landing/request";
import { env } from "@/lib/env";

// Reads the visitor's country and session cookie per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "BuildMonday: know what to build on Monday" },
  description:
    "BuildMonday reads your app reviews, Reddit threads, Hacker News comments and website feedback every day, groups them into ranked engineering issues, and sends your team the list every Monday morning.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return <Landing currency={requestCurrency()} signedIn={requestSignedIn()} appUrl={env.APP_URL} />;
}
