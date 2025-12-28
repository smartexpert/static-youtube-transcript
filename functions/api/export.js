/**
 * Export API - Export all transcripts
 *
 * GET /api/export  - Export all transcripts as JSON
 */

export async function onRequestGet(context) {
    const { env } = context;

    try {
        const result = await env.DB.prepare(
            `SELECT * FROM transcripts ORDER BY captured_at DESC`
        ).all();

        return jsonResponse({
            transcripts: result.results,
            exportedAt: new Date().toISOString()
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
