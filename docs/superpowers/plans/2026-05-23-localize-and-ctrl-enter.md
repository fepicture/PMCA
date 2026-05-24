# Localize Remote Resources, Remove Cloud Sync, and Add Ctrl+Enter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the PMCA browser-extension popup fully offline (no remote fonts, icons, or stars badges), delete dormant cloud-sync code, and add Ctrl/Cmd+Enter submission tracking — all in one fork-and-ship change set.

**Architecture:** Self-host the 5 Latin Google Fonts as `.woff2` in `lib/fonts/`, replace the 11 KB Font Awesome kit loader with 6 inline SVG icons defined in a new `src/popup/util/icons.js`, delete the entire cloud-sync subsystem and its `options.html` UI, and add a `keydown` listener mirroring the existing `click` submission listener.

**Tech Stack:** Vanilla JS (no framework), webpack 5 production build, Manifest V3 Chrome/Edge extension, Bootstrap 5 (local), curl for asset fetching.

**Spec:** `docs/superpowers/specs/2026-05-23-localize-and-ctrl-enter-design.md`

---

## File Structure

**New files:**
- `lib/fonts/PressStart2P-Regular.woff2`
- `lib/fonts/CourierPrime-Regular.woff2`
- `lib/fonts/PTMono-Regular.woff2`
- `lib/fonts/JetBrainsMono-ExtraLight.woff2`
- `lib/fonts/Raleway-Regular.woff2`
- `src/popup/util/icons.js` — exports `ICONS` map (string → SVG string) and `hydrateIcons(root)` helper

**Modified files:**
- `popup.html` — drop Google Fonts links, FA script, GitHub iframe, "New feature" banner; convert `<i>`/`<small class="fa-...">` to `<span class="icon" data-icon="...">`
- `options.html` — same as popup.html (minus FA usage); remove cloud-sync toggle block
- `src/popup/popup.css` — add `@font-face` declarations, icon-size CSS rules, drop `'Noto Sans SC'` from fallback
- `src/popup/popup.js` — call `hydrateIcons(document)` after `renderAll`
- `src/popup/options.js` — drop cloud-sync wiring, call `hydrateIcons(document)`
- `src/popup/view/view.js` — replace FA template strings with SVG, parallelize `renderAll`, delete debug `console.log`
- `src/popup/script/submission.js` — promote `monitorSubmissionResult` to exported with module-level concurrent-run guard; drop `syncProblems` calls
- `src/popup/script/leetcode.js` — add `keydown` listener for Ctrl/Cmd+Enter
- `src/popup/script/leetcodecn.js` — same as leetcode.js
- `src/popup/service/problemService.js` — delete cloud-sync exports + imports
- `src/popup/service/configService.js` — delete `isCloudSyncEnabled` family, simplify `loadConfigs`
- `src/popup/store.js` — remove `isCloudSyncEnabled` field
- `src/popup/util/utils.js` — delete merge/sync helpers and `cloudStorageDelegate` import
- `src/popup/util/keys.js` — delete `CONFIG_KEY` and `CONFIG_INNER_KEY_ENABLE_CLOUD`
- `manifest.base.json` — version bump 0.9.8 → 0.9.9

**Deleted files:**
- `src/popup/delegate/cloudStorageDelegate.js`
- `lib/fontawesome.js`

---

## Task 0: Pre-flight Setup

**Files:** none

- [ ] **Step 0.1: Verify node_modules installed (one-time)**

```bash
cd /home/haohang/PMCA && [ -d node_modules ] || npm install
```

Expected: either silent (already installed) or completes with no errors. If missing dependencies, may take ~30s.

- [ ] **Step 0.2: Verify webpack baseline build works**

```bash
cd /home/haohang/PMCA && npm run build 2>&1 | tail -10
```

Expected: `compiled successfully` (warnings about bundle size acceptable). Establishes a known-good baseline before any edits.

- [ ] **Step 0.3: Configure git identity for this repo (skip if `git -C /home/haohang/PMCA config user.email` already returns a value)**

```bash
git -C /home/haohang/PMCA config user.email "shyhot@outlook.com"
git -C /home/haohang/PMCA config user.name "Haolin Zhong"
```

Per-repo only (no `--global`). If user prefers a different display name, ask before running.

- [ ] **Step 0.4: Create a feature branch**

```bash
git -C /home/haohang/PMCA checkout -b localize-and-ctrl-enter
```

Expected: `Switched to a new branch 'localize-and-ctrl-enter'`.

---

## Task 1: Download Local Font Files

**Files:**
- Create: `lib/fonts/PressStart2P-Regular.woff2`
- Create: `lib/fonts/CourierPrime-Regular.woff2`
- Create: `lib/fonts/PTMono-Regular.woff2`
- Create: `lib/fonts/JetBrainsMono-ExtraLight.woff2`
- Create: `lib/fonts/Raleway-Regular.woff2`

- [ ] **Step 1.1: Create fonts directory**

```bash
mkdir -p /home/haohang/PMCA/lib/fonts
```

- [ ] **Step 1.2: Download all 5 fonts via a single Google Fonts CSS fetch + parse**

```bash
cd /home/haohang/PMCA/lib/fonts

UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

# Fetch the combined CSS for all five families. Google returns the same payload Chrome receives.
CSS=$(curl -sSf -A "$UA" 'https://fonts.googleapis.com/css2?family=Courier+Prime&family=JetBrains+Mono:wght@200&family=PT+Mono&family=Press+Start+2P&family=Raleway&display=swap')

# Helper: extract latin woff2 URL for one family.
# CSS blocks are ordered by subset; the "latin" comment marker precedes the latin block.
extract_latin_url() {
    local family="$1"
    echo "$CSS" | awk -v fam="$family" '
        /^\/\* latin \*\/$/ { in_latin=1; next }
        /^\/\*/             { in_latin=0 }
        in_latin && $0 ~ "font-family: '"'"'" fam "'"'"'" { matched_family=1 }
        in_latin && matched_family && /src:/ {
            match($0, /https:[^)]+\.woff2/, arr); print arr[0]; exit
        }'
}

declare -A FONT_URLS
FONT_URLS[PressStart2P-Regular]=$(extract_latin_url 'Press Start 2P')
FONT_URLS[CourierPrime-Regular]=$(extract_latin_url 'Courier Prime')
FONT_URLS[PTMono-Regular]=$(extract_latin_url 'PT Mono')
FONT_URLS[JetBrainsMono-ExtraLight]=$(extract_latin_url 'JetBrains Mono')
FONT_URLS[Raleway-Regular]=$(extract_latin_url 'Raleway')

for name in "${!FONT_URLS[@]}"; do
    url="${FONT_URLS[$name]}"
    if [ -z "$url" ]; then echo "FAIL: no URL for $name" >&2; exit 1; fi
    echo "Downloading $name from $url"
    curl -sSf -A "$UA" -o "${name}.woff2" "$url"
done

ls -la /home/haohang/PMCA/lib/fonts/
```

Expected: 5 files listed, each between 5 KB and 80 KB. If any file is 0 bytes or extraction failed, debug the awk pattern against the actual CSS Google returned (subset comment markers occasionally shift).

- [ ] **Step 1.3: Sanity-check each file is a valid woff2**

```bash
cd /home/haohang/PMCA/lib/fonts
for f in *.woff2; do
    head -c 4 "$f" | xxd | head -1
done
```

Expected: every line shows `00000000: 774f 4632` — that's `wOF2` in ASCII, the woff2 magic number. Any other bytes mean the download is wrong (likely an HTML error page).

- [ ] **Step 1.4: Commit the fonts**

