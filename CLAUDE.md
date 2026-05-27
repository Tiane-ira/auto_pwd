# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development

This is a Manifest V3 Chrome extension with **no build step and zero dependencies** — pure vanilla JS loaded directly by the browser.

- **Load the extension**: Open `chrome://extensions/`, enable "Developer mode", click "Load unpacked", select the project root.
- **Test page**: Open `tests/test-page.html` in the browser to verify fill functionality.
- **No lint/format/test commands** — the project has no Node tooling.

After editing any source file, go to `chrome://extensions/` and click the refresh icon on the extension card to reload.

## Architecture

Three standard extension components that communicate via `chrome.runtime.sendMessage` / `chrome.tabs.sendMessage`:

| Component | File | Role |
|---|---|---|
| Popup | `src/popup.html`, `popup.css`, `popup.js` | Rule CRUD UI, import/export, global toggle |
| Content script | `src/content.js` | Injected into every page. Finds elements (CSS/XPath), fills values, auto-executes matching rules |
| Background SW | `src/background.js` | Listens for `tabs.onUpdated`, notifies content script to execute rules on page load |

### Data flow

1. Rules are stored in `chrome.storage.local` under key `rules` (array). A separate key `autoFillEnabled` (boolean) controls the global toggle.
2. **Popup** reads/writes `rules` and `autoFillEnabled` directly via `chrome.storage.local`.
3. **Content script** reads `rules` and `autoFillEnabled` (with 5s in-memory cache), filters rules whose `urls` match the current page, then executes them.
4. **Background** detects page load via `tabs.onUpdated` and sends `{ action: 'executeAllAutoRules' }` to the content script — this is a fallback trigger; the content script also self-initiates on DOM load + SPA URL changes via `MutationObserver`.

### Rule schema

```js
{
  id: string,          // UUID v4
  urls: string[],      // bound URLs for matching
  selectorType: 'css' | 'xpath',
  selector: string,    // the CSS/XPath expression
  fillValue: string,   // text to fill
  createdAt: string    // ISO timestamp
}
```

### URL matching (defined in both popup.js and content.js)

- **Exact match**: normalized URL (protocol + host + pathname, no query/hash) equals the rule URL
- **Wildcard**: rule URL ends with `*` → prefix match on normalized URL
- **Path match**: rule URL starts with `/` → matches current page's pathname by prefix

### Element filling (content.js)

1. `waitForElements()` polls every 50ms for up to 3s to find the element
2. `findElementsSync()` runs `querySelectorAll` (CSS) or `document.evaluate` (XPath)
3. `performFill()` focuses the element, clears existing value, sets new value, dispatches `input`/`change`/`blur` events — handles `<input>`, `<textarea>`, and `contentEditable` elements

## Known code issues

- `popup.js` has a duplicate `matchesCurrentUrl` function definition (lines 123–144 and 147–168 are identical).
- `popup.css` has duplicate `.urls-container` (lines 392–405) and `.url-group-rules` (lines 552–561) blocks.