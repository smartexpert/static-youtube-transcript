# Bookmarklet Automation Pattern - Implementation Guide

## Purpose

This guide documents a proven pattern for creating bookmarklet-based automation that:
1. Extracts data from a source website (e.g., YouTube, Twitter, any web app)
2. Transfers that data to a companion app for processing
3. Automates the entire flow with minimal user interaction

**Reference Implementation:** YouTube Transcript Extractor → Transcript Cleaner App

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           USER WORKFLOW                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. User on source website (e.g., YouTube)                              │
│                    │                                                     │
│                    ▼                                                     │
│  2. Click bookmarklet → Overlay UI appears                              │
│                    │                                                     │
│                    ▼                                                     │
│  3. Trigger action (e.g., toggle CC) OR click "Fetch" button            │
│                    │                                                     │
│                    ▼                                                     │
│  4. Data captured → Copied to clipboard automatically                   │
│                    │                                                     │
│                    ▼                                                     │
│  5. Click "Open App" → Opens companion app with ?auto=1                 │
│                    │                                                     │
│                    ▼                                                     │
│  6. App auto-reads clipboard → Validates → Processes → Done!            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Critical Technical Findings

### 1. Content Security Policy (CSP) - Trusted Types

**CRITICAL:** Many modern websites (YouTube, Google properties, etc.) enforce Trusted Types CSP which **blocks innerHTML assignments**.

**Error you'll see:**
```
This document requires 'TrustedHTML' assignment.
Uncaught TypeError: Failed to set the 'innerHTML' property on 'Element'
```

**SOLUTION - Use DOM methods exclusively:**

```javascript
// ❌ WRONG - Will fail on sites with Trusted Types CSP
element.innerHTML = '<div class="status">Loading...</div>';
statusDiv.innerHTML += '<span>Done!</span>';

// ✅ CORRECT - Use DOM manipulation methods
function createEl(tag, styles, text) {
    const el = document.createElement(tag);
    if (styles) el.style.cssText = styles;
    if (text) el.textContent = text;
    return el;
}

const statusDiv = createEl('div', 'color: green; font-size: 14px', 'Loading...');
parent.appendChild(statusDiv);

// To update content:
statusDiv.textContent = '';  // Clear
statusDiv.appendChild(createEl('span', null, 'Done!'));
```

**Rule:** NEVER use innerHTML, outerHTML, or insertAdjacentHTML in bookmarklets. Always use createElement, textContent, and appendChild.

---

### 2. Network Request Interception

Modern websites may use **XHR, Fetch, or both**. Intercept both to be safe.

#### XHR Interception Pattern

```javascript
function installXHRInterceptor(onCapture) {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        this._url = url;
        // Customize this condition for your target API
        this._isTarget = url && url.includes('your-api-endpoint');
        return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function(body) {
        if (this._isTarget) {
            this.addEventListener('load', function() {
                if (this.responseText && this.responseText.length > 0) {
                    try {
                        const data = JSON.parse(this.responseText);
                        onCapture(this.responseText, data);
                    } catch (e) {
                        // Handle non-JSON responses if needed
                    }
                }
            });
        }
        return originalSend.call(this, body);
    };
}
```

#### Fetch Interception Pattern

```javascript
function installFetchInterceptor(onCapture) {
    const originalFetch = window.fetch;

    window.fetch = async function(input, init) {
        const url = typeof input === 'string' ? input : input.url;
        // Customize this condition for your target API
        const isTarget = url && url.includes('your-api-endpoint');

        const response = await originalFetch.call(this, input, init);

        if (isTarget) {
            // Clone response so we can read it without consuming
            const clone = response.clone();
            clone.text().then(text => {
                if (text && text.length > 0) {
                    try {
                        const data = JSON.parse(text);
                        onCapture(text, data);
                    } catch (e) {
                        // Handle non-JSON responses
                    }
                }
            }).catch(err => {
                // Handle read errors
            });
        }

        return response;  // Return original response to not break the page
    };
}
```

**IMPORTANT:** Always return the original response/call the original method. Breaking the page's normal functionality will cause issues.

---

### 3. Timing Considerations

**Problem:** Interceptors must be installed BEFORE the target request is made.

**Solutions:**

1. **User-triggered action:** Instruct user to perform action after bookmarklet is clicked
   ```
   "Click bookmarklet first, THEN toggle the feature"
   ```