```bash
cd /home/haohang/PMCA
git add lib/fonts/
git commit -m "feat: vendor 5 Latin woff2 fonts under lib/fonts/

Self-hosted replacements for the Google Fonts stylesheet so popup
loading no longer requires fetching fonts.googleapis.com on every open.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Wire Fonts via @font-face and Remove Google Fonts Links

**Files:**
- Modify: `src/popup/popup.css` (top of file, plus line 41)
- Modify: `popup.html:7-11`
- Modify: `options.html:8-10`

- [ ] **Step 2.1: Prepend `@font-face` declarations to `popup.css`**

Insert at the very top of `src/popup/popup.css`, before the existing `table,` rule:

```css
@font-face {
    font-family: 'Press Start 2P';
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    src: url('../../lib/fonts/PressStart2P-Regular.woff2') format('woff2');
}
@font-face {
    font-family: 'Courier Prime';
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    src: url('../../lib/fonts/CourierPrime-Regular.woff2') format('woff2');
}
@font-face {
    font-family: 'PT Mono';
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    src: url('../../lib/fonts/PTMono-Regular.woff2') format('woff2');
}
@font-face {
    font-family: 'JetBrains Mono';
    font-style: normal;
    font-weight: 200;
    font-display: swap;
    src: url('../../lib/fonts/JetBrainsMono-ExtraLight.woff2') format('woff2');
}
@font-face {
    font-family: 'Raleway';
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    src: url('../../lib/fonts/Raleway-Regular.woff2') format('woff2');
}

```

Note: webpack's `css-loader` resolves `url(...)` relative to the CSS file's location (`src/popup/popup.css`), and `../../lib/fonts/` resolves to the repo's `lib/fonts/` directory. The font files will be emitted into the webpack output via `style-loader`/`css-loader`'s asset handling.

- [ ] **Step 2.2: Verify css-loader will copy fonts**

By default `css-loader` v6 inlines small assets and emits larger ones. To be safe, set explicit asset handling — edit `webpack.config.js`:

Current:
```js
{
    test: /.css$/,
    use: [
        'style-loader',
        'css-loader'
    ]
}
```

Replace with:
```js
{
    test: /\.css$/,
    use: [
        'style-loader',
        'css-loader'
    ]
},
{
    test: /\.woff2$/,
    type: 'asset/inline'
}
```

`asset/inline` base64-encodes the woff2 into the bundled CSS. For 5 fonts totaling ~100 KB, this adds ~135 KB to `popup.js` (base64 overhead ~33%), but eliminates the need to copy assets to `dist/` and any chrome-extension URL-resolution headaches. Single-file output is simpler.

- [ ] **Step 2.3: Drop `'Noto Sans SC'` from `.multifont` font-stack**

Edit `src/popup/popup.css` — the `.multifont` rule currently at the equivalent of line 41 (will shift after Step 2.1):

```css
.multifont {
    font-family: 'Courier Prime', 'Noto Sans SC', sans-serif;
}
```

becomes:

```css
.multifont {
    font-family: 'Courier Prime', sans-serif;
}
```

CJK problem names from leetcode.cn will fall back to the system CJK font (Microsoft YaHei on Windows, PingFang SC on Mac, Noto Sans CJK on most Linux distros) via the `sans-serif` keyword.

- [ ] **Step 2.4: Remove Google Fonts links from `popup.html`**

Delete `popup.html:7-11`:

```html
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link
        href="https://fonts.googleapis.com/css2?family=Courier+Prime&family=JetBrains+Mono:wght@200&family=Noto+Sans+SC&family=PT+Mono&family=Press+Start+2P&family=Raleway&display=swap"
        rel="stylesheet">
```

The bootstrap link on line 6 stays.

- [ ] **Step 2.5: Remove Google Fonts links from `options.html`**

Delete `options.html:8-10`:

```html
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Courier+Prime&family=JetBrains+Mono:wght@200&family=Noto+Sans+SC&family=PT+Mono&family=Press+Start+2P&family=Raleway&display=swap" rel="stylesheet">
```

- [ ] **Step 2.6: Build and verify no remote font references remain in HTML / dist bundles**

```bash
cd /home/haohang/PMCA
npm run build 2>&1 | tail -5
git grep -nE 'googleapis|gstatic' -- 'popup.html' 'options.html' 'src/' 'dist/' || echo "CLEAN: no remote font refs"
```

Expected: build succeeds; grep prints `CLEAN: no remote font refs`. The base64-encoded fonts add ~135 KB to `dist/popup.js` — that's expected and not a concern.

- [ ] **Step 2.7: Commit**

```bash
cd /home/haohang/PMCA
git add src/popup/popup.css popup.html options.html webpack.config.js dist/
git commit -m "feat: load fonts from local woff2 via @font-face, drop Google Fonts links

popup.html and options.html no longer reference fonts.googleapis.com or
fonts.gstatic.com. Fonts are base64-inlined into the bundled CSS via
webpack asset/inline, so no separate file copying is needed.

Also drops 'Noto Sans SC' from the .multifont fallback — UI has zero
CJK text; CJK problem names fall back to the OS CJK font via sans-serif.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Create the Icons Module

**Files:**
- Create: `src/popup/util/icons.js`

- [ ] **Step 3.1: Download the 6 FA Free SVG sources**

```bash
cd /tmp
BASE='https://raw.githubusercontent.com/FortAwesome/Font-Awesome/6.x/svgs'
curl -sSfo gear.svg               "$BASE/solid/gear.svg"
curl -sSfo arrow-rotate-left.svg  "$BASE/solid/arrow-rotate-left.svg"
curl -sSfo arrows-rotate.svg      "$BASE/solid/arrows-rotate.svg"
curl -sSfo circle-info.svg        "$BASE/solid/circle-info.svg"
curl -sSfo square-check.svg       "$BASE/regular/square-check.svg"
curl -sSfo square-minus.svg       "$BASE/regular/square-minus.svg"

for f in gear arrow-rotate-left arrows-rotate circle-info square-check square-minus; do
    echo "=== $f ==="; cat /tmp/$f.svg; echo
done
```

Each SVG will look roughly like `<svg xmlns="..." viewBox="0 0 512 512"><path d="..."/></svg>`. Verify each is well-formed XML before pasting into the module.

- [ ] **Step 3.2: Create `src/popup/util/icons.js`**

Use the exact path data from the FA Free 6.7.2 SVGs (pre-fetched, license comment stripped, `width="1em" height="1em" fill="currentColor"` added so icons scale with parent font-size and inherit parent color). Write the file verbatim:

