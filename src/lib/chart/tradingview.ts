/** Lazy loader and factory for TradingView Advanced Chart embed widget. */

const EMBED_SCRIPT_SRC =
  'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';

/**
 * Create a TradingView Advanced Chart embed widget inside the given container.
 * Uses the embed-widget approach (inline JSON config inside a <script> tag).
 */
export function createTvEmbedWidget(
  container: HTMLElement,
  symbol: string = 'BINANCE:BTCUSDT',
): void {
  // Build the widget DOM structure
  const widgetContainer = document.createElement('div');
  widgetContainer.className = 'tradingview-widget-container';
  widgetContainer.style.width = '100%';
  widgetContainer.style.height = '100%';

  const widgetDiv = document.createElement('div');
  widgetDiv.className = 'tradingview-widget-container__widget';
  widgetDiv.style.width = '100%';
  widgetDiv.style.height = '100%';
  widgetContainer.appendChild(widgetDiv);

  const config = JSON.stringify({
    autosize: true,
    symbol,
    interval: '1',
    timezone: 'America/New_York',
    theme: 'dark',
    style: '1',
    locale: 'en',
    allow_symbol_change: false,
    withdateranges: true,
    details: false,
    calendar: false,
    studies: ['STD;RSI', 'STD;MACD', 'STD;VWAP', 'PUB;bH92P2FE'],
    support_host: 'https://www.tradingview.com',
  });

  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = EMBED_SCRIPT_SRC;
  script.async = true;
  script.textContent = config;
  widgetContainer.appendChild(script);

  container.appendChild(widgetContainer);
}
