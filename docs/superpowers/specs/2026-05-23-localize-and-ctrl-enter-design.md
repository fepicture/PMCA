# Localize Remote Resources, Remove Cloud Sync, and Add Ctrl+Enter Submission Detection

**Date:** 2026-05-23
**Status:** Draft (awaiting user review)
**Type:** Performance fix + dead-code removal + small feature

## Problem

Three independent issues, addressed together because they share files and a single fork-and-ship release cycle.

### 1. Popup cold-start is slow (~10+ seconds on first click)

`popup.html` pulls render-blocking remote resources on every popup open:

- `popup.html:9-11` — Google Fonts stylesheet (6 font families) from `fonts.googleapis.com`, which in turn fetches `.woff2` files from `fonts.gstatic.com`
- `popup.html:165` + `lib/fontawesome.js` — Font Awesome **Kit Loader** (only an 11KB shim) that fetches the actual icon CSS from `ka-f.fontawesome.com` and then the webfonts

Both are render-blocking. On a cold browser session, each remote origin requires fresh DNS resolution, TCP, and TLS handshakes. Chrome closes idle HTTP/2 connections after ~5 minutes (`kUsedIdleSocketTimeout = 300s`) and its internal DNS cache expires after ~60s, which matches the user's observation that popups reopened more than 5 minutes apart are slow again even though the font bytes are cached on disk.

Same remote dependencies exist in `options.html:8-10` and `options.html:99`.

`options.html` and `popup.html` also embed a GitHub stars iframe (`ghbtns.com`). It already has `loading="lazy"`, so it is not the primary bottleneck, but it is another network dependency the user did not consent to.

### 2. Cloud sync code is dead weight

User does not use cloud sync and never plans to. The code (`cloudStorageDelegate.js`, `syncProblems`, `store.isCloudSyncEnabled`, the options-page toggle, the sharded sync helpers in `utils.js`) is currently gated behind `store.isCloudSyncEnabled` and runs no remote requests when disabled, so it is **not** the cause of slowness. But for a personal fork the code is pure noise and complicates future maintenance.

### 3. Ctrl+Enter submissions are not tracked

`src/popup/script/leetcode.js:7` (and `leetcodecn.js:7`) only listen for `click` events. LeetCode's Ctrl+Enter / Cmd+Enter shortcut programmatically invokes `button.click()`, which does **not** dispatch a real `MouseEvent`, so the listener never fires and the submission goes untracked.

## Goals

- Popup first-open is fast and **fully offline** — zero remote requests on any code path.
- Codebase is cleaner: cloud-sync code fully removed.
- Both mouse-click and Ctrl/Cmd+Enter submissions are tracked on both `leetcode.com` and `leetcode.cn`.
- No new permissions, no manifest schema change, no behavioral changes for the user beyond the above.

## Non-Goals

- Refactoring the `*0DOM` / `*1DOM` / `*2DOM` naming in `view.js`.
- Changing pagination, sorting, or any review-curve logic.
- Migrating away from Bootstrap, webpack, or MV3.
- Submitting changes upstream — user is forking and shipping their own build.

## Design

### A. Fonts: self-host as woff2

**Files added** under `lib/fonts/` (one woff2 per family, latin subset where available):
- `PressStart2P-Regular.woff2`
- `CourierPrime-Regular.woff2`
- `PTMono-Regular.woff2`
- `JetBrainsMono-ExtraLight.woff2` (weight 200, matches current usage `JetBrains+Mono:wght@200`)
- `Raleway-Regular.woff2`

Total estimated payload ≤ 100 KB.

**Source:** Download the latin-subset woff2 directly from Google Fonts' CDN response (already what the browser receives today, so visually identical). Acceptable license — these are all OFL/Apache licensed fonts shipped with Google Fonts.

**Wired up via `src/popup/popup.css`** with `@font-face` declarations at the top, each using `font-display: swap` so text always renders immediately even if a font byte is slow to load (defense in depth — should never trigger since fonts are local).

**`popup.css:41`**: drop `'Noto Sans SC'` from the `.multifont` font-stack. UI text is entirely English; Chinese problem names from `leetcode.cn` will fall back to the system CJK font (microsoft YaHei on Windows, PingFang SC on Mac) — visually fine.

**`popup.html:7-11` and `options.html:8-10`**: delete the three `<link>` tags (`preconnect` × 2, Google Fonts stylesheet × 1).

**Shared CSS path:** `src/popup/options.js:1` already does `import './popup.css'`, and `webpack.config.js` uses `style-loader` + `css-loader` (production mode) which injects the CSS into a runtime `<style>` tag inside the options page. So the new `@font-face` rules added to `popup.css` are automatically available in both `popup.html` and `options.html`. No new CSS file needed.

**Inline `<style>` in `options.html:11-46`** already references `'Raleway', sans-serif` and `'Courier Prime', monospace`. After the @font-face additions, both names resolve to local fonts. No edit needed to the inline style block beyond what the Google Fonts link removal already does.

### B. Font Awesome: replace with inline SVG

Only **6 icons** are used across the entire codebase:

