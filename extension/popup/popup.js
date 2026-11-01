import {
  ApiError,
  clampText,
  clipItems,
  describeClipResult,
  describeClipUsage,
  fetchAccount,
  filterReviews,
  getSettings,
  groupNow,
  hostOf,
  plural,
  resolveProduct,
  saveSettings,
  shouldOfferGroupNow,
} from "../lib/api.js";
import { activeTab, scanTab } from "../lib/tab.js";

const $ = (id) => document.getElementById(id);

const state = {
  settings: null,
  account: null,
  tab: null,
  scan: null,
  busy: false,
};

const VIEWS = ["view-loading", "view-connect", "view-error", "view-main"];

function show(view) {
  for (const id of VIEWS) $(id).hidden = id !== view;
  $("foot").hidden = view !== "view-main";
}

function icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#i-${name}`);
  svg.appendChild(use);
  return svg;
}

function setStatus(tone, title, detail, link, action) {
  const box = $("status");
  box.textContent = "";
  if (!tone) return;
  const callout = document.createElement("div");
  callout.className = `callout ${tone}`;
  if (tone === "danger") callout.setAttribute("role", "alert");
  callout.appendChild(icon(tone === "danger" ? "alert" : "check"));
  const body = document.createElement("div");
  const t = document.createElement("p");
  t.className = "callout-title";
  t.textContent = title;
  body.appendChild(t);
  if (detail) {
    const d = document.createElement("p");
    d.textContent = detail;
    body.appendChild(d);
  }
  if (link || action) {
    const row = document.createElement("div");
    row.className = "callout-actions";
    if (action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-primary btn-sm";
      button.textContent = action.label;
      button.addEventListener("click", () => action.onClick(button));
      row.appendChild(button);
    }
    if (link) {
      const a = document.createElement("a");
      a.href = link.href;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = link.label;
      row.appendChild(a);
    }
    body.appendChild(row);
  }
  callout.appendChild(body);
  box.appendChild(callout);
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  button.setAttribute("aria-busy", busy ? "true" : "false");
  const labelEl = button.querySelector(".btn-label");
  if (labelEl && label) labelEl.textContent = label;
  const existing = button.querySelector(".spinner");
  const firstIcon = button.querySelector(".icon");
  if (busy && !existing) {
    const s = document.createElement("span");
    s.className = "spinner";
    s.setAttribute("aria-hidden", "true");
    if (firstIcon) firstIcon.hidden = true;
    button.insertBefore(s, button.firstChild);
  } else if (!busy && existing) {
    existing.remove();
    if (firstIcon) firstIcon.hidden = false;
  }
}

function planLabel(plan) {
  return plan === "team" ? "Team" : plan === "pro" ? "Pro" : "Free";
}

function renderAccount() {
  const { account, settings } = state;
  $("ws-name").textContent = account.workspace.name;
  const pill = $("ws-plan");
  pill.textContent = planLabel(account.workspace.plan);
  pill.className = account.workspace.plan === "free" ? "pill" : "pill brand";

  const select = $("product");
  select.textContent = "";
  for (const p of account.products) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  }
  const product = resolveProduct(account, settings.productId);
  if (product) select.value = product.id;
  select.disabled = account.products.length <= 1;

  $("usage").textContent = describeClipUsage(account.clips);
  $("open-inbox").href = account.inboxUrl || `${settings.server}/inbox`;
}

function reviewsToSend() {
  const scan = state.scan;
  if (!scan || !scan.ok) return [];
  return filterReviews(scan.reviews, { lowStarOnly: $("lowstar").checked }).map((r) => ({ ...r, site: scan.site }));
}

function renderPage() {
  const scan = state.scan;
  const reviewsBlock = $("reviews-block");
  const selectionBlock = $("selection-block");
  const emptyBlock = $("empty-block");
  const restrictedBlock = $("restricted-block");
  reviewsBlock.hidden = true;
  selectionBlock.hidden = true;
  emptyBlock.hidden = true;
  restrictedBlock.hidden = true;

  if (!scan || !scan.ok) {
    $("site-label").textContent = "This page";
    $("page-host").textContent = "";
    restrictedBlock.hidden = false;
    return;
  }

  $("site-label").textContent = scan.siteLabel || "This page";
  $("page-host").textContent = hostOf(scan.url);

  const reviews = Array.isArray(scan.reviews) ? scan.reviews : [];
  const hasReviews = scan.supported && reviews.length > 0;
  const hasSelection = typeof scan.selection === "string" && scan.selection.trim().length >= 3;

  if (hasReviews) {
    reviewsBlock.hidden = false;
    $("review-count").textContent = reviews.length.toLocaleString("en-US");
    $("review-noun").textContent = reviews.length === 1 ? "item" : "items";
    $("lowstar-row").hidden = !scan.ratingsFound;
    $("lowstar").checked = state.settings.lowStarOnly;
    updateCaptureButton();

    const preview = $("preview");
    preview.textContent = "";
    for (const r of reviewsToSend().slice(0, 3)) {
      const li = document.createElement("li");
      if (typeof r.rating === "number") {
        const stars = document.createElement("span");
        stars.className = "stars";
        stars.textContent = `${r.rating} of 5`;
        li.appendChild(stars);
      }
      li.appendChild(document.createTextNode(r.title ? `${r.title}: ${r.text}` : r.text));
      preview.appendChild(li);
    }
    preview.hidden = preview.childElementCount === 0;
  }

  if (hasSelection) {
    selectionBlock.hidden = false;
    $("selection-text").textContent = scan.selection;
    $("clip").className = hasReviews ? "btn btn-block" : "btn btn-primary btn-block";
  }

  if (!hasReviews && !hasSelection) {
    emptyBlock.hidden = false;
    if (scan.supported) {
      emptyBlock.querySelector("p").textContent =
        "No reviews are loaded on this page yet. Scroll until they appear, or select some text to clip it.";
    }
  }
}

