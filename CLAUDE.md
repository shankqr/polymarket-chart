# Polymarket Chart

Standalone crypto charting app for Polymarket visualization. Shows candlestick charts with technical indicators for BTC, ETH, SOL, and XRP across multiple timeframes.

## Tech Stack

- **Frontend**: Svelte 5 (runes mode) + TypeScript + Vite 7
- **Charting**: `lightweight-charts` (TradingView)
- **Hosting**: Cloudflare Pages (project: `polybot-web`)
- **API**: Cloudflare Pages Functions (in `functions/`)
- **KV Storage**: Cloudflare KV namespace `PTB` (price-to-beat values)

## Commands

- `npm run dev` — start dev server on port 3001
- `npm run build` — typecheck + production build (`tsc -b && vite build`)
- `npm run preview` — preview production build locally
- `npx wrangler pages deploy dist --project-name=polybot-web` — deploy to Cloudflare Pages

## Deployment

- **URL**: https://polym.clawmyway.com/
- **Preview URLs**: `https://<hash>.polybot-web.pages.dev`
- **Cloudflare account**: Shankqr@gmail.com's Account
- **Pages project name**: `polybot-web`
- The `PTB` KV namespace must be bound in Cloudflare dashboard (Settings > Functions > KV namespace bindings)

## Project Structure

```
src/
  App.svelte                  — root component
  main.ts                     — entry point
  types.ts                    — shared types (Asset, Timeframe, KlineEntry, indicators, etc.)
  app.css                     — global styles
  components/
    Header.svelte             — top header bar
    AssetTimeframeSelector    — asset/timeframe picker
    ChartTab.svelte           — tab container for charts
    ChartView.svelte          — chart wrapper
    TradingViewChart.svelte   — lightweight-charts integration
  lib/
    actions/chart.ts          — Svelte actions for chart DOM
    chart/
      indicators.ts           — technical indicator rendering
      primitives.ts           — chart drawing primitives
      theme.ts                — chart color theme
      time.ts                 — time utilities for chart
      tradingview.ts          — TradingView chart setup/config
    stores/
      clob.svelte.ts          — CLOB (order book) data store
      market.svelte.ts        — market data store
      price.svelte.ts         — price data store
    market-time.ts            — market hours/time helpers
functions/
  api/ptb.ts                  — Pages Function for price-to-beat CRUD (GET/POST/DELETE)
dist/                         — build output (gitignored)
```

## Key Types

- `Asset`: `'BTC' | 'ETH' | 'SOL' | 'XRP'`
- `Timeframe`: `'5m' | '15m' | '1h' | '4h' | 'daily'`
- `ChartMessage`: WebSocket message type with `Init` and `Update` variants
- `ComputedIndicators`: full set of technical indicators (RSI, MACD, VWAP, EMAs, Bollinger Bands, etc.)

## Notes

- Svelte 5 runes mode is enabled in `svelte.config.js` — use `$state`, `$derived`, `$effect` instead of legacy reactive syntax
- The `$lib` alias maps to `src/lib/` (configured in `vite.config.ts`)
- Stores use `.svelte.ts` extension for Svelte 5 rune-aware modules
