// WebSocket proxy for Binance market data streams.
// Client connects to wss://<host>/api/ws/binance?stream=btcusdt@kline_1m
// Worker opens wss://stream.binance.com:9443/ws/<stream> and relays messages both ways.
// Needed because stream.binance.com is blocked on some networks (mobile, smart TVs).

const BINANCE_WS = 'wss://stream.binance.com:9443/ws';

export const onRequest: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const stream = url.searchParams.get('stream');

  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  if (!stream || !/^[a-z0-9@_]+$/i.test(stream)) {
    return new Response('Invalid stream parameter', { status: 400 });
  }

  const upstreamResp = await fetch(`${BINANCE_WS}/${stream}`, {
    headers: { Upgrade: 'websocket' },
  });

  const upstream = (upstreamResp as unknown as { webSocket: WebSocket | null }).webSocket;
  if (!upstream) {
    return new Response('Failed to connect upstream', { status: 502 });
  }

  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];

  server.accept();
  upstream.accept();

  // Upstream -> Client
  upstream.addEventListener('message', (e: MessageEvent) => {
    try {
      server.send(e.data);
    } catch {
      // client closed
    }
  });
  upstream.addEventListener('close', (e: CloseEvent) => {
    try {
      server.close(e.code, e.reason);
    } catch {
      // already closed
    }
  });
  upstream.addEventListener('error', () => {
    try {
      server.close(1011, 'upstream error');
    } catch {
      // already closed
    }
  });

  // Client -> Upstream
  server.addEventListener('message', (e: MessageEvent) => {
    try {
      upstream.send(e.data);
    } catch {
      // upstream closed
    }
  });
  server.addEventListener('close', (e: CloseEvent) => {
    try {
      upstream.close(e.code, e.reason);
    } catch {
      // already closed
    }
  });
  server.addEventListener('error', () => {
    try {
      upstream.close(1011, 'client error');
    } catch {
      // already closed
    }
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  } as ResponseInit & { webSocket: WebSocket });
};
