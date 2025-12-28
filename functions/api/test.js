/**
 * Test API - Verify connection
 *
 * GET /api/test  - Test database connection
 */

export async function onRequestGet(context) {
    const { env } = context;

    try {
        // Simple query to verify D1 connection
        const result = await env.DB.prepare('SELECT 1 as test').first();

        return jsonResponse({
            success: true,
            message: 'Connected to D1',
            test: result.test
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
