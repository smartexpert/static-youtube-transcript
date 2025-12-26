# SQLite in the Browser - Feasibility Research

## Date: December 26, 2025

## Objective

Research the feasibility of storing YouTube transcripts in a local SQLite database from a static web app, with the ability to:
1. Persist data locally between sessions
2. Store metadata (video title, date captured, etc.)
3. Enable future LLM-based processing and summarization
4. Maintain a fully static/client-side architecture

---

## Executive Summary

**Verdict: FEASIBLE with caveats**

It is possible to run SQLite in the browser using WebAssembly and persist data locally. However, the "connect to a SQLite file on the local file system" approach has significant limitations. The recommended approach is to use **Origin Private File System (OPFS)** for storage, with export/import capabilities for backup and portability.

### Key Findings

| Requirement | Feasibility | Notes |
|-------------|-------------|-------|
| SQLite in browser | ✅ Fully supported | Multiple mature WASM libraries available |
| Persistent storage | ✅ Supported | Via OPFS (recommended) or IndexedDB |
| Access user's local .sqlite file | ⚠️ Limited | Requires permission each session, Chrome/Edge only |
| GitHub Pages hosting | ⚠️ Workaround needed | Requires service worker for COOP/COEP headers |
| Export/Import database | ✅ Supported | Can backup and restore database files |
| Multi-tab access | ⚠️ Limited | Only one tab can have database open at a time |

---

## Technology Options

### 1. SQLite WebAssembly Libraries