2. **Manual fetch fallback:** If data URLs are available in page, provide a "Fetch Manually" button
   ```javascript
   // Example: YouTube stores caption URLs in page data
   const dataUrl = window.ytInitialPlayerResponse?.captions?.captionTracks[0]?.baseUrl;
   if (dataUrl) {
       // Offer manual fetch as fallback
   }
   ```

3. **Re-trigger instruction:** Tell user to toggle feature off then on
   ```
   "Turn CC OFF then ON again to capture"
   ```

---

### 4. Data Transfer: Bookmarklet → App

**Primary Method: Clipboard API**

```javascript
// In bookmarklet - Copy captured data
navigator.clipboard.writeText(jsonString).then(() => {
    // Update UI to show success
}).catch(err => {
    // Handle clipboard error (show manual copy option)
});

// In companion app - Read clipboard
async function readFromClipboard() {
    try {
        const text = await navigator.clipboard.readText();
        return text;
    } catch (e) {
        // Clipboard access denied - user must paste manually
        return null;
    }
}
```

**Auto-Processing Pattern:**

```javascript
// Bookmarklet opens app with parameter
window.open('https://your-app.com/?auto=1', '_blank');

// App detects parameter and auto-processes
async function checkAutoPaste() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auto') === '1') {
        try {
            const text = await navigator.clipboard.readText();
            if (isValidData(text)) {
                processData(text);
                // Clean up URL
                window.history.replaceState({}, '', window.location.pathname);
            }
        } catch (e) {
            // Fallback to manual paste
        }
    }
}
```

**Clipboard API Requirements:**
- HTTPS (works on localhost and GitHub Pages)
- User permission (browser will prompt first time)
- Some browsers require recent user gesture

---

### 5. Overlay UI Pattern

Create a floating overlay that doesn't interfere with the source page:

```javascript
function createOverlay() {
    // Remove existing overlay if present (idempotency)
    const existing = document.getElementById('my-bookmarklet-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'my-bookmarklet-overlay';
    overlay.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #0f0f0f;
        color: #f1f1f1;
        padding: 20px;
        border-radius: 12px;
        z-index: 999999;
        max-width: 400px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        border: 1px solid #272727;
    `;

    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        background: none;
        border: none;
        color: #aaa;
        cursor: pointer;
        font-size: 24px;
        line-height: 1;
    `;
    closeBtn.onclick = () => overlay.remove();
    overlay.appendChild(closeBtn);

    document.body.appendChild(overlay);
    return overlay;
}
```

**Key z-index:** Use `999999` or higher to ensure overlay appears above all page content.

---

### 6. Debug Mode Pattern

Include a debug flag that can be easily toggled:

```javascript
(function() {
    // ========== DEBUG FLAG ==========
    // Set to true to enable console logging
    const DEBUG = false;
    const log = DEBUG ? console.log.bind(console, '[MyBookmarklet]') : () => {};

    // Usage throughout code:
    log('Interceptor installed');
    log('Captured data:', data);
    log('Error:', err);
})();
```

**For minified/embedded version:** Use short variable name
```javascript
const D=false;const log=D?console.log.bind(console,'[Tag]'):()=>{};
```

---

### 7. Accessing Page Data

Many sites expose data in global variables. Check for these:

```javascript
// YouTube
window.ytInitialPlayerResponse  // Video data, captions
window.ytInitialData            // Page data

// Twitter/X
window.__INITIAL_STATE__

// React apps
document.querySelector('[data-reactroot]')?.__reactFiber$

// Generic patterns
window.__NEXT_DATA__           // Next.js apps
window.__NUXT__                // Nuxt.js apps
```

**Finding page data:**
1. Open DevTools Console
2. Type `window.` and browse autocomplete
3. Look for variables starting with `__` or containing `initial`, `data`, `state`

---

## What Didn't Work (Lessons Learned)

### 1. innerHTML on CSP-Protected Sites
**Failed:** YouTube, Google properties, many modern sites
**Solution:** DOM methods only (see section 1)

### 2. Testing with Playwright/Puppeteer
**Failed:** Many sites detect automation and return empty/different responses
**Solution:** Test manually in real browser. Automated tests are unreliable for this pattern.

### 3. Single Interception Method
**Failed:** Assuming site uses only XHR or only Fetch
**Solution:** Intercept both XHR and Fetch to be safe

### 4. Relying on Request Timing
**Failed:** Expecting to capture requests that already happened
**Solution:** User must trigger action AFTER bookmarklet is clicked, or provide manual fetch

