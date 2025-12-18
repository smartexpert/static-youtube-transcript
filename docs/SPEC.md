# YouTube Transcript Cleaner - Static HTML App Specification

## Overview

Build a single-page static HTML application that takes raw YouTube transcript JSON as input and outputs clean, readable text. The app should use JQ (via WebAssembly) for JSON processing, Alpine.js for reactivity, and Tailwind CSS with ShadCN-inspired styling.

## Purpose

This app is a client-side version of a YouTube transcript processing tool. The original server-side app fetches YouTube closed captions via browser automation and processes them using JQ. This static version allows users to paste raw transcript JSON and get clean text output without needing a backend server.

## Tech Stack

| Technology | Purpose | CDN/Source |
|------------|---------|------------|
| Alpine.js | Reactive UI framework | `https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js` |
| Tailwind CSS | Utility-first CSS | `https://cdn.tailwindcss.com` |
| jq-web | JQ in WebAssembly | `https://cdn.jsdelivr.net/npm/jq-web@0.5.1/jq.wasm.min.js` |

## Input Data Format

The app accepts YouTube's timedtext API JSON response. This is the raw closed captions data with timing information.

### Example Input Structure

```json
[
  {
    "responseContext": {},
    "events": [
      {
        "tStartMs": 1234,
        "dDurationMs": 5000,
        "segs": [
          {
            "utf8": "This is the subtitle text",
            "tStartMs": 1234,
            "dDurationMs": 5000
          }
        ]
      },
      {
        "tStartMs": 6234,
        "dDurationMs": 3000,
        "segs": [
          {
            "utf8": "Another line of text\n",
            "tStartMs": 6234
          }
        ]
      }
    ]
  }
]
```

### Key Data Points
- **events**: Array of caption events (timestamped text blocks)
- **segs**: Segments within each event containing actual text
- **utf8**: The caption text (may contain newlines `\n`)
- **tStartMs**: Start time in milliseconds
- **dDurationMs**: Duration in milliseconds

## JQ Processing Query

Use this exact JQ query to extract clean text from the raw transcript JSON:

```jq
[.[].events[].segs | select(.) | .[].utf8 | gsub("\\n"; " ")] | join("")
```

### Query Breakdown
1. `.[].events[]` - Extract all events from each response object
2. `.segs` - Access the segments array
3. `select(.)` - Filter out null/empty segments
4. `.[].utf8` - Extract UTF-8 text from each segment
5. `gsub("\\n"; " ")` - Replace newline characters with spaces
6. `join("")` - Concatenate all text into a single string

## UI/UX Requirements

### Layout (Single Page)
```
┌─────────────────────────────────────────────────────────┐
│  Header: "YouTube Transcript Cleaner"                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Input Section                                   │   │
│  │  Label: "Paste Raw Transcript JSON"              │   │
│  │  ┌───────────────────────────────────────────┐  │   │
│  │  │                                           │  │   │
│  │  │  <textarea> - monospace font              │  │   │
│  │  │  placeholder text explaining input        │  │   │
│  │  │                                           │  │   │
│  │  └───────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────┐                                   │
│  │  Process Button │  (Primary style, prominent)       │
│  └─────────────────┘                                   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Output Section (shown after processing)         │   │
│  │  Label: "Clean Transcript"                       │   │
│  │  ┌───────────────────────────────────────────┐  │   │
│  │  │                                           │  │   │
│  │  │  <textarea> - readable font, read-only    │  │   │
│  │  │  processed clean text output              │  │   │
│  │  │                                           │  │   │
│  │  └───────────────────────────────────────────┘  │   │
│  │                                                  │   │
│  │  [Copy to Clipboard] button                      │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Error display area (shown if JQ processing fails)     │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  Footer: Brief instructions / credits                   │
└─────────────────────────────────────────────────────────┘
```

### ShadCN-Inspired Styling Guidelines

Use these Tailwind classes to achieve ShadCN's design aesthetic:

#### Color Palette (Dark Mode Preferred)
```css
/* Background colors */
--background: hsl(222.2 84% 4.9%)      /* bg-slate-950 */
--foreground: hsl(210 40% 98%)         /* text-slate-50 */
--card: hsl(222.2 84% 4.9%)            /* bg-slate-900 */
--card-foreground: hsl(210 40% 98%)

/* Primary accent */
--primary: hsl(210 40% 98%)            /* bg-slate-50 */
--primary-foreground: hsl(222.2 47.4% 11.2%)

/* Muted/secondary */
--muted: hsl(217.2 32.6% 17.5%)        /* bg-slate-800 */
--muted-foreground: hsl(215 20.2% 65.1%)

/* Border */
--border: hsl(217.2 32.6% 17.5%)       /* border-slate-800 */

/* Destructive/error */
--destructive: hsl(0 62.8% 30.6%)      /* bg-red-900 */
```

#### Component Styles

**Card/Container:**
```html
<div class="rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-sm">
```

**Input/Textarea:**
```html
<textarea class="w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-50 font-mono">
```

