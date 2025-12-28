/**
 * Stats API - Database Statistics
 *
 * GET /api/stats  - Get database statistics
 */

export async function onRequestGet(context) {
    const { env } = context;

    try {
        const result = await env.DB.prepare(`
            SELECT
                COUNT(*) as total_transcripts,
                COALESCE(SUM(word_count), 0) as total_words,
                MIN(captured_at) as first_capture,
                MAX(captured_at) as last_capture
            FROM transcripts
        `).first();

        return jsonResponse(result || {
            total_transcripts: 0,
            total_words: 0,
            first_capture: null,
            last_capture: null
        });
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
