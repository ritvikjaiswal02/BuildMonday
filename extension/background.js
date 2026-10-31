// BuildMonday service worker: context menus, the keyboard shortcut and the
// clip requests they trigger. The popup clips on its own; this file handles
// everything that happens without the popup open.

import {
  ApiError,
  acceptExternalConnect,
  adoptBundledToken,
  clampText,
  clipItems,
  describeClipResult,
  ensureAccount,
  fetchAccount,
  filterReviews,
  getSettings,
  resolveProduct,
  saveSettings,
  siteFromUrl,
} from "./lib/api.js";
import { readSelection, scanTab } from "./lib/tab.js";

const MENU_CLIP = "bm-clip-selection";
const MENU_CAPTURE = "bm-capture-page";

const REVIEW_PAGES = [
  "https://play.google.com/*",
  "https://apps.apple.com/*",
  "https://www.reddit.com/*",
  "https://old.reddit.com/*",
  "https://news.ycombinator.com/*",
  "https://www.trustpilot.com/*",
  "https://*.trustpilot.com/*",
  "https://www.g2.com/*",
  "https://www.producthunt.com/*",
  "https://x.com/*",
  "https://twitter.com/*",
];

const COLORS = { ok: "#0B7A4B", error: "#C8251B", busy: "#2340D9" };

/** Notification id -> URL to open when it is clicked. Lost if the worker restarts, which only disables the click. */
const notificationLinks = new Map();

function createMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_CLIP,
      title: "Clip to BuildMonday",
      contexts: ["selection"],
    });
    chrome.contextMenus.create({
      id: MENU_CAPTURE,
      title: "Capture reviews on this page",
      contexts: ["page"],
      documentUrlPatterns: REVIEW_PAGES,
    });
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  createMenus();
  if (details.reason !== "install") return;
  // Signed-in downloads carry a token: connect without asking, then show the options page as confirmation.
  adoptBundledToken()
    .then(async (connected) => {
      if (connected) {
        const settings = await getSettings();
        await fetchAccount(settings).catch(() => null);
      }
    })
    .finally(() => chrome.runtime.openOptionsPage());
});

// "Connect this browser" on the BuildMonday Extension page sends the token here.
// Only pages listed in externally_connectable can reach this listener, and the
// page's origin must match the server it asks us to use.
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message && message.type === "bm:ping") {
    getSettings()
      .then((settings) => sendResponse({ ok: true, version: chrome.runtime.getManifest().version, connected: Boolean(settings.token) }))
      .catch(() => sendResponse({ ok: true, connected: false }));
    return true;
  }
  const accepted = acceptExternalConnect(message, sender && (sender.origin || (sender.url ? new URL(sender.url).origin : null)));
  if (!accepted) {
    sendResponse({ ok: false, error: "This page cannot connect the extension." });
    return false;
  }
  saveSettings({ server: accepted.server, token: accepted.token, account: null, productId: null })
    .then(() => getSettings())
    .then((settings) => fetchAccount(settings))
    .then((account) =>
      sendResponse({ ok: true, workspace: account && account.workspace ? account.workspace.name : null }),
    )
    .catch((err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : "Could not connect." }));
  return true;
});

chrome.runtime.onStartup.addListener(createMenus);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_CLIP) void clipSelection(tab, info);
  else if (info.menuItemId === MENU_CAPTURE) void capturePage(tab);
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "clip-selection") void clipSelection(tab, null);
});

chrome.notifications.onClicked.addListener((id) => {
  const url = notificationLinks.get(id);
  if (url) {
    chrome.tabs.create({ url });
    notificationLinks.delete(id);
  }
  chrome.notifications.clear(id);
});

// The popup and options page tell the worker when the connection changes so
// the cached account is refreshed right away.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "bm:refresh-account") {
    getSettings()
      .then((settings) => (settings.token ? fetchAccount(settings) : null))
      .then((account) => sendResponse({ ok: true, account }))
      .catch((err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }));
    return true;
  }
  return false;
});