```js
// SVG paths extracted from FontAwesome Free 6.7.2.
// License: Icons CC BY 4.0, Code MIT (https://fontawesome.com/license/free).
// Inlined to keep the popup fully offline.

export const ICONS = {
    'gear':              '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" fill="currentColor"><path d="M495.9 166.6c3.2 8.7 .5 18.4-6.4 24.6l-43.3 39.4c1.1 8.3 1.7 16.8 1.7 25.4s-.6 17.1-1.7 25.4l43.3 39.4c6.9 6.2 9.6 15.9 6.4 24.6c-4.4 11.9-9.7 23.3-15.8 34.3l-4.7 8.1c-6.6 11-14 21.4-22.1 31.2c-5.9 7.2-15.7 9.6-24.5 6.8l-55.7-17.7c-13.4 10.3-28.2 18.9-44 25.4l-12.5 57.1c-2 9.1-9 16.3-18.2 17.8c-13.8 2.3-28 3.5-42.5 3.5s-28.7-1.2-42.5-3.5c-9.2-1.5-16.2-8.7-18.2-17.8l-12.5-57.1c-15.8-6.5-30.6-15.1-44-25.4L83.1 425.9c-8.8 2.8-18.6 .3-24.5-6.8c-8.1-9.8-15.5-20.2-22.1-31.2l-4.7-8.1c-6.1-11-11.4-22.4-15.8-34.3c-3.2-8.7-.5-18.4 6.4-24.6l43.3-39.4C64.6 273.1 64 264.6 64 256s.6-17.1 1.7-25.4L22.4 191.2c-6.9-6.2-9.6-15.9-6.4-24.6c4.4-11.9 9.7-23.3 15.8-34.3l4.7-8.1c6.6-11 14-21.4 22.1-31.2c5.9-7.2 15.7-9.6 24.5-6.8l55.7 17.7c13.4-10.3 28.2-18.9 44-25.4l12.5-57.1c2-9.1 9-16.3 18.2-17.8C227.3 1.2 241.5 0 256 0s28.7 1.2 42.5 3.5c9.2 1.5 16.2 8.7 18.2 17.8l12.5 57.1c15.8 6.5 30.6 15.1 44 25.4l55.7-17.7c8.8-2.8 18.6-.3 24.5 6.8c8.1 9.8 15.5 20.2 22.1 31.2l4.7 8.1c6.1 11 11.4 22.4 15.8 34.3zM256 336a80 80 0 1 0 0-160 80 80 0 1 0 0 160z"/></svg>',
    'arrow-rotate-left': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" fill="currentColor"><path d="M125.7 160l50.3 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L48 224c-17.7 0-32-14.3-32-32L16 64c0-17.7 14.3-32 32-32s32 14.3 32 32l0 51.2L97.6 97.6c87.5-87.5 229.3-87.5 316.8 0s87.5 229.3 0 316.8s-229.3 87.5-316.8 0c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0c62.5 62.5 163.8 62.5 226.3 0s62.5-163.8 0-226.3s-163.8-62.5-226.3 0L125.7 160z"/></svg>',
    'arrows-rotate':     '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" fill="currentColor"><path d="M105.1 202.6c7.7-21.8 20.2-42.3 37.8-59.8c62.5-62.5 163.8-62.5 226.3 0L386.3 160 352 160c-17.7 0-32 14.3-32 32s14.3 32 32 32l111.5 0c0 0 0 0 0 0l.4 0c17.7 0 32-14.3 32-32l0-112c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 35.2L414.4 97.6c-87.5-87.5-229.3-87.5-316.8 0C73.2 122 55.6 150.7 44.8 181.4c-5.9 16.7 2.9 34.9 19.5 40.8s34.9-2.9 40.8-19.5zM39 289.3c-5 1.5-9.8 4.2-13.7 8.2c-4 4-6.7 8.8-8.1 14c-.3 1.2-.6 2.5-.8 3.8c-.3 1.7-.4 3.4-.4 5.1L16 432c0 17.7 14.3 32 32 32s32-14.3 32-32l0-35.1 17.6 17.5c0 0 0 0 0 0c87.5 87.4 229.3 87.4 316.7 0c24.4-24.4 42.1-53.1 52.9-83.8c5.9-16.7-2.9-34.9-19.5-40.8s-34.9 2.9-40.8 19.5c-7.7 21.8-20.2 42.3-37.8 59.8c-62.5 62.5-163.8 62.5-226.3 0l-.1-.1L125.6 352l34.4 0c17.7 0 32-14.3 32-32s-14.3-32-32-32L48.4 288c-1.6 0-3.2 .1-4.8 .3s-3.1 .5-4.6 1z"/></svg>',
    'circle-info':       '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="1em" height="1em" fill="currentColor"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM216 336l24 0 0-64-24 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l48 0c13.3 0 24 10.7 24 24l0 88 8 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-80 0c-13.3 0-24-10.7-24-24s10.7-24 24-24zm40-208a32 32 0 1 1 0 64 32 32 0 1 1 0-64z"/></svg>',
    'square-check':      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="1em" height="1em" fill="currentColor"><path d="M64 80c-8.8 0-16 7.2-16 16l0 320c0 8.8 7.2 16 16 16l320 0c8.8 0 16-7.2 16-16l0-320c0-8.8-7.2-16-16-16L64 80zM0 96C0 60.7 28.7 32 64 32l320 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96zM337 209L209 337c-9.4 9.4-24.6 9.4-33.9 0l-64-64c-9.4-9.4-9.4-24.6 0-33.9s24.6-9.4 33.9 0l47 47L303 175c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9z"/></svg>',
    'square-minus':      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" width="1em" height="1em" fill="currentColor"><path d="M64 80c-8.8 0-16 7.2-16 16l0 320c0 8.8 7.2 16 16 16l320 0c8.8 0 16-7.2 16-16l0-320c0-8.8-7.2-16-16-16L64 80zM0 96C0 60.7 28.7 32 64 32l320 0c35.3 0 64 28.7 64 64l0 320c0 35.3-28.7 64-64 64L64 480c-35.3 0-64-28.7-64-64L0 96zM152 232l144 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-144 0c-13.3 0-24-10.7-24-24s10.7-24 24-24z"/></svg>',
};

/**
 * Replaces every <span data-icon="..."> inside `root` with the matching SVG.
 * Safe to call multiple times — uses innerHTML assignment which is idempotent.
 */
export const hydrateIcons = (root = document) => {
    root.querySelectorAll('[data-icon]').forEach(el => {
        const name = el.dataset.icon;
        const svg = ICONS[name];
        if (svg) el.innerHTML = svg;
    });
};
```

Note: `gear`, `arrow-rotate-left`, `arrows-rotate`, `circle-info` use `viewBox="0 0 512 512"`; `square-check` and `square-minus` use `viewBox="0 0 448 512"` — these are FA's native aspect ratios and must match per icon.

- [ ] **Step 3.3: Verify the module parses**

```bash
cd /home/haohang/PMCA
node --check src/popup/util/icons.js && echo "OK: icons.js parses"
```

Expected: `OK: icons.js parses`.

- [ ] **Step 3.4: Commit**

```bash
cd /home/haohang/PMCA
git add src/popup/util/icons.js
git commit -m "feat: add inline-SVG icons module

Replaces the remote Font Awesome kit loader with 6 inline SVG icons
covering every glyph used in the UI (gear, arrow-rotate-left,
arrows-rotate, circle-info, square-check, square-minus). Sized via
width/height='1em' + fill='currentColor' so they match font-size and
text color of their parent.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Convert Static `<i>` Tags to Icon Placeholders + Hydrate in popup.js

**Files:**
- Modify: `popup.html` (7 places — lines 46, 83, 95, 108, 120, 133, 145)
- Modify: `src/popup/popup.css` (add icon sizing rules)
- Modify: `src/popup/popup.js` (call `hydrateIcons` after render)

- [ ] **Step 4.1: Replace circle-info in popup.html line 46**

Find:
```html
            <i class="fa-solid fa-circle-info"></i>
```
Replace with:
```html
            <span class="icon" data-icon="circle-info"></span>
```

- [ ] **Step 4.2: Replace fa-gear instances in popup.html (lines 83, 108, 133 — three nearly identical `optionsBtn` declarations)**

Find each occurrence of:
```html
                        <small class="fa-solid fa-gear fa-2xs my-2"></small>
```
Replace each with:
```html
                        <span class="icon icon-xs my-2" data-icon="gear"></span>
```

There are exactly 3 occurrences — use `Edit` with `replace_all: true` is acceptable since the original string is identical at all 3 sites.

- [ ] **Step 4.3: Replace fa-arrow-rotate-left instances in popup.html (lines 95, 120, 145)**

Find each occurrence of:
```html
                        <small class="fa-solid fa-arrow-rotate-left fa-2xs my-2"></small>
```
Replace each with:
```html
                        <span class="icon icon-xs my-2" data-icon="arrow-rotate-left"></span>
```

`replace_all: true` again — 3 identical occurrences.

- [ ] **Step 4.4: Add icon sizing rules to `src/popup/popup.css`**

Append at the end of the file:

```css

.icon {
    display: inline-flex;
    align-items: center;
    line-height: 1;
}
.icon svg {
    display: block;
}
.icon-xs svg {
    width: 0.625em;
    height: 0.625em;
}
```

`fa-2xs` in FontAwesome is `0.625em`; matching that visually keeps the original button proportions.

- [ ] **Step 4.5: Hydrate icons in `src/popup/popup.js`**

Current `src/popup/popup.js`:
```js
import './popup.css';
import { renderAll } from './view/view.js';

console.log("Hello PMCA!");
await renderAll();
```

Replace with:
```js
import './popup.css';
import { renderAll } from './view/view.js';
import { hydrateIcons } from './util/icons.js';

console.log("Hello PMCA!");
await renderAll();
hydrateIcons(document);
```

Order matters: `renderAll` injects dynamic `<span data-icon>` placeholders into the tables via view.js template strings (Task 5), and `hydrateIcons` must run after to populate them along with the static ones.

- [ ] **Step 4.6: Build and visually inspect dist/popup.js for the icon strings**

```bash
cd /home/haohang/PMCA
npm run build 2>&1 | tail -3
grep -c 'data-icon=' /home/haohang/PMCA/popup.html
```

Expected: build succeeds. `grep -c` should print `7` (1 circle-info + 3 gear + 3 arrow-rotate-left). Do NOT commit yet — Task 5 finishes the icon migration.

---

## Task 5: Convert Dynamic FA Tags in view.js to Inline SVG

**Files:**
- Modify: `src/popup/view/view.js:28-38` (three icon template functions)

- [ ] **Step 5.1: Replace `getCheckButtonTag` (lines 28-30)**

Find:
```js
const getCheckButtonTag = (problem) => `<small class="fa-regular fa-square-check fa-2xs mt-2 mb-0 check-btn-mark"\ 
                                            data-bs-toggle="tooltip" data-bs-title="✅ Mark as mastered" data-bs-placement="left"\
                                            style="color: #d2691e;" data-id=${problem.index}> </small>`;
