/**
 * Transcript Database Module
 *
 * Supports multiple storage backends:
 * 1. OPFS (via Web Worker + sqlite-wasm) - Preferred for local storage
 * 2. D1 (via REST API) - Cloud storage with user's own Cloudflare D1
 * 3. IndexedDB (via sql.js) - Fallback for browsers without OPFS
 *
 * The storage mode is controlled by localStorage 'storage-mode' key.
 */

// ============================================================
// CONFIGURATION
// ============================================================

const DB_NAME = 'TranscriptDB';
const DB_VERSION = 1;
const STORE_NAME = 'sqlite';
const DB_KEY = 'database';

// Active backend reference
let activeBackend = null;
let storageMode = 'local'; // 'local' | 'cloud'

// ============================================================
// FEATURE DETECTION
// ============================================================

/**
 * Check if OPFS is available (requires Worker support)
 */
function hasOPFSSupport() {
    return (
        typeof Worker !== 'undefined' &&
        typeof navigator?.storage?.getDirectory === 'function'
    );
}

/**
 * Check if D1 is configured (just needs API key now)
 */
function hasD1Config() {
    try {
        return !!localStorage.getItem('d1-api-key');
    } catch {
        return false;
    }
}

/**
 * Get current storage mode preference
 */
function getStorageMode() {
    return localStorage.getItem('storage-mode') || 'local';
}

// ============================================================
// OPFS BACKEND (Web Worker)
// ============================================================

class OPFSBackend {
    constructor() {
        this.worker = null;
        this.pending = new Map();
        this.messageId = 0;
    }

    async init() {
        if (this.worker) {
            return { success: true, storageType: 'opfs' };
        }

        return new Promise((resolve, reject) => {
            try {
                // Create worker as ES module
                this.worker = new Worker('js/db-worker.js', { type: 'module' });

                this.worker.onmessage = (event) => {
                    const { id, result, error } = event.data;
                    const pending = this.pending.get(id);
                    if (pending) {
                        this.pending.delete(id);
                        if (error) {
                            pending.reject(new Error(error));
                        } else {
                            pending.resolve(result);
                        }
                    }
                };

                this.worker.onerror = (error) => {
                    console.error('[OPFS Backend] Worker error:', error);
                    reject(error);
                };

                // Initialize the database
                this._call('init')
                    .then(resolve)
                    .catch(reject);

            } catch (err) {
                reject(err);
            }
        });
    }

    _call(method, ...args) {
        return new Promise((resolve, reject) => {
            const id = ++this.messageId;
            this.pending.set(id, { resolve, reject });
            this.worker.postMessage({ id, method, args });
        });
    }

    async save(data) { return this._call('save', data); }
    async get(videoId) { return this._call('get', videoId); }
    async getAll(limit, offset) { return this._call('getAll', limit, offset); }
    async delete(videoId) { return this._call('delete', videoId); }
    async search(query) { return this._call('search', query); }
    async getStats() { return this._call('getStats'); }
    async exportJson() { return this._call('exportJson'); }
    async exportFile() { return this._call('exportFile'); }
    async importJson(data) { return this._call('importJson', data); }
    async importFile(arrayBuffer) {
        // For OPFS, we import JSON data
        const text = new TextDecoder().decode(arrayBuffer);
        const data = JSON.parse(text);
        return this._call('importJson', data);
    }
}

// ============================================================
// INDEXEDDB BACKEND (sql.js fallback)
// ============================================================

class IndexedDBBackend {
    constructor() {
        this.db = null;
        this.SQL = null;
    }

