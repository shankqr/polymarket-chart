// Pages Function: GET/POST /api/ptb
// GET  /api/ptb?asset=BTC&timeframe=15m  → returns { value: 96500 } or { value: null }
// POST /api/ptb  body: { asset: "BTC", timeframe: "15m", value: 96500 }  → sets PTB
// DELETE /api/ptb?asset=BTC&timeframe=15m  → clears PTB

interface Env {
  PTB: KVNamespace;
}

function kvKey(asset: string, timeframe: string): string {
  return `ptb:${asset.toUpperCase()}:${timeframe}`;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const asset = url.searchParams.get('asset') || 'BTC';
  const timeframe = url.searchParams.get('timeframe') || '15m';

  const value = await env.PTB.get(kvKey(asset, timeframe));

  return new Response(
    JSON.stringify({ asset, timeframe, value: value ? parseFloat(value) : null }),
    { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
  );
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const body = await request.json() as { asset?: string; timeframe?: string; value?: number };
    const asset = (body.asset || 'BTC').toUpperCase();
    const timeframe = body.timeframe || '15m';
    const value = body.value;

    if (value === undefined || value === null || isNaN(value)) {
      return new Response(
        JSON.stringify({ error: 'value is required and must be a number' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
      );
    }

    await env.PTB.put(kvKey(asset, timeframe), value.toString());

    return new Response(
      JSON.stringify({ asset, timeframe, value, ok: true }),
      { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    );
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
    );
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const asset = url.searchParams.get('asset') || 'BTC';
  const timeframe = url.searchParams.get('timeframe') || '15m';

  await env.PTB.delete(kvKey(asset, timeframe));

  return new Response(
    JSON.stringify({ asset, timeframe, value: null, ok: true }),
    { headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } },
  );
};