```

Replace with:
```js
const getCheckButtonTag = (problem) => `<span class="icon icon-xs mt-2 mb-0 check-btn-mark"\
                                            data-bs-toggle="tooltip" data-bs-title="✅ Mark as mastered" data-bs-placement="left"\
                                            style="color: #d2691e;" data-id=${problem.index} data-icon="square-check"></span>`;
```

- [ ] **Step 5.2: Replace `getDeleteButtonTag` (lines 32-34)**

Find:
```js
const getDeleteButtonTag = (problem) => `<small class="fa-regular fa-square-minus fa-2xs mt-2 mb-0 delete-btn-mark"\ 
                                            data-bs-toggle="tooltip" data-bs-title="⛔ Delete this record" data-bs-placement="left"\
                                            style="color: red;" data-id=${problem.index}> </small>`;
```

Replace with:
```js
const getDeleteButtonTag = (problem) => `<span class="icon icon-xs mt-2 mb-0 delete-btn-mark"\
                                            data-bs-toggle="tooltip" data-bs-title="⛔ Delete this record" data-bs-placement="left"\
                                            style="color: red;" data-id=${problem.index} data-icon="square-minus"></span>`;
```

- [ ] **Step 5.3: Replace `getResetButtonTag` (lines 36-38)**

Find:
```js
const getResetButtonTag = (problem) => `<small class="fa-solid fa-arrows-rotate fa-2xs mt-2 mb-0 reset-btn-mark" \
                                            data-bs-toggle="tooltip" data-bs-title="🔄 Reset progress" data-bs-placement="left"\
                                            style="color: #d2691e;" data-id=${problem.index}> </small>`;
```

Replace with:
```js
const getResetButtonTag = (problem) => `<span class="icon icon-xs mt-2 mb-0 reset-btn-mark"\
                                            data-bs-toggle="tooltip" data-bs-title="🔄 Reset progress" data-bs-placement="left"\
                                            style="color: #d2691e;" data-id=${problem.index} data-icon="arrows-rotate"></span>`;
```

- [ ] **Step 5.4: Confirm `recordOperationHandler` still matches by class, not tag**

```bash
grep -n 'check-btn-mark\|delete-btn-mark\|reset-btn-mark' /home/haohang/PMCA/src/popup/handler/recordOperationHandler.js
```

Verify the handler looks up these elements by `.classList.contains(...)` / `.querySelectorAll('.check-btn-mark')`, NOT by element tag (`<small>`). If it relies on the tag name being `<small>`, switching to `<span>` will silently break the handlers. The current code uses `data-id` + class selectors, so the swap should be safe — but verify before committing.

- [ ] **Step 5.5: Build and check for stray FA classes**

```bash
cd /home/haohang/PMCA
npm run build 2>&1 | tail -3
git grep -nE 'fa-(solid|regular|brands)\s+fa-' -- 'popup.html' 'options.html' 'src/' || echo "CLEAN: no FA classes in source"
```

Expected: build succeeds. Grep prints `CLEAN: no FA classes in source`. The `dist/` bundle will still contain FA strings until next webpack run is committed.

---

## Task 6: Delete Font Awesome Kit Loader

**Files:**
- Modify: `popup.html:165`
- Modify: `options.html:110`
- Delete: `lib/fontawesome.js`

- [ ] **Step 6.1: Remove FA `<script>` from popup.html**

Find line 165:
```html
    <script type="text/javascript" src="lib/fontawesome.js"></script>
```
Delete the entire line.

- [ ] **Step 6.2: Remove FA `<script>` from options.html**

Find line 110:
```html
    <script type="text/javascript" src="lib/fontawesome.js"></script>
```
Delete the entire line.

- [ ] **Step 6.3: Delete the kit loader file**

```bash
rm /home/haohang/PMCA/lib/fontawesome.js
```

- [ ] **Step 6.4: Hydrate icons in options page if needed**

Check whether `options.html` has any `data-icon` spans (it does NOT, per the design). Skip this step if grep is empty:

```bash
grep -c 'data-icon=' /home/haohang/PMCA/options.html
```

If output is `0`, skip 6.5 below. If non-zero, do 6.5.

- [ ] **Step 6.5: (Conditional) Wire `hydrateIcons` in options.js**

Only if Step 6.4 found data-icon spans in options.html. Otherwise skip.

Edit `src/popup/options.js` — add import at top:
```js
import { hydrateIcons } from './util/icons.js';
```
And inside the `DOMContentLoaded` handler, after the existing setup, add:
```js
hydrateIcons(document);
```

- [ ] **Step 6.6: Build, verify, commit Tasks 3–6 together**

```bash
cd /home/haohang/PMCA
npm run build 2>&1 | tail -3
git grep -nE 'fontawesome\.com|fa-solid|fa-regular|fa-brands|lib/fontawesome\.js' -- 'popup.html' 'options.html' 'src/' || echo "CLEAN: no FA refs"

git add popup.html options.html src/popup/popup.css src/popup/popup.js src/popup/view/view.js dist/
git rm lib/fontawesome.js
git commit -m "feat: replace Font Awesome kit loader with inline SVG icons

The 11 KB FA kit loader (lib/fontawesome.js) was actually a remote
fetcher that pulled icon CSS + webfonts from ka-f.fontawesome.com on
every popup open. Replaced with 6 hand-picked SVGs (~3 KB total) in
src/popup/util/icons.js, hydrated into <span data-icon=...> placeholders
by hydrateIcons() at end of popup.js.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Remove GitHub Stars Iframes

**Files:**
- Modify: `popup.html:155-156`
- Modify: `options.html:99-100`

- [ ] **Step 7.1: Remove iframe from popup.html footer**

Find:
```html
            <iframe src="https://ghbtns.com/github-btn.html?user=HaolinZhong&repo=PMCA&type=star&count=true&size=large"
                frameborder="0" scrolling="0" width="200" height="30" title="GitHub" loading="lazy" class="col-3 mb-0"></iframe>
            <a class="col-9 mb-0 ms-0" href="https://github.com/HaolinZhong/PMCA/issues/new" target="_blank">
```

Replace with:
```html
            <a class="mb-0" href="https://github.com/HaolinZhong/PMCA/issues/new" target="_blank">
```

(Drops the iframe entirely and removes the `col-9`/`col-3` Bootstrap grid widths from the remaining anchor so it centers naturally within the flex footer.)

- [ ] **Step 7.2: Remove iframe from options.html footer**

Same change in `options.html` — find the same iframe block and replace identically.

- [ ] **Step 7.3: Build, verify no remote refs anywhere, commit**

```bash
cd /home/haohang/PMCA
npm run build 2>&1 | tail -3
git grep -nE 'ghbtns|googleapis|gstatic|fontawesome\.com|kit-free' -- 'popup.html' 'options.html' 'src/' || echo "CLEAN: zero remote refs in source"

git add popup.html options.html dist/
git commit -m "chore: drop GitHub stars iframe from popup and options pages

The lazy-loaded ghbtns.com iframe was the last remote dependency in
the extension UI. Removed it; kept the 'Request new features / Report
a bug' anchor as the sole footer CTA.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

Expected after this commit: zero hits for that grep across the entire source tree.

---

## Task 8: Delete Cloud Sync — Core Code

**Files:**
- Delete: `src/popup/delegate/cloudStorageDelegate.js`
- Modify: `src/popup/service/problemService.js`
- Modify: `src/popup/script/submission.js`

- [ ] **Step 8.1: Delete the cloud-storage delegate**

```bash
rm /home/haohang/PMCA/src/popup/delegate/cloudStorageDelegate.js
```

- [ ] **Step 8.2: Edit `src/popup/service/problemService.js`**

Replace the entire current file with:

```js
import { getProblemInfo } from "../delegate/leetCodeDelegate";
import { getLocalStorageData, setLocalStorageData } from "../delegate/localStorageDelegate";
import { addNewOperationHistory } from "./operationHistoryService";
import { OPS_TYPE } from "../entity/operationHistory";
import { forggettingCurve } from "../util/constants";
import { CN_PROBLEM_KEY, PROBLEM_KEY } from "../util/keys";
import { isInCnMode } from "./modeService";