**Primary Button:**
```html
<button class="inline-flex items-center justify-center rounded-md bg-slate-50 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:pointer-events-none disabled:opacity-50">
```

**Secondary Button:**
```html
<button class="inline-flex items-center justify-center rounded-md border border-slate-800 bg-transparent px-4 py-2 text-sm font-medium text-slate-50 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-slate-900">
```

**Label:**
```html
<label class="text-sm font-medium text-slate-200">
```

**Error Message:**
```html
<div class="rounded-md bg-red-900/50 border border-red-800 p-4 text-sm text-red-200">
```

## Functional Requirements

### Core Features

1. **JSON Input**
   - Large textarea for pasting raw transcript JSON
   - Monospace font for code readability
   - Placeholder text explaining expected format
   - Clear/reset button to empty the input

2. **JQ Processing**
   - Load jq-web WASM library on page load
   - Show loading indicator while WASM initializes
   - Process JSON using the specified JQ query
   - Handle malformed JSON gracefully with error messages

3. **Output Display**
   - Show clean transcript text in readable format
   - Read-only textarea for output
   - "Copy to Clipboard" button with success feedback
   - Character/word count display

4. **Error Handling**
   - Display friendly error messages for:
     - Invalid JSON input
     - JQ processing errors
     - Empty input submission
   - Clear errors when user modifies input

### Alpine.js Data Model

```javascript
Alpine.data('transcriptCleaner', () => ({
    // State
    input: '',
    output: '',
    error: '',
    isProcessing: false,
    isJqReady: false,
    copied: false,

    // Computed
    get wordCount() {
        return this.output ? this.output.trim().split(/\s+/).filter(Boolean).length : 0;
    },
    get charCount() {
        return this.output.length;
    },

    // Methods
    async init() {
        // Initialize jq-web WASM
    },
    async process() {
        // Run JQ query on input
    },
    clear() {
        // Reset all state
    },
    async copyToClipboard() {
        // Copy output to clipboard
    }
}))
```

## Implementation Notes

### jq-web Usage

```javascript
// Load jq-web
import jq from 'jq-web';

// Or via CDN script tag, then:
const result = jq.json(inputData, '[.[].events[].segs | select(.) | .[].utf8 | gsub("\\n"; " ")] | join("")');
```

### Handling WASM Loading

```javascript
// Show loading state while WASM initializes
async init() {
    try {
        // jq-web auto-initializes, but may need time
        await jq.promised;  // If using promised version
        this.isJqReady = true;
    } catch (e) {
        this.error = 'Failed to load JQ processor';
    }
}
```

### Copy to Clipboard

```javascript
async copyToClipboard() {
    try {
        await navigator.clipboard.writeText(this.output);
        this.copied = true;
        setTimeout(() => this.copied = false, 2000);
    } catch (e) {
        this.error = 'Failed to copy to clipboard';
    }
}
```

## File Structure

Create a single `index.html` file containing:
- All HTML structure
- Inline `<style>` for any custom CSS (minimal, mostly Tailwind)
- Inline `<script>` for Alpine.js component logic
- CDN links for dependencies

```
index.html (single file, self-contained)
```

## Sample Test Data

Use this sample JSON to test the app:

```json
[{"events":[{"tStartMs":0,"dDurationMs":5000,"segs":[{"utf8":"Hello and welcome to this video."}]},{"tStartMs":5000,"dDurationMs":4000,"segs":[{"utf8":"Today we're going to talk about\n"}]},{"tStartMs":9000,"dDurationMs":3000,"segs":[{"utf8":"something really interesting."}]}]}]
```

**Expected Output:**
```
Hello and welcome to this video.Today we're going to talk about something really interesting.
```

## Additional Features (Optional Enhancements)

If time permits, consider adding:

1. **Timed Output Mode** - Option to include timestamps with text
   ```jq
   [.[].events[] | select(.segs) | "\(.tStartMs/1000 | floor)s: \([.segs[].utf8] | join("") | gsub("\\n"; " "))"] | join("\n")
   ```

2. **Download Button** - Save output as .txt file

3. **Dark/Light Mode Toggle** - User preference for theme

4. **Local Storage** - Remember last input for convenience

5. **Drag & Drop** - Allow dropping JSON files onto input area

## Acceptance Criteria

The app is complete when:

- [ ] Single HTML file loads without errors
- [ ] jq-web WASM loads successfully (loading indicator shown)
- [ ] Pasting valid transcript JSON and clicking "Process" produces clean text
- [ ] Invalid JSON shows appropriate error message
- [ ] "Copy to Clipboard" works and shows feedback
- [ ] UI matches ShadCN aesthetic (dark theme, rounded corners, proper spacing)
- [ ] Responsive design works on mobile and desktop
- [ ] No console errors during normal operation

## Reference

This specification is based on the server-side YouTube transcript tool that:
- Uses Playwright to fetch YouTube closed captions
- Processes them with Python's jq library
- Returns either raw JSON (`/timedtext/{video_id}`) or clean text (`/transcript/{video_id}`)

The static HTML version replicates the client-side processing without needing browser automation for fetching.
