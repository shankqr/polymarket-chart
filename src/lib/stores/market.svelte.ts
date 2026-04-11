// Market discovery store — fetches market metadata from Gamma API,
// manages countdown timer, and fetches previous candle outcomes.

import type { Asset, Timeframe, CandleResult } from '../../types';
import { nextMarketTimestamp, currentMarketTimestamp, durationSeconds, buildMarketSlug } from '../market-time';

const GAMMA_API = 'https://gamma-api.polymarket.com/markets/slug';

interface GammaMarketResponse {
  condition?: string;
  clobTokenIds?: string;
  closed?: boolean;
  outcomes?: string;
  outcomePrices?: string;
}

function parseTokenIds(raw: string | undefined): [string, string] | null {
  if (!raw) return null;
  // Format: "token1,token2" or "[token1,token2]"
  const cleaned = raw.replace(/[\[\]"]/g, '');
  const parts = cleaned.split(',').map(s => s.trim()).filter(s => s.length > 0);
  if (parts.length >= 2) return [parts[0], parts[1]];
  return null;
}

function parseCandleResult(resp: GammaMarketResponse): CandleResult {
  if (!resp.closed) return 'Unknown';
  const outcomes = resp.outcomes;
  const prices = resp.outcomePrices;
  if (!outcomes || !prices) return 'Unknown';

  const parseArr = (s: string): string[] =>
    s.replace(/[\[\]]/g, '').split(',').map(v => v.trim().replace(/"/g, '')).filter(v => v.length > 0);

  const outcomeList = parseArr(outcomes);
  const priceList = parseArr(prices);

  for (let i = 0; i < outcomeList.length && i < priceList.length; i++) {
    if (priceList[i] === '1') {
      const o = outcomeList[i].toLowerCase();
      if (o === 'up') return 'Up';
      if (o === 'down') return 'Down';
    }
  }
  return 'Unknown';
}

export function createMarketStore() {
  let marketTitle = $state('');
  let currentMarketTs = $state<number | null>(null);
  let nextMarketTs = $state<number | null>(null);
  let timeRemaining = $state(0);
  let tokenIdUp = $state<string | null>(null);
  let tokenIdDown = $state<string | null>(null);
  let previousCandles = $state<CandleResult[]>([]);
  let connected = $state(false);
  let error = $state<string | null>(null);
  let timerInterval: ReturnType<typeof setInterval> | undefined;
  let _asset: Asset | null = null;
  let _timeframe: Timeframe | null = null;

  async function fetchMarket(slug: string): Promise<GammaMarketResponse | null> {
    try {
      const resp = await fetch(`${GAMMA_API}/${slug}`);
      if (!resp.ok) return null;
      return await resp.json() as GammaMarketResponse;
    } catch {
      return null;
    }
  }

  async function fetchPreviousCandles(asset: Asset, timeframe: Timeframe, count: number) {
    const next = nextMarketTimestamp(timeframe);
    const duration = durationSeconds(timeframe);
    const results: CandleResult[] = [];

    for (let i = 0; i < count; i++) {
      // next - 2*duration = most recently closed, next - 3*duration = one before, etc.
      const ts = next - ((i + 2) * duration);
      const slug = buildMarketSlug(asset, timeframe, ts);
      const resp = await fetchMarket(slug);
      results.push(resp ? parseCandleResult(resp) : 'Unknown');
    }

    previousCandles = results;
  }

  function startTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(() => {
      if (nextMarketTs !== null) {
        const remaining = nextMarketTs - Math.floor(Date.now() / 1000);
        timeRemaining = Math.max(0, remaining);

        if (remaining <= 0 && _asset && _timeframe) {
          // Market ended — rotate to next
          init(_asset, _timeframe);
        }
      }
    }, 1000);
  }

  async function init(asset: Asset, timeframe: Timeframe) {
    _asset = asset;
    _timeframe = timeframe;
    error = null;

    const curTs = currentMarketTimestamp(timeframe);
    const nxtTs = nextMarketTimestamp(timeframe);
    currentMarketTs = curTs;
    nextMarketTs = nxtTs;
    timeRemaining = Math.max(0, nxtTs - Math.floor(Date.now() / 1000));

    const slug = buildMarketSlug(asset, timeframe, curTs);
    const resp = await fetchMarket(slug);

    if (resp) {
      marketTitle = resp.condition ?? `${asset} Up or Down`;
      const tokens = parseTokenIds(resp.clobTokenIds);
      if (tokens) {
        tokenIdUp = tokens[0];
        tokenIdDown = tokens[1];
      } else {
        tokenIdUp = null;
        tokenIdDown = null;
      }
      connected = true;
    } else {
      marketTitle = `${asset} Up or Down`;
      tokenIdUp = null;
      tokenIdDown = null;
      error = `Failed to fetch market: ${slug}`;
      connected = false;
    }

    startTimer();

    // Fetch previous candles in background
    fetchPreviousCandles(asset, timeframe, 5);
  }

  function destroy() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = undefined;
    _asset = null;
    _timeframe = null;
  }

  return {
    get marketTitle() { return marketTitle; },
    get currentMarketTs() { return currentMarketTs; },
    get nextMarketTs() { return nextMarketTs; },
    get timeRemaining() { return timeRemaining; },
    get tokenIdUp() { return tokenIdUp; },
    get tokenIdDown() { return tokenIdDown; },
    get previousCandles() { return previousCandles; },
    get connected() { return connected; },
    get error() { return error; },
    init,
    destroy,
  };
}