export const getAllProblems = async () => {
    let cnMode = await isInCnMode();
    const queryKey = cnMode ? CN_PROBLEM_KEY : PROBLEM_KEY;
    let problems = await getLocalStorageData(queryKey);
    if (problems === undefined) problems = {};
    return problems;
}

export const getProblemsByMode = async (useCnMode) => {
    const queryKey = useCnMode ? CN_PROBLEM_KEY : PROBLEM_KEY;
    let problems = await getLocalStorageData(queryKey);
    if (problems === undefined) problems = {};
    return problems;
}

export const getCurrentProblemInfoFromLeetCode = async () => {
    return await getProblemInfo();
}

export const setProblems = async (problems) => {
    let cnMode = await isInCnMode();
    const key = cnMode ? CN_PROBLEM_KEY : PROBLEM_KEY;
    await setLocalStorageData(key, problems);
}

export const setProblemsByMode = async (problems, useCnMode) => {
    const key = useCnMode ? CN_PROBLEM_KEY : PROBLEM_KEY;
    await setLocalStorageData(key, problems);
}

export const createOrUpdateProblem = async (problem) => {
    problem.modificationTime = Date.now();
    const problems = await getAllProblems();
    problems[problem.index] = problem;
    await setProblems(problems);
}

export const markProblemAsMastered = async (problemId) => {
    let problems = await getAllProblems();
    let problem = problems[problemId];

    await addNewOperationHistory(problem, OPS_TYPE.MASTER, Date.now());

    problem.proficiency = forggettingCurve.length;
    problem.modificationTime = Date.now();

    problems[problemId] = problem;

    await setProblems(problems);
};

export const deleteProblem = async (problemId) => {
    let problems = await getAllProblems();
    const problem = problems[problemId];

    // soft delete
    if (problem) {
        problem.isDeleted = true;
        problem.modificationTime = Date.now();
        await addNewOperationHistory(problem, OPS_TYPE.DELETE, Date.now());
        problems[problemId] = problem;
        await setProblems(problems);
    }
};

export const resetProblem = async (problemId) => {
    let problems = await getAllProblems();
    let problem = problems[problemId];

    problem.proficiency = 0;
    problem.submissionTime = Date.now() - 24 * 60 * 60 * 1000;
    problem.modificationTime = Date.now();

    await addNewOperationHistory(problem, OPS_TYPE.RESET, Date.now());

    problems[problemId] = problem;

    await setProblems(problems);
};
```

This drops: `getAllProblemsInCloud`, `setProblemsToCloud`, `syncProblems`, and unused imports (`store`, `mergeProblems`, `syncLocalAndCloudStorage`, `cloudStorageDelegate`, `copy`/`getDeletedProblem` if unused — keep `copy`/`getDeletedProblem` import check for Step 8.3).

Verify `copy` and `getDeletedProblem` are actually unused in this file before deleting the `import` for them — grep the file:
```bash
grep -nE '\bcopy\b|\bgetDeletedProblem\b' /home/haohang/PMCA/src/popup/service/problemService.js
```
If grep shows zero hits in code (not in comments), the import line `import { copy, getDeletedProblem } from "../entity/problem";` should be removed. Otherwise keep it.

- [ ] **Step 8.3: Edit `src/popup/script/submission.js`**

Find:
```js
import { getAllProblems, createOrUpdateProblem, getCurrentProblemInfoFromLeetCode, syncProblems } from "../service/problemService";
```
Replace with:
```js
import { getAllProblems, createOrUpdateProblem, getCurrentProblemInfoFromLeetCode } from "../service/problemService";
```

Find (line ~34):
```js
        const { problemIndex, problemName, problemLevel, problemUrl } = await getCurrentProblemInfoFromLeetCode();
        await syncProblems();   // prior to fetch local problem data, sync local problem data with cloud
        const problems = await getAllProblems();
```
Replace with:
```js
        const { problemIndex, problemName, problemLevel, problemUrl } = await getCurrentProblemInfoFromLeetCode();
        const problems = await getAllProblems();
```

Find (line ~47):
```js
        await syncProblems(); // after problem updated, sync to cloud

        console.log("Submission successfully tracked!");
```
Replace with:
```js
        console.log("Submission successfully tracked!");
```

(Leave the rest of submission.js — including `monitorSubmissionResult` body and `submissionListener` — intact; Task 11 will modify these.)

- [ ] **Step 8.4: Build sanity check (do not commit yet)**

```bash
cd /home/haohang/PMCA
npm run build 2>&1 | tail -5
```

Expected: build succeeds. If webpack errors about missing imports, fix them — `utils.js` still imports `cloudStorageDelegate` which Task 9 removes.

---

## Task 9: Delete Cloud Sync — Config / Store / Utils / Keys

**Files:**
- Modify: `src/popup/service/configService.js`
- Modify: `src/popup/store.js`
- Modify: `src/popup/util/utils.js`
- Modify: `src/popup/util/keys.js`

- [ ] **Step 9.1: Rewrite `src/popup/service/configService.js`**

Replace entire file with:

```js
import { getLocalStorageData, setLocalStorageData } from "../delegate/localStorageDelegate"
import { store } from "../store";
import { PROBLEM_SORT_BY_KEY, REVIEW_INTV_KEY } from "../util/keys"
import { getSorterById, idOf, problemSorters } from "../util/sort";

// configurable review intervals

export const getReviewIntervals = async () => {
    return await getLocalStorageData(REVIEW_INTV_KEY);
}

export const setReviewIntervals = async (customIntv) => {
    if (customIntv == null || customIntv == undefined) return;
    const {easyIntv, mediumIntv, hardIntv} = store;
    customIntv.easyIntv = customIntv.easyIntv || easyIntv;
    customIntv.mediumIntv = customIntv.mediumIntv || mediumIntv;
    customIntv.hardIntv = customIntv.hardIntv || hardIntv;
    await setLocalStorageData(REVIEW_INTV_KEY, customIntv);
}

export const loadReviewIntervals = async () => {
    const customIntv = await getReviewIntervals();
    if (customIntv !== undefined) {
        Object.assign(store, customIntv);
    }
}

// configurable problem sort by

export const getProblemSorter = async () => {
    return await getLocalStorageData(PROBLEM_SORT_BY_KEY);
}

export const setProblemSorter = async (sorterId) => {
    await setLocalStorageData(PROBLEM_SORT_BY_KEY, sorterId);
}

export const loadProblemSorter = async () => {
    const sorterId = await getProblemSorter() | idOf(problemSorters.sortByReviewTimeAsc);
    store.problemSortBy = getSorterById(sorterId);
}

export const loadConfigs = async () => {
    await loadReviewIntervals();
    await loadProblemSorter();
}
```

Removed: `isCloudSyncEnabled`, `switchCloudSyncEnabled`, `setCloudSyncEnabled`, `loadCloudSyncConfig`, and the `CONFIG_KEY` / `CONFIG_INNER_KEY_ENABLE_CLOUD` imports. `loadConfigs` no longer calls `loadCloudSyncConfig`.

- [ ] **Step 9.2: Edit `src/popup/store.js`**

Find:
```js
    problemSortBy: problemSorters.sortByReviewTimeAsc,
    isCloudSyncEnabled: false
}
```
Replace with:
```js
    problemSortBy: problemSorters.sortByReviewTimeAsc
}
```

- [ ] **Step 9.3: Rewrite `src/popup/util/utils.js`**

Replace the entire file with:

```js
import { store } from "../store";
import { COMPILE_ERROR_AND_TLE_CLASSNAME, COMPILE_ERROR_AND_TLE_CLASSNAME_CN, COMPILE_ERROR_AND_TLE_CLASSNAME_NEW, PAGE_SIZE, SUBMIT_BUTTON_ATTRIBUTE_NAME, SUBMIT_BUTTON_ATTRIBUTE_VALUE, SUCCESS_CLASSNAME, SUCCESS_CLASSNAME_CN, SUCCESS_CLASSNAME_NEW, WRONG_ANSWER_CLASSNAME, WRONG_ANSWER_CLASSNAME_CN, WRONG_ANSWER_CLASSNAME_NEW, forggettingCurve } from "./constants";

