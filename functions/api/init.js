/**
 * Init API - Initialize Database Schema
 *
 * POST /api/init  - Create tables and indexes if they don't exist
 */

export async function onRequestPost(context) {
    const { env } = context;

    try {
        // Create transcripts table
        await env.DB.prepare(`
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
        `).run();

        // Create indexes
        await env.DB.prepare(
            `CREATE INDEX IF NOT EXISTS idx_captured_at ON transcripts(captured_at)`
        ).run();

        await env.DB.prepare(
            `CREATE INDEX IF NOT EXISTS idx_video_id ON transcripts(video_id)`
        ).run();

        return jsonResponse({ success: true, message: 'Schema initialized' });
    } catch (err) {
        return jsonResponse({ error: err.message }, 500);
    }
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}
