// Proxy for Binance REST API to avoid geo-blocking / network restrictions
// that affect direct client calls from some networks (mobile carriers, smart TVs).
// GET /api/binance/api/v3/klines?symbol=BTCUSDT&interval=1m → https://api.binance.com/api/v3/klines?...

const BINANCE_BASE = 'https://api.binance.com';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestGet: PagesFunction = async ({ params, request }) => {
  const path = Array.isArray(params.path) ? params.path.join('/') : params.path;
  const incoming = new URL(request.url);
  const url = `${BINANCE_BASE}/${path}${incoming.search}`;

  try {
    const resp = await fetch(url);
    const body = await resp.text();
    return new Response(body, {
      status: resp.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1',
        ...CORS_HEADERS,
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to fetch from Binance API' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
};
