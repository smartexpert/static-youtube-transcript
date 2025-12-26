# YouTube Transcript Cleaner - Project Guide

## Overview

A static HTML app that extracts and cleans YouTube transcript data. Consists of two components:

1. **Main App** (`index.html`) - Processes raw timedtext JSON into clean readable text using jq-web WASM
2. **Bookmarklet** (`bookmarklet.js`) - Captures transcript data directly from YouTube pages

## File Structure

```
├── index.html              # Main app (Alpine.js + Tailwind + jq-web)
├── bookmarklet.js          # Source bookmarklet code (readable version)
├── docs/
│   ├── SPEC.md             # Original app specification
│   ├── RESEARCH.md         # Technical research on YouTube APIs
│   └── BOOKMARKLET_RESEARCH.md  # Approach comparison
```

## Key Technical Details

### Bookmarklet Implementation

The bookmarklet intercepts YouTube's network requests to capture transcript data automatically.

**Critical Findings:**

1. **YouTube uses both XHR and Fetch** - Must intercept both `XMLHttpRequest` and `window.fetch`

2. **Trusted Types CSP** - YouTube enforces Trusted Types policy which blocks `innerHTML`. All DOM manipulation must use:
   - `document.createElement()`
   - `element.textContent`
   - `element.appendChild()`
   - Never use `innerHTML` or YouTube will throw: `This document requires 'TrustedHTML' assignment`

3. **Caption Data Location** - Available in `window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks`

4. **timedtext API** - Captions are fetched from URLs like:
   ```
   https://www.youtube.com/api/timedtext?v=VIDEO_ID&...
   ```

### User Flow

```
1. User on YouTube video page
2. Click bookmarklet → overlay appears
3. Turn CC OFF then ON (triggers fresh timedtext request)
4. Transcript automatically intercepted and copied to clipboard
5. Click "Open App" → app auto-pastes and processes → clean text ready
```

**Note:** The app opens with `?auto=1` parameter which triggers automatic clipboard reading and processing. No manual paste required.

### Fallback: Manual Fetch

If CC was already enabled (cached), user can:
- Click "Fetch Manually" button in overlay
- Uses `baseUrl` from `ytInitialPlayerResponse` to fetch directly

## Common Issues

### "Fetch failed" on Manual Fetch
- The `baseUrl` may be expired or have CORS issues
- Solution: Toggle CC off then on to trigger a fresh request

### No `[YT Transcript]` logs appearing
- User may be using old bookmarklet code
- Solution: Re-copy bookmarklet from GitHub Pages after deployment

### Console errors: `requestStorageAccessFor: Permission denied`
- This is YouTube's own error, unrelated to bookmarklet
- Safe to ignore

## Development Notes

### Auto-Paste Feature

When the app is opened with `?auto=1` parameter (from bookmarklet's "Open App" button):

1. App waits for jq-web WASM to load
2. Reads clipboard using `navigator.clipboard.readText()`
3. Validates content is JSON with `events` property (transcript data)
4. If valid, auto-populates input and processes
5. Cleans up URL by removing `?auto=1` parameter

**Fallback:** If clipboard access is denied or content isn't valid transcript JSON, user can paste manually.

### Updating the Bookmarklet

When modifying `bookmarklet.js`:
1. Edit `bookmarklet.js` (readable source)
2. **Also update** the minified version embedded in `index.html` (in `bookmarkletInstaller()`)
3. Commit and push - GitHub Pages will deploy automatically

### Testing

- Cannot test with Playwright/automation - YouTube's bot detection returns empty responses
- Must test in real browser manually

### Debug Mode

Debug logging is controlled by a `DEBUG` flag. When enabled, logs appear in console with `[YT Transcript]` prefix.

**To enable debug mode:**

1. In `bookmarklet.js`: Change `const DEBUG = false;` to `const DEBUG = true;`
2. In `index.html` (embedded bookmarklet): Change `const D=false` to `const D=true`
3. Commit, push, and re-copy the bookmarklet

**Debug output includes:**
- XHR/Fetch interceptor installation confirmation
- Detected timedtext requests (URL)
- Response lengths
- Capture success/failure with event counts

### JQ Query

The app uses this JQ query to extract clean text:
```jq
[.[] | if type == "object" and has("events") then .events[] else . end | .segs | select(.) | .[].utf8 | gsub("\\n"; " ")] | join("")
```

## Deployment

- Hosted on GitHub Pages
- Push to `main` branch triggers automatic deployment
- Users copy bookmarklet from the deployed page
