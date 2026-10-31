# BuildMonday Clipper (Chrome extension)

Clip customer feedback from any page into your BuildMonday inbox, or capture a whole page of reviews in one click. Clipped items that match an existing issue are linked to it right away; the rest are grouped on the product's next run, or straight away with **Group now** after a capture of 10 or more.

Manifest V3, plain JavaScript, no build step.

## Install (load unpacked)

1. Get the folder:
   - From your BuildMonday deployment: open **Extension and widget** in the app and click **Download extension**. Unzip it somewhere you will keep it. This copy already points at your deployment and, when downloaded while signed in, carries a token for your workspace, so it connects itself.
   - Or use this `extension/` folder from the repository as it is.
2. Open `chrome://extensions` in Chrome (or any Chromium browser: Edge, Brave, Arc).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and choose the folder that contains `manifest.json`.
5. The options page opens. A signed-in download is already connected ("Connected as you@example.com"). Otherwise, either click **Connect this browser** on the Extension and widget page (when the deployment has a fixed extension id), or click **Create token**, paste it into the options page and click **Connect**.

To update, replace the folder and click the reload icon on the extension's card in `chrome://extensions`.

## What it does

| Action | How |
| --- | --- |
| Clip a selection | Select text on any page, right-click, **Clip to BuildMonday**. Or press `Alt+Shift+B` (change it at `chrome://extensions/shortcuts`). Works in support tools, email, docs, anywhere you can select text. |
| Capture a review page | Open the popup on a supported site and click **Capture N reviews**, or right-click the page and choose **Capture reviews on this page**. Up to 100 items per capture. |
| Pick the product | The popup's **Save to** menu, or the default on the options page. |
| Low-star filter | On pages that show ratings, capture only 1 to 3 star reviews (on by default, switch it off in the popup or options). |

Supported review pages: Google Play app pages and their review dialog, App Store app pages, Reddit posts and comments (new and old Reddit), Hacker News threads, Trustpilot company pages, G2 product reviews, Product Hunt reviews and comments, and X posts and replies. Sites change their markup often; when a page is not recognised, select the text and clip it instead.

The server de-duplicates: clipping the same review twice stores it once. Reviews from Google Play, the App Store, Reddit, Hacker News and Trustpilot are stored under that source, so they line up with what monitoring fetches. Everything else is stored as "Extension".

## Privacy

- The token is kept in `chrome.storage.local` on this computer only. It is never synced.
- Content scripts on the supported sites only answer the popup. Nothing is read or sent until you clip or capture.
- A token baked into a download is used once, on install, and only when no token is saved yet.
- Requests go only to the server you configured, with the token in the `Authorization` header.
- Revoke a token any time in BuildMonday under **Extension and widget**; the extension then asks you to reconnect.

## Files

| Path | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest: permissions `activeTab`, `scripting`, `contextMenus`, `storage`, `notifications` |
| `background.js` | Service worker: context menus, the shortcut, notifications and the toolbar badge |
| `content/extract.js` | Site extractors and selection reader (content script, also injected on demand) |
| `popup/` | Toolbar popup: product picker, page capture, selection clip |
| `options/` | Connection (server + token), defaults, help |
| `lib/api.js` | Settings storage and API calls shared by every part |
| `lib/tab.js` | Reads the active tab through the content script |
| `lib/config.js` | Default server address, and the token baked into signed-in downloads (empty in the repository) |
| `ui/base.css` | Shared tokens and primitives (light and dark) |

## API used

- `GET /api/extension/me` returns the user, workspace, plan, products and this month's clip usage.
- `POST /api/extension/clip` with `{ productId, items: [{ text, url, title, author, rating, postedAt, externalId, site }] }` (1 to 100 items, 256 KB) returns `{ inserted, duplicates, rejected, inboxUrl }`. `402` when the plan's monthly clip or feedback limit is used up, `429` above 60 requests per token per minute.

- `POST /api/extension/runs` with `{ productId }` starts a run ("Group now", one manual run from the plan) and returns `{ runId, runUrl }`.

All accept `Authorization: Bearer bm_ext_...` and answer CORS preflights from `chrome-extension://` origins.

## Connecting from the web page

The downloaded `manifest.json` lists the deployment's origin under `externally_connectable`. The Extension and widget page can then send `{ type: "bm:ping" }` and `{ type: "bm:connect", token, server }` with `chrome.runtime.sendMessage`. The service worker only accepts a connect message whose sender origin is the server it names, and only accepts tokens of the `bm_ext_` shape.