### 5. Direct CORS Fetch
**Failed:** Fetching API URLs directly often blocked by CORS
**Solution:** Intercept the page's own requests, or use URLs the page itself would use

---

## Complete Bookmarklet Template

```javascript
/**
 * [Your Bookmarklet Name]
 *
 * Purpose: [What it does]
 * Target Site: [e.g., youtube.com]
 *
 * DEBUG: Set DEBUG = true to enable console logging
 */
(function() {
    // ========== CONFIGURATION ==========
    const DEBUG = false;
    const log = DEBUG ? console.log.bind(console, '[MyBookmarklet]') : () => {};

    const CONFIG = {
        siteHostname: 'example.com',           // Target site
        apiPattern: 'api/data',                 // URL pattern to intercept
        overlayId: 'my-bookmarklet-overlay',
        appUrl: 'https://my-app.com/',
        appAutoParam: 'auto=1'
    };

    // ========== VALIDATION ==========
    if (!window.location.hostname.includes(CONFIG.siteHostname)) {
        alert(`This bookmarklet only works on ${CONFIG.siteHostname}`);
        return;
    }

    // ========== HELPERS ==========
    function createEl(tag, styles, text) {
        const el = document.createElement(tag);
        if (styles) el.style.cssText = styles;
        if (text) el.textContent = text;
        return el;
    }

    // ========== STATE ==========
    let isIntercepting = false;
    let capturedData = null;

    // ========== INTERCEPTORS ==========
    function installInterceptors(onCapture) {
        if (isIntercepting) return;
        isIntercepting = true;
        log('Installing interceptors...');

        // XHR
        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
            this._url = url;
            this._isTarget = url && url.includes(CONFIG.apiPattern);
            if (this._isTarget) log('XHR detected:', url);
            return originalOpen.call(this, method, url, ...rest);
        };

        XMLHttpRequest.prototype.send = function(body) {
            if (this._isTarget) {
                this.addEventListener('load', function() {
                    log('XHR response:', this.responseText?.length, 'bytes');
                    if (this.responseText) {
                        try {
                            const data = JSON.parse(this.responseText);
                            onCapture(this.responseText, data);
                        } catch (e) {
                            log('XHR parse error:', e);
                        }
                    }
                });
            }
            return originalSend.call(this, body);
        };

        // Fetch
        const originalFetch = window.fetch;
        window.fetch = async function(input, init) {
            const url = typeof input === 'string' ? input : input.url;
            const isTarget = url && url.includes(CONFIG.apiPattern);
            if (isTarget) log('Fetch detected:', url);

            const response = await originalFetch.call(this, input, init);

            if (isTarget) {
                const clone = response.clone();
                clone.text().then(text => {
                    log('Fetch response:', text?.length, 'bytes');
                    if (text) {
                        try {
                            const data = JSON.parse(text);
                            onCapture(text, data);
                        } catch (e) {
                            log('Fetch parse error:', e);
                        }
                    }
                }).catch(err => log('Fetch read error:', err));
            }

            return response;
        };

        log('Interceptors installed');
    }

    // ========== UI ==========
    const existing = document.getElementById(CONFIG.overlayId);
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = CONFIG.overlayId;
    overlay.style.cssText = 'position:fixed;top:20px;right:20px;background:#0f0f0f;color:#f1f1f1;padding:20px;border-radius:12px;z-index:999999;max-width:400px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:14px;box-shadow:0 8px 32px rgba(0,0,0,0.5);border:1px solid #272727';

    // Header
    const header = createEl('div', 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px');
    const title = createEl('span', 'font-weight:600;font-size:16px', 'My Bookmarklet');
    const closeBtn = createEl('button', 'background:none;border:none;color:#aaa;cursor:pointer;font-size:24px;line-height:1', '×');
    closeBtn.onclick = () => overlay.remove();
    header.appendChild(title);
    header.appendChild(closeBtn);
    overlay.appendChild(header);

    // Status
    const statusDiv = createEl('div', 'background:#1a1a2e;border:1px solid #3b82f6;border-radius:8px;padding:16px;margin-bottom:16px;text-align:center');
    statusDiv.appendChild(createEl('div', 'font-size:24px;margin-bottom:8px', '⏳'));
    statusDiv.appendChild(createEl('div', 'color:#60a5fa;font-weight:600', 'Waiting for data...'));
    statusDiv.appendChild(createEl('div', 'color:#6b7280;font-size:12px;margin-top:4px', 'Perform action to capture'));
    overlay.appendChild(statusDiv);

    // Buttons
    const btnRow = createEl('div', 'display:flex;gap:10px');

    const fetchBtn = createEl('button', 'flex:1;padding:10px;background:#272727;color:#f1f1f1;border:1px solid #3f3f3f;border-radius:6px;cursor:pointer', 'Fetch Manually');

    const openAppBtn = createEl('button', 'flex:1;padding:10px;background:#3ea6ff;color:#0f0f0f;border:none;border-radius:6px;font-weight:600;cursor:pointer;display:none', 'Open App');
    openAppBtn.onclick = () => window.open(CONFIG.appUrl + '?' + CONFIG.appAutoParam, '_blank');

    btnRow.appendChild(fetchBtn);
    btnRow.appendChild(openAppBtn);
    overlay.appendChild(btnRow);

    document.body.appendChild(overlay);

    // ========== CAPTURE HANDLER ==========
    function onDataCaptured(rawText, parsedData) {
        capturedData = rawText;
        log('Data captured!', parsedData);

        // Update status
        statusDiv.style.borderColor = '#22c55e';
        statusDiv.style.background = '#052e16';
        statusDiv.textContent = '';
        statusDiv.appendChild(createEl('div', 'font-size:24px;margin-bottom:8px', '✅'));
        statusDiv.appendChild(createEl('div', 'color:#4ade80;font-weight:600', 'Data Captured!'));

        // Copy to clipboard
        navigator.clipboard.writeText(rawText).then(() => {
            statusDiv.appendChild(createEl('div', 'color:#4ade80;font-size:11px;margin-top:8px', '📋 Copied to clipboard'));
        }).catch(() => {
            statusDiv.appendChild(createEl('div', 'color:#fca5a5;font-size:11px;margin-top:8px', '⚠️ Clipboard copy failed'));
        });

        // Show open app button
        openAppBtn.style.display = 'block';
        fetchBtn.style.display = 'none';
    }

    // ========== MANUAL FETCH (if applicable) ==========
    fetchBtn.onclick = async function() {
        // Implement manual fetch if page exposes data URLs
        // Example: const dataUrl = window.someGlobalData?.url;
        alert('Manual fetch not implemented for this site');
    };

    // ========== START ==========
    installInterceptors(onDataCaptured);

})();
```