function updateCaptureButton() {
  const items = reviewsToSend();
  const total = state.scan && Array.isArray(state.scan.reviews) ? state.scan.reviews.length : 0;
  const button = $("capture");
  button.disabled = items.length === 0;
  $("capture-label").textContent =
    items.length === 0 ? "No reviews match" : `Capture ${plural(items.length, "review")}`;
  const lowCount = $("lowstar-count");
  lowCount.textContent = $("lowstar").checked && total !== items.length ? `(${items.length} of ${total})` : "";
}

async function send(items, button, idleLabel) {
  if (state.busy) return;
  const productId = $("product").value;
  const product = state.account.products.find((p) => p.id === productId);
  if (!product) {
    setStatus("danger", "Choose a product", "Pick where this feedback should go.");
    return;
  }
  state.busy = true;
  setStatus(null);
  setBusy(button, true, "Saving");
  try {
    const result = await clipItems(state.settings, product.id, items);
    const { title, detail } = describeClipResult(result, product.name);
    const inboxLink = { href: result.inboxUrl || `${state.settings.server}/inbox`, label: "Open inbox" };
    const groupAction = shouldOfferGroupNow(result)
      ? {
          label: "Group now",
          onClick: async (btn) => {
            btn.disabled = true;
            btn.textContent = "Starting";
            try {
              const run = await groupNow(state.settings, product.id);
              setStatus("success", "Grouping started", "The ranked list updates in about a minute.", {
                href: run.runUrl,
                label: "Watch the run",
              });
              chrome.tabs.create({ url: run.runUrl });
            } catch (err) {
              const message = err instanceof Error ? err.message : "The run could not start.";
              setStatus("danger", "Could not group now", message, inboxLink);
            }
          },
        }
      : null;
    setStatus(
      "success",
      title,
      groupAction ? `${detail ? `${detail} ` : ""}Group them into issues now, or wait for the next scheduled run.` : detail,
      inboxLink,
      groupAction,
    );
    if (state.account.clips && state.account.clips.max >= 0) {
      state.account.clips.used += result.inserted || 0;
      $("usage").textContent = describeClipUsage(state.account.clips);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "That did not work. Try again.";
    if (err instanceof ApiError && err.status === 402) {
      setStatus("danger", "Monthly limit reached", message, { href: `${state.settings.server}/billing`, label: "See plans" });
    } else if (err instanceof ApiError && err.status === 401) {
      setStatus("danger", "Reconnect the extension", message);
    } else {
      setStatus("danger", "Not saved", message);
    }
  } finally {
    state.busy = false;
    setBusy(button, false, idleLabel());
    if (button.id === "capture") updateCaptureButton();
  }
}

function wire() {
  $("open-options").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("connect-open").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("error-options").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("error-retry").addEventListener("click", () => void init(true));

  $("product").addEventListener("change", (e) => {
    state.settings.productId = e.target.value;
    void saveSettings({ productId: e.target.value });
  });

  $("lowstar").addEventListener("change", (e) => {
    state.settings.lowStarOnly = e.target.checked;
    void saveSettings({ lowStarOnly: e.target.checked });
    renderPage();
  });

  $("capture").addEventListener("click", () => {
    const items = reviewsToSend();
    if (items.length === 0) return;
    void send(items, $("capture"), () => "Capture reviews");
  });

  $("clip").addEventListener("click", () => {
    const scan = state.scan;
    if (!scan || !scan.selection) return;
    void send(
      [{ text: clampText(scan.selection), url: scan.url, title: scan.title || null, site: scan.site }],
      $("clip"),
      () => "Clip selection",
    );
  });
}

async function init(forceRefresh = false) {
  show("view-loading");
  setStatus(null);
  state.settings = await getSettings();
  const { settings } = state;
  $("connect-create").href = `${settings.server}/extension`;

  if (!settings.token) {
    show("view-connect");
    return;
  }

  const tabPromise = activeTab().then(async (tab) => {
    state.tab = tab;
    state.scan = await scanTab(tab);
  });

  try {
    const fresh =
      !forceRefresh &&
      settings.account &&
      Array.isArray(settings.account.products) &&
      Date.now() - (settings.account.fetchedAt || 0) < 60 * 1000;
    if (fresh) {
      state.account = settings.account;
      // Refresh quietly so plan and usage stay current next time.
      fetchAccount(settings).catch(() => {});
    } else {
      state.account = await fetchAccount(settings);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Try again in a moment.";
    $("error-title").textContent =
      err instanceof ApiError && err.status === 401 ? "Reconnect the extension" : "Could not load your account";
    $("error-text").textContent = message;
    show("view-error");
    return;
  }

  if (!state.account.products || state.account.products.length === 0) {
    $("error-title").textContent = "Add a product first";
    $("error-text").textContent = "Your workspace has no products yet. Finish setup in BuildMonday, then come back.";
    show("view-error");
    return;
  }

  await tabPromise;
  renderAccount();
  renderPage();
  show("view-main");
}

wire();
void init();
