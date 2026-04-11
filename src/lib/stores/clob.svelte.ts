// CLOB price store — connects to Polymarket CLOB WebSocket for UP/DOWN bid/ask/mid prices.

const CLOB_WS = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
const MAX_SPREAD = 0.15;

interface ClobWsMessage {
  event_type?: string;
  asset_id?: string;
  market?: string;
  // PriceChange fields
  price?: string;
  side?: string;
  // Book fields
  bids?: { price: string; size: string }[];
  asks?: { price: string; size: string }[];
  // LastTradePrice fields
  last_trade_price?: string;
}

export function createClobStore() {
  let upBid = $state<number | null>(null);
  let upAsk = $state<number | null>(null);
  let upMid = $state<number | null>(null);
  let downBid = $state<number | null>(null);
  let downAsk = $state<number | null>(null);
  let downMid = $state<number | null>(null);
  let connected = $state(false);

  let ws: WebSocket | null = null;
  let reconnectTimeout: ReturnType<typeof setTimeout> | undefined;
  let reconnectDelay = 1000;
  let _tokenIdUp: string | null = null;
  let _tokenIdDown: string | null = null;

  function computeMid(bid: number | null, ask: number | null): number | null {
    if (bid !== null && ask !== null) {
      const spread = ask - bid;
      if (spread > MAX_SPREAD) return null; // reject glitch
      return (bid + ask) / 2;
    }
    return null;
  }

  function handleMessage(msg: ClobWsMessage) {
    const assetId = msg.asset_id;
    if (!assetId) return;

    const isUp = assetId === _tokenIdUp;
    const isDown = assetId === _tokenIdDown;
    if (!isUp && !isDown) return;

    if (msg.event_type === 'price_change') {
      const price = msg.price ? parseFloat(msg.price) : null;
      if (price === null) return;

      if (isUp) {
        if (msg.side === 'BUY') upBid = price;
        else if (msg.side === 'SELL') upAsk = price;
        upMid = computeMid(upBid, upAsk);
      } else {
        if (msg.side === 'BUY') downBid = price;
        else if (msg.side === 'SELL') downAsk = price;
        downMid = computeMid(downBid, downAsk);
      }
    } else if (msg.event_type === 'book') {
      const bestBid = msg.bids && msg.bids.length > 0 ? parseFloat(msg.bids[0].price) : null;
      const bestAsk = msg.asks && msg.asks.length > 0 ? parseFloat(msg.asks[0].price) : null;

      if (isUp) {
        upBid = bestBid;
        upAsk = bestAsk;
        upMid = computeMid(bestBid, bestAsk);
      } else {
        downBid = bestBid;
        downAsk = bestAsk;
        downMid = computeMid(bestBid, bestAsk);
      }
    } else if (msg.event_type === 'last_trade_price') {
      // We track this but don't use it for mid calculation
    }
  }

  function connectWs() {
    if (!_tokenIdUp || !_tokenIdDown) return;

    const socket = new WebSocket(CLOB_WS);
    ws = socket;

    socket.onopen = () => {
      connected = true;
      reconnectDelay = 1000;
      // Subscribe to both tokens
      socket.send(JSON.stringify({
        assets_ids: [_tokenIdUp, _tokenIdDown],
        type: 'market',
      }));
    };

    socket.onmessage = (event) => {
      try {
        // Messages can be arrays or single objects
        const parsed = JSON.parse(event.data as string);
        if (Array.isArray(parsed)) {
          for (const msg of parsed) handleMessage(msg as ClobWsMessage);
        } else {
          handleMessage(parsed as ClobWsMessage);
        }
      } catch {
        // ignore parse errors
      }
    };

    socket.onclose = () => {
      connected = false;
      ws = null;
      if (_tokenIdUp && _tokenIdDown) {
        reconnectTimeout = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
          connectWs();
        }, reconnectDelay);
      }
    };

    socket.onerror = () => {
      socket.close();
    };
  }

  function init(tokenIdUp: string, tokenIdDown: string) {
    destroy();
    _tokenIdUp = tokenIdUp;
    _tokenIdDown = tokenIdDown;
    connectWs();
  }

  function destroy() {
    _tokenIdUp = null;
    _tokenIdDown = null;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    reconnectTimeout = undefined;
    ws?.close();
    ws = null;
    connected = false;
    upBid = null;
    upAsk = null;
    upMid = null;
    downBid = null;
    downAsk = null;
    downMid = null;
  }

  return {
    get upBid() { return upBid; },
    get upAsk() { return upAsk; },
    get upMid() { return upMid; },
    get downBid() { return downBid; },
    get downAsk() { return downAsk; },
    get downMid() { return downMid; },
    get connected() { return connected; },
    init,
    destroy,
  };
}