---

## Companion App Template (Auto-Paste)

```javascript
// Add to your app's initialization
async function checkAutoPaste() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auto') !== '1') return;

    try {
        const text = await navigator.clipboard.readText();
        if (!text || !text.trim()) return;

        // Validate the data format
        const trimmed = text.trim();
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return;

        try {
            const json = JSON.parse(trimmed);

            // Add your validation logic here
            // Example: Check for expected properties
            if (!isValidData(json)) return;

            // Auto-process
            this.input = text;
            this.process();

            // Clean up URL
            window.history.replaceState({}, '', window.location.pathname);

        } catch (e) {
            // Not valid JSON, ignore
        }
    } catch (e) {
        // Clipboard access denied, user can paste manually
    }
}

function isValidData(json) {
    // Customize for your data format
    // Example: return json.events && Array.isArray(json.events);
    return true;
}
```

---

## Minification Tips

When embedding bookmarklet in HTML:

1. Remove comments and unnecessary whitespace
2. Use short variable names for DEBUG flag: `const D=false;`
3. Use single quotes inside template literal (or escape properly)
4. Test the minified version - syntax errors are common

**Tools:**
- https://javascript-minifier.com/
- Manual: Remove newlines, use short names, remove comments

---

## Checklist for New Implementation

- [ ] Identify target site and API endpoints to intercept
- [ ] Check if site uses Trusted Types CSP (test innerHTML first)
- [ ] Determine if XHR, Fetch, or both are used
- [ ] Find any page data globals (window.__DATA__, etc.)
- [ ] Design overlay UI with status feedback
- [ ] Implement interception for target APIs
- [ ] Add clipboard copy on capture
- [ ] Create "Open App" button with ?auto=1 parameter
- [ ] Add debug flag for troubleshooting
- [ ] Test in real browser (not Playwright/Puppeteer)
- [ ] Create companion app auto-paste handler
- [ ] Update embedded/minified bookmarklet in app
- [ ] Document site-specific quirks discovered

---

## Reference Implementation

See the YouTube Transcript Extractor project:
- `bookmarklet.js` - Full implementation with XHR+Fetch interception
- `index.html` - Companion app with auto-paste
- `CLAUDE.md` - Project-specific documentation
- `docs/RESEARCH.md` - Technical research findings