| Class | Where used |
|---|---|
| `fa-regular fa-square-check` | mark-as-mastered button (view.js) |
| `fa-regular fa-square-minus` | delete-problem button (view.js) |
| `fa-solid fa-arrow-rotate-left` | undo-ops button (popup.html × 3) |
| `fa-solid fa-arrows-rotate` | reset-progress button (view.js) |
| `fa-solid fa-circle-info` | info-banner icon (popup.html line 46) |
| `fa-solid fa-gear` | open-options button (popup.html × 3) |

**New file `src/popup/util/icons.js`**: exports six named SVG-string constants (e.g., `SVG_GEAR`, `SVG_CIRCLE_INFO`, …). Each is a literal `<svg>...</svg>` string taken from FontAwesome's free SVG source (MIT-licensed for the free tier).

**Static usages in `popup.html` / `options.html`**: replace each `<i class="fa-... fa-...">` with a placeholder `<span class="icon" data-icon="gear"></span>` (or similar), then a tiny boot step in `popup.js` / `options.js` walks `[data-icon]` and sets `innerHTML` to the matching SVG string. This avoids inlining literal SVG XML into the HTML files (which would make them noisy) and keeps the icon definitions centralized.

**Dynamic usages in `view.js`** (icons inside template strings, e.g., `getCheckButtonTag`): inline the SVG string directly into the template literal, since these are already JS.

**Script tag removal:** delete `popup.html:165` and `options.html:110` (`<script type="text/javascript" src="lib/fontawesome.js"></script>`). `options.html` does not currently use any FA icons — removing the script is purely a network cleanup.

**Delete `lib/fontawesome.js`.**

### C. Remove cloud sync (full deletion)

Per user decision: **delete, don't keep dormant.**

**Delete entirely:**
- `src/popup/delegate/cloudStorageDelegate.js`

**Edit `src/popup/service/problemService.js`:**
- Delete exports: `getAllProblemsInCloud`, `setProblemsToCloud`, `syncProblems`
- Delete import of `cloudStorageDelegate` and `mergeProblems`/`syncLocalAndCloudStorage`

**Edit `src/popup/script/submission.js`:**
- Delete both `await syncProblems()` calls (lines 34 and 47)
- Delete the import of `syncProblems`

**Edit `src/popup/service/configService.js`:**
- Delete: `isCloudSyncEnabled`, `switchCloudSyncEnabled`, `setCloudSyncEnabled`, `loadCloudSyncConfig`
- Edit `loadConfigs` to drop `await loadCloudSyncConfig()`
- Remove `CONFIG_KEY` / `CONFIG_INNER_KEY_ENABLE_CLOUD` imports

**Edit `src/popup/store.js`:**
- Remove `isCloudSyncEnabled: false` field

**Edit `src/popup/util/utils.js`:**
- Delete: `mergeProblem`, `mergeProblems`, `syncStorage`, `syncLocalAndCloudStorage`, `simpleStringHash`
- Delete the `cloudStorageDelegate` import

**Edit `src/popup/util/keys.js`:**
- Delete both `CONFIG_KEY` and `CONFIG_INNER_KEY_ENABLE_CLOUD`. Verified: a `grep` shows neither has any consumer outside of `configService.js`, and after C all those consumers are gone.

**Edit `options.html`:**
- Delete lines 73-85: the entire `<div class="form-check form-switch">` block containing the "Enable Cloud Sync" toggle and the three `p.s.` / `p.s.s.` / `p.s.s.s.` notes that describe cloud-sync setup.

**Edit `src/popup/options.js`:**
- Drop `isCloudSyncEnabled, setCloudSyncEnabled` from the configService import (line 2).
- Delete lines 27-28 (`syncToggle` lookup + initial `.checked` assignment).
- Delete line 33 (`const isCloudSyncEnabled = syncToggle.checked;`).
- Delete line 35 (`await setCloudSyncEnabled(isCloudSyncEnabled);`).

**Edit `popup.html:45-49`**: delete the "🎉New feature🎉 Now you can sync your problem data across devices" banner. It is misleading once the feature is gone.

**`manifest.base.json`**: **keep `"unlimitedStorage"`**. `chrome.storage.local` also benefits from this permission, and removing it risks data loss for users with large problem histories.

### D. Ctrl+Enter / Cmd+Enter submission detection

**Edit `src/popup/script/submission.js`:**
- Promote `monitorSubmissionResult` from internal `const` to `export`d function.
- Add module-level guard against concurrent runs:
  ```js
  let activeMonitorId = null;
  const monitorSubmissionResult = () => {
      if (activeMonitorId !== null) {
          clearInterval(activeMonitorId);
      }
      // ...existing body, but assign setInterval result to activeMonitorId
      // and set activeMonitorId = null in the two exit paths
  };
  ```
  This prevents two parallel polls if the user clicks AND presses Ctrl+Enter, or presses Ctrl+Enter twice.

