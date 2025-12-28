/**
 * Import API - Import transcripts from JSON
 *
 * POST /api/import  - Import transcripts (upsert)
 */

export async function onRequestPost(context) {
    const { env, request } = context;

    try {
        const data = await request.json();
        const { transcripts } = data;

        if (!Array.isArray(transcripts)) {
            return jsonResponse({ error: 'transcripts array is required' }, 400);
        }

        let imported = 0;
        let errors = [];

        for (const t of transcripts) {
            try {
                const videoId = t.video_id;
                if (!videoId) continue;

                // Check if exists
                const existing = await env.DB.prepare(
                    `SELECT id FROM transcripts WHERE video_id = ?`
                ).bind(videoId).first();

                if (existing) {
                    // Update
                    await env.DB.prepare(`
                        UPDATE transcripts SET
                            title = ?, channel_name = ?, video_url = ?, duration_seconds = ?,
                            publish_date = ?, raw_json = ?, clean_text = ?, language = ?,
                            is_auto_generated = ?, word_count = ?, captured_at = datetime('now')
                        WHERE video_id = ?
                    `).bind(
                        t.title, t.channel_name, t.video_url, t.duration_seconds,
                        t.publish_date || null, t.raw_json, t.clean_text, t.language,
                        t.is_auto_generated ? 1 : 0, t.word_count, videoId
                    ).run();
                } else {
                    // Insert
                    await env.DB.prepare(`
                        INSERT INTO transcripts
                        (video_id, title, channel_name, video_url, duration_seconds, publish_date,
                         raw_json, clean_text, language, is_auto_generated, word_count)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).bind(
                        videoId, t.title, t.channel_name, t.video_url, t.duration_seconds,
                        t.publish_date || null, t.raw_json, t.clean_text, t.language,
                        t.is_auto_generated ? 1 : 0, t.word_count
                    ).run();
                }
                imported++;
            } catch (err) {
                errors.push({ videoId: t.video_id, error: err.message });
            }
        }

        return jsonResponse({ imported, errors: errors.length > 0 ? errors : undefined });
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