async function setBadge(tabId, text, color) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color, tabId });
    await chrome.action.setBadgeText({ text, tabId });
    if (typeof chrome.action.setBadgeTextColor === "function") {
      await chrome.action.setBadgeTextColor({ color: "#FFFFFF", tabId });
    }
  } catch {
    /* the tab may have closed */
  }
}

function clearBadgeLater(tabId, ms = 4000) {
  setTimeout(() => {
    chrome.action.setBadgeText({ text: "", tabId }).catch(() => {});
  }, ms);
}

function notify(title, message, link) {
  const options = {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon128.png"),
    title,
    message,
    priority: 0,
  };
  chrome.notifications.create("", options, (id) => {
    if (link && id) notificationLinks.set(id, link);
  });
}

async function connectedContext() {
  const settings = await getSettings();
  if (!settings.token) {
    notify("Connect BuildMonday first", "Paste a token on the options page, then try again.");
    chrome.runtime.openOptionsPage();
    return null;
  }
  try {
    const account = await ensureAccount(settings);
    const product = resolveProduct(account, settings.productId);
    if (!product) {
      notify("No product to save to", "Add a product in BuildMonday, then try again.", `${settings.server}/onboarding?new=1`);
      return null;
    }
    return { settings, account, product };
  } catch (err) {
    reportError(err, settings);
    return null;
  }
}

function reportError(err, settings, tabId) {
  const message = err instanceof Error ? err.message : "That did not work. Try again.";
  let link = null;
  if (err instanceof ApiError && err.status === 402 && settings) link = `${settings.server}/billing`;
  if (err instanceof ApiError && err.status === 401) {
    chrome.runtime.openOptionsPage();
  }
  if (typeof tabId === "number") {
    void setBadge(tabId, "!", COLORS.error);
    clearBadgeLater(tabId, 6000);
  }
  notify(err instanceof ApiError && err.status === 402 ? "Monthly limit reached" : "Clip not saved", message, link);
}

async function send(tab, ctx, items) {
  const tabId = tab && typeof tab.id === "number" ? tab.id : undefined;
  if (typeof tabId === "number") await setBadge(tabId, "…", COLORS.busy);
  try {
    const result = await clipItems(ctx.settings, ctx.product.id, items);
    const { title, detail } = describeClipResult(result, ctx.product.name);
    if (typeof tabId === "number") {
      await setBadge(tabId, result.inserted > 0 ? String(Math.min(result.inserted, 99)) : "0", COLORS.ok);
      clearBadgeLater(tabId);
    }
    notify(title, detail, result.inboxUrl || `${ctx.settings.server}/inbox`);
  } catch (err) {
    reportError(err, ctx.settings, tabId);
  }
}

async function clipSelection(tab, info) {
  if (!tab) return;
  const ctx = await connectedContext();
  if (!ctx) return;

  let text = await readSelection(tab, info && typeof info.frameId === "number" ? info.frameId : undefined);
  if (!text && info && info.selectionText) text = info.selectionText.trim();
  if (!text || text.length < 3) {
    notify("Nothing selected", "Select the feedback text on the page, then clip it again.");
    return;
  }

  const site = siteFromUrl(tab.url || "");
  await send(tab, ctx, [
    {
      text: clampText(text),
      url: tab.url || null,
      title: tab.title || null,
      site,
    },
  ]);
}

async function capturePage(tab) {
  if (!tab) return;
  const ctx = await connectedContext();
  if (!ctx) return;

  const scan = await scanTab(tab);
  if (!scan.ok || !scan.supported) {
    notify("Nothing to capture here", "Open a review page on a supported site, or select text and clip it.");
    return;
  }
  const items = filterReviews(scan.reviews, { lowStarOnly: ctx.settings.lowStarOnly }).map((r) => ({
    ...r,
    site: scan.site,
  }));
  if (items.length === 0) {
    notify(
      "No reviews found",
      scan.reviews.length > 0
        ? "Every review on this page is rated 4 or 5 stars. Turn off the low-star filter in the popup to capture them."
        : "Scroll until the reviews load, then try again.",
    );
    return;
  }
  await send(tab, ctx, items);
}