export const needReview = (problem) => {
    if (problem.proficiency >= forggettingCurve.length) {
        return false;
    }

    const currentTime = Date.now();
    const timeDiffInMinute = (currentTime - problem.submissionTime) / (1000 * 60);
    return timeDiffInMinute >= forggettingCurve[problem.proficiency];
};

export const scheduledReview = (problem) => {
    return !needReview(problem) && problem.proficiency < 5;
};

export const isCompleted = (problem) => {
    return problem.proficiency === 5;
};

export const calculatePageNum = (problems) => {
    return Math.max(Math.ceil(problems.length / PAGE_SIZE), 1);
}

export const decorateProblemLevel = (level) => {
    let color;
    if (level === "Easy") {
        color = "rgb(67, 160, 71)";
    } else if (level === "Medium") {
        color = "rgb(239, 108, 0)";
    } else {
        color = "rgb(233, 30, 99)";
    }
    return `<small style="color: ${color}; vertical-align: middle">${level}</small>`
}

export const getNextReviewTime = (problem) => {
    return new Date(problem.submissionTime + forggettingCurve[problem.proficiency] * 60 * 1000);
}

export const getDelayedHours = (problem) => {
    const nextReviewDate = getNextReviewTime(problem);
    return Math.round((Date.now() - nextReviewDate) / (60 * 60 * 1000));
}

export const getDifficultyBasedSteps = (diffculty) => {
    if (diffculty === "Easy") {
        return store.easyIntv;
    } else if (diffculty === "Medium") {
        return store.mediumIntv;
    } else {
        return store.hardIntv;
    }
}

export const isSubmitButton = (element) => {
    return element.getAttribute(SUBMIT_BUTTON_ATTRIBUTE_NAME) === SUBMIT_BUTTON_ATTRIBUTE_VALUE;
}

export const getSubmissionResult = () => {
    return document.getElementsByClassName(SUCCESS_CLASSNAME_CN)[0] ||
    document.getElementsByClassName(WRONG_ANSWER_CLASSNAME_CN)[0] ||
    document.getElementsByClassName(COMPILE_ERROR_AND_TLE_CLASSNAME_CN)[0] ||
    document.getElementsByClassName(SUCCESS_CLASSNAME)[0] ||
    document.getElementsByClassName(WRONG_ANSWER_CLASSNAME)[0] ||
    document.getElementsByClassName(COMPILE_ERROR_AND_TLE_CLASSNAME)[0] ||
    document.getElementsByClassName(SUCCESS_CLASSNAME_NEW)[0] ||
    document.getElementsByClassName(WRONG_ANSWER_CLASSNAME_NEW)[0] ||
    document.getElementsByClassName(COMPILE_ERROR_AND_TLE_CLASSNAME_NEW)[0];
}

export const isSubmissionSuccess = (submissionResult) => {
    return submissionResult.className.includes(SUCCESS_CLASSNAME_CN) ||
    submissionResult.className.includes(SUCCESS_CLASSNAME_NEW) ||
    submissionResult.className.includes(SUCCESS_CLASSNAME);
}

export const updateProblemUponSuccessSubmission = (problem) => {
    const steps = getDifficultyBasedSteps(problem.problemLevel);
    let nextProficiencyIndex;
    for (const i of steps) {
        if (i > problem.proficiency) {
            nextProficiencyIndex = i;
            break;
        }
    }

    if (nextProficiencyIndex !== undefined) {
        problem.proficiency = nextProficiencyIndex;
    } else {
        problem.proficiency = forggettingCurve.length;
    }
    problem.submissionTime = Date.now();
    problem.modificationTime = Date.now();
    return problem;
}
```

Removed: `mergeProblem`, `mergeProblems`, `syncStorage`, `syncLocalAndCloudStorage`, `simpleStringHash`, plus the `localStorageDelegate` and `cloudStorageDelegate` imports (neither is used by the remaining functions).

- [ ] **Step 9.4: Edit `src/popup/util/keys.js`**

Find:
```js
export const PROBLEM_SORT_BY_KEY = 'problem_sort_by';
export const CONFIG_KEY = 'configs';
export const CONFIG_INNER_KEY_ENABLE_CLOUD = 'enable_cloud';
```
Replace with:
```js
export const PROBLEM_SORT_BY_KEY = 'problem_sort_by';
```

- [ ] **Step 9.5: Build sanity check**

```bash
cd /home/haohang/PMCA
npm run build 2>&1 | tail -5
git grep -nE 'isCloudSyncEnabled|cloudStorageDelegate|syncProblems|mergeProblems|CONFIG_INNER_KEY_ENABLE_CLOUD|CONFIG_KEY' -- 'src/' 'popup.html' || echo "CLEAN: no cloud-sync refs in source"
```

Expected: build succeeds. Grep should print `CLEAN: ...` (Task 10 still has to remove the options.html toggle UI before final commit).

---

## Task 10: Delete Cloud Sync — Options UI + Popup Banner

**Files:**
- Modify: `options.html:73-85`
- Modify: `src/popup/options.js`
- Modify: `popup.html:45-49`

- [ ] **Step 10.1: Remove the cloud-sync toggle block from `options.html`**

Find the block starting at line 73:
```html
                <div class="form-check form-switch">
                    <label class="form-check-label" for="syncToggle">Enable Cloud Sync (⚠️experimental feature⚠️)</label>
                    <input class="form-check-input custom-switch" type="checkbox" id="syncToggle">
                </div>
                <div style="font-size: smaller; text-align: left;">
                    <small><b>p.s.</b> ⚠️For 2 or more devices to share the problem data, all of them should: 1.enable cloud sync, 2.login to chrome with the same user, 3.enable <a target="#" href="https://support.google.com/chrome/answer/185277?hl=en&co=GENIE.Platform%3DAndroid#zippy=%2Csign-in-turn-on-sync">chrome sync</a> ⚠️</small>
                </div>
                <div style="font-size: smaller; text-align: left;">
                    <small><b>p.s.s.</b> The feature does not have a robust concensus algorithm backing it up, but it should be able to cover normal use cases😎. Feel free to report bugs!</small>
                </div>
                <div style="font-size: smaller; text-align: left;">
                    <small><b>p.s.s.s.</b> I tried my best to align this option to the leftmost but I gave up eventually. That's why I only do backend in my real job😅.</small>
                </div>
                
```

Delete the entire block (13 lines, ending with the empty `                ` line before the `<button type="submit"...>`).

- [ ] **Step 10.2: Rewrite `src/popup/options.js`**

Replace entire file with:

```js
import './popup.css';
import { loadConfigs, setProblemSorter } from "./service/configService";
import { optionPageFeedbackMsgDOM } from './util/doms';
import { descriptionOf, idOf, problemSorterArr } from "./util/sort";

document.addEventListener('DOMContentLoaded', async () => {

    await loadConfigs();

    const optionsForm = document.getElementById('optionsForm');

    // problem sorter setting
    const problemSorterSelect = document.getElementById('problemSorterSelect');
    const problemSorterMetaArr = problemSorterArr.map(sorter => ({
        id: idOf(sorter),
        text: descriptionOf(sorter),
    }));

    problemSorterMetaArr.forEach(sorterMeta => {
        const optionElement = document.createElement('option');
        optionElement.value = sorterMeta.id;
        optionElement.textContent = sorterMeta.text;
        problemSorterSelect.append(optionElement);
    });

    optionsForm.addEventListener('submit', async e => {
        e.preventDefault();
        const selectedSorterId = problemSorterSelect.value;
        await setProblemSorter(Number(selectedSorterId));
        optionPageFeedbackMsgDOM.style.display = 'block';
        setTimeout(() => optionPageFeedbackMsgDOM.style.display = 'none', 1000);
    });
});
```

Removed: `store` import (no longer needed), `isCloudSyncEnabled`/`setCloudSyncEnabled` imports, `syncToggle` lookup, `syncToggle.checked` read/write, `setCloudSyncEnabled` call.

- [ ] **Step 10.3: Remove the "New feature" banner from `popup.html`**

Find lines 45-49:
```html
        <div class="multifont my-3 py-0 by-0" style="text-align: center; font-size: smaller">
            <i class="fa-solid fa-circle-info"></i>
            <small>🎉New feature🎉</small>
            <small> Now you can sync your problem data across devices. Open options to enable it.</small>
        </div>
