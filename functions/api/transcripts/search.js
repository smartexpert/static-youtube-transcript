/**
 * Transcripts API - Search
 *
 * GET /api/transcripts/search?q=query  - Search transcripts
 */

export async function onRequestGet(context) {
    const { env, request } = context;
    const url = new URL(request.url);
    const query = url.searchParams.get('q');

    if (!query) {
        return jsonResponse({ error: 'Search query (q) is required' }, 400);
    }

    try {
        const searchTerm = `%${query}%`;
        const result = await env.DB.prepare(`
            SELECT id, video_id, title, channel_name, captured_at, word_count
            FROM transcripts
            WHERE title LIKE ? OR clean_text LIKE ? OR channel_name LIKE ?
            ORDER BY captured_at DESC
            LIMIT 50
        `).bind(searchTerm, searchTerm, searchTerm).all();

        return jsonResponse({ transcripts: result.results });
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
