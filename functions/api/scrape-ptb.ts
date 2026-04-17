// Pages Function: GET/POST /api/scrape-ptb
//
// GET  /api/scrape-ptb?asset=BTC&timeframe=15m&marketTs=1776393900
//   → returns cached KV value { value: number | null, scrapedAt?: number } (no scrape)
//
// POST /api/scrape-ptb?asset=BTC&timeframe=15m&marketTs=1776393900
//   → returns cached value if present, otherwise invokes scraper Worker via
//     service binding `SCRAPER`, writes result to KV, returns it.
//
// KV key: `ptb:scrape:${ASSET}:${TIMEFRAME}:${marketTs}`
//   — marketTs in the key guarantees a stale prior-market value never shadows
//     the current window. TTL = duration + 60s.

import { buildMarketSlug, durationSeconds, isValidAsset, isValidTimeframe, type Asset, type Timeframe } from '../_shared/market-time';

interface Env {
  PTB: KVNamespace;
  SCRAPER: Fetcher;
}

interface CachedValue {
  value: number;
  scrapedAt: number;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function kvKey(asset: Asset, timeframe: Timeframe, marketTs: number): string {
  return `ptb:scrape:${asset}:${timeframe}:${marketTs}`;
}

function lockKey(asset: Asset, timeframe: Timeframe, marketTs: number): string {
  return `lock:${kvKey(asset, timeframe, marketTs)}`;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function parseParams(url: URL): { asset: Asset; timeframe: Timeframe; marketTs: number } | string {
  const asset = url.searchParams.get('asset');
  const timeframe = url.searchParams.get('timeframe');
  const marketTsRaw = url.searchParams.get('marketTs');
  if (!isValidAsset(asset)) return 'bad asset';
  if (!isValidTimeframe(timeframe)) return 'bad timeframe';
  const marketTs = marketTsRaw ? parseInt(marketTsRaw, 10) : NaN;
  if (!Number.isFinite(marketTs) || marketTs <= 0) return 'bad marketTs';
  return { asset, timeframe, marketTs };
}

async function readCache(env: Env, key: string): Promise<CachedValue | null> {
  const raw = await env.PTB.get(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedValue;
    if (typeof parsed.value === 'number' && Number.isFinite(parsed.value)) return parsed;
  } catch {
    // legacy string value (shouldn't happen under this new key prefix, but be forgiving)
    const n = parseFloat(raw);
    if (Number.isFinite(n)) return { value: n, scrapedAt: 0 };
  }
  return null;
}

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const parsed = parseParams(url);
  if (typeof parsed === 'string') return json({ error: parsed }, 400);
  const { asset, timeframe, marketTs } = parsed;

  const cached = await readCache(env, kvKey(asset, timeframe, marketTs));
  return json({
    asset, timeframe, marketTs,
    value: cached?.value ?? null,
    scrapedAt: cached?.scrapedAt ?? null,
  });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const parsed = parseParams(url);
  if (typeof parsed === 'string') return json({ error: parsed }, 400);
  const { asset, timeframe, marketTs } = parsed;

  const key = kvKey(asset, timeframe, marketTs);
  const force = url.searchParams.get('force') === '1';

  // Cache hit — short-circuit unless force=1
  if (!force) {
    const cached = await readCache(env, key);
    if (cached) {
      return json({ asset, timeframe, marketTs, value: cached.value, scrapedAt: cached.scrapedAt, cached: true });
    }
  }

  // In-flight lock — another request is already scraping
  const lk = lockKey(asset, timeframe, marketTs);
  const existingLock = await env.PTB.get(lk);
  if (existingLock) {
    return json({ asset, timeframe, marketTs, value: null, error: 'scrape in progress' }, 429);
  }
  await env.PTB.put(lk, '1', { expirationTtl: 60 });

  try {
    const slug = buildMarketSlug(asset, timeframe, marketTs);
    const scraperUrl = `https://scraper.internal/?slug=${encodeURIComponent(slug)}`;
    const resp = await env.SCRAPER.fetch(scraperUrl);
    if (!resp.ok) {
      const body = await resp.text();
      return json({ asset, timeframe, marketTs, value: null, error: 'scraper failed', status: resp.status, body }, 502);
    }
    const data = await resp.json() as { value?: number };
    const value = data.value;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return json({ asset, timeframe, marketTs, value: null, error: 'scraper returned invalid value' }, 502);
    }

    const cachedValue: CachedValue = { value, scrapedAt: Date.now() };
    await env.PTB.put(key, JSON.stringify(cachedValue), {
      expirationTtl: durationSeconds(timeframe) + 60,
    });

    return json({ asset, timeframe, marketTs, ...cachedValue, cached: false });
  } finally {
    await env.PTB.delete(lk);
  }
};
