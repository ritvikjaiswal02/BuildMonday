"use client";

/**
 * Razorpay Checkout (https://checkout.razorpay.com/v1/checkout.js) loader and
 * the small slice of its API the billing page uses.
 */

export const RAZORPAY_CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/** Monday Cobalt (light). Razorpay's theme option only accepts a hex colour. */
export const RAZORPAY_THEME_COLOR = "#2340D9";

export interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

export interface RazorpayFailure {
  error?: { code?: string; description?: string; reason?: string; source?: string; step?: string };
}

export interface RazorpayOptions {
  key: string;
  subscription_id: string;
  name: string;
  description: string;
  prefill?: { email?: string; name?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (response: RazorpaySuccess) => void;
  modal?: { ondismiss?: () => void; escape?: boolean; confirm_close?: boolean };
}

export interface RazorpayInstance {
  open(): void;
  on(event: "payment.failed", cb: (response: RazorpayFailure) => void): void;
}

export type RazorpayConstructor = new (options: RazorpayOptions) => RazorpayInstance;

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let loading: Promise<RazorpayConstructor> | null = null;

/** Resolves once window.Razorpay exists, injecting the script if next/script has not loaded it yet. */
export function loadRazorpay(timeoutMs = 15_000): Promise<RazorpayConstructor> {
  if (typeof window === "undefined") return Promise.reject(new Error("Checkout runs in the browser only."));
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (loading) return loading;

  loading = new Promise<RazorpayConstructor>((resolve, reject) => {
    const done = () => {
      if (window.Razorpay) resolve(window.Razorpay);
      else reject(new Error("Razorpay Checkout did not start."));
    };
    const timer = window.setTimeout(() => reject(new Error("Razorpay Checkout took too long to load.")), timeoutMs);

    let script = document.querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_CHECKOUT_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = RAZORPAY_CHECKOUT_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => {
      window.clearTimeout(timer);
      done();
    });
    script.addEventListener("error", () => {
      window.clearTimeout(timer);
      reject(new Error("Razorpay Checkout could not load."));
    });
    // The tag may already have finished loading before we attached listeners.
    if (window.Razorpay) {
      window.clearTimeout(timer);
      done();
    }
  }).catch((err: unknown) => {
    loading = null;
    throw err;
  });

  return loading;
}