#### a) Official sqlite-wasm (sqlite.org)
- **Source:** [sqlite.org/wasm](https://sqlite.org/wasm)
- **Status:** Official SQLite project, actively maintained
- **Persistence:** OPFS via "opfs" or "opfs-sahpool" VFS
- **Pros:** Official support, well-documented, battle-tested
- **Cons:** Requires COOP/COEP headers for full OPFS support

#### b) wa-sqlite (by Roy Hashimoto)
- **Source:** [github.com/rhashimoto/wa-sqlite](https://github.com/rhashimoto/wa-sqlite)
- **Status:** Reached v1.0 in July 2024, actively maintained
- **Persistence:** Multiple VFS options (OPFS, IndexedDB)
- **Pros:** Flexible VFS system, good concurrency support, OPFSCoopSyncVFS works without COOP/COEP
- **Cons:** Third-party library

#### c) sql.js
- **Source:** [github.com/sql-js/sql.js](https://github.com/sql-js/sql.js)
- **Status:** Oldest option (since 2014), widely used
- **Persistence:** In-memory only (requires external persistence layer)
- **Pros:** Simple, no special headers needed
- **Cons:** No built-in persistence, must export/import entire database

#### d) SQLocal
- **Source:** [github.com/DallasHoff/sqlocal](https://github.com/DallasHoff/sqlocal) / [sqlocal.dev](https://sqlocal.dev)
- **Status:** High-level wrapper around official sqlite-wasm
- **Persistence:** OPFS-backed
- **Pros:** Simple API, Kysely/Drizzle ORM support, good DX
- **Cons:** Requires build tooling (Vite plugin), COOP/COEP headers

### Recommendation: **wa-sqlite** or **SQLocal**
- wa-sqlite for maximum flexibility and GitHub Pages compatibility
- SQLocal for best developer experience if using a build system

---

## Storage Options

### Option A: Origin Private File System (OPFS) ⭐ Recommended

**What it is:** Browser-sandboxed file system, invisible to user but persistent.

**How it works:**
```javascript
// Access OPFS
const root = await navigator.storage.getDirectory();
const fileHandle = await root.getFileHandle('transcripts.db', { create: true });
```

**Pros:**
- High performance (synchronous access in Web Workers)
- Persistent across sessions
- No user prompts after initial setup
- Works on Chrome 102+, Firefox 111+, Safari 16.4+

**Cons:**
- Not visible in user's file system
- Requires COOP/COEP headers for SharedArrayBuffer (most VFS implementations)
- One tab at a time can open database
- Safari <17 has bugs (workaround available with opfs-sahpool)

**Browser Support:**
| Browser | OPFS Support | Notes |
|---------|--------------|-------|
| Chrome 102+ | ✅ Full | Best support |
| Edge 102+ | ✅ Full | Same as Chrome |
| Firefox 111+ | ✅ Full | Good support |
| Safari 16.4+ | ⚠️ Partial | Bugs in <17, use opfs-sahpool |

---

### Option B: IndexedDB

**What it is:** Browser key-value database, can store binary blobs.

**How it works:**
- Store entire SQLite database as a blob
- Load into memory on startup
- Save back after changes

**Pros:**
- Universal browser support
- No special headers required
- Simple implementation with sql.js

**Cons:**
- Must load entire database into memory
- Slower than OPFS
- Not suitable for large databases

**Best for:** Simple use cases, maximum compatibility

---

### Option C: File System Access API (User's Local Files)

**What it is:** API to read/write actual files on user's computer.

**How it works:**
```javascript
// Let user pick a file
const [fileHandle] = await window.showOpenFilePicker({
  types: [{ description: 'SQLite Database', accept: { 'application/x-sqlite3': ['.db', '.sqlite'] } }]
});

// Request write permission
await fileHandle.requestPermission({ mode: 'readwrite' });
```

**Pros:**
- User controls file location
- Database visible in file system
- Can use existing databases

**Cons:**
- **Permission required EVERY SESSION** - Cannot persist permissions across browser restarts
- Chrome/Edge only (not Firefox, limited Safari)
- User must re-select file each time (can store handle in IndexedDB, but still need permission)

**Verdict:** NOT recommended for primary storage. The permission-per-session requirement defeats the "connect once" goal.

**Alternative Use:** Use for **export/import** functionality, not primary storage.

---

## GitHub Pages Hosting Considerations

### The Problem

SQLite WASM with OPFS requires these HTTP headers:
```
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

GitHub Pages **does not allow custom headers**.

### Solutions

#### Solution 1: coi-serviceworker ⭐ Recommended for GitHub Pages

**Source:** [github.com/gzuidhof/coi-serviceworker](https://github.com/gzuidhof/coi-serviceworker)

A service worker that intercepts requests and adds the required headers.

**Implementation:**
```html
<!-- Add to index.html, BEFORE other scripts -->
<script src="coi-serviceworker.js"></script>
```

**Behavior:**
- First page load: installs service worker, reloads page
- Subsequent loads: headers are present, OPFS works

**Trade-offs:**
- Initial page reload (usually fast, barely noticeable)
- May break embedding in iframes
- May cause issues with third-party embeds (YouTube, etc.)

#### Solution 2: Use opfs-sahpool VFS

The "opfs-sahpool" VFS in official sqlite-wasm does NOT require COOP/COEP headers.

**Trade-offs:**
- Slightly different performance characteristics
- Works on all major browsers since March 2023

#### Solution 3: wa-sqlite with OPFSCoopSyncVFS

wa-sqlite's OPFSCoopSyncVFS offers excellent performance without COOP/COEP requirements.

---

## Export/Import Capabilities

### Exporting Database

```javascript
// Using official sqlite-wasm
const byteArray = sqlite3.capi.sqlite3_js_db_export(db);
const blob = new Blob([byteArray], { type: 'application/x-sqlite3' });

// Trigger download
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'transcripts.db';
a.click();
```

**Limitations:**
- Does NOT work with WAL-mode databases
- WASM build cannot read WAL-mode databases

### Importing Database

```javascript
// Using File System Access API
const [fileHandle] = await window.showOpenFilePicker();
const file = await fileHandle.getFile();
const arrayBuffer = await file.arrayBuffer();

// Import into database
// Method varies by library
```

**Use Cases:**
- Backup/restore
- Transfer between devices
- Use with external SQLite tools

---

## Concurrency Limitations

### Multi-Tab Access

**Problem:** OPFS sync access handles exclusively lock the file.

**Behavior:**
- Tab 1 opens database → works fine
- Tab 2 tries to open same database → **ERROR**

**Workarounds:**
1. **Detect and warn:** Check if database is locked, show message
2. **Use BroadcastChannel:** Coordinate between tabs
3. **Single-tab enforcement:** Only allow one instance

### Chrome 121+ Improvement

The `readwrite-unsafe` mode allows some concurrency, but not full multi-tab support.

---

## Recommended Architecture

### For This Project (YouTube Transcript Storage)

```
┌─────────────────────────────────────────────────────────────────┐
│                        STATIC WEB APP                           │
│                    (GitHub Pages + coi-serviceworker)           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────────────────────────┐ │
│  │   Main Thread   │    │          Web Worker                 │ │
│  │                 │    │                                     │ │
│  │  - UI (Alpine)  │◄──►│  - SQLite WASM (wa-sqlite/SQLocal)  │ │
│  │  - User input   │    │  - Database operations              │ │
│  │  - Display      │    │  - OPFS persistence                 │ │
│  │                 │    │                                     │ │
│  └─────────────────┘    └─────────────────────────────────────┘ │
│                                    │                             │
│                                    ▼                             │
│                         ┌─────────────────┐                      │
│                         │      OPFS       │                      │
│                         │  transcripts.db │                      │
│                         └─────────────────┘                      │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Export/Import                            ││
│  │  - Export: Download .db file for backup                     ││
│  │  - Import: Upload .db file to restore                       ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Database Schema (Proposed)

```sql
CREATE TABLE transcripts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id TEXT NOT NULL UNIQUE,
    title TEXT,
    channel_name TEXT,
    video_url TEXT,
    duration_seconds INTEGER,
    captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    raw_json TEXT,           -- Original timedtext JSON
    clean_text TEXT,         -- Processed transcript
    language TEXT,
    is_auto_generated BOOLEAN,
    word_count INTEGER,
    -- Future: LLM processing
    summary TEXT,
    summary_generated_at DATETIME,
    tags TEXT                -- JSON array of tags
);

CREATE INDEX idx_captured_at ON transcripts(captured_at);
CREATE INDEX idx_video_id ON transcripts(video_id);
```

---

## Roadblocks and Limitations

### 1. Cannot "Connect to Local File" Persistently ❌

**User's original idea:** "Connect to SQLite database on local system once"

**Reality:** File System Access API requires permission every browser session. There is no way to maintain persistent access to a user-chosen file location.

**Workaround:** Use OPFS (invisible to user) + export/import for portability.

### 2. GitHub Pages Header Restrictions ⚠️

**Problem:** Cannot set COOP/COEP headers natively.

**Solution:** coi-serviceworker or use VFS that doesn't require headers.

### 3. Single-Tab Limitation ⚠️

**Problem:** Only one browser tab can have database open.

**Solution:** Detect and warn, or enforce single-tab mode.

### 4. Safari Compatibility ⚠️

**Problem:** Safari <17 has OPFS bugs.

**Solution:** Use opfs-sahpool VFS, test thoroughly.

### 5. No WAL Mode in WASM ❌

**Problem:** WASM SQLite cannot use WAL mode (Write-Ahead Logging).

**Impact:** Slightly reduced write performance, cannot import WAL databases directly.

---

## Implementation Recommendations

### Phase 1: Basic Storage
1. Add wa-sqlite or SQLocal to project
2. Add coi-serviceworker for GitHub Pages
3. Create database schema
4. Implement save/load for transcripts

### Phase 2: User Experience
1. Add "Save Transcript" button to bookmarklet flow
2. Add transcript history/list view
3. Add search functionality
4. Add export/import for backup

### Phase 3: Future (LLM Integration)
1. Add summary field to schema
2. Integrate with LLM API (OpenAI, Claude, etc.)
3. Generate summaries on demand or automatically
4. Add tagging/categorization

---

## Library Comparison Summary

| Feature | sql.js | wa-sqlite | sqlite-wasm | SQLocal |
|---------|--------|-----------|-------------|---------|
| Persistence | Manual | Built-in | Built-in | Built-in |
| OPFS Support | No | Yes | Yes | Yes |
| Needs COOP/COEP | No | Varies | Varies | Yes |
| GitHub Pages | ✅ Easy | ✅ Possible | ⚠️ Workaround | ⚠️ Workaround |
| ORM Support | No | Kysely | No | Kysely, Drizzle |
| Bundle Size | ~1MB | ~1MB | ~1MB | ~1MB |
| Maturity | High | High | High | Medium |

---

## References

- [The Current State Of SQLite Persistence On The Web (November 2025)](https://www.powersync.com/blog/sqlite-persistence-on-the-web)
- [SQLite Wasm in the browser backed by OPFS - Chrome Developers](https://developer.chrome.com/blog/sqlite-wasm-in-the-browser-backed-by-the-origin-private-file-system)
- [Official SQLite WASM Documentation](https://sqlite.org/wasm/doc/trunk/about.md)
- [wa-sqlite GitHub](https://github.com/rhashimoto/wa-sqlite)
- [SQLocal Documentation](https://sqlocal.dev/guide/introduction)
- [coi-serviceworker GitHub](https://github.com/gzuidhof/coi-serviceworker)
- [File System Access API - Chrome Developers](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)
- [Origin Private File System - MDN](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)
- [Setting COOP/COEP on GitHub Pages](https://blog.tomayac.com/2025/03/08/setting-coop-coep-headers-on-static-hosting-like-github-pages/)
- [LocalStorage vs IndexedDB vs OPFS vs WASM-SQLite - RxDB](https://rxdb.info/articles/localstorage-indexeddb-cookies-opfs-sqlite-wasm.html)
- [Notion's SQLite WASM Implementation](https://www.notion.com/blog/how-we-sped-up-notion-in-the-browser-with-wasm-sqlite)

---

## Conclusion

**Feasibility: YES** - Storing transcripts in a browser-based SQLite database is fully achievable.

**Recommended Approach:**
1. Use **wa-sqlite** with OPFS for storage (best GitHub Pages compatibility)
2. Add **coi-serviceworker** for COOP/COEP headers on GitHub Pages
3. Implement **export/import** for backup and portability
4. Accept **single-tab limitation** (warn user if database is locked)

**What Won't Work:**
- Persistent connection to user's local .sqlite file (permission required each session)
- Multi-tab simultaneous access to same database
- WAL mode databases

The architecture shift is: instead of "connect to a file", think of it as "the app has its own database that you can export/import."
