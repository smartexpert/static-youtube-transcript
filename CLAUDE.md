# YouTube Transcript Cleaner - Project Guide

## Overview

A static HTML app that extracts and cleans YouTube transcript data with local SQLite storage. Consists of three main components:

1. **Main App** (`index.html`) - Processes raw timedtext JSON into clean readable text using jq-web WASM
2. **Bookmarklet** (`bookmarklet.js`) - Captures transcript data directly from YouTube pages
3. **Database** (`js/db.js`) - SQLite storage using sql.js with IndexedDB persistence

## File Structure

```
├── index.html              # Main app (Alpine.js + Tailwind + jq-web + sql.js)
├── bookmarklet.js          # Source bookmarklet code (readable version)
├── _headers                # Cloudflare Pages headers (COOP)
├── js/
│   └── db.js               # Database module (sql.js + IndexedDB)
├── docs/
│   ├── SPEC.md             # Original app specification
│   ├── RESEARCH.md         # Technical research on YouTube APIs
│   ├── BOOKMARKLET_RESEARCH.md      # Approach comparison
│   ├── BOOKMARKLET_AUTOMATION_GUIDE.md  # LLM guide for bookmarklet automation
│   └── SQLITE_BROWSER_RESEARCH.md   # Browser SQLite feasibility research
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

**IMPORTANT: Keep Both Files in Sync!**

The bookmarklet code exists in TWO places that must stay synchronized:

| File | Description |
|------|-------------|
| `bookmarklet.js` | Readable source code with comments |
| `index.html` → `bookmarkletInstaller()` | Minified version users drag to bookmarks bar |

**When modifying bookmarklet logic:**

1. Edit `bookmarklet.js` (readable source with full comments)
2. **MUST ALSO** update the minified `const code = \`javascript:...\`` in `index.html`
3. The minified version in index.html is what users actually get
4. Commit and push - deployment is automatic

**Failure to sync both files** will result in:
- Users getting outdated bookmarklet behavior
- Bugs that appear "fixed" in source but persist for users

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

## SQLite Storage

### Architecture

The app uses **sql.js** (SQLite compiled to WebAssembly) with IndexedDB persistence:

- Database is stored in browser's IndexedDB as a single binary blob
- Loads entirely into memory on startup (~instant for typical usage)
- Automatically saves after each write operation
- No server required - fully client-side

### Database API (`window.TranscriptDB`)

```javascript
TranscriptDB.init()              // Initialize database
TranscriptDB.save(data)          // Save transcript
TranscriptDB.get(videoId)        // Get by video ID
TranscriptDB.getAll(limit, offset)  // List all transcripts
TranscriptDB.delete(videoId)     // Delete transcript
TranscriptDB.search(query)       // Full-text search
TranscriptDB.getStats()          // Get statistics
TranscriptDB.exportJson()        // Export as JSON
TranscriptDB.exportFile()        // Export as SQLite file
TranscriptDB.importJson(data)    // Import from JSON
TranscriptDB.importFile(buffer)  // Import SQLite file
```

### Schema

```sql
CREATE TABLE transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id TEXT NOT NULL UNIQUE,
    title TEXT,
    channel_name TEXT,
    video_url TEXT,
    duration_seconds INTEGER,
    publish_date TEXT,           -- YouTube publish date
    captured_at TEXT DEFAULT (datetime('now')),
    raw_json TEXT,
    clean_text TEXT,
    language TEXT,
    is_auto_generated INTEGER DEFAULT 0,
    word_count INTEGER,
    summary TEXT,
    summary_generated_at TEXT,
    tags TEXT
);
```

### COOP Header

The `_headers` file configures Cloudflare Pages to send the COOP header:

```
Cross-Origin-Opener-Policy: same-origin
```

Note: COEP (`require-corp`) was removed because Tailwind's CDN lacks CORS headers and would be blocked. sql.js with IndexedDB doesn't require SharedArrayBuffer, so this doesn't affect functionality.

## Deployment

### Cloudflare Pages via Wrangler CLI

**Live URL:** https://yt-captions.pages.dev

To deploy updates:
```bash
wrangler pages deploy . --project-name yt-captions
```

The project uses Direct Upload (Wrangler CLI), not Git integration. This means:
- Deploy manually with the command above
- Cannot switch to Git integration without recreating the project
- The `_headers` file is automatically applied

### Alternative: GitHub Pages

GitHub Pages doesn't support custom headers natively. Options:
- Use `coi-serviceworker` to inject headers client-side
- Accept that some WASM features may not work

### Users

- Copy bookmarklet from the deployed page
- All transcript data stored locally in their browser
