/*! BuildMonday feedback widget: <script src="/widget.js" data-key="pk_..." async></script>
 Options: data-position, data-label, data-prompt, data-accent, data-ask-email, data-theme, data-button="false" + BuildMonday.open() */
(function () {
  "use strict";
  var w = window, d = document;
  if (w.BuildMonday && w.BuildMonday.__widget) return;

  var script = d.currentScript || d.querySelector('script[data-key][src*="widget.js"]') || d.querySelector('script[src*="widget.js"]');
  if (!script) return;
  var ds = script.dataset || {};
  var key = (ds.key || "").trim();
  if (!key) {
    console.warn('[BuildMonday] Add data-key="pk_..." to the widget script tag.');
    return;
  }
  var base;
  try {
    base = new URL(ds.api || script.src, location.href).origin;
  } catch (e) {
    base = location.origin;
  }
  var preview = ds.preview === "true";
  var MAX = 4000;
  var NET = "That did not send. Check your connection and try again.";
  var cfg = {
    productName: "",
    prompt: "What could be better?",
    askEmail: true,
    accent: null,
    position: "bottom-right",
    buttonLabel: "Feedback",
    showBranding: true,
  };

  function applyOverrides() {
    if (ds.label) cfg.buttonLabel = ds.label.slice(0, 24);
    if (ds.prompt) cfg.prompt = ds.prompt.slice(0, 120);
    if (ds.position === "bottom-left" || ds.position === "bottom-right") cfg.position = ds.position;
    if (/^#[0-9a-f]{6}$/i.test(ds.accent || "")) cfg.accent = ds.accent;
    if (ds.askEmail === "false") cfg.askEmail = false;
    if (ds.askEmail === "true") cfg.askEmail = true;
    if ((preview || key === "demo") && ds.branding === "false") cfg.showBranding = false;
    if (preview && ds.productName) cfg.productName = ds.productName.slice(0, 60);
  }

  function onAccent(hex) {
    var n = parseInt(hex.slice(1), 16);
    var c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] > 0.4 ? "#0f1419" : "#ffffff";
  }

  var ICON_MSG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  var ICON_OK = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>';

  var CSS =
    ":host{all:initial}" +
    ".r{--a:#2340d9;--on:#fff;--bg:#fff;--sk:#eef0f3;--ln:#e2e5ea;--ls:#c9cfd8;--ink:#0f1419;--ink2:#404854;--mut:#69717e;--err:#c8251b;--errs:#fdecea;--ok:#0b7a4b;" +
    "font:14px/20px ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:var(--ink);-webkit-font-smoothing:antialiased}" +
    ".r.dk{--bg:#15181e;--sk:#101318;--ln:#252a32;--ls:#363c47;--ink:#eceef1;--ink2:#b6bcc6;--mut:#8a919d;--err:#f47067;--errs:#3a1715;--ok:#4fcb8d}" +
    "*{box-sizing:border-box}svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;flex:none}" +
    "button,input,textarea{font:inherit;color:inherit}[hidden]{display:none!important}" +
    ".l{position:fixed;bottom:20px;z-index:2147483000;display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 16px;border:0;border-radius:999px;background:var(--a);color:var(--on);font-weight:600;cursor:pointer;box-shadow:0 8px 24px -6px rgba(15,20,25,.28),0 2px 6px rgba(15,20,25,.12)}" +
    ".R .l,.R .p{right:20px}.L .l,.L .p{left:20px}" +
    "button:focus-visible,a:focus-visible{outline:2px solid var(--a);outline-offset:2px}" +
    ".p{position:fixed;bottom:72px;z-index:2147483001;width:360px;max-width:calc(100vw - 40px);max-height:calc(100vh - 96px);overflow:auto;background:var(--bg);border:1px solid var(--ln);border-radius:16px;box-shadow:0 24px 56px -12px rgba(15,20,25,.3);animation:in .24s cubic-bezier(.16,1,.3,1)}" +
    "@keyframes in{from{opacity:0;transform:translateY(6px) scale(.98)}}" +
    ".h{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 16px 0 20px}" +
    "h2{margin:0;font-size:17px;line-height:24px;font-weight:600;letter-spacing:-.01em}" +
    ".x{display:inline-grid;place-items:center;width:32px;height:32px;margin:-4px -4px 0 0;border:0;border-radius:8px;background:none;color:var(--mut);cursor:pointer}.x:hover{background:var(--sk);color:var(--ink)}" +
    "form,.ok{display:flex;flex-direction:column;gap:6px;padding:12px 20px 20px}" +
    "label{font-weight:500}.o{font-weight:400;color:var(--mut)}" +
    "textarea,input{width:100%;border:1px solid var(--ls);border-radius:8px;background:var(--bg);padding:8px 10px;outline:0;transition:border-color .12s,box-shadow .12s}" +
    "textarea{min-height:112px;resize:vertical}textarea:focus,input:focus{border-color:var(--a);box-shadow:0 0 0 3px color-mix(in srgb,var(--a) 25%,transparent)}" +
    "textarea::placeholder,input::placeholder{color:var(--mut)}" +
    ".m{display:flex;justify-content:space-between;gap:8px;font-size:12px;line-height:16px;color:var(--mut);margin-bottom:8px}" +
    ".hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}" +
    ".e{margin:4px 0 0;padding:8px 10px;border-radius:8px;background:var(--errs);color:var(--err);font-size:13px}" +
    ".s{margin-top:10px;height:40px;border:0;border-radius:8px;background:var(--a);color:var(--on);font-weight:600;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px}" +
    ".s:disabled{opacity:.55;cursor:not-allowed}" +
    ".sp{width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:sp .7s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}" +
    ".ok{align-items:flex-start;gap:10px;padding-top:16px}.ok svg{width:24px;height:24px;color:var(--ok)}.ok p{margin:0;color:var(--ink2)}" +
    ".g{height:36px;padding:0 14px;border:1px solid var(--ls);border-radius:8px;background:var(--bg);font-weight:500;cursor:pointer}.g:hover{background:var(--sk)}" +
    ".b{margin:0;padding:10px 20px;border-top:1px solid var(--ln);font-size:12px;color:var(--mut)}.b a{color:inherit}" +
    "@media (max-width:480px){.mb .p{left:8px;right:8px;bottom:8px;width:auto;max-width:none;max-height:calc(100vh - 16px)}}" +
    "@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}";

  var host, root, wrap, launcher, panel, form, text, email, hp, sendBtn, errEl, done, countEl, lastFocus, isOpen = false, sending = false;
  var hideLauncher = ds.button === "false";

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return "&#" + c.charCodeAt(0) + ";";
    });
  }

  function theme() {
    var t = ds.theme;
    return t === "dark" || (t === "auto" && w.matchMedia && w.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  function build() {
    host = d.createElement("div");
    host.id = "buildmonday-widget";
    root = host.attachShadow({ mode: "open" });
    var accent = cfg.accent || "#2340d9";
    wrap = d.createElement("div");
    wrap.className = "r " + (cfg.position === "bottom-left" ? "L" : "R") + (theme() ? " dk" : "") + (preview ? "" : " mb");
    wrap.style.setProperty("--a", accent);
    wrap.style.setProperty("--on", onAccent(accent));
    var title = cfg.productName ? "Feedback for " + esc(cfg.productName) : "Send feedback";
    wrap.innerHTML =
      '<button type="button" class="l" aria-haspopup="dialog" aria-expanded="false" aria-controls="bmp">' + ICON_MSG + "<span>" + esc(cfg.buttonLabel) + "</span></button>" +
      '<div class="p" id="bmp" role="dialog" aria-modal="true" aria-labelledby="bmt" hidden>' +
      '<div class="h"><h2 id="bmt">' + title + '</h2><button type="button" class="x" aria-label="Close">' + ICON_X + "</button></div>" +
      '<form novalidate><label for="bmx">' + esc(cfg.prompt) + "</label>" +
      '<textarea id="bmx" name="text" maxlength="' + MAX + '" aria-describedby="bmc" required></textarea>' +
      '<div class="m"><span>Be as specific as you like.</span><span id="bmc" aria-live="off">0 / ' + MAX + "</span></div>" +
      (cfg.askEmail
        ? '<label for="bme">Email <span class="o">optional, if you would like a reply</span></label><input id="bme" name="email" type="email" autocomplete="email" maxlength="254" placeholder="you@example.com">'
        : "") +
      '<div class="hp" aria-hidden="true"><label for="bmw">Website</label><input id="bmw" name="website" tabindex="-1" autocomplete="off"></div>' +
      '<p class="e" role="alert" hidden></p>' +
      '<button type="submit" class="s">Send feedback</button></form>' +
      '<div class="ok" role="status" hidden>' + ICON_OK + "<p>Thanks. Your feedback went straight to the team.</p>" +
      '<button type="button" class="g">Send more</button></div>' +
      (cfg.showBranding ? '<p class="b">Feedback by <a href="' + esc(base) + '" target="_blank" rel="noopener">BuildMonday</a></p>' : "") +
      "</div>";
    var style = d.createElement("style");
    style.textContent = CSS;
    root.appendChild(style);
    root.appendChild(wrap);

    launcher = wrap.querySelector(".l");
    panel = wrap.querySelector(".p");
    form = wrap.querySelector("form");
    text = wrap.querySelector("#bmx");
    email = wrap.querySelector("#bme");
    hp = wrap.querySelector("#bmw");
    sendBtn = wrap.querySelector(".s");
    errEl = wrap.querySelector(".e");
    done = wrap.querySelector(".ok");
    countEl = wrap.querySelector("#bmc");
    if (hideLauncher) launcher.hidden = true;

    launcher.addEventListener("click", toggle);
    wrap.querySelector(".x").addEventListener("click", close);
    wrap.querySelector(".g").addEventListener("click", reset);
    text.addEventListener("input", function () {
      countEl.textContent = text.value.length + " / " + MAX;
      if (!errEl.hidden) errEl.hidden = true;
    });
    form.addEventListener("submit", submit);
    panel.addEventListener("keydown", onKey);
    d.addEventListener("pointerdown", onOutside, true);
    (d.body || d.documentElement).appendChild(host);
    if (ds.open === "true") open();
  }

  function focusables() {
    return Array.prototype.filter.call(
      panel.querySelectorAll("button,textarea,input:not([tabindex='-1']),a[href]"),
      function (n) { return !n.disabled && !n.closest("[hidden]") && !n.closest(".hp"); }
    );
  }

  function onKey(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== "Tab") return;
    var list = focusables();
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1], cur = root.activeElement;
    if (e.shiftKey && (cur === first || !panel.contains(cur))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && cur === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function onOutside(e) {
    if (!isOpen) return;
    var path = e.composedPath ? e.composedPath() : [];
    if (path.indexOf(host) === -1) close(true);
  }

  function open() {
    if (!host || isOpen) return;
    lastFocus = d.activeElement;
    isOpen = true;
    panel.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    (done.hidden ? text : done.querySelector(".g")).focus();
  }

  function close(skipFocus) {
    if (!isOpen) return;
    isOpen = false;
    panel.hidden = true;
    launcher.setAttribute("aria-expanded", "false");
    if (skipFocus === true) return;
    if (lastFocus && lastFocus !== host && lastFocus.focus && d.contains(lastFocus)) lastFocus.focus();
    else if (!launcher.hidden) launcher.focus();
  }

  function toggle() {
    isOpen ? close() : open();
  }

  function reset() {
    form.reset();
    countEl.textContent = "0 / " + MAX;
    errEl.hidden = true;
    done.hidden = true;
    form.hidden = false;
    text.focus();
  }

  function fail(msg) {
    errEl.textContent = msg;
    errEl.hidden = false;
  }

  function setSending(on) {
    sending = on;
    sendBtn.disabled = on;
    sendBtn.setAttribute("aria-busy", on ? "true" : "false");
    sendBtn.innerHTML = on ? '<span class="sp" aria-hidden="true"></span>Sending' : "Send feedback";
  }

  function succeed() {
    setSending(false);
    form.hidden = true;
    done.hidden = false;
    done.querySelector(".g").focus();
  }

  function submit(e) {
    e.preventDefault();
    if (sending) return;
    var value = text.value.trim();
    if (value.length < 3) {
      fail("Write a few words so the team knows what happened.");
      text.focus();
      return;
    }
    var mail = email ? email.value.trim() : "";
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      fail("That email address does not look right. Fix it or leave it empty.");
      email.focus();
      return;
    }
    errEl.hidden = true;
    setSending(true);
    if (preview) {
      setTimeout(succeed, 500);
      return;
    }
    var body = {
      key: key,
      text: value.slice(0, MAX),
      pageUrl: location.origin + location.pathname,
      website: hp.value,
      meta: { lang: navigator.language || "", viewport: w.innerWidth + "x" + w.innerHeight },
    };
    if (mail) body.email = mail;
    fetch(base + "/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "omit",
      mode: "cors",
    })
      .then(function (res) {
        if (res.ok) return succeed();
        setSending(false);
        fail(
          res.status === 429
            ? "You have sent a lot of feedback in a short time. Try again in a few minutes."
            : NET
        );
      })
      .catch(function () {
        setSending(false);
        fail(NET);
      });
  }

  function destroy() {
    if (!host) return;
    d.removeEventListener("pointerdown", onOutside, true);
    host.remove();
    host = null;
    isOpen = false;
    delete w.BuildMonday;
  }

  w.BuildMonday = { __widget: true, open: open, close: close, toggle: toggle, destroy: destroy };

  function start(remote) {
    if (remote) for (var k in cfg) if (remote[k] !== undefined && remote[k] !== null) cfg[k] = remote[k];
    applyOverrides();
    if (d.body) build();
    else d.addEventListener("DOMContentLoaded", build);
  }

  if (preview) return start(null);
  fetch(base + "/api/ingest/config?key=" + encodeURIComponent(key), { credentials: "omit", mode: "cors" })
    .then(function (res) {
      if (res.status === 404) {
        console.warn("[BuildMonday] This widget key is not valid. Copy the snippet again from BuildMonday.");
        delete w.BuildMonday;
        return;
      }
      return res.ok ? res.json().then(start) : start(null);
    })
    .catch(function () {
      start(null);
    });
})();
