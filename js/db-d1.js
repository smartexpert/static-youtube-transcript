/**
 * D1 Database Backend (Worker Proxy)
 *
 * Connects to D1 via Pages Functions API endpoints.
 * Only requires an API key - no Cloudflare account credentials exposed.
 *
 * User Setup:
 * 1. Deploy app to Cloudflare Pages with D1 binding
 * 2. Set API_KEY secret: wrangler pages secret put API_KEY
 * 3. Enter the same API key in app settings
 */

class D1Backend {
    constructor() {
        this.apiKey = this._loadApiKey();
    }

    _loadApiKey() {
        try {
            return localStorage.getItem('d1-api-key') || '';
        } catch {
            return '';
        }
    }

    _saveApiKey(apiKey) {
        localStorage.setItem('d1-api-key', apiKey);
        this.apiKey = apiKey;
    }

    /**
     * Make authenticated API request
     */
    async _fetch(endpoint, options = {}) {
        if (!this.apiKey) {
            throw new Error('API key not configured. Please add your API key in settings.');
        }

        const url = `/api${endpoint}`;
        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `API error: ${response.status}`);
        }

        return data;
    }

    /**
     * Initialize database (create schema if needed)
     */
    async init() {
        if (!this.apiKey) {
            throw new Error('D1 not configured. Please add your API key in settings.');
        }

        await this._fetch('/init', { method: 'POST' });
        console.log('[D1 Backend] Schema ready');
        return { success: true, storageType: 'd1' };
    }

    /**
     * Test connection to D1
     */
    async testConnection() {
        try {
            const result = await this._fetch('/test');
            return { success: true, message: result.message || 'Connected to D1' };
        } catch (err) {
            return { success: false, message: err.message };
        }
    }

    /**
     * Save a transcript (insert or update)
     */
    async save(data) {
        return this._fetch('/transcripts', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    /**
     * Get a transcript by video ID
     */
    async get(videoId) {
        try {
            return await this._fetch(`/transcripts/${encodeURIComponent(videoId)}`);
        } catch (err) {
            if (err.message.includes('not found')) {
                return null;
            }
            throw err;
        }
    }

    /**
     * Get all transcripts (paginated)
     */
    async getAll(limit = 50, offset = 0) {
        const data = await this._fetch(`/transcripts?limit=${limit}&offset=${offset}`);
        return data.transcripts || [];
    }

    /**
     * Delete a transcript
     */
    async delete(videoId) {
        return this._fetch(`/transcripts/${encodeURIComponent(videoId)}`, {
            method: 'DELETE'
        });
    }

    /**
     * Search transcripts
     */
    async search(query) {
        const data = await this._fetch(`/transcripts/search?q=${encodeURIComponent(query)}`);
        return data.transcripts || [];
    }

    /**
     * Get database statistics
     */
    async getStats() {
        return this._fetch('/stats');
    }

    /**
     * Export all transcripts as JSON
     */
    async exportJson() {
        return this._fetch('/export');
    }

    /**
     * Export as file (JSON format)
     */
    async exportFile() {
        const data = await this.exportJson();
        return JSON.stringify(data);
    }

    /**
     * Import transcripts from JSON
     */
    async importJson(jsonData) {
        return this._fetch('/import', {
            method: 'POST',
            body: JSON.stringify(jsonData)
        });
    }

    /**
     * Import from file (JSON format)
     */
    async importFile(arrayBuffer) {
        const text = new TextDecoder().decode(arrayBuffer);
        const data = JSON.parse(text);
        return this.importJson(data);
    }

    /**
     * Set API key
     */
    static setApiKey(apiKey) {
        localStorage.setItem('d1-api-key', apiKey);
    }

    /**
     * Get current API key status
     */
    static getConfig() {
        const apiKey = localStorage.getItem('d1-api-key') || '';
        return {
            hasApiKey: !!apiKey
        };
    }

    /**
     * Clear API key
     */
    static clearConfig() {
        localStorage.removeItem('d1-api-key');
    }
}

// Export for use in db.js
window.D1Backend = D1Backend;
