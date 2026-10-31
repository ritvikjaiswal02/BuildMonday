import { describe, expect, it } from "vitest";
import { errorCodeFromUrl, loginErrorMessage } from "@/app/login/errors";
import { renderInviteEmail } from "@/app/settings/team/invite-email";
import { actionError } from "@/app/settings/_lib/action-result";
import { HttpError } from "@/lib/auth/http";
import { z } from "zod";

describe("login errors", () => {
  it("maps Auth.js codes to sentences", () => {
    expect(loginErrorMessage("Verification")).toMatch(/expired or was already used/);
    expect(loginErrorMessage("SomethingNew")).toBe("Sign-in did not complete. Try again.");
    expect(loginErrorMessage(null)).toBeNull();
  });

  it("reads error codes from redirect URLs", () => {
    expect(errorCodeFromUrl("http://localhost:3000/login?error=EmailSignin")).toBe("EmailSignin");
    expect(errorCodeFromUrl("/login?check=email")).toBeNull();
    expect(errorCodeFromUrl(undefined)).toBeNull();
  });
});

describe("invite email", () => {
  it("uses the contracted subject and escapes names", () => {
    const mail = renderInviteEmail({
      inviterName: "Ana <script>",
      workspaceName: "Acme & Co",
      url: "https://app.example.com/onboarding/invite/abc",
      role: "member",
      expiresInDays: 7,
    });
    expect(mail.subject).toBe("Ana <script> invited you to Acme & Co on BuildMonday");
    expect(mail.html).toContain("Ana &lt;script&gt;");
    expect(mail.html).toContain("Acme &amp; Co");
    expect(mail.html).toContain("https://app.example.com/onboarding/invite/abc");
    expect(mail.text).toContain("works for 7 days");
  });
});

describe("actionError", () => {
  it("returns plan details for 402s", () => {
    const err = new HttpError(402, "plan_required", "Slack alerts are on Pro and Team.", {
      feature: "slack_alerts",
      requiredPlan: "pro",
    });
    expect(actionError(err)).toEqual({
      ok: false,
      error: "Slack alerts are on Pro and Team.",
      plan: { error: "Slack alerts are on Pro and Team.", code: "plan_required", feature: "slack_alerts", requiredPlan: "pro" },
    });
  });

  it("keeps HttpError and zod messages, hides others", () => {
    expect(actionError(new HttpError(403, "forbidden", "Only workspace admins can do this."))).toEqual({
      ok: false,
      error: "Only workspace admins can do this.",
    });
    const zod = z.string().email("Enter a valid email address.").safeParse("x");
    expect(actionError(zod.success ? null : zod.error).error).toBe("Enter a valid email address.");
    const original = console.error;
    console.error = () => undefined;
    expect(actionError(new Error("db exploded")).error).toMatch(/Something went wrong/);
    console.error = original;
  });

  it("rethrows Next redirects", () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/dashboard;307;" });
    expect(() => actionError(redirect)).toThrow("NEXT_REDIRECT");
  });
});
