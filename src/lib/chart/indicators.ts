import type { KlineEntry } from '../../types';
import type { Time } from 'lightweight-charts';
import { klineToTime } from './time';

/** EMA series — SMA seed for first `period` values, then exponential smoothing. */
function emaSeries(vals: number[], period: number): (number | null)[] {
  if (vals.length < period) return new Array(vals.length).fill(null);

  const mult = 2.0 / (period + 1.0);
  const out: (number | null)[] = new Array(period - 1).fill(null);
  let sma = 0;
  for (let i = 0; i < period; i++) sma += vals[i];
  sma /= period;
  out.push(sma);

  let prev = sma;
  for (let i = period; i < vals.length; i++) {
    const v = vals[i] * mult + prev * (1.0 - mult);
    out.push(v);
    prev = v;
  }
  return out;
}

/** Compute full RSI series using Wilder smoothing (matches backend compute_rsi).
 *  Returns both the RSI line and an SMA-smoothed RSI-based MA line (matching TradingView).
 */
export function computeRsiSeries(
  klines: KlineEntry[],
  period: number = 14,
  maPeriod: number = 14,
): {
  rsi: { time: Time; value: number }[];
  rsiMa: { time: Time; value: number }[];
} {
  const closes = klines.map((k) => k.close);
  if (closes.length < period + 1) return { rsi: [], rsiMa: [] };

  const changes: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i] - closes[i - 1]);
  }

  // Initial average gain/loss from first `period` changes
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 0; i < period; i++) {
    avgGain += Math.max(changes[i], 0);
    avgLoss += Math.max(-changes[i], 0);
  }
  avgGain /= period;
  avgLoss /= period;

  const rsi: { time: Time; value: number }[] = [];

  // First RSI value corresponds to kline at index `period`
  const rsi0 = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  rsi.push({ time: klineToTime(klines[period].open_time_ms), value: rsi0 });

  // Subsequent values using Wilder smoothing
  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + Math.max(changes[i], 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-changes[i], 0)) / period;
    const val = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    rsi.push({ time: klineToTime(klines[i + 1].open_time_ms), value: val });
  }

  // RSI-based MA: SMA of RSI values
  const rsiMa: { time: Time; value: number }[] = [];
  if (rsi.length >= maPeriod) {
    let sum = 0;
    for (let i = 0; i < maPeriod; i++) sum += rsi[i].value;
    rsiMa.push({ time: rsi[maPeriod - 1].time, value: sum / maPeriod });
    for (let i = maPeriod; i < rsi.length; i++) {
      sum += rsi[i].value - rsi[i - maPeriod].value;
      rsiMa.push({ time: rsi[i].time, value: sum / maPeriod });
    }
  }

  return { rsi, rsiMa };
}

/** Compute full MACD series (matches backend compute_macd).
 *  Uses TradingView-style 4-color histogram:
 *  - positive & growing:   bright green
 *  - positive & shrinking: dim green
 *  - negative & shrinking: bright red
 *  - negative & growing:   dim red
 */
export function computeMacdSeries(
  klines: KlineEntry[],
  fast: number = 12,
  slow: number = 26,
  signal: number = 9,
): {
  macdLine: { time: Time; value: number }[];
  signalLine: { time: Time; value: number }[];
  histogram: { time: Time; value: number; color: string }[];
} {
  const closes = klines.map((k) => k.close);
  const empty = { macdLine: [], signalLine: [], histogram: [] };
  if (closes.length < slow) return empty;

  const ef = emaSeries(closes, fast);
  const es = emaSeries(closes, slow);

  // MACD line = fast EMA - slow EMA (only where both exist)
  const macdVals: (number | null)[] = [];
  const macdOnly: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (ef[i] != null && es[i] != null) {
      const v = ef[i]! - es[i]!;
      macdVals.push(v);
      macdOnly.push(v);
    } else {
      macdVals.push(null);
    }
  }

  if (macdOnly.length === 0) return empty;

  // Signal line = EMA of MACD values
  const sig = emaSeries(macdOnly, signal);

  // Build output series — map back to kline timestamps
  const macdLine: { time: Time; value: number }[] = [];
  const signalLine: { time: Time; value: number }[] = [];
  const histogram: { time: Time; value: number; color: string }[] = [];

  let macdIdx = 0;
  let prevH: number | null = null;
  for (let i = 0; i < closes.length; i++) {
    if (macdVals[i] == null) continue;

    const time = klineToTime(klines[i].open_time_ms);
    const m = macdVals[i]!;
    macdLine.push({ time, value: m });

    if (sig[macdIdx] != null) {
      const s = sig[macdIdx]!;
      signalLine.push({ time, value: s });
      const h = m - s;
      const growing = prevH === null || h >= prevH;
      histogram.push({
        time,
        value: h,
        color: macdHistogramColor(h, growing),
      });
      prevH = h;
    }
    macdIdx++;
  }

  return { macdLine, signalLine, histogram };
}

