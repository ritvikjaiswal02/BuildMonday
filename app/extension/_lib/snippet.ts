/** Client-safe helpers for the widget snippet and its live preview. */

/** The script tag owners paste into their site. */
export function widgetSnippet(appUrl: string, publicKey: string): string {
  return `<script src="${appUrl}/widget.js" data-key="${publicKey}" async></script>`;
}

/** Variant without the floating button, opened from the site's own link or button. */
export function widgetCustomTriggerSnippet(appUrl: string, publicKey: string): string {
  return [
    `<script src="${appUrl}/widget.js" data-key="${publicKey}" data-button="false" async></script>`,
    `<button type="button" onclick="window.BuildMonday && window.BuildMonday.open()">Send feedback</button>`,
  ].join("\n");
}

export interface PreviewSettings {
  buttonLabel: string;
  prompt: string;
  position: "bottom-right" | "bottom-left";
  askEmail: boolean;
  accent: string | null;
  showBranding: boolean;
  productName: string;
}

function attr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/**
 * The document for the preview iframe: a neutral sample page with the real
 * widget script in preview mode (opens immediately, never sends anything).
 */
export function previewDocument(origin: string, s: PreviewSettings, theme: "light" | "dark" = "light"): string {
  const dark = theme === "dark";
  const bg = dark ? "#0d0f13" : "#f6f7f9";
  const surface = dark ? "#15181e" : "#ffffff";
  const line = dark ? "#252a32" : "#e2e5ea";
  const data = [
    `data-key="preview"`,
    `data-preview="true"`,
    `data-open="true"`,
    `data-label="${attr(s.buttonLabel)}"`,
    `data-prompt="${attr(s.prompt)}"`,
    `data-position="${s.position}"`,
    `data-ask-email="${s.askEmail ? "true" : "false"}"`,
    s.accent ? `data-accent="${attr(s.accent)}"` : "",
    `data-branding="${s.showBranding ? "true" : "false"}"`,
    s.productName ? `data-product-name="${attr(s.productName)}"` : "",
    dark ? `data-theme="dark"` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
html,body{margin:0;height:100%;background:${bg};font:14px/20px system-ui,sans-serif}
.nav{display:flex;align-items:center;gap:10px;height:44px;padding:0 16px;background:${surface};border-bottom:1px solid ${line}}
.dot{width:18px;height:18px;border-radius:5px;background:${line}}
.l{height:8px;border-radius:4px;background:${line}}
.main{padding:20px 16px;display:grid;gap:10px;max-width:520px}
.card{height:72px;border-radius:10px;background:${surface};border:1px solid ${line}}
</style></head><body>
<div class="nav" aria-hidden="true"><span class="dot"></span><span class="l" style="width:80px"></span></div>
<div class="main" aria-hidden="true"><span class="l" style="width:60%;height:12px"></span><span class="l" style="width:90%"></span><span class="l" style="width:75%"></span><div class="card"></div><div class="card"></div></div>
<script src="${attr(origin)}/widget.js" ${data}></script>
</body></html>`;
}
