// Reading the active tab: asks the content script, injecting it first when the
// page has none (any site, thanks to activeTab after a user gesture).

const READABLE = /^https?:\/\//i;

async function ask(tabId, message) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, message);
    return res || null;
  } catch {
    return null;
  }
}

async function inject(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content/extract.js"] });
    return true;
  } catch {
    return false;
  }
}

/**
 * Scans a tab for reviews and the current selection.
 * Returns { ok: true, ...scan } or { ok: false, reason: "restricted" | "blocked" }.
 */
export async function scanTab(tab) {
  if (!tab || typeof tab.id !== "number" || !READABLE.test(tab.url || "")) {
    return { ok: false, reason: "restricted" };
  }
  let scan = await ask(tab.id, { type: "bm:scan" });
  if (!scan && (await inject(tab.id))) scan = await ask(tab.id, { type: "bm:scan" });
  if (!scan) return { ok: false, reason: "blocked" };
  return { ok: true, ...scan };
}

/** Selected text with line breaks kept, from a specific frame when known. */
export async function readSelection(tab, frameId) {
  if (!tab || typeof tab.id !== "number") return "";
  try {
    const results = await chrome.scripting.executeScript({
      target: typeof frameId === "number" ? { tabId: tab.id, frameIds: [frameId] } : { tabId: tab.id },
      func: () => {
        const sel = window.getSelection ? window.getSelection() : null;
        return sel ? sel.toString() : "";
      },
    });
    const value = results && results[0] ? results[0].result : "";
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

export async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}
