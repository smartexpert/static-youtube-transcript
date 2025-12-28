/**
 * Transcripts API - Get and Delete by Video ID
 *
 * GET    /api/transcripts/:videoId  - Get a single transcript
 * DELETE /api/transcripts/:videoId  - Delete a transcript
 */

export async function onRequestGet(context) {
    const { env, params } = context;
    const videoId = params.videoId;

    try {
        const result = await env.DB.prepare(
            `SELECT * FROM transcripts WHERE video_id = ?`
        ).bind(videoId).first();

        if (!result) {
            return jsonResponse({ error: 'Transcript not found' }, 404);
        }

        return jsonResponse(result);
    } catch (err) {
        return jsonResponse({ error: err.message }, 500);
    }
}

export async function onRequestDelete(context) {
    const { env, params } = context;
    const videoId = params.videoId;

    try {
        await env.DB.prepare(
            `DELETE FROM transcripts WHERE video_id = ?`
        ).bind(videoId).run();

        return jsonResponse({ deleted: true, videoId });
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