    async init() {
        // Load sql.js
        this.SQL = await initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`
        });

        // Try to load existing database from IndexedDB
        const savedData = await this._loadFromIndexedDB();

        if (savedData) {
            this.db = new this.SQL.Database(savedData);
            console.log('[IndexedDB Backend] Loaded existing database');
        } else {
            this.db = new this.SQL.Database();
            console.log('[IndexedDB Backend] Created new database');
        }

        // Create schema if needed
        this.db.run(`
            CREATE TABLE IF NOT EXISTS transcripts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id TEXT NOT NULL UNIQUE,
                title TEXT,
                channel_name TEXT,
                video_url TEXT,
                duration_seconds INTEGER,
                publish_date TEXT,
                captured_at TEXT DEFAULT (datetime('now')),
                raw_json TEXT,
                clean_text TEXT,
                language TEXT,
                is_auto_generated INTEGER DEFAULT 0,
                word_count INTEGER,
                summary TEXT,
                summary_generated_at TEXT,
                tags TEXT
            )
        `);

        // Migration: Add publish_date column if it doesn't exist
        try {
            this.db.run(`ALTER TABLE transcripts ADD COLUMN publish_date TEXT`);
            console.log('[IndexedDB Backend] Added publish_date column');
        } catch (e) {
            // Column already exists, ignore
        }

        this.db.run(`CREATE INDEX IF NOT EXISTS idx_captured_at ON transcripts(captured_at)`);
        this.db.run(`CREATE INDEX IF NOT EXISTS idx_video_id ON transcripts(video_id)`);

        await this._saveToIndexedDB();

        return { success: true, storageType: 'indexeddb' };
    }

    _loadFromIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);

            request.onupgradeneeded = (event) => {
                const idb = event.target.result;
                if (!idb.objectStoreNames.contains(STORE_NAME)) {
                    idb.createObjectStore(STORE_NAME);
                }
            };

            request.onsuccess = () => {
                const idb = request.result;
                const transaction = idb.transaction(STORE_NAME, 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const getRequest = store.get(DB_KEY);

                getRequest.onsuccess = () => {
                    idb.close();
                    resolve(getRequest.result || null);
                };

                getRequest.onerror = () => {
                    idb.close();
                    resolve(null);
                };
            };
        });
    }

    _saveToIndexedDB() {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                resolve();
                return;
            }

            const data = this.db.export();
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);

            request.onupgradeneeded = (event) => {
                const idb = event.target.result;
                if (!idb.objectStoreNames.contains(STORE_NAME)) {
                    idb.createObjectStore(STORE_NAME);
                }
            };

            request.onsuccess = () => {
                const idb = request.result;
                const transaction = idb.transaction(STORE_NAME, 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                store.put(data, DB_KEY);

                transaction.oncomplete = () => {
                    idb.close();
                    resolve();
                };

                transaction.onerror = () => {
                    idb.close();
                    reject(transaction.error);
                };
            };
        });
    }

    async save(data) {
        const {
            videoId, title, channelName, videoUrl, durationSeconds, publishDate,
            rawJson, cleanText, language, isAutoGenerated, wordCount
        } = data;

        const existing = this.db.exec(`SELECT id FROM transcripts WHERE video_id = ?`, [videoId]);

        if (existing.length > 0 && existing[0].values.length > 0) {
            this.db.run(`
                UPDATE transcripts SET
                    title = ?, channel_name = ?, video_url = ?, duration_seconds = ?,
                    publish_date = ?, raw_json = ?, clean_text = ?, language = ?, is_auto_generated = ?,
                    word_count = ?, captured_at = datetime('now')
                WHERE video_id = ?
            `, [title, channelName, videoUrl, durationSeconds, publishDate || null, rawJson, cleanText,
                language, isAutoGenerated ? 1 : 0, wordCount, videoId]);
        } else {
            this.db.run(`
                INSERT INTO transcripts
                (video_id, title, channel_name, video_url, duration_seconds, publish_date,
                 raw_json, clean_text, language, is_auto_generated, word_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [videoId, title, channelName, videoUrl, durationSeconds, publishDate || null, rawJson, cleanText,
                language, isAutoGenerated ? 1 : 0, wordCount]);
        }

        await this._saveToIndexedDB();
        return { saved: true, videoId };
    }

    get(videoId) {
        const result = this.db.exec(`SELECT * FROM transcripts WHERE video_id = ?`, [videoId]);
        if (result.length === 0 || result[0].values.length === 0) {
            return null;
        }
        return this._rowToObject(result[0]);
    }

    getAll(limit = 50, offset = 0) {
        const result = this.db.exec(`
            SELECT id, video_id, title, channel_name, captured_at,
                   language, is_auto_generated, word_count
            FROM transcripts
            ORDER BY captured_at DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);

        if (result.length === 0) return [];
        return result[0].values.map(row => this._rowToObjectWithColumns(row, result[0].columns));
    }

    async delete(videoId) {
        this.db.run(`DELETE FROM transcripts WHERE video_id = ?`, [videoId]);
        await this._saveToIndexedDB();
        return { deleted: true, videoId };
    }

    search(query) {
        const searchTerm = `%${query}%`;
        const result = this.db.exec(`
            SELECT id, video_id, title, channel_name, captured_at, word_count
            FROM transcripts
            WHERE title LIKE ? OR clean_text LIKE ? OR channel_name LIKE ?
            ORDER BY captured_at DESC
            LIMIT 50
        `, [searchTerm, searchTerm, searchTerm]);

        if (result.length === 0) return [];
        return result[0].values.map(row => this._rowToObjectWithColumns(row, result[0].columns));
    }

    getStats() {
        const result = this.db.exec(`
            SELECT
                COUNT(*) as total_transcripts,
                COALESCE(SUM(word_count), 0) as total_words,
                MIN(captured_at) as first_capture,
                MAX(captured_at) as last_capture
            FROM transcripts
        `);

        if (result.length === 0 || result[0].values.length === 0) {
            return { total_transcripts: 0, total_words: 0, first_capture: null, last_capture: null };
        }
        return this._rowToObjectWithColumns(result[0].values[0], result[0].columns);
    }

    exportJson() {
        const result = this.db.exec(`SELECT * FROM transcripts ORDER BY captured_at DESC`);
        if (result.length === 0) return { transcripts: [], exportedAt: new Date().toISOString() };

        const transcripts = result[0].values.map(row => this._rowToObjectWithColumns(row, result[0].columns));
        return { transcripts, exportedAt: new Date().toISOString() };
    }

    exportFile() {
        const data = this.db.export();
        return new Uint8Array(data);
    }

    async importFile(arrayBuffer) {
        const data = new Uint8Array(arrayBuffer);
        this.db = new this.SQL.Database(data);
        await this._saveToIndexedDB();
        return { imported: true };
    }

    async importJson(jsonData) {
        const { transcripts } = jsonData;
        let imported = 0;

        for (const t of transcripts) {
            try {
                await this.save({
                    videoId: t.video_id,
                    title: t.title,
                    channelName: t.channel_name,
                    videoUrl: t.video_url,
                    durationSeconds: t.duration_seconds,
                    publishDate: t.publish_date,
                    rawJson: t.raw_json,
                    cleanText: t.clean_text,
                    language: t.language,
                    isAutoGenerated: t.is_auto_generated === 1,
                    wordCount: t.word_count
                });
                imported++;
            } catch (e) {
                console.warn('[IndexedDB Backend] Failed to import:', t.video_id, e);
            }
        }

        return { imported };
    }

    _rowToObject(result) {
        if (!result || !result.values || result.values.length === 0) return null;
        return this._rowToObjectWithColumns(result.values[0], result.columns);
    }

    _rowToObjectWithColumns(row, columns) {
        const obj = {};
        columns.forEach((col, i) => {
            obj[col] = row[i];
        });
        return obj;
    }
}

// ============================================================
// D1 BACKEND (REST API - will be implemented in db-d1.js)
// ============================================================

// D1Backend will be loaded from js/db-d1.js when cloud mode is selected

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Initialize the database with the appropriate backend
 */
async function initDatabase() {
    storageMode = getStorageMode();
    console.log('[DB] Storage mode:', storageMode);

    if (storageMode === 'cloud' && hasD1Config()) {
        // Cloud mode with D1 - load D1 backend dynamically
        if (typeof D1Backend !== 'undefined') {
            activeBackend = new D1Backend();
        } else {
            console.warn('[DB] D1 backend not loaded, falling back to local');
            storageMode = 'local';
        }
    }

    if (storageMode === 'local') {
        if (hasOPFSSupport()) {
            console.log('[DB] Using OPFS backend');
            activeBackend = new OPFSBackend();
        } else {
            console.log('[DB] OPFS not available, using IndexedDB fallback');
            activeBackend = new IndexedDBBackend();
        }
    }

    try {
        const result = await activeBackend.init();
        console.log('[DB] Initialized:', result);
        return result;
    } catch (err) {
        console.error('[DB] Initialization failed:', err);

        // If OPFS fails, fall back to IndexedDB
        if (activeBackend instanceof OPFSBackend) {
            console.log('[DB] Falling back to IndexedDB');
            activeBackend = new IndexedDBBackend();
            return activeBackend.init();
        }

        throw err;
    }
}

/**
 * Get the current storage info
 */
function getStorageInfo() {
    let backendType = 'unknown';
    if (activeBackend instanceof OPFSBackend) {
        backendType = 'opfs';
    } else if (activeBackend instanceof IndexedDBBackend) {
        backendType = 'indexeddb';
    } else if (activeBackend?.constructor?.name === 'D1Backend') {
        backendType = 'd1';
    }

    return {
        mode: storageMode,
        backend: backendType,
        opfsAvailable: hasOPFSSupport(),
        d1Configured: hasD1Config()
    };
}

// Export the API
window.TranscriptDB = {
    init: initDatabase,
    save: (data) => activeBackend.save(data),
    get: (videoId) => activeBackend.get(videoId),
    getAll: (limit, offset) => activeBackend.getAll(limit, offset),
    delete: (videoId) => activeBackend.delete(videoId),
    search: (query) => activeBackend.search(query),
    getStats: () => activeBackend.getStats(),
    exportJson: () => activeBackend.exportJson(),
    exportFile: () => activeBackend.exportFile(),
    importFile: (data) => activeBackend.importFile(data),
    importJson: (data) => activeBackend.importJson(data),
    getStorageInfo: getStorageInfo,
    hasOPFSSupport: hasOPFSSupport,
    hasD1Config: hasD1Config
};
