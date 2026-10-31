// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui";
import { DEFAULT_WIDGET_SETTINGS } from "@/lib/db/schema";
import type { ProductDTO } from "@/lib/db/dto";
import type { ExtensionTokenRow } from "@/app/api/extension/_lib/service";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/extension",
  useSearchParams: () => new URLSearchParams(),
}));

import { ExtensionTabs } from "@/app/extension/_components/ExtensionTabs";
import { previewDocument, widgetSnippet } from "@/app/extension/_lib/snippet";

const product: ProductDTO = {
  id: "p1",
  name: "Acme Notes",
  websiteUrl: "https://acme.com",
  description: null,
  publicKey: "pk_abcdefghijklmnopqrstuvwx",
  monitoringEnabled: true,
  lastRunAt: null,
  nextRunAt: null,
  alertThreshold: 70,
  autofileEnabled: false,
  autofileTarget: null,
  autofileThreshold: 80,
  widgetSettings: { ...DEFAULT_WIDGET_SETTINGS },
  allowedOrigins: [],
  createdAt: "2026-10-01T00:00:00.000Z",
};

const token: ExtensionTokenRow = {
  id: "t1",
  name: "Chrome on Mac",
  prefix: "bm_ext_A1b2C",
  lastUsedAt: null,
  createdAt: "2026-10-20T00:00:00.000Z",
  revokedAt: null,
  mine: true,
  owner: { name: "Ritvik", email: "ritvik@example.com" },
};

function renderTabs(overrides: Partial<React.ComponentProps<typeof ExtensionTabs>> = {}) {
  return render(
    <TooltipProvider>
      <ExtensionTabs
        initialTab="extension"
        appUrl="https://app.buildmonday.test"
        plan="free"
        isAdmin
        tokens={[token]}
        clips={{ used: 12, max: 100 }}
        products={[product]}
        activeProductId="p1"
        activity={{}}
        {...overrides}
      />
    </TooltipProvider>,
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  router.replace.mockReset();
  router.refresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("snippet helpers", () => {
  it("builds the script tag and a preview document", () => {
    expect(widgetSnippet("https://app.test", "pk_1")).toBe('<script src="https://app.test/widget.js" data-key="pk_1" async></script>');
    const doc = previewDocument("https://app.test", {
      buttonLabel: 'Say "hi"',
      prompt: "What broke?",
      position: "bottom-left",
      askEmail: false,
      accent: "#0e8a7d",
      showBranding: true,
      productName: "Acme",
    });
    expect(doc).toContain('src="https://app.test/widget.js"');
    expect(doc).toContain('data-preview="true"');
    expect(doc).toContain('data-label="Say &quot;hi&quot;"');
    expect(doc).toContain('data-ask-email="false"');
    expect(doc).toContain('data-position="bottom-left"');
  });
});

describe("/extension page", () => {
  it("shows install steps, the token list and clip usage", () => {
    renderTabs();
    expect(screen.getByRole("heading", { name: "Install the extension" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Download extension/ })).toHaveAttribute("href", "/api/extension/download");
    expect(screen.getByText("Chrome on Mac")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke Chrome on Mac" })).toBeInTheDocument();
  });

  it("shows an empty state without tokens", () => {
    renderTabs({ tokens: [] });
    expect(screen.getByText("No tokens yet")).toBeInTheDocument();
  });

  it("creates a token and shows it once", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          token: "bm_ext_plaintextplaintextplaintext",
          record: { ...token, id: "t2", name: "Work laptop" },
        }),
        { status: 201 },
      ),
    );
    renderTabs({ tokens: [] });
    fireEvent.click(screen.getAllByRole("button", { name: "Create token" })[0]);
    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByLabelText("Name");
    fireEvent.change(input, { target: { value: "Work laptop" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create token" }));

    await screen.findByText("You will not see this token again");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/extension/tokens",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Work laptop" }) }),
    );
    expect(screen.getByDisplayValue("bm_ext_plaintextplaintextplaintext")).toBeInTheDocument();
  });

  it("shows the server's error when the token limit is reached", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "This workspace has 10 active tokens.", code: "conflict" }), { status: 409 }),
    );
    renderTabs({ tokens: [] });
    fireEvent.click(screen.getAllByRole("button", { name: "Create token" })[0]);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Create token" }));
    expect(await within(dialog).findByText("This workspace has 10 active tokens.")).toBeInTheDocument();
  });

  it("revokes a token after confirmation", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    renderTabs();
    fireEvent.click(screen.getByRole("button", { name: "Revoke Chrome on Mac" }));
    const dialog = await screen.findByRole("dialog");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "Revoke token" }));
    });
    await waitFor(() => expect(screen.queryByText("Chrome on Mac")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("/api/extension/tokens/t1", expect.objectContaining({ method: "DELETE" }));
  });

  it("shows the widget snippet and saves settings", async () => {
    const saved = { ...product, widgetSettings: { ...product.widgetSettings, buttonLabel: "Ideas?" }, allowedOrigins: ["https://acme.com"] };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ product: saved }), { status: 200 }));
    renderTabs({ initialTab: "widget" });

    expect(screen.getByDisplayValue(widgetSnippet("https://app.buildmonday.test", product.publicKey))).toBeInTheDocument();
    expect(screen.getByText("No messages yet.")).toBeInTheDocument();

    const save = screen.getByRole("button", { name: "Save widget" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Button label"), { target: { value: "Ideas?" } });
    fireEvent.change(screen.getByLabelText(/Allowed sites/), { target: { value: "https://acme.com" } });
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(save);
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/products/p1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({
      widgetSettings: { buttonLabel: "Ideas?", prompt: "What could be better?", position: "bottom-right", askEmail: true, accent: null },
      allowedOrigins: ["https://acme.com"],
    });
    await waitFor(() => expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument());
  });

  it("validates widget fields before saving", () => {
    renderTabs({ initialTab: "widget" });
    fireEvent.change(screen.getByLabelText("Button label"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save widget" }));
    expect(screen.getByText("Add a button label.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is read-only for members", () => {
    renderTabs({ initialTab: "widget", isAdmin: false });
    expect(screen.getByText("Only workspace admins can change the widget.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save widget" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Button label")).toBeDisabled();
  });

  it("asks for a product when there is none", () => {
    renderTabs({ initialTab: "widget", products: [], activeProductId: null });
    expect(screen.getByText("Add your first product")).toBeInTheDocument();
  });
});
