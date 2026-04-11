// Proxy for Gamma API to avoid CORS issues
// GET /api/gamma/markets/slug/btc-updown-15m-123 → https://gamma-api.polymarket.com/markets/slug/btc-updown-15m-123

const GAMMA_BASE = 'https://gamma-api.polymarket.com';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestGet: PagesFunction = async ({ params }) => {
  const path = Array.isArray(params.path) ? params.path.join('/') : params.path;
  const url = `${GAMMA_BASE}/${path}`;

  try {
    const resp = await fetch(url);
    const body = await resp.text();
    return new Response(body, {
      status: resp.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=30',
        ...CORS_HEADERS,
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to fetch from Gamma API' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
};
