// @vitest-environment jsdom
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const WIDGET_PATH = path.resolve(__dirname, "../../public/widget.js");
const code = readFileSync(WIDGET_PATH, "utf8");

type FetchArgs = [string, RequestInit | undefined];

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function flush(times = 5) {
  for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0));
}

function load(data: Record<string, string>) {
  const script = document.createElement("script");
  script.setAttribute("src", "https://app.buildmonday.test/widget.js");
  for (const [k, v] of Object.entries(data)) script.dataset[k] = v;
  document.head.appendChild(script);
  // eslint-disable-next-line no-new-func
  new Function(code)();
}

function shadow(): ShadowRoot {
  const host = document.getElementById("buildmonday-widget");
  if (!host || !host.shadowRoot) throw new Error("widget not rendered");
  return host.shadowRoot;
}

function q<T extends Element>(selector: string): T {
  const el = shadow().querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

function key(target: Element, k: string, opts: KeyboardEventInit = {}) {
  target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, composed: true, ...opts }));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "<main><button id='page-button'>Page</button></main>";
  delete (window as { BuildMonday?: unknown }).BuildMonday;
  fetchMock = vi.fn(async (url: string) => {
    if (url.includes("/api/ingest/config")) {
      return jsonResponse(200, {
        productName: "Acme Notes",
        prompt: "What could be better?",
        askEmail: true,
        accent: null,
        position: "bottom-right",
        buttonLabel: "Feedback",
        showBranding: true,
      });
    }
    return jsonResponse(201, { ok: true });
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  (window as { BuildMonday?: { destroy: () => void } }).BuildMonday?.destroy();
  vi.unstubAllGlobals();
});

