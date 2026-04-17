// Price store — Binance REST bootstrap + WebSocket streaming for kline data.
// Computes price-to-beat from the kline at market start time.

import type { Asset, Timeframe, KlineEntry } from '../../types';
import { binanceSymbol, binancePtbUrl } from '../market-time';

const BINANCE_WS = 'wss://stream.binance.com:9443/ws';
const BINANCE_REST = 'https://api.binance.com/api/v3/klines';
const RTDS_WS = 'wss://ws-live-data.polymarket.com';

const CHAINLINK_SYMBOLS: Record<Asset, string> = {
  BTC: 'btc/usd',
  ETH: 'eth/usd',
  SOL: 'sol/usd',
  XRP: 'xrp/usd',
};

function useChainlinkForTimeframe(tf: Timeframe): boolean {
  return tf === '5m' || tf === '15m' || tf === '4h';
}

export function createPriceStore() {
  let klines = $state<KlineEntry[]>([]);
  let currentKline = $state<KlineEntry | null>(null);
  let assetPrice = $state<number | null>(null);
  let priceToBeat = $state<number | null>(null);
  let connected = $state(false);

  let ws: WebSocket | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;
  let reconnectDelay = 1000;
  let _asset: Asset | null = null;
  let _useChainlink = false;
  let chainlinkWs: WebSocket | null = null;
  let chainlinkReconnectTimeout: ReturnType<typeof setTimeout> | undefined;
  let chainlinkReconnectDelay = 1000;

  function parseKlineArray(raw: number[]): KlineEntry {
    return {
      open_time_ms: raw[0] as number,
      open: parseFloat(raw[1] as unknown as string),
      high: parseFloat(raw[2] as unknown as string),
      low: parseFloat(raw[3] as unknown as string),
      close: parseFloat(raw[4] as unknown as string),
      volume: parseFloat(raw[5] as unknown as string),
    };
  }

  async function fetchHistoricalKlines(asset: Asset): Promise<KlineEntry[]> {
    const symbol = binanceSymbol(asset);
    const url = `${BINANCE_REST}?symbol=${symbol}&interval=1m&limit=300`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) return [];
      const data = await resp.json() as number[][];
      return data.map(parseKlineArray);
    } catch {
      return [];
    }
  }

  async function fetchPriceToBeat(asset: Asset, marketStartTs: number, timeframe: Timeframe): Promise<number | null> {
    const url = binancePtbUrl(asset, marketStartTs, timeframe);
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const data = await resp.json() as number[][];
      if (data.length === 0) return null;
      // Hourly/sub-hourly: use open (index 1), Daily: use close (index 4)
      const idx = timeframe === 'daily' ? 4 : 1;
      return parseFloat(data[0][idx] as unknown as string);
    } catch {
      return null;
    }
  }

  function connectWs(asset: Asset) {
    const symbol = binanceSymbol(asset).toLowerCase();
    const socket = new WebSocket(`${BINANCE_WS}/${symbol}@kline_1m`);
    ws = socket;

    socket.onopen = () => {
      connected = true;
      reconnectDelay = 1000;
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as { k: { t: number; o: string; h: string; l: string; c: string; v: string; x: boolean } };
        const k = msg.k;
        const entry: KlineEntry = {
          open_time_ms: k.t,
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v),
        };

        if (!_useChainlink) {
          assetPrice = entry.close;
        }

        if (k.x) {
          // Kline closed — push to history
          const newKlines = [...klines];
          const last = newKlines[newKlines.length - 1];
          if (last && last.open_time_ms === entry.open_time_ms) {
            newKlines[newKlines.length - 1] = entry;
          } else {
            newKlines.push(entry);
          }
          klines = newKlines;
          currentKline = null;
        } else {
          currentKline = entry;
        }
      } catch {
        // ignore parse errors
      }
    };

    socket.onclose = () => {
      connected = false;
      ws = null;
      if (_asset) {
        reconnectTimeout = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
          if (_asset) connectWs(_asset);
        }, reconnectDelay);
      }
    };

    socket.onerror = () => {
      socket.close();
    };
  }

  function connectChainlinkWs(asset: Asset) {
    const symbol = CHAINLINK_SYMBOLS[asset];
    const socket = new WebSocket(RTDS_WS);
    chainlinkWs = socket;

    socket.onopen = () => {
      chainlinkReconnectDelay = 1000;
      socket.send(JSON.stringify({
        action: 'subscribe',
        subscriptions: [{
          topic: 'crypto_prices_chainlink',
          type: '*',
          filters: JSON.stringify({ symbol }),
        }],
      }));
    };

    socket.onmessage = (event) => {
      try {
        const raw = (event.data as string).trim();
        if (!raw) return;

        const messages: { topic?: string; payload?: { symbol?: string; value?: number | string } }[] =
          raw.startsWith('[') ? JSON.parse(raw) : [JSON.parse(raw)];

        for (const msg of messages) {
          if (msg.topic === 'crypto_prices_chainlink' && msg.payload) {
            const val = typeof msg.payload.value === 'number'
              ? msg.payload.value
              : parseFloat(msg.payload.value as string);
            if (!isNaN(val)) {
              assetPrice = val;
            }
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    socket.onclose = () => {
      chainlinkWs = null;
      if (_asset && _useChainlink) {
        chainlinkReconnectTimeout = setTimeout(() => {
          chainlinkReconnectDelay = Math.min(chainlinkReconnectDelay * 1.5, 30000);
          if (_asset && _useChainlink) connectChainlinkWs(_asset);
        }, chainlinkReconnectDelay);
      }
    };

    socket.onerror = () => {
      socket.close();
    };
  }

  let manualPtb = $state<number | null>(null);
  let scrapedPtb = $state<number | null>(null);

  let effectivePtb = $derived(manualPtb ?? scrapedPtb ?? priceToBeat);

  let scrapeTimeout: ReturnType<typeof setTimeout> | undefined;

  async function fetchManualPtb(asset: Asset, timeframe: Timeframe) {
    try {
      const resp = await fetch(`/api/ptb?asset=${asset}&timeframe=${timeframe}`);
      if (!resp.ok) return;
      const data = await resp.json() as { value: number | null };
      if (data.value !== null) {
        manualPtb = data.value;
      }
    } catch {
      // API not available — ignore
    }
  }

  async function fetchScrapedPtb(asset: Asset, timeframe: Timeframe, marketTs: number) {
    try {
      const resp = await fetch(`/api/scrape-ptb?asset=${asset}&timeframe=${timeframe}&marketTs=${marketTs}`);
      if (!resp.ok) return;
      const data = await resp.json() as { value: number | null };
      if (data.value !== null && _asset === asset) {
        scrapedPtb = data.value;
      }
    } catch {
      // API not available — ignore
    }
  }

  async function triggerScrape(asset: Asset, timeframe: Timeframe, marketTs: number) {
    try {
      const resp = await fetch(
        `/api/scrape-ptb?asset=${asset}&timeframe=${timeframe}&marketTs=${marketTs}`,
        { method: 'POST' },
      );
      if (!resp.ok) return;
      const data = await resp.json() as { value: number | null };
      if (data.value !== null && _asset === asset) {
        scrapedPtb = data.value;
      }
    } catch {
      // Scraper unavailable — silent fallback to Binance PTB
    }
  }

  async function setManualPtb(asset: Asset, timeframe: Timeframe, value: number | null) {
    manualPtb = value;
    try {
      if (value !== null) {
        await fetch('/api/ptb', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ asset, timeframe, value }),
        });
      } else {
        await fetch(`/api/ptb?asset=${asset}&timeframe=${timeframe}`, { method: 'DELETE' });
      }
    } catch {
      // API not available — PTB still applied locally
    }
  }

  async function init(asset: Asset, timeframe: Timeframe, marketStartTs: number) {
    destroy();
    _asset = asset;
    _useChainlink = useChainlinkForTimeframe(timeframe);

    // Bootstrap historical klines
    const historical = await fetchHistoricalKlines(asset);
    klines = historical;
    if (historical.length > 0) {
      assetPrice = historical[historical.length - 1].close;
    }

    // Fetch price-to-beat from Binance
    const ptb = await fetchPriceToBeat(asset, marketStartTs, timeframe);
    priceToBeat = ptb;

    // Check for manual PTB override from API
    await fetchManualPtb(asset, timeframe);

    // Check for cached Polymarket-scraped PTB
    await fetchScrapedPtb(asset, timeframe, marketStartTs);

    // Trigger a fresh scrape 5s after market start (or 5s from now if mid-market)
    if (scrapeTimeout) clearTimeout(scrapeTimeout);
    scrapeTimeout = setTimeout(() => {
      if (_asset === asset) triggerScrape(asset, timeframe, marketStartTs);
    }, 5000);

    // Connect Binance WebSocket for kline chart data
    connectWs(asset);

    // For 5m/15m/4h, also connect Chainlink RTDS for accurate asset price
    if (_useChainlink) {
      connectChainlinkWs(asset);
    }
  }

  function destroy() {
    _asset = null;
    _useChainlink = false;
    manualPtb = null;
    scrapedPtb = null;
    if (scrapeTimeout) clearTimeout(scrapeTimeout);
    scrapeTimeout = undefined;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    reconnectTimeout = undefined;
    ws?.close();
    ws = null;
    connected = false;
    if (chainlinkReconnectTimeout) clearTimeout(chainlinkReconnectTimeout);
    chainlinkReconnectTimeout = undefined;
    chainlinkWs?.close();
    chainlinkWs = null;
  }

  return {
    get klines() { return klines; },
    get currentKline() { return currentKline; },
    get assetPrice() { return assetPrice; },
    get priceToBeat() { return effectivePtb; },
    get connected() { return connected; },
    get hasManualPtb() { return manualPtb !== null; },
    get hasScrapedPtb() { return scrapedPtb !== null && manualPtb === null; },
    init,
    destroy,
    setManualPtb,
  };
}
