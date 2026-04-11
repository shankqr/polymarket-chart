// TypeScript types for standalone Polymarket visualization
// Slimmed version of web/src/types.ts — no positions, orders, or bot state

export type Asset = 'BTC' | 'ETH' | 'SOL' | 'XRP';
export type Timeframe = '5m' | '15m' | '1h' | '4h' | 'daily';

export interface ClobPriceData {
  bid: string | null;
  ask: string | null;
  mid: string | null;
  ltp: string | null;
}

export interface KlineEntry {
  open_time_ms: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FillMarker {
  price: number;
  is_up: boolean;
  label: string;
}

export type Direction = 'Bullish' | 'Bearish' | 'Neutral';

export interface SignalSummary {
  obi: Direction;
  cvd_5m: Direction;
  rsi: Direction;
  macd: Direction;
  vwap: Direction;
  ema_cross: Direction;
  buy_walls: Direction;
  sell_walls: Direction;
  heikin_ashi: Direction;
  trend_score: number;
  trend_direction: Direction;
}

export interface Strategy15mIndicators {
  linreg_slope: number | null;
  vwap_distance: number | null;
  rsi_7: number | null;
  atr_15m: number | null;
  volume_ratio_20: number | null;
  recent_returns: number[];
}

export interface ComputedIndicators {
  obi: number | null;
  buy_walls: [number, number][];
  sell_walls: [number, number][];
  depth: [number, number][];
  cvd_1m: number | null;
  cvd_3m: number | null;
  cvd_5m: number | null;
  poc: number | null;
  volume_profile: [number, number][];
  rsi: number | null;
  macd_line: number | null;
  macd_signal: number | null;
  macd_histogram: number | null;
  vwap: number | null;
  ema_short: number | null;
  ema_long: number | null;
  ema_9: number | null;
  ema_21: number | null;
  heikin_ashi_streak: number;
  bb_upper: number | null;
  bb_middle: number | null;
  bb_lower: number | null;
  atr: number | null;
  zscore: number | null;
  trend_strength: number | null;
  momentum_pct: number | null;
  volume_ratio: number | null;
  volatility: number | null;
  fair_value_up: number | null;
  fair_value_down: number | null;
  edge_up: number | null;
  edge_down: number | null;
  signals: SignalSummary;
  bias_score: number | null;
  strategy_15m: Strategy15mIndicators;
  has_orderbook: boolean;
  trade_count: number;
  kline_count: number;
}

export type ChartMessage =
  | { type: 'Init'; klines: KlineEntry[]; current_kline: KlineEntry | null; indicators: ComputedIndicators; price_to_beat: number | null; fill_markers: FillMarker[] }
  | { type: 'Update'; kline: KlineEntry | null; is_closed: boolean; indicators: ComputedIndicators; price_to_beat: number | null; fill_markers: FillMarker[] };

export type CandleResult = 'Up' | 'Down' | 'Unknown';