```
Delete all 5 lines. The `<i class="fa-solid fa-circle-info">` should already have been converted in Task 4 Step 4.1 — re-check, and if Step 4.1 already changed line 46 to `<span class="icon" data-icon="circle-info"></span>`, the deletion here removes the whole banner block including that span. Either way, after this step the circle-info icon no longer appears in popup.html.

Verify:
```bash
grep -n 'circle-info\|New feature\|sync your problem data' /home/haohang/PMCA/popup.html || echo "CLEAN: banner removed"
```

- [ ] **Step 10.4: Build, verify, commit Tasks 8–10**

```bash
cd /home/haohang/PMCA
npm run build 2>&1 | tail -5
git grep -nE 'isCloudSyncEnabled|cloudStorageDelegate|syncProblems|mergeProblems|CONFIG_INNER_KEY_ENABLE_CLOUD|enable_cloud|syncToggle' -- 'src/' 'popup.html' 'options.html' || echo "CLEAN: no cloud-sync refs anywhere"

git add src/popup/service/problemService.js src/popup/script/submission.js src/popup/service/configService.js src/popup/store.js src/popup/util/utils.js src/popup/util/keys.js src/popup/options.js options.html popup.html dist/
git rm src/popup/delegate/cloudStorageDelegate.js
git commit -m "feat: remove cloud sync entirely

User explicitly opted out of cloud sync, which was already gated behind
an isCloudSyncEnabled flag and unused. Removed:

- src/popup/delegate/cloudStorageDelegate.js (deleted)
- syncProblems / getAllProblemsInCloud / setProblemsToCloud
- syncProblems calls in submission.js (both before and after problem update)
- isCloudSyncEnabled / switchCloudSyncEnabled / setCloudSyncEnabled / loadCloudSyncConfig
- store.isCloudSyncEnabled field
- mergeProblem / mergeProblems / syncStorage / syncLocalAndCloudStorage / simpleStringHash
- CONFIG_KEY / CONFIG_INNER_KEY_ENABLE_CLOUD
- 'Enable Cloud Sync' toggle UI and the three p.s. notes in options.html
- 'New feature: sync your problem data' banner in popup.html

The local-storage schema (chrome.storage.local keys: problems, cn_records,
operation_history, review_intervals, problem_sort_by, cn_mode) is unchanged
— existing user data continues to work.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Add Ctrl/Cmd+Enter Submission Detection

**Files:**
- Modify: `src/popup/script/submission.js`
- Modify: `src/popup/script/leetcode.js`
- Modify: `src/popup/script/leetcodecn.js`

- [ ] **Step 11.1: Refactor `monitorSubmissionResult` to be exported with concurrent-run guard**

Replace the entire contents of `src/popup/script/submission.js` with:

```js
import { getDifficultyBasedSteps, getSubmissionResult, isSubmissionSuccess, isSubmitButton, needReview, updateProblemUponSuccessSubmission } from "../util/utils";
import { getAllProblems, createOrUpdateProblem, getCurrentProblemInfoFromLeetCode } from "../service/problemService";
import { Problem } from "../entity/problem";

let activeMonitorId = null;

/*
    Repeatedly poll for the submission result; track the problem on success.
    Concurrent calls are deduplicated — if a poll is already running, it is
    cleared and replaced. This handles the case where the user both clicks
    Submit and presses Ctrl+Enter back-to-back.
*/
export const monitorSubmissionResult = () => {

    if (activeMonitorId !== null) {
        clearInterval(activeMonitorId);
        activeMonitorId = null;
    }

    let submissionResult;
    let maxRetry = 10;
    const retryInterval = 1000;

    activeMonitorId = setInterval(async () => {

        if (maxRetry <= 0) {
            clearInterval(activeMonitorId);
            activeMonitorId = null;
            return;
        }

        submissionResult = getSubmissionResult();

        if (submissionResult === undefined || submissionResult.length === 0) {
            maxRetry--;
            return;
        }

        clearInterval(activeMonitorId);
        activeMonitorId = null;

        let isSuccess = isSubmissionSuccess(submissionResult);

        if (!isSuccess) return;

        const { problemIndex, problemName, problemLevel, problemUrl } = await getCurrentProblemInfoFromLeetCode();
        const problems = await getAllProblems();
        let problem = problems[problemIndex];

        if (problem && problem.isDeleted !== true) {
            const reviewNeeded = needReview(problem);
            if (reviewNeeded) {
                await createOrUpdateProblem(updateProblemUponSuccessSubmission(problem));
            }
        } else {
            problem = new Problem(problemIndex, problemName, problemLevel, problemUrl, Date.now(), getDifficultyBasedSteps(problemLevel)[0], Date.now());
            await createOrUpdateProblem(problem);
        }

        console.log("Submission successfully tracked!");

    }, retryInterval);
};

export const submissionListener = (event) => {

    const element = event.target;

    const filterConditions = [
        isSubmitButton(element),
        element.parentElement && isSubmitButton(element.parentElement),
        element.parentElement && element.parentElement.parentElement && isSubmitButton(element.parentElement.parentElement),
    ];

    const isSubmission = filterConditions.reduce((prev, curr) => prev || curr);

    if (isSubmission) {
        monitorSubmissionResult();
    }
};
```

Two semantic changes vs original:
1. `monitorSubmissionResult` is now `export const` (was internal `const`).
2. Module-level `activeMonitorId` ensures only one interval is ever running. Cleared and nulled at every exit path.

- [ ] **Step 11.2: Edit `src/popup/script/leetcode.js`**

Replace entire file with:

```js
import { loadConfigs } from "../service/configService";
import { submissionListener, monitorSubmissionResult } from "./submission";

console.log(`Hello PMCA!`);

await loadConfigs();

document.addEventListener('click', submissionListener);

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        // Only fire if we're on a problem page with a visible submit button.
        if (document.querySelector('[data-e2e-locator="console-submit-button"]')) {
            monitorSubmissionResult();
        }
    }
});
```

- [ ] **Step 11.3: Edit `src/popup/script/leetcodecn.js`**

Same content as Step 11.2 (`leetcode.js` and `leetcodecn.js` are bundled separately by webpack but currently have identical bodies).

- [ ] **Step 11.4: Build and verify the new listener is in both bundles**

```bash
cd /home/haohang/PMCA
npm run build 2>&1 | tail -5
grep -c 'console-submit-button' /home/haohang/PMCA/dist/leetcode.js
grep -c 'console-submit-button' /home/haohang/PMCA/dist/leetcodecn.js
```

Expected: build succeeds. Both `grep -c` should print `2` or more (the locator appears in both the keydown listener and via the `SUBMIT_BUTTON_ATTRIBUTE_VALUE` constant).

- [ ] **Step 11.5: Commit**

