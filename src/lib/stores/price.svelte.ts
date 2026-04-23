// Price store — Binance REST bootstrap + WebSocket streaming for kline data.
// Computes price-to-beat from the kline at market start time.

import type { Asset, Timeframe, KlineEntry } from '../../types';
import { binanceSymbol, binancePtbUrl } from '../market-time';

// Routed through Cloudflare Pages Functions to bypass networks that block
// api.binance.com / stream.binance.com directly (mobile carriers, smart TVs).
const BINANCE_REST = '/api/binance/api/v3/klines';
const RTDS_WS = 'wss://ws-live-data.polymarket.com';

function binanceWsUrl(stream: string): string {
  const proto = typeof location !== 'undefined' && location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = typeof location !== 'undefined' ? location.host : '';
  return `${proto}//${host}/api/ws/binance?stream=${stream}`;
}

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
  let _timeframe: Timeframe | null = null;
  let _useChainlink = false;
  let chainlinkWs: WebSocket | null = null;
  let chainlinkReconnectTimeout: ReturnType<typeof setTimeout> | undefined;
  let chainlinkReconnectDelay = 1000;
  // Monotonic generation bumped on every destroy()/init() call. Stale awaits
  // from a superseded init bail out by comparing against the current gen.
  let _gen = 0;

  // Watchdog — WebSockets can stop delivering messages without firing onclose
  // (Cloudflare proxy idle eviction, Chainlink backend hiccups, OS sleep).
  // Track last message time and force a full reconnect when nothing's arrived
  // for a while. We don't rely on ws.close() triggering onclose — some broken
  // sockets never fire it — so we detach handlers and start a new WS directly.
  let binanceLastMsgAt = 0;
  let chainlinkLastMsgAt = 0;
  let watchdogInterval: ReturnType<typeof setInterval> | undefined;
  let visibilityHandler: (() => void) | null = null;
  const BINANCE_STALE_MS = 45_000;    // 1m klines tick every few seconds normally
  const CHAINLINK_STALE_MS = 15_000;  // Chainlink prices arrive ~2x/sec normally
  const WATCHDOG_INTERVAL_MS = 5_000;

  function hardReconnectBinance() {
    if (!_asset) return;
    if (ws) {
      try {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      } catch { /* ignore */ }
      ws = null;
    }
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
      reconnectTimeout = undefined;
    }
    connectWs(_asset);
  }

  function hardReconnectChainlink() {
    if (!_asset || !_useChainlink) return;
    if (chainlinkWs) {
      try {
        chainlinkWs.onopen = null;
        chainlinkWs.onmessage = null;
        chainlinkWs.onclose = null;
        chainlinkWs.onerror = null;
        chainlinkWs.close();
      } catch { /* ignore */ }
      chainlinkWs = null;
    }
    if (chainlinkReconnectTimeout) {
      clearTimeout(chainlinkReconnectTimeout);
      chainlinkReconnectTimeout = undefined;
    }
    connectChainlinkWs(_asset);
  }

  function checkFreshness() {
    if (!_asset) return;
    const now = Date.now();
    // Force reconnect whenever messages are stale — don't care whether the
    // socket is reporting OPEN/CONNECTING/CLOSED, the authoritative signal is
    // "are we actually receiving fresh data".
    if (binanceLastMsgAt > 0 && now - binanceLastMsgAt > BINANCE_STALE_MS) {
      hardReconnectBinance();
    }
    if (_useChainlink && chainlinkLastMsgAt > 0 && now - chainlinkLastMsgAt > CHAINLINK_STALE_MS) {
      hardReconnectChainlink();
    }
  }

  function startWatchdog() {
    if (watchdogInterval) clearInterval(watchdogInterval);
    watchdogInterval = setInterval(checkFreshness, WATCHDOG_INTERVAL_MS);

    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      window.removeEventListener('online', visibilityHandler);
      window.removeEventListener('focus', visibilityHandler);
    }
    visibilityHandler = () => {
      // Tab came back from background / network came back / window refocused.
      // Browsers throttle timers & WS while hidden and sockets often die
      // silently during sleep, so bypass the timer and re-evaluate now.
      if (document.visibilityState === 'visible') {
        checkFreshness();
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);
    window.addEventListener('online', visibilityHandler);
    window.addEventListener('focus', visibilityHandler);
  }

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
    const socket = new WebSocket(binanceWsUrl(`${symbol}@kline_1m`));
    ws = socket;
    binanceLastMsgAt = Date.now();

    socket.onopen = () => {
      connected = true;
      reconnectDelay = 1000;
      binanceLastMsgAt = Date.now();
    };

    socket.onmessage = (event) => {
      binanceLastMsgAt = Date.now();
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

        // When not using Chainlink, Binance drives assetPrice directly. When
        // using Chainlink, still fall back to Binance if Chainlink hasn't
        // delivered a price recently (stale or reconnecting), so the live
        // candle and dotted line keep progressing.
        if (!_useChainlink || Date.now() - chainlinkLastMsgAt > 10_000) {
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
    chainlinkLastMsgAt = Date.now();

    socket.onopen = () => {
      chainlinkReconnectDelay = 1000;
      chainlinkLastMsgAt = Date.now();
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
      chainlinkLastMsgAt = Date.now();
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

  async function triggerScrape(asset: Asset, timeframe: Timeframe, marketTs: number, force = false): Promise<boolean> {
    try {
      const qs = `asset=${asset}&timeframe=${timeframe}&marketTs=${marketTs}${force ? '&force=1' : ''}`;
      const resp = await fetch(`/api/scrape-ptb?${qs}`, { method: 'POST' });
      if (!resp.ok) return false;
      const data = await resp.json() as { value: number | null };
      if (data.value !== null && _asset === asset) {
        scrapedPtb = data.value;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  let _currentMarketTs: number | null = null;

  async function refetchScrapedPtb(): Promise<boolean> {
    if (!_asset || !_timeframe || _currentMarketTs === null) return false;
    // Clear any manual override first so the scraped value is visible.
    if (manualPtb !== null) {
      await setManualPtb(_asset, _timeframe, null);
    }
    return triggerScrape(_asset, _timeframe, _currentMarketTs, true);
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
    const gen = ++_gen;
    _asset = asset;
    _timeframe = timeframe;
    _currentMarketTs = marketStartTs;
    _useChainlink = useChainlinkForTimeframe(timeframe);

    // Bootstrap historical klines. Only overwrite existing klines if this init
    // is still the latest AND we actually got data back — otherwise a late or
    // failed fetch from a superseded init would clobber fresh state with [].
    const historical = await fetchHistoricalKlines(asset);
    if (gen !== _gen) return;
    if (historical.length > 0) {
      klines = historical;
      assetPrice = historical[historical.length - 1].close;
    }

    // Fetch price-to-beat from Binance
    const ptb = await fetchPriceToBeat(asset, marketStartTs, timeframe);
    if (gen !== _gen) return;
    priceToBeat = ptb;

    // Check for manual PTB override from API
    await fetchManualPtb(asset, timeframe);
    if (gen !== _gen) return;

    // Check for cached Polymarket-scraped PTB
    await fetchScrapedPtb(asset, timeframe, marketStartTs);
    if (gen !== _gen) return;

    // Trigger a fresh scrape 5s after market start (or 5s from now if mid-market)
    if (scrapeTimeout) clearTimeout(scrapeTimeout);
    scrapeTimeout = setTimeout(() => {
      if (gen === _gen && _asset === asset) triggerScrape(asset, timeframe, marketStartTs);
    }, 5000);

    // Connect Binance WebSocket for kline chart data
    connectWs(asset);

    // For 5m/15m/4h, also connect Chainlink RTDS for accurate asset price
    if (_useChainlink) {
      connectChainlinkWs(asset);
    }

    startWatchdog();
  }

  function destroy() {
    _gen++;
    _asset = null;
    _timeframe = null;
    _currentMarketTs = null;
    _useChainlink = false;
    manualPtb = null;
    scrapedPtb = null;
    if (watchdogInterval) clearInterval(watchdogInterval);
    watchdogInterval = undefined;
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      window.removeEventListener('online', visibilityHandler);
      window.removeEventListener('focus', visibilityHandler);
      visibilityHandler = null;
    }
    binanceLastMsgAt = 0;
    chainlinkLastMsgAt = 0;
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
    refetchScrapedPtb,
  };
}
