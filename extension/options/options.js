import {
  ApiError,
  disconnect,
  fetchAccount,
  getSettings,
  hostOf,
  isTokenShape,
  normalizeServer,
  request,
  resolveProduct,
  saveSettings,
  tokenHint,
} from "../lib/api.js";

const $ = (id) => document.getElementById(id);

let settings = null;
let savedTimer = null;

function fieldError(id, message) {
  const input = $(id);
  const error = $(`${id}-error`);
  if (message) {
    input.setAttribute("aria-invalid", "true");
    error.textContent = message;
    error.hidden = false;
  } else {
    input.removeAttribute("aria-invalid");
    error.textContent = "";
    error.hidden = true;
  }
}

function setConnectStatus(tone, message) {
  const box = $("connect-status");
  box.textContent = "";
  if (!tone) return;
  const div = document.createElement("div");
  div.className = `callout ${tone}`;
  if (tone === "danger") div.setAttribute("role", "alert");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", tone === "danger" ? "#i-alert" : "#i-check");
  svg.appendChild(use);
  div.appendChild(svg);
  const p = document.createElement("p");
  p.textContent = message;
  div.appendChild(p);
  box.appendChild(div);
}

function setBusy(busy) {
  const button = $("connect");
  button.disabled = busy;
  button.setAttribute("aria-busy", busy ? "true" : "false");
  button.querySelector(".btn-label").textContent = busy ? "Connecting" : "Connect";
}

function planLabel(plan) {
  return plan === "team" ? "Team" : plan === "pro" ? "Pro" : "Free";
}

function renderConnected(account) {
  $("connect-form").hidden = true;
  $("connected").hidden = false;
  $("defaults").hidden = false;
  $("connected-title").textContent = `Connected as ${account.user.email}`;
  $("connected-detail").textContent = `Clips go to ${account.workspace.name}.`;
  $("connected-server").textContent = hostOf(settings.server);
  $("connected-token").textContent = tokenHint(settings.token);
  $("connected-plan").textContent = planLabel(account.workspace.plan);

  const select = $("product");
  select.textContent = "";
  for (const p of account.products) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  }
  if (account.products.length === 0) {
    const opt = document.createElement("option");
    opt.textContent = "No products yet";
    opt.value = "";
    select.appendChild(opt);
    select.disabled = true;
  } else {
    select.disabled = false;
    const product = resolveProduct(account, settings.productId);
    if (product) select.value = product.id;
  }
  $("lowstar").checked = settings.lowStarOnly;
}

function renderForm() {
  $("connect-form").hidden = false;
  $("connected").hidden = true;
  $("defaults").hidden = true;
  $("server").value = settings.server;
  $("token").value = "";
}

function flashSaved() {
  const el = $("defaults-status");
  el.textContent = "Saved";
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => {
    el.textContent = "";
  }, 1500);
}

async function onConnect(event) {
  event.preventDefault();
  setConnectStatus(null);
  const server = normalizeServer($("server").value);
  const token = $("token").value.trim();
  fieldError("server", server ? null : "Enter the address of your BuildMonday server, like https://build-monday.vercel.app.");
  fieldError("token", isTokenShape(token) ? null : "Paste the full token. It starts with bm_ext_.");
  if (!server) {
    $("server").focus();
    return;
  }
  if (!isTokenShape(token)) {
    $("token").focus();
    return;
  }

  setBusy(true);
  try {
    const me = await request({ server, token }, "/api/extension/me");
    const account = { ...me, fetchedAt: Date.now() };
    const product = resolveProduct(account, settings.productId);
    await saveSettings({ server, token, account, productId: product ? product.id : null });
    settings = await getSettings();
    renderConnected(account);
    $("disconnect").focus();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      fieldError("token", err.message);
      $("token").focus();
    } else if (err instanceof ApiError && (err.status === 404 || err.status === 0)) {
      setConnectStatus(
        "danger",
        err.status === 0 ? err.message : `${hostOf(server)} does not look like a BuildMonday server. Check the address.`,
      );
    } else {
      setConnectStatus("danger", err instanceof Error ? err.message : "Could not connect. Try again.");
    }
  } finally {
    setBusy(false);
  }
}

async function onDisconnect() {
  await disconnect();
  settings = await getSettings();
  renderForm();
  setConnectStatus("success", "Disconnected. Revoke the token in BuildMonday if you no longer need it.");
  $("token").focus();
}

async function init() {
  settings = await getSettings();
  $("token-link").href = `${settings.server}/extension`;

  $("connect-form").addEventListener("submit", onConnect);
  $("disconnect").addEventListener("click", () => void onDisconnect());
  $("server").addEventListener("input", () => {
    const s = normalizeServer($("server").value);
    if (s) $("token-link").href = `${s}/extension`;
  });
  $("toggle-token").addEventListener("click", () => {
    const input = $("token");
    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    $("toggle-token").setAttribute("aria-pressed", reveal ? "true" : "false");
    $("toggle-token").setAttribute("aria-label", reveal ? "Hide token" : "Show token");
  });
  $("product").addEventListener("change", async (e) => {
    await saveSettings({ productId: e.target.value });
    settings.productId = e.target.value;
    flashSaved();
  });
  $("lowstar").addEventListener("change", async (e) => {
    await saveSettings({ lowStarOnly: e.target.checked });
    settings.lowStarOnly = e.target.checked;
    flashSaved();
  });

  if (!settings.token) {
    renderForm();
    return;
  }

  if (settings.account) renderConnected(settings.account);
  try {
    const account = await fetchAccount(settings);
    renderConnected(account);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      await disconnect();
      settings = await getSettings();
      renderForm();
      setConnectStatus("danger", err.message);
    } else if (!settings.account) {
      renderForm();
      $("token").value = settings.token;
      setConnectStatus("danger", err instanceof Error ? err.message : "Could not reach BuildMonday.");
    }
  }
}

void init();