**Edit `src/popup/script/leetcode.js` and `leetcodecn.js`** (identical change in both):
```js
import { monitorSubmissionResult, submissionListener } from "./submission";

document.addEventListener('click', submissionListener);
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (document.querySelector('[data-e2e-locator="console-submit-button"]')) {
            monitorSubmissionResult();
        }
    }
});
```

The `querySelector` gate ensures we are actually on the code-editor view of a problem page. Worst case if LeetCode someday changes the locator: nothing fires, no false positives.

### E. Remove GitHub stars iframes

User wants fully local; the lazy-loaded `ghbtns.com` iframes still incur a network request once visible. Both pages already keep the "Request new features / Report a bug" link as a standalone CTA, so removing the iframe loses only the dynamic star-count badge.

- Delete `popup.html:155-156` (the entire `<iframe>` for GitHub stars).
- Delete `options.html:99-100` (same iframe in the options page).
- Adjust the surrounding `<div>` layout: the remaining "Request new features / Report a bug" anchor was sized `col-9` next to the iframe's `col-3`. After removal, drop the `col-9`/`col-3` classes and let the anchor center naturally inside the flex footer. The footer's `display: flex; justify-content: center` already handles centering.

### F. Incidental cleanups (in-scope because we are already in these files)

- `src/popup/view/view.js:251-272` (`renderAll`): parallelize the now-independent storage reads with `Promise.all`. After C, `loadConfigs` only reads review intervals and sorter — these and `renderSiteMode` and `getAllProblems` can run concurrently.
- `src/popup/view/view.js:98`: delete the debug `console.log(store.toReviewMaxPage)`.

## Data Flow (After)

Popup open → `popup.js` calls `renderAll()` →
1. **Parallel** (`Promise.all`): `loadConfigs()`, `renderSiteMode()`, `getAllProblems()`
2. Filter problems into needReview / scheduled / completed
3. Compute max pages, sort, render three table bodies
4. Walk `[data-icon]` placeholders, inject SVG strings
5. Register handlers

Zero `fetch`, zero `XMLHttpRequest`, zero remote `<link>` or `<script>`, zero `<iframe>`.

## Error Handling

No new error paths introduced. Existing local-storage error logging remains. The Ctrl+Enter listener falls through silently if the submit button is not present (intentional — same behavior as a click on a non-submit element).

## Testing & Verification

This work is done on a Linux host without the extension installed. Verification is layered:

1. **Build:** `npm run build` (webpack production) produces all 4 `dist/*.js` bundles without errors.
2. **No remote refs:** `git grep -iE 'googleapis|gstatic|fontawesome\.com|ghbtns|kit-free'` returns no hits in `src/`, `popup.html`, `options.html`, or `lib/` (excluding bundled vendor files we did not touch).
3. **No dead imports:** `grep -r 'syncProblems\|cloudStorageDelegate\|isCloudSyncEnabled\|mergeProblems' src/` returns nothing.
4. **Manual HTML inspection:** confirm `popup.html` and `options.html` reference only `lib/bootstrap.*`, local font files, and local JS bundles.
5. **User on Windows tests the loaded fork:**
   - First popup open after cold browser launch: < 500ms to fully rendered.
   - Re-open after 10+ minutes: still < 500ms (no remote handshakes).
   - Submit a LeetCode problem via mouse-click: appears in "Review Due" / updates record.
   - Submit a LeetCode problem via Ctrl+Enter (Windows) — same.
   - Submit a LeetCode problem via Cmd+Enter on Mac if available (skip if user has no Mac).
   - Spam Ctrl+Enter twice quickly: only one record updated, no duplicate progression.

If verification step 5 reveals an issue, return to Phase 1 of systematic-debugging — do not patch symptomatically.

## Migration / Compatibility

- **No storage schema change.** Existing users' `chrome.storage.local` data (`problems`, `cnProblems`, `opsHistory`, etc.) keeps working as-is. The `config` key may have a stale `enableCloud` field after upgrade — harmless, no code reads it after C.
- **Version bump.** Increment `manifest.base.json` version from `0.9.8` to `0.9.9` so Chrome treats this as an update on reinstall/reload. Update will not be published to the Chrome Web Store; user side-loads or installs from a self-built zip.

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| Font Awesome SVG markup differs visually from webfont version | Low | Use official FA SVG source; visual compare against current popup before/after. |
| LeetCode changes `data-e2e-locator` attribute → both click and keydown detection break together | Low | Already a pre-existing risk for the click handler; not made worse by this change. |
| Removing `Noto Sans SC` causes ugly CJK rendering on some OS | Very low | Modern Windows / Mac / Linux all have decent system CJK fonts. UI itself has zero CJK text. |
| webpack bundle grows due to inline SVG strings | Negligible | 6 SVGs × ~500 bytes = ~3 KB total. |
| Removing `syncProblems` from submission flow loses data on multi-device users | Not applicable | User explicitly does not use cloud sync. |

## Out of Scope (Future Work)

- Renaming `*0DOM` / `*1DOM` / `*2DOM` to semantic names.
- Switching from Bootstrap to a smaller CSS framework.
- Adding tests (the repo currently has none — outside this fork's intent).
- Re-introducing cloud sync via a different backend.