describe("public/widget.js", () => {
  it("stays under 15 KB", () => {
    expect(statSync(WIDGET_PATH).size).toBeLessThan(15 * 1024);
  });

  it("loads its config from the script's origin and renders in a shadow root", async () => {
    load({ key: "pk_test123" });
    await flush();
    expect(fetchMock.mock.calls[0][0]).toBe("https://app.buildmonday.test/api/ingest/config?key=pk_test123");
    const launcher = q<HTMLButtonElement>(".l");
    expect(launcher.textContent).toBe("Feedback");
    expect(launcher.getAttribute("aria-haspopup")).toBe("dialog");
    expect(launcher.getAttribute("aria-expanded")).toBe("false");
    expect(q<HTMLElement>(".p").hidden).toBe(true);
    expect(q("#bmt").textContent).toBe("Feedback for Acme Notes");
    expect(q(".b").textContent).toContain("Feedback by BuildMonday");
    // Page styles cannot reach the widget.
    expect(document.querySelector(".l")).toBeNull();
  });

  it("applies the server settings", async () => {
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse(200, {
        productName: "Acme",
        prompt: "Tell us what broke",
        askEmail: false,
        accent: "#ffcc00",
        position: "bottom-left",
        buttonLabel: "Ideas?",
        showBranding: false,
      }),
    );
    load({ key: "pk_test123" });
    await flush();
    expect(q(".l").textContent).toBe("Ideas?");
    expect(q("label[for='bmx']").textContent).toBe("Tell us what broke");
    expect(shadow().querySelector("#bme")).toBeNull();
    expect(shadow().querySelector(".b")).toBeNull();
    const wrap = q<HTMLElement>(".r");
    expect(wrap.classList.contains("L")).toBe(true);
    expect(wrap.style.getPropertyValue("--a")).toBe("#ffcc00");
    // Dark text on a light accent.
    expect(wrap.style.getPropertyValue("--on")).toBe("#0f1419");
  });

  it("opens with focus in the text box, traps Tab and closes on Escape", async () => {
    load({ key: "pk_test123" });
    await flush();
    const launcher = q<HTMLButtonElement>(".l");
    launcher.focus();
    launcher.click();
    expect(q<HTMLElement>(".p").hidden).toBe(false);
    expect(launcher.getAttribute("aria-expanded")).toBe("true");
    expect(shadow().activeElement?.id).toBe("bmx");

    const submit = q<HTMLButtonElement>(".s");
    const link = q<HTMLAnchorElement>(".b a");
    link.focus();
    key(link, "Tab");
    expect(shadow().activeElement?.className).toBe("x");
    key(q(".x"), "Tab", { shiftKey: true });
    expect(shadow().activeElement).toBe(link);
    expect(submit).toBeTruthy();

    key(q("#bmx"), "Escape");
    expect(q<HTMLElement>(".p").hidden).toBe(true);
    expect(launcher.getAttribute("aria-expanded")).toBe("false");
    expect(shadow().activeElement).toBe(launcher);
  });

  it("validates before sending", async () => {
    load({ key: "pk_test123" });
    await flush();
    window.BuildMonday!.open();
    const text = q<HTMLTextAreaElement>("#bmx");
    text.value = "no";
    q<HTMLFormElement>("form").dispatchEvent(new Event("submit", { cancelable: true }));
    expect(q<HTMLElement>(".e").hidden).toBe(false);
    expect(q(".e").textContent).toContain("Write a few words");

    text.value = "The export button does nothing";
    q<HTMLInputElement>("#bme").value = "not-an-email";
    q<HTMLFormElement>("form").dispatchEvent(new Event("submit", { cancelable: true }));
    expect(q(".e").textContent).toContain("email address");
    expect(fetchMock).toHaveBeenCalledTimes(1); // config only
  });

  it("posts feedback and shows the confirmation", async () => {
    load({ key: "pk_test123" });
    await flush();
    window.BuildMonday!.open();
    q<HTMLTextAreaElement>("#bmx").value = "  The export button does nothing  ";
    q<HTMLInputElement>("#bme").value = "sam@example.com";
    q<HTMLFormElement>("form").dispatchEvent(new Event("submit", { cancelable: true }));
    expect(q<HTMLButtonElement>(".s").disabled).toBe(true);
    await flush();

    const [url, init] = fetchMock.mock.calls[1] as FetchArgs;
    expect(url).toBe("https://app.buildmonday.test/api/ingest");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ key: "pk_test123", text: "The export button does nothing", email: "sam@example.com", website: "" });
    expect(body.pageUrl).toBe(`${location.origin}${location.pathname}`);
    expect(JSON.stringify(body.meta).length).toBeLessThan(2048);

    expect(q<HTMLElement>("form").hidden).toBe(true);
    expect(q<HTMLElement>(".ok").hidden).toBe(false);
    expect(q(".ok").textContent).toContain("Thanks. Your feedback went straight to the team.");

    q<HTMLButtonElement>(".g").click();
    expect(q<HTMLElement>("form").hidden).toBe(false);
    expect(q<HTMLTextAreaElement>("#bmx").value).toBe("");
  });

  it("passes the honeypot through for the server to judge", async () => {
    load({ key: "pk_test123" });
    await flush();
    window.BuildMonday!.open();
    q<HTMLTextAreaElement>("#bmx").value = "Buy cheap things";
    q<HTMLInputElement>("#bmw").value = "spam.example";
    q<HTMLFormElement>("form").dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();
    const body = JSON.parse(String((fetchMock.mock.calls[1] as FetchArgs)[1]?.body));
    expect(body.website).toBe("spam.example");
  });

  it("shows the connection message when sending fails", async () => {
    load({ key: "pk_test123" });
    await flush();
    fetchMock.mockImplementationOnce(async () => {
      throw new TypeError("network down");
    });
    window.BuildMonday!.open();
    q<HTMLTextAreaElement>("#bmx").value = "The export button does nothing";
    q<HTMLFormElement>("form").dispatchEvent(new Event("submit", { cancelable: true }));
    await flush();
    expect(q(".e").textContent).toBe("That did not send. Check your connection and try again.");
    expect(q<HTMLButtonElement>(".s").disabled).toBe(false);
    expect(q<HTMLTextAreaElement>("#bmx").value).toBe("The export button does nothing");
  });

  it("does not render for an unknown key", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockImplementationOnce(async () => jsonResponse(404, { error: "Unknown key", code: "not_found" }));
    load({ key: "pk_unknown" });
    await flush();
    expect(document.getElementById("buildmonday-widget")).toBeNull();
    expect(window.BuildMonday).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it("does nothing without a key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    load({});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("previews without any network calls", async () => {
    vi.useFakeTimers();
    try {
      load({ key: "preview", preview: "true", open: "true", label: "Tell us", branding: "false", productName: "Acme" });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(q(".l").textContent).toBe("Tell us");
      expect(q<HTMLElement>(".p").hidden).toBe(false);
      expect(shadow().querySelector(".b")).toBeNull();
      expect(q("#bmt").textContent).toBe("Feedback for Acme");
      q<HTMLTextAreaElement>("#bmx").value = "Looks good in the preview";
      q<HTMLFormElement>("form").dispatchEvent(new Event("submit", { cancelable: true }));
      vi.advanceTimersByTime(600);
      expect(q<HTMLElement>(".ok").hidden).toBe(false);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a single instance and exposes open, close and destroy", async () => {
    load({ key: "pk_test123" });
    load({ key: "pk_test123" });
    await flush();
    expect(document.querySelectorAll("#buildmonday-widget")).toHaveLength(1);
    window.BuildMonday!.open();
    expect(q<HTMLElement>(".p").hidden).toBe(false);
    window.BuildMonday!.close();
    expect(q<HTMLElement>(".p").hidden).toBe(true);
    window.BuildMonday!.destroy();
    expect(document.getElementById("buildmonday-widget")).toBeNull();
    expect(window.BuildMonday).toBeUndefined();
  });

  it("closes when the visitor clicks outside", async () => {
    load({ key: "pk_test123" });
    await flush();
    window.BuildMonday!.open();
    document.getElementById("page-button")!.dispatchEvent(new Event("pointerdown", { bubbles: true, composed: true }));
    expect(q<HTMLElement>(".p").hidden).toBe(true);
  });
});
