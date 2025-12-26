# YouTube Transcript Automation Research

## Date: December 26, 2025

## Objective
Investigate how to automatically capture YouTube transcript data when a user enables closed captions, to streamline the current manual DevTools workflow.

---

## Research Methodology

Used Playwright to:
1. Observe YouTube network requests
2. Test XHR vs fetch interception
3. Analyze caption data delivery mechanism

---

## Key Findings

### 1. YouTube Uses XHR, Not Fetch

Network analysis confirmed that YouTube's timedtext (caption) requests use `XMLHttpRequest`, not the Fetch API.

**Evidence:**
```
>>> TIMEDTEXT REQUEST DETECTED <<<
URL: https://www.youtube.com/api/timedtext?v=...
Resource Type: xhr
Method: GET
```

**Implication:** Bookmarklet must intercept `XMLHttpRequest.prototype.open/send`, not `window.fetch`.

### 2. Bot Detection Blocks Automated Browsers

When testing with Playwright (Chromium-for-Testing):
- timedtext API returns `Status: 200` but `Body length: 0`
- CC button works visually but no caption data is delivered
- Same videos work normally in regular Chrome

**Implication:** Cannot fully validate interception in Playwright, but this doesn't affect real-browser bookmarklet usage.

### 3. Caption URLs Available in Page Data

Caption track information is embedded in the initial page response:

```javascript
window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks
```

Each track contains:
- `name.simpleText` - Language name (e.g., "English")
- `languageCode` - ISO code (e.g., "en")
- `kind` - "asr" for auto-generated, undefined for manual
- `baseUrl` - Direct URL to timedtext API

**Example baseUrl:**
```
https://www.youtube.com/api/timedtext?v=VIDEO_ID&ei=...&caps=asr&opi=...&lang=en
```

This provides a fallback mechanism for manual transcript fetching.

### 4. timedtext API Response Format

The timedtext endpoint returns JSON with this structure:
```json
{
  "events": [
    {
      "tStartMs": 1234,
      "dDurationMs": 5000,
      "segs": [
        { "utf8": "Caption text here" }
      ]
    }
  ]
}
```

This matches the format the existing transcript cleaner expects.

---

## XHR Interception Pattern

Validated approach for capturing timedtext responses:

```javascript
const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function(method, url, ...rest) {
  this._url = url;
  this._isTimedText = url && url.includes('timedtext');
  return originalOpen.call(this, method, url, ...rest);
};

XMLHttpRequest.prototype.send = function(body) {
  if (this._isTimedText) {
    this.addEventListener('load', function() {
      if (this.responseText && this.responseText.length > 0) {
        // Capture successful - responseText contains JSON
        console.log('Captured timedtext:', this.responseText.length, 'bytes');
      }
    });
  }
  return originalSend.call(this, body);
};
```

---

## Limitations Discovered

1. **CORS blocks direct fetch** - Cannot fetch timedtext URLs from bookmarklet context due to YouTube's security headers

2. **Bot detection** - Automated testing tools receive empty responses; testing must be done in real browser

3. **Timing dependency** - XHR interception must be installed BEFORE user enables CC, otherwise the request is missed

4. **Trusted Types CSP** - YouTube enforces Trusted Types policy that blocks `innerHTML` assignments

---

## Additional Findings (Implementation Phase)

### 5. Trusted Types CSP Policy

YouTube's Content Security Policy requires "TrustedHTML" for innerHTML assignments. Using innerHTML throws:

```
This document requires 'TrustedHTML' assignment.
Uncaught TypeError: Failed to set the 'innerHTML' property on 'Element'
```

**Solution:** Use DOM methods instead:
```javascript
// Instead of: element.innerHTML = '<div>text</div>';
const div = document.createElement('div');
div.textContent = 'text';
element.appendChild(div);
```

### 6. Fetch API Also Needed

While initial research showed XHR, YouTube may use Fetch API in some cases. The bookmarklet now intercepts both:

```javascript
// XHR interception
XMLHttpRequest.prototype.open = function(method, url, ...rest) { ... };
XMLHttpRequest.prototype.send = function(body) { ... };

// Fetch interception
const originalFetch = window.fetch;
window.fetch = async function(input, init) { ... };
```

### 7. Caption Caching

YouTube caches caption data. If CC was previously enabled:
- No new network request is made when toggling CC
- User must toggle CC OFF then ON to trigger fresh request
- Or use "Fetch Manually" with baseUrl from page data

---

## Recommended Implementation

Based on research:

1. **Primary method:** XHR interception
   - Install interceptor when bookmarklet is clicked
   - Capture timedtext response on CC enable
   - Copy to clipboard automatically

2. **Fallback method:** Manual fetch button
   - Use baseUrl from `ytInitialPlayerResponse`
   - Let user trigger fetch after CC is already visible

3. **User flow:**
   ```
   Click bookmarklet → "Waiting for CC..." → User clicks CC → "Captured! Open App"
   ```

---

## References

- [LogRocket: Intercepting Fetch API](https://blog.logrocket.com/intercepting-javascript-fetch-api-requests-responses/)
- [Monkey patching async functions](https://aweirdimagination.net/2024/05/19/monkey-patching-async-functions-in-user-scripts/)
- [YouTube Captions Extractor (GitHub)](https://github.com/erkamguresen/YouTube-Captions-Subtitles-Extractor)