```bash
cd /home/haohang/PMCA
git add src/popup/script/submission.js src/popup/script/leetcode.js src/popup/script/leetcodecn.js dist/
git commit -m "feat: track submissions triggered by Ctrl/Cmd+Enter shortcut

LeetCode's keyboard shortcut programmatically invokes button.click(),
which does NOT dispatch a real MouseEvent, so the existing click
listener missed shortcut-triggered submissions. Added a keydown
listener that calls monitorSubmissionResult() directly when
Ctrl/Cmd+Enter fires on a page with a visible submit button.

monitorSubmissionResult is now exported and guarded against concurrent
runs via a module-level activeMonitorId — clicking Submit and pressing
Ctrl+Enter back-to-back will dedup to a single poll cycle.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Incidental Cleanups

**Files:**
- Modify: `src/popup/view/view.js:98` (debug log)
- Modify: `src/popup/view/view.js:251-272` (renderAll parallelization)

- [ ] **Step 12.1: Delete the debug `console.log` at view.js:98**

Find inside `renderReviewTableContent`:
```js
    /* validation */
    console.log(store.toReviewMaxPage);
    if (page > store.toReviewMaxPage || page < 1) {
```
Replace with:
```js
    /* validation */
    if (page > store.toReviewMaxPage || page < 1) {
```

- [ ] **Step 12.2: Update the `syncProblems` import in `view.js`**

Find at top of `src/popup/view/view.js`:
```js
import { getAllProblems, syncProblems } from "../service/problemService";
```
Replace with:
```js
import { getAllProblems } from "../service/problemService";
```

(`syncProblems` was deleted in Task 8 — the import is dangling.)

- [ ] **Step 12.3: Parallelize `renderAll`**

Find the entire `renderAll` function (currently lines 251-275):
```js
export const renderAll = async () => {
    await loadConfigs();
    await renderSiteMode();
    await syncProblems();

    const problems = Object.values(await getAllProblems()).filter(p => p.isDeleted !== true);
    store.needReviewProblems = problems.filter(needReview);
    store.reviewScheduledProblems = problems.filter(scheduledReview);
    store.completedProblems = problems.filter(isCompleted);

    store.toReviewMaxPage = calculatePageNum(store.needReviewProblems);
    store.scheduledMaxPage = calculatePageNum(store.reviewScheduledProblems);
    store.completedMaxPage = calculatePageNum(store.completedProblems);

    store.needReviewProblems.sort(store.problemSortBy);
    store.reviewScheduledProblems.sort(store.problemSortBy);
    store.completedProblems.sort(store.problemSortBy);

    renderReviewTableContent(store.needReviewProblems, 1);
    renderScheduledTableContent(store.reviewScheduledProblems, 1);
    renderCompletedTableContent(store.completedProblems, 1);
    await renderUndoButton();

    registerAllHandlers();
}
```

Replace with:
```js
export const renderAll = async () => {
    const [, , allProblems] = await Promise.all([
        loadConfigs(),
        renderSiteMode(),
        getAllProblems(),
    ]);

    const problems = Object.values(allProblems).filter(p => p.isDeleted !== true);
    store.needReviewProblems = problems.filter(needReview);
    store.reviewScheduledProblems = problems.filter(scheduledReview);
    store.completedProblems = problems.filter(isCompleted);

    store.toReviewMaxPage = calculatePageNum(store.needReviewProblems);
    store.scheduledMaxPage = calculatePageNum(store.reviewScheduledProblems);
    store.completedMaxPage = calculatePageNum(store.completedProblems);

    store.needReviewProblems.sort(store.problemSortBy);
    store.reviewScheduledProblems.sort(store.problemSortBy);
    store.completedProblems.sort(store.problemSortBy);

    renderReviewTableContent(store.needReviewProblems, 1);
    renderScheduledTableContent(store.reviewScheduledProblems, 1);
    renderCompletedTableContent(store.completedProblems, 1);
    await renderUndoButton();

    registerAllHandlers();
}
```

**Safety note on parallelism:** `loadConfigs()` writes `store.problemSortBy` (read later in the `.sort(...)` calls — after the `await`, so safe). `renderSiteMode()` only reads/writes DOM elements unrelated to the problem lists. `getAllProblems()` reads chrome.storage.local directly. The three operations touch disjoint state, so racing them is safe.

- [ ] **Step 12.4: Build sanity check**

```bash
cd /home/haohang/PMCA
npm run build 2>&1 | tail -3
```

Expected: build succeeds.

- [ ] **Step 12.5: Commit (deferred — combined with version bump in Task 13)**

Skip — defer commit to Task 13 so the housekeeping changes ship together.

---

## Task 13: Version Bump + Final Verification

**Files:**
- Modify: `manifest.base.json:4`

- [ ] **Step 13.1: Bump version**

Find:
```json
    "version": "0.9.8",
```
Replace with:
```json
    "version": "0.9.9",
```

- [ ] **Step 13.2: Full release build**

```bash
cd /home/haohang/PMCA
npm run release:dev 2>&1 | tail -10
```

Expected: builds bundles, generates manifest, zips into `release/` (or similar — check `deploy/zip.js` for output path). No errors.

- [ ] **Step 13.3: Comprehensive grep verification**

```bash
cd /home/haohang/PMCA

echo "=== Remote refs (must be empty) ==="
git grep -nE 'googleapis|gstatic|fontawesome\.com|ghbtns|kit-free|ka-f\.fontawesome' -- 'src/' 'popup.html' 'options.html' 'manifest.base.json' || echo "  CLEAN"

echo "=== Cloud sync refs (must be empty) ==="
git grep -nE 'isCloudSyncEnabled|cloudStorageDelegate|syncProblems|mergeProblems|CONFIG_INNER_KEY_ENABLE_CLOUD|enable_cloud|syncToggle' -- 'src/' 'popup.html' 'options.html' || echo "  CLEAN"

echo "=== FA class usage (must be empty) ==="
git grep -nE 'fa-(solid|regular|brands)\s+fa-' -- 'src/' 'popup.html' 'options.html' || echo "  CLEAN"

echo "=== FA kit file (must not exist) ==="
[ -f lib/fontawesome.js ] && echo "  STILL PRESENT — should be deleted" || echo "  CLEAN: lib/fontawesome.js removed"

echo "=== Cloud delegate file (must not exist) ==="
[ -f src/popup/delegate/cloudStorageDelegate.js ] && echo "  STILL PRESENT — should be deleted" || echo "  CLEAN: cloudStorageDelegate.js removed"

echo "=== Font files present ==="
ls -la lib/fonts/

echo "=== Icons module present ==="
ls -la src/popup/util/icons.js

echo "=== Manifest version ==="
grep '"version"' manifest.base.json
```

Expected: all five `CLEAN` lines fire; `lib/fonts/` lists 5 woff2 files; `icons.js` exists; version is `0.9.9`.

- [ ] **Step 13.4: Commit Tasks 12 + 13**

```bash
cd /home/haohang/PMCA
git add src/popup/view/view.js manifest.base.json dist/
git commit -m "chore: parallelize renderAll, drop debug log, bump version to 0.9.9

- view.js: Promise.all loadConfigs/renderSiteMode/getAllProblems instead
  of serial awaits. Saves a few storage-read round trips on popup open.
- view.js: delete stray console.log(store.toReviewMaxPage) from
  renderReviewTableContent.
- manifest.base.json: 0.9.8 -> 0.9.9 so Chrome treats this fork as an
  update on reload.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 13.5: Hand off to user for manual verification**

Report to user:
> Branch `localize-and-ctrl-enter` ready. Total commits: 6.
> Please load the unpacked extension from `/home/haohang/PMCA/` on Windows
> (Chrome → Extensions → Developer mode → Load unpacked) or use the
> generated zip from `npm run release:dev` output. Verify:
> 1. Cold popup open is < 500ms.
> 2. Popup re-opened after 10+ minutes is still fast.
> 3. Mouse-clicking Submit on a LeetCode problem still tracks it.
> 4. Pressing Ctrl+Enter on a LeetCode problem tracks it.
> 5. Options page loads correctly (with the "Enable Cloud Sync" toggle gone).
> 6. Icons render visually identical to before.

---

## Notes for the Executing Engineer

- **No test framework exists.** Each task ends with `npm run build` and a grep-based verification — these are the closest analogues to a passing test suite. Treat any build error or unexpected grep hit as a test failure: stop, diagnose, fix before continuing.
- **Commits are per-task-group, not per-step.** Steps inside a task are atomic edits; the commit happens at the explicit "commit" step.
- **Do not skip the verification greps** — they catch dangling imports / orphan references that webpack would otherwise tree-shake silently.
- **If a step's `Edit` operation fails because the file has shifted lines** since the spec was written, re-read the file with `Read` and adjust the `old_string` to the current content.
- **Cross-platform:** Cmd+Enter (Mac) is covered by `e.metaKey`. Bootstrap classes (`col-9`/`col-3` removal in Task 7) work identically across Chrome/Edge/Brave/Firefox MV3. The `'sans-serif'` CJK fallback works on Windows (Microsoft YaHei), macOS (PingFang SC), and modern Linux (Noto Sans CJK). No platform-specific branches needed.