/** TradingView-style 4-color MACD histogram.
 *  Color 0: bright green — positive & increasing (h >= 0, h >= prevH)
 *  Color 1: dim green   — positive & decreasing (h >= 0, h < prevH)
 *  Color 2: dim red     — negative & increasing (h < 0, h >= prevH)
 *  Color 3: bright red  — negative & decreasing (h < 0, h < prevH)
 */
export function macdHistogramColor(value: number, growing: boolean): string {
  if (value >= 0) {
    return growing ? '#26a69a' : '#93d7cf';
  } else {
    return growing ? '#f7a0a0' : '#ef5350';
  }
}

/** Compute EMA chart series for a given period. Wraps the private emaSeries() helper. */
export function computeEmaChartSeries(
  klines: KlineEntry[],
  period: number,
): { time: Time; value: number }[] {
  const closes = klines.map((k) => k.close);
  const ema = emaSeries(closes, period);
  const out: { time: Time; value: number }[] = [];
  for (let i = 0; i < klines.length; i++) {
    if (ema[i] != null) {
      out.push({ time: klineToTime(klines[i].open_time_ms), value: ema[i]! });
    }
  }
  return out;
}

/** Compute cumulative VWAP series. Resets naturally when kline data resets on market cycle. */
export function computeVwapSeries(
  klines: KlineEntry[],
): { time: Time; value: number }[] {
  const out: { time: Time; value: number }[] = [];
  let cumVol = 0;
  let cumTpVol = 0;
  for (const k of klines) {
    const tp = (k.high + k.low + k.close) / 3;
    cumVol += k.volume;
    cumTpVol += tp * k.volume;
    if (cumVol > 0) {
      out.push({ time: klineToTime(k.open_time_ms), value: cumTpVol / cumVol });
    }
  }
  return out;
}

/** Compute Pivots High/Low series (marks local extremes).
 *  A pivot high at index i requires klines[i].high >= all highs in [i-leftBars..i+rightBars].
 *  A pivot low at index i requires klines[i].low <= all lows in [i-leftBars..i+rightBars].
 */
export function computePivotsHlSeries(
  klines: KlineEntry[],
  leftBars: number = 10,
  rightBars: number = 10,
): { highs: { time: Time; value: number }[]; lows: { time: Time; value: number }[] } {
  const highs: { time: Time; value: number }[] = [];
  const lows: { time: Time; value: number }[] = [];
  for (let i = leftBars; i < klines.length - rightBars; i++) {
    let isPivotHigh = true;
    let isPivotLow = true;
    for (let j = i - leftBars; j <= i + rightBars; j++) {
      if (j === i) continue;
      if (klines[j].high > klines[i].high) isPivotHigh = false;
      if (klines[j].low < klines[i].low) isPivotLow = false;
      if (!isPivotHigh && !isPivotLow) break;
    }
    if (isPivotHigh) {
      highs.push({ time: klineToTime(klines[i].open_time_ms), value: klines[i].high });
    }
    if (isPivotLow) {
      lows.push({ time: klineToTime(klines[i].open_time_ms), value: klines[i].low });
    }
  }
  return { highs, lows };
}

/** Compute StochRSI K and D from a window of RSI values.
 *  K = (RSI - lowestRSI) / (highestRSI - lowestRSI) × 100
 *  D = SMA(3) of K values
 *  Requires at least `period` RSI values for K, and `period + smoothK - 1` for D.
 */
export function computeStochRsi(
  rsiValues: number[],
  period: number = 14,
  smoothK: number = 3,
): { k: number | null; d: number | null } {
  if (rsiValues.length < period) return { k: null, d: null };

  // Compute K values for the last smoothK periods
  const kValues: number[] = [];
  const needed = Math.min(rsiValues.length, period + smoothK - 1);
  const startIdx = rsiValues.length - needed;

  for (let i = startIdx + period - 1; i < rsiValues.length; i++) {
    const window = rsiValues.slice(i - period + 1, i + 1);
    const lo = Math.min(...window);
    const hi = Math.max(...window);
    const k = hi === lo ? 50 : ((rsiValues[i] - lo) / (hi - lo)) * 100;
    kValues.push(k);
  }

  const currentK = kValues[kValues.length - 1] ?? null;
  const currentD = kValues.length >= smoothK
    ? kValues.slice(-smoothK).reduce((a, b) => a + b, 0) / smoothK
    : null;

  return { k: currentK !== null ? Math.round(currentK) : null, d: currentD !== null ? Math.round(currentD) : null };
}
