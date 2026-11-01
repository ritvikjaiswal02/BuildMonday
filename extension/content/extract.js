/*
 * BuildMonday content script.
 *
 * Reads reviews and comments that are already rendered on supported review
 * sites, and the current text selection on any page. It does nothing on its
 * own: it only answers messages from the extension popup or service worker,
 * and it never sends data anywhere itself.
 *
 * Exposes globalThis.BuildMondayExtract for the popup's injected fallback and
 * for tests.
 */
(function () {
  "use strict";

  var MAX_ITEMS = 200;
  var MIN_TEXT = 3;
  var MAX_TEXT = 4000;

  var SITE_LABELS = {
    playstore: "Google Play",
    appstore: "App Store",
    reddit: "Reddit",
    hackernews: "Hacker News",
    trustpilot: "Trustpilot",
    g2: "G2",
    producthunt: "Product Hunt",
    x: "X",
    other: "This page",
  };

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function siteFromUrl(href) {
    var host;
    try {
      host = new URL(href).hostname.toLowerCase();
    } catch (e) {
      return "other";
    }
    host = host.replace(/^www\./, "").replace(/^m\./, "");
    if (host === "play.google.com") return "playstore";
    if (host === "apps.apple.com" || host === "itunes.apple.com") return "appstore";
    if (host === "reddit.com" || host === "old.reddit.com" || host === "new.reddit.com") return "reddit";
    if (host === "news.ycombinator.com") return "hackernews";
    if (host === "trustpilot.com" || /(^|\.)trustpilot\.com$/.test(host)) return "trustpilot";
    if (host === "g2.com") return "g2";
    if (host === "producthunt.com") return "producthunt";
    if (host === "x.com" || host === "twitter.com" || host === "mobile.twitter.com") return "x";
    return "other";
  }

  function textOf(el) {
    if (!el) return "";
    var raw = typeof el.innerText === "string" && el.innerText ? el.innerText : el.textContent || "";
    return clean(raw);
  }

  /** Collapses spaces, keeps paragraph breaks, trims. */
  function clean(raw) {
    return String(raw || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t ​]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function oneLine(raw, max) {
    var t = clean(raw).replace(/\s+/g, " ");
    if (!t) return null;
    return t.length > max ? t.slice(0, max) : t;
  }

  function q(root, selector) {
    try {
      return root.querySelector(selector);
    } catch (e) {
      return null;
    }
  }

  function qa(root, selector) {
    try {
      return Array.prototype.slice.call(root.querySelectorAll(selector));
    } catch (e) {
      return [];
    }
  }

  function first(root, selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var el = q(root, selectors[i]);
      if (el) return el;
    }
    return null;
  }

  function absUrl(href) {
    if (!href) return null;
    try {
      var u = new URL(href, location.href);
      return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
    } catch (e) {
      return null;
    }
  }

  function isoDate(value) {
    if (value === null || value === undefined || value === "") return null;
    var d;
    if (typeof value === "number" || /^\d{9,13}$/.test(String(value))) {
      var n = Number(value);
      d = new Date(n < 1e12 ? n * 1000 : n);
    } else {
      d = new Date(String(value));
    }
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  /** "Rated 2 stars out of five", "4 out of 5", "3/5", "2 stars". */
  function ratingFrom(value) {
    if (value === null || value === undefined) return null;
    var s = String(value).toLowerCase();
    var words = { one: 1, two: 2, three: 3, four: 4, five: 5 };
    var m =
      s.match(/(\d+(?:[.,]\d+)?)\s*(?:stars?\s*)?(?:out of|of|\/)\s*(5|five)\b/) ||
      s.match(/rated\s+(\d+(?:[.,]\d+)?)/) ||
      s.match(/(\d+(?:[.,]\d+)?)\s*stars?/) ||
      s.match(/^\s*(\d+(?:[.,]\d+)?)\s*$/);
    var n = null;
    if (m) n = parseFloat(m[1].replace(",", "."));
    else {
      var w = s.match(/\b(one|two|three|four|five)\s+stars?\b/);
      if (w) n = words[w[1]];
    }
    if (n === null || !isFinite(n)) return null;
    var r = Math.round(n);
    return r >= 1 && r <= 5 ? r : null;
  }

  function hidden(el) {
    return !!(el.closest && el.closest("[hidden], [aria-hidden='true'], template"));
  }

  function item(fields) {
    var text = clean(fields.text);
    if (!text || text.length < MIN_TEXT) return null;
    if (/^\[(deleted|removed)\]$/i.test(text)) return null;
    if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT - 1) + "…";
    return {
      text: text,
      title: fields.title ? oneLine(fields.title, 300) : null,
      author: fields.author ? oneLine(fields.author, 120) : null,
      rating: typeof fields.rating === "number" ? fields.rating : null,
      postedAt: fields.postedAt || null,
      externalId: fields.externalId ? String(fields.externalId).slice(0, 200) : null,
      url: fields.url || null,
    };
  }

  function pushUnique(list, seen, entry) {
    if (!entry) return;
    var key = entry.externalId ? "id:" + entry.externalId : "t:" + entry.text.slice(0, 280).toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    list.push(entry);
  }

  // ---------------------------------------------------------------------------
  // Site extractors. Each returns an array of items; selectors are best effort
  // and fall back to structured data where the site publishes it.
  // ---------------------------------------------------------------------------

  function playstore(doc) {
    var out = [];
    var cards = qa(doc, "div.RHo1pe");
    if (cards.length === 0) {
      cards = qa(doc, "[data-review-id]").map(function (el) {
        return el.closest("div.RHo1pe") || el.parentElement || el;
      });
    }
    cards.forEach(function (card) {
      if (hidden(card)) return;
      var idEl = card.matches && card.matches("[data-review-id]") ? card : q(card, "[data-review-id]");
      var ratingEl = q(card, "[role='img'][aria-label]");
      out.push(
        item({
          text: textOf(first(card, [".h3YV2d", "[jsname='bN97Pc']", "div[class*='review-body']"])),
          author: textOf(first(card, [".X5PpBb", "[class*='author']"])),
          rating: ratingEl ? ratingFrom(ratingEl.getAttribute("aria-label")) : null,
          postedAt: isoDate(textOf(first(card, [".bp9Aid", "span[class*='date']"]))),
          externalId: idEl ? idEl.getAttribute("data-review-id") : null,
          url: location.href,
        }),
      );
    });
    return out;
  }

  function appstore(doc) {
    var out = [];
    var cards = qa(doc, ".we-customer-review, [data-testid='review'], article.review, li.review, div[class*='review-card']");
    cards.forEach(function (card) {
      if (hidden(card)) return;
      var ratingEl = first(card, [
        "[aria-label*='out of 5']",
        "[aria-label*='Stars']",
        "[aria-label*='stars']",
        "figure[aria-label]",
        ".we-star-rating",
      ]);
      var timeEl = q(card, "time");
      var title = textOf(first(card, [".we-customer-review__title", "h3", "[class*='title']"]));
      var body = textOf(
        first(card, [".we-customer-review__body", "blockquote", "[data-test-bidi]", "p[class*='content']", "div[class*='content']"]),
      );
      if (!body) return;
      out.push(
        item({
          text: body,
          title: title && title !== body ? title : null,
          author: textOf(first(card, [".we-customer-review__user", "[class*='author']", "[class*='user']"])),
          rating: ratingEl ? ratingFrom(ratingEl.getAttribute("aria-label") || textOf(ratingEl)) : null,
          postedAt: timeEl ? isoDate(timeEl.getAttribute("datetime") || textOf(timeEl)) : null,
          externalId: card.getAttribute("data-review-id") || card.id || null,
          url: location.href,
        }),
      );
    });
    return out;
  }

  function reddit(doc) {
    var out = [];
    // New Reddit (shreddit web components).
    qa(doc, "shreddit-post").forEach(function (post) {
      if (hidden(post)) return;
      var title = post.getAttribute("post-title") || textOf(q(post, "[slot='title']"));
      var body = textOf(q(post, "[slot='text-body']"));
      out.push(
        item({
          text: body ? title + "\n\n" + body : title,
          title: body ? title : null,
          author: post.getAttribute("author"),
          postedAt: isoDate(post.getAttribute("created-timestamp")),
          externalId: post.getAttribute("id") || post.getAttribute("thingid"),
          url: absUrl(post.getAttribute("permalink")) || location.href,
        }),
      );
    });
    qa(doc, "shreddit-comment").forEach(function (c) {
      if (hidden(c)) return;
      var bodyEl = q(c, ":scope > [slot='comment']") || q(c, "[slot='comment']");
      var cTime = q(c, "time[datetime]");
      out.push(
        item({
          text: textOf(bodyEl),
          author: c.getAttribute("author"),
          postedAt: isoDate(c.getAttribute("created-timestamp") || (cTime ? cTime.getAttribute("datetime") : null)),
          externalId: c.getAttribute("thingid"),
          url: absUrl(c.getAttribute("permalink")) || location.href,
        }),
      );
    });
    // Old Reddit.
    qa(doc, ".thing.link").forEach(function (t) {
      if (hidden(t)) return;
      var title = textOf(q(t, "a.title"));
      var body = textOf(q(t, ".expando .usertext-body .md"));
      var timeEl = q(t, "time[datetime]");
      out.push(
        item({
          text: body ? title + "\n\n" + body : title,
          title: body ? title : null,
          author: t.getAttribute("data-author"),
          postedAt: timeEl ? isoDate(timeEl.getAttribute("datetime")) : null,
          externalId: t.getAttribute("data-fullname"),
          url: absUrl(t.getAttribute("data-permalink")) || location.href,
        }),
      );
    });
    qa(doc, ".thing.comment").forEach(function (t) {
      if (hidden(t)) return;
      var timeEl = q(t, ".entry time[datetime]");
      out.push(
        item({
          text: textOf(q(t, ".entry .usertext-body .md")),
          author: t.getAttribute("data-author"),
          postedAt: timeEl ? isoDate(timeEl.getAttribute("datetime")) : null,
          externalId: t.getAttribute("data-fullname"),
          url: absUrl(t.getAttribute("data-permalink")) || location.href,
        }),
      );
    });
    return out;
  }

  function hackernews(doc) {
    var out = [];
    var story = q(doc, "tr.athing.submission, tr.athing:not(.comtr)");
    var toptext = q(doc, ".toptext");
    if (story && toptext && textOf(toptext)) {
      var title = textOf(q(story, ".titleline > a") || q(story, ".titleline"));
      out.push(
        item({
          text: title + "\n\n" + textOf(toptext),
          title: title,
          author: textOf(q(doc, ".subtext .hnuser, .fatitem .hnuser")),
          externalId: story.id || null,
          url: story.id ? "https://news.ycombinator.com/item?id=" + story.id : location.href,
        }),
      );
    }
    qa(doc, "tr.athing.comtr").forEach(function (row) {
      if (hidden(row)) return;
      var commtext = q(row, ".commtext");
      if (!commtext) return;
      var copy = commtext.cloneNode(true);
      qa(copy, ".reply").forEach(function (r) {
        r.remove();
      });
      var age = q(row, ".age");
      var stamp = age ? (age.getAttribute("title") || "").split(" ")[0] : "";
      out.push(
        item({
          text: textOf(copy),
          author: textOf(q(row, ".hnuser")),
          postedAt: stamp ? isoDate(/Z|[+-]\d\d:?\d\d$/.test(stamp) ? stamp : stamp + "Z") : null,
          externalId: row.id || null,
          url: row.id ? "https://news.ycombinator.com/item?id=" + row.id : location.href,
        }),
      );
    });
    return out;
  }

  function trustpilot(doc) {
    var out = [];
    var bodies = qa(doc, "[data-service-review-text-typography]");
    var cards = [];
    bodies.forEach(function (b) {
      var card = b.closest("article") || b.closest("[data-service-review-card-paper]") || b.parentElement;
      if (card && cards.indexOf(card) === -1) cards.push(card);
    });
    if (cards.length === 0) cards = qa(doc, "article[data-service-review-card-paper], [data-service-review-card-paper='true']");
    cards.forEach(function (card) {
      if (hidden(card)) return;
      var ratingEl = q(card, "[data-service-review-rating]");
      var rating = ratingEl ? ratingFrom(ratingEl.getAttribute("data-service-review-rating")) : null;
      if (rating === null) {
        var img = q(card, "img[alt*='Rated'], [aria-label*='Rated']");
        if (img) rating = ratingFrom(img.getAttribute("alt") || img.getAttribute("aria-label"));
      }
      var link = q(card, "a[href*='/reviews/']");
      var href = link ? absUrl(link.getAttribute("href")) : null;
      var idMatch = href ? href.match(/\/reviews\/([a-f0-9]{12,})/i) : null;
      var timeEl = q(card, "time[datetime]");
      out.push(
        item({
          text: textOf(first(card, ["[data-service-review-text-typography]", "p"])),
          title: textOf(q(card, "[data-service-review-title-typography]")),
          author: textOf(first(card, ["[data-consumer-name-typography]", "[data-consumer-profile-link] span"])),
          rating: rating,
          postedAt: timeEl ? isoDate(timeEl.getAttribute("datetime")) : null,
          externalId: idMatch ? idMatch[1] : null,
          url: href || location.href,
        }),
      );
    });
    return out;
  }

  function g2(doc) {
    var out = [];
    var cards = qa(doc, "[itemprop='review']");
    if (cards.length === 0) cards = qa(doc, "[id^='survey-response-'], [data-review-id]");
    cards.forEach(function (card) {
      if (hidden(card)) return;
      var bodyEl = q(card, "[itemprop='reviewBody']");
      var text = bodyEl ? textOf(bodyEl) : textOf(first(card, ["[class*='review-body']", "[class*='formatted-text']"]));
      var ratingMeta = q(card, "[itemprop='ratingValue']");
      var rating = ratingMeta ? ratingFrom(ratingMeta.getAttribute("content") || textOf(ratingMeta)) : null;
      var best = q(card, "[itemprop='bestRating']");
      if (ratingMeta && best) {
        var max = parseFloat(best.getAttribute("content") || "5");
        var val = parseFloat(ratingMeta.getAttribute("content") || "");
        if (isFinite(max) && isFinite(val) && max > 0 && max !== 5) rating = ratingFrom(String((val / max) * 5));
      }
      var dateMeta = q(card, "[itemprop='datePublished']");
      var authorEl = q(card, "[itemprop='author'] [itemprop='name']") || q(card, "[itemprop='author']");
      var link = q(card, "a[href*='/survey_responses/'], a[href*='#survey-response']");
      out.push(
        item({
          text: text,
          title: textOf(q(card, "[itemprop='name']:not([itemprop='author'] *)")),
          author: authorEl ? authorEl.getAttribute("content") || textOf(authorEl) : null,
          rating: rating,
          postedAt: dateMeta ? isoDate(dateMeta.getAttribute("content") || textOf(dateMeta)) : null,
          externalId: card.getAttribute("data-review-id") || card.id || null,
          url: link ? absUrl(link.getAttribute("href")) : location.href,
        }),
      );
    });
    return out;
  }

  function producthunt(doc) {
    var out = [];
    var cards = qa(doc, "[data-test^='review-'], [data-test='review'], [data-test^='comment-'], [data-test='comment']");
    cards = cards.filter(function (c) {
      return !cards.some(function (other) {
        return other !== c && c.contains(other);
      });
    });
    cards.forEach(function (card) {
      if (hidden(card)) return;
      var bodyEl = first(card, ["[class*='prose']", "[data-test*='body']", "[class*='text']", "p"]);
      var authorEl = q(card, "a[href^='/@']");
      var ratingEl = q(card, "[aria-label*='out of 5'], [aria-label*='stars']");
      var timeEl = q(card, "time[datetime]");
      out.push(
        item({
          text: textOf(bodyEl || card),
          author: authorEl ? textOf(authorEl) : null,
          rating: ratingEl ? ratingFrom(ratingEl.getAttribute("aria-label")) : null,
          postedAt: timeEl ? isoDate(timeEl.getAttribute("datetime")) : null,
          externalId: (card.getAttribute("data-test") || "").replace(/^(review|comment)-?/, "") || card.id || null,
          url: location.href,
        }),
      );
    });
    return out;
  }

  function x(doc) {
    var out = [];
    qa(doc, "article[data-testid='tweet']").forEach(function (card) {
      if (hidden(card)) return;
      var timeEl = q(card, "time[datetime]");
      var link = timeEl ? timeEl.closest("a") : q(card, "a[href*='/status/']");
      var href = link ? absUrl(link.getAttribute("href")) : null;
      var idMatch = href ? href.match(/\/status\/(\d+)/) : null;
      var nameBlock = q(card, "[data-testid='User-Name']");
      var handle = null;
      if (nameBlock) {
        var m = textOf(nameBlock).match(/@[A-Za-z0-9_]{1,15}/);
        handle = m ? m[0] : textOf(nameBlock).split("\n")[0];
      }
      out.push(
        item({
          text: textOf(q(card, "[data-testid='tweetText']")),
          author: handle,
          postedAt: timeEl ? isoDate(timeEl.getAttribute("datetime")) : null,
          externalId: idMatch ? idMatch[1] : null,
          url: href || location.href,
        }),
      );
    });
    return out;
  }

  var EXTRACTORS = {
    playstore: playstore,
    appstore: appstore,
    reddit: reddit,
    hackernews: hackernews,
    trustpilot: trustpilot,
    g2: g2,
    producthunt: producthunt,
    x: x,
  };

  function extractReviews(doc, site) {
    var fn = EXTRACTORS[site];
    if (!fn) return [];
    var list = [];
    var seen = {};
    var raw;
    try {
      raw = fn(doc || document);
    } catch (e) {
      raw = [];
    }
    for (var i = 0; i < raw.length && list.length < MAX_ITEMS; i++) pushUnique(list, seen, raw[i]);
    return list;
  }

  function selectionText() {
    try {
      var sel = window.getSelection ? window.getSelection() : null;
      var text = sel ? sel.toString() : "";
      return clean(text);
    } catch (e) {
      return "";
    }
  }

  function scan() {
    var site = siteFromUrl(location.href);
    var reviews = extractReviews(document, site);
    var rated = reviews.filter(function (r) {
      return typeof r.rating === "number";
    }).length;
    return {
      url: location.href,
      title: document.title || "",
      site: site,
      siteLabel: SITE_LABELS[site] || SITE_LABELS.other,
      supported: Object.prototype.hasOwnProperty.call(EXTRACTORS, site),
      reviews: reviews,
      ratingsFound: rated > 0,
      selection: selectionText(),
    };
  }

  var api = {
    version: 1,
    siteFromUrl: siteFromUrl,
    ratingFrom: ratingFrom,
    clean: clean,
    extractReviews: extractReviews,
    selectionText: selectionText,
    scan: scan,
    SITE_LABELS: SITE_LABELS,
  };
  globalThis.BuildMondayExtract = api;

  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    // Re-injection (for example after the extension was updated) replaces the
    // previous listener so there is always exactly one.
    if (typeof globalThis.__buildMondayListener === "function") {
      try {
        chrome.runtime.onMessage.removeListener(globalThis.__buildMondayListener);
      } catch (e) {
        /* the old context is gone */
      }
    }
    var listener = function (message, _sender, sendResponse) {
      if (!message || typeof message.type !== "string") return false;
      if (message.type === "bm:scan") {
        sendResponse(api.scan());
        return false;
      }
      if (message.type === "bm:selection") {
        sendResponse({ text: api.selectionText() });
        return false;
      }
      return false;
    };
    globalThis.__buildMondayListener = listener;
    chrome.runtime.onMessage.addListener(listener);
  }
})();
