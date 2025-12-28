/**
 * Auth Middleware for API endpoints
 *
 * Validates Bearer token against API_KEY secret.
 * All /api/* routes require authentication.
 */

export async function onRequest(context) {
    const { request, env, next } = context;

    // Allow CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            headers: corsHeaders()
        });
    }

    // Check API key
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!env.API_KEY) {
        return jsonResponse({ error: 'API_KEY secret not configured' }, 500);
    }

    if (!token || token !== env.API_KEY) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    // Proceed to handler
    const response = await next();

    // Add CORS headers to response
    const newResponse = new Response(response.body, response);
    for (const [key, value] of Object.entries(corsHeaders())) {
        newResponse.headers.set(key, value);
    }

    return newResponse;
}

function corsHeaders() {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...corsHeaders()
        }
    });
}
