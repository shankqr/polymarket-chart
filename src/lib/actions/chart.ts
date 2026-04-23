import type { Action } from 'svelte/action';
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type IPaneApi,
  type IPriceLine,
  type CandlestickData,
  type LineData,
  type HistogramData,
  type Time,
} from 'lightweight-charts';
import type { KlineEntry, FillMarker, ComputedIndicators } from '../../types';
import { chartTheme, candleColors, indicatorColors } from '../chart/theme';
import { computeRsiSeries, computeMacdSeries, macdHistogramColor, computeEmaChartSeries } from '../chart/indicators';
import { klineToTime } from '../chart/time';
import { LeftPriceLabelPrimitive, FillLabelsPrimitive, VerticalLinesPrimitive, RsiBandFillPrimitive } from '../chart/primitives';

export interface ChartParams {
  klines: KlineEntry[];
  currentKline: KlineEntry | null;
  indicators: ComputedIndicators | null;
  assetPrice: number | null;
  priceToBeat: number | null;
  fillMarkers: FillMarker[];
  showEma: boolean;
  showRsi: boolean;
  showMacd: boolean;
  showMarketLines: boolean;
  currentMarketTs: number | null;
  nextMarketTs: number | null;
  onResetRef: (fn: () => void) => void;
}

/** Build a deduplicated, time-ascending kline array from closed klines + optional current kline. */
function buildAllKlines(klines: KlineEntry[], currentKline: KlineEntry | null): KlineEntry[] {
  const all = [...klines];
  if (currentKline) {
    const last = all[all.length - 1];
    if (last && last.open_time_ms === currentKline.open_time_ms) {
      all[all.length - 1] = currentKline;
    } else {
      all.push(currentKline);
    }
  }
  return all;
}

/** Bars of history visible to the left of the last bar in the default view. */
const BARS_LEFT = 96;
/** Bars of empty space visible to the right of the last bar in the default view. */
const BARS_RIGHT = 24;

/** Compute the rightOffset (in bars) needed so the end time is visible with padding. */
function computeEndTimeOffset(
  series: ISeriesApi<'Candlestick'> | null,
  endTime: Time | null,
): number {
  const DEFAULT_OFFSET = BARS_RIGHT;
  if (!series || !endTime) return DEFAULT_OFFSET;
  const data = series.data() as CandlestickData[];
  if (data.length < 2) return DEFAULT_OFFSET;
  const lastTime = data[data.length - 1].time as number;
  const endNum = endTime as number;
  if (endNum <= lastTime) return DEFAULT_OFFSET;
  const prevTime = data[data.length - 2].time as number;
  const barInterval = lastTime - prevTime;
  if (barInterval <= 0) return DEFAULT_OFFSET;
  return Math.max(DEFAULT_OFFSET, Math.ceil((endNum - lastTime) / barInterval) + 2);
}

/** Position the last bar at ~75% from the left so Start Time lands in the right third. */
function fitToMarketWindow(
  chart: IChartApi | null,
  series: ISeriesApi<'Candlestick'> | null,
  _startTime: Time | null,
  _endTime: Time | null,
) {
  if (!chart || !series) return;
  const data = series.data() as CandlestickData[];
  if (data.length === 0) return;
  const lastIdx = data.length - 1;
  chart.timeScale().applyOptions({ rightOffset: BARS_RIGHT });
  chart.timeScale().setVisibleLogicalRange({
    from: lastIdx - BARS_LEFT,
    to: lastIdx + BARS_RIGHT,
  });
}

function updateStretchFactors(
  chart: IChartApi,
  rsiPane: IPaneApi<Time> | null,
  macdPane: IPaneApi<Time> | null,
) {
  const mainPane = chart.panes()[0];
  if (!mainPane) return;
  if (rsiPane && macdPane) {
    mainPane.setStretchFactor(55);
    rsiPane.setStretchFactor(20);
    macdPane.setStretchFactor(25);
  } else if (rsiPane) {
    mainPane.setStretchFactor(75);
    rsiPane.setStretchFactor(25);
  } else if (macdPane) {
    mainPane.setStretchFactor(70);
    macdPane.setStretchFactor(30);
  } else {
    mainPane.setStretchFactor(1);
  }
}

export const chartAction: Action<HTMLDivElement, ChartParams> = (node, initialParams) => {
  // ─── Chart + main series ──────────────────────────────────────
  const chart = createChart(node, {
    ...chartTheme,
    width: node.clientWidth,
    height: node.clientHeight,
    autoSize: true,
    localization: {
      priceFormatter: (price: number) => price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    },
  });

  const candleSeries = chart.addSeries(CandlestickSeries, {
    ...candleColors,
    priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
    lastValueVisible: false,
    priceLineVisible: false,
  });

  // ─── Volume overlay (bottom 20% of main pane) ──────────────────
  const volumeSeries = chart.addSeries(HistogramSeries, {
    priceScaleId: 'volume',
    color: indicatorColors.volumeUp,
    priceLineVisible: false,
    lastValueVisible: false,
  });
  chart.priceScale('volume').applyOptions({
    scaleMargins: { top: 0.8, bottom: 0 },
    borderVisible: false,
  });

  // ─── Current price series (shows assetPrice on axis) ─────────
  const currentPriceSeries = chart.addSeries(LineSeries, {
    color: 'rgba(0,0,0,0)',
    lineWidth: 1,
    lastValueVisible: true,
    priceLineVisible: true,
    priceLineWidth: 1,
    priceLineStyle: 2,
    priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
  });

  // ─── Primitives ───────────────────────────────────────────────
  const deltaLabel = new LeftPriceLabelPrimitive('', '#8b949e');
  const fillLabels = new FillLabelsPrimitive();
  const marketLines = new VerticalLinesPrimitive('rgba(255, 255, 255, 0.5)');
  candleSeries.attachPrimitive(deltaLabel);
  candleSeries.attachPrimitive(fillLabels);
  candleSeries.attachPrimitive(marketLines);

  // ─── State ────────────────────────────────────────────────────
  let rsiPane: IPaneApi<Time> | null = null;
  let rsiSeries: ISeriesApi<'Line'> | null = null;
  let rsiMaSeries: ISeriesApi<'Line'> | null = null;
  let macdPane: IPaneApi<Time> | null = null;
  let macdHistogram: ISeriesApi<'Histogram'> | null = null;
  let macdLine: ISeriesApi<'Line'> | null = null;
  let macdSignal: ISeriesApi<'Line'> | null = null;
  let ptbLine: IPriceLine | null = null;
  let fillPriceLines: IPriceLine[] = [];
  let prevPtb: number | null = null;
  let prevFillCount = 0;
  let prevMarketTs: number | null = null;
  let startTime: Time | null = null;
  let endTime: Time | null = null;
  let inited = false;
  let prevKlineCount = 0;
  let autoFollow = true;
  let prevShowRsi = false;
  let prevShowMacd = false;
  let prevShowMarketLines = true;
  let prevShowEma = false;
  let ema9Series: ISeriesApi<'Line'> | null = null;
  let ema21Series: ISeriesApi<'Line'> | null = null;
  let prevMacdHistValue: number | null = null;
  const rsiMaWindow: number[] = [];
  const RSI_MA_PERIOD = 14;

  // ─── Auto-follow scroll tracking ─────────────────────────────
  let dragPending = false;
  let startX = 0;

  const onMouseDown = (e: MouseEvent) => { dragPending = true; startX = e.clientX; };
  const onMouseMove = (e: MouseEvent) => {
    if (dragPending && Math.abs(e.clientX - startX) > 3) {
      autoFollow = false;
      dragPending = false;
    }
  };
  const onMouseUp = () => { dragPending = false; };
  const onWheel = () => { autoFollow = false; };
  const onTouchStart = (e: TouchEvent) => { dragPending = true; startX = e.touches[0].clientX; };
  const onTouchMove = (e: TouchEvent) => {
    if (dragPending && Math.abs(e.touches[0].clientX - startX) > 3) {
      autoFollow = false;
      dragPending = false;
    }
  };
  const onTouchEnd = () => { dragPending = false; };

  node.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  node.addEventListener('wheel', onWheel);
  node.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: true });
  window.addEventListener('touchend', onTouchEnd);

  // ─── Reset view callback ──────────────────────────────────────
  function resetView() {
    autoFollow = true;
    fitToMarketWindow(chart, candleSeries, startTime, endTime);
  }

  // ─── RSI pane management ──────────────────────────────────────
  function showRsiPane(allKlines: KlineEntry[]) {
    const savedScroll = chart.timeScale().scrollPosition();
    const pane = chart.addPane();
    rsiPane = pane;

    rsiSeries = pane.addSeries(LineSeries, {
      color: indicatorColors.rsi,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    rsiMaSeries = pane.addSeries(LineSeries, {
      color: indicatorColors.rsiMa,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    rsiSeries.createPriceLine({ price: 70, color: indicatorColors.rsiOverbought, lineWidth: 1, lineStyle: 2, axisLabelVisible: true });
    rsiSeries.createPriceLine({ price: 30, color: indicatorColors.rsiOversold, lineWidth: 1, lineStyle: 2, axisLabelVisible: true });
    rsiSeries.createPriceLine({ price: 50, color: indicatorColors.rsiMidline, lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
    rsiSeries.attachPrimitive(new RsiBandFillPrimitive(indicatorColors.rsiOverboughtFill, indicatorColors.rsiOversoldFill));

    if (allKlines.length > 0) {
      const { rsi, rsiMa } = computeRsiSeries(allKlines);
      rsiSeries.setData(rsi as LineData[]);
      rsiMaSeries.setData(rsiMa as LineData[]);
    }

    updateStretchFactors(chart, pane, macdPane);
    restoreScroll(savedScroll);
  }

  function hideRsiPane() {
    if (!rsiPane) return;
    const savedScroll = chart.timeScale().scrollPosition();
    const idx = rsiPane.paneIndex();
    chart.removePane(idx);
    rsiPane = null;
    rsiSeries = null;
    rsiMaSeries = null;
    updateStretchFactors(chart, null, macdPane);
    restoreScroll(savedScroll);
  }

  // ─── MACD pane management ─────────────────────────────────────
  function showMacdPane(allKlines: KlineEntry[]) {
    const savedScroll = chart.timeScale().scrollPosition();
    const pane = chart.addPane();
    macdPane = pane;

    macdHistogram = pane.addSeries(HistogramSeries, {
      color: indicatorColors.macdHistogramUp,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    macdLine = pane.addSeries(LineSeries, {
      color: indicatorColors.macdLine,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    macdSignal = pane.addSeries(LineSeries, {
      color: indicatorColors.macdSignal,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });
    macdHistogram.createPriceLine({ price: 0, color: indicatorColors.macdZeroLine, lineWidth: 1, lineStyle: 2, axisLabelVisible: false });

    if (allKlines.length > 0) {
      const macdData = computeMacdSeries(allKlines, 12, 26, 9);
      macdLine.setData(macdData.macdLine as LineData[]);
      macdSignal.setData(macdData.signalLine as LineData[]);
      macdHistogram.setData(macdData.histogram as HistogramData[]);
    }

    // If RSI is already present, it was at index 1 and MACD was just appended
    // after it. Swap them so MACD sits directly below the main pane and RSI
    // stays at the bottom.
    if (rsiPane) {
      const macdIdx = pane.paneIndex();
      const rsiIdx = rsiPane.paneIndex();
      if (macdIdx > rsiIdx) chart.swapPanes(macdIdx, rsiIdx);
    }

    updateStretchFactors(chart, rsiPane, pane);
    restoreScroll(savedScroll);
  }

  function hideMacdPane() {
    if (!macdPane) return;
    const savedScroll = chart.timeScale().scrollPosition();
    const idx = macdPane.paneIndex();
    chart.removePane(idx);
    macdPane = null;
    macdHistogram = null;
    macdLine = null;
    macdSignal = null;
    updateStretchFactors(chart, rsiPane, null);
    restoreScroll(savedScroll);
  }

  // ─── Main-pane overlay management (EMA, VWAP, Pivots HL) ─────
  function showEmaOverlay(allKlines: KlineEntry[]) {
    ema9Series = chart.addSeries(LineSeries, {
      color: indicatorColors.emaShort,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    ema21Series = chart.addSeries(LineSeries, {
      color: indicatorColors.emaLong,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    if (allKlines.length > 0) {
      ema9Series.setData(computeEmaChartSeries(allKlines, 9) as LineData[]);
      ema21Series.setData(computeEmaChartSeries(allKlines, 21) as LineData[]);
    }
  }
  function hideEmaOverlay() {
    if (ema9Series) { chart.removeSeries(ema9Series); ema9Series = null; }
    if (ema21Series) { chart.removeSeries(ema21Series); ema21Series = null; }
  }

  /** Recompute and setData for all active main-pane overlays. */
  function refreshOverlays(allKlines: KlineEntry[]) {
    if (ema9Series) ema9Series.setData(computeEmaChartSeries(allKlines, 9) as LineData[]);
    if (ema21Series) ema21Series.setData(computeEmaChartSeries(allKlines, 21) as LineData[]);
  }

  function restoreScroll(savedScroll: number | null) {
    const offset = computeEndTimeOffset(candleSeries, endTime);
    chart.timeScale().applyOptions({ rightOffset: offset });
    if (savedScroll !== null) {
      requestAnimationFrame(() => {
        chart.timeScale().scrollToPosition(savedScroll, false);
      });
    }
  }

  // ─── Apply all params ─────────────────────────────────────────
  function applyParams(params: ChartParams) {
    // Register reset callback
    params.onResetRef(resetView);

    const allKlines = buildAllKlines(params.klines, params.currentKline);

    // ── RSI/MACD toggle (MACD goes first so it naturally sits above RSI) ──
    if (params.showMacd !== prevShowMacd) {
      if (params.showMacd) showMacdPane(allKlines);
      else hideMacdPane();
      prevShowMacd = params.showMacd;
    }
    if (params.showRsi !== prevShowRsi) {
      if (params.showRsi) showRsiPane(allKlines);
      else hideRsiPane();
      prevShowRsi = params.showRsi;
    }

    // ── Main-pane overlay toggles ──
    if (params.showEma !== prevShowEma) {
      if (params.showEma) showEmaOverlay(allKlines);
      else hideEmaOverlay();
      prevShowEma = params.showEma;
    }

    // ── Market time computation ──
    if (params.currentMarketTs && params.nextMarketTs) {
      const duration = params.nextMarketTs - params.currentMarketTs;
      if (duration > 0) {
        const prevEndTime = endTime;
        startTime = klineToTime(params.currentMarketTs * 1000);
        endTime = klineToTime((params.currentMarketTs + duration) * 1000);
        if (prevEndTime === null && inited) {
          fitToMarketWindow(chart, candleSeries, startTime, endTime);
        }
      }
    } else {
      startTime = null;
      endTime = null;
    }

    // ── Market vertical lines ──
    if (params.showMarketLines !== prevShowMarketLines || params.currentMarketTs !== prevMarketTs) {
      if (!params.showMarketLines || !params.currentMarketTs || !params.nextMarketTs) {
        marketLines.setLines([]);
        prevMarketTs = null;
      } else if (params.currentMarketTs !== prevMarketTs) {
        const duration = params.nextMarketTs - params.currentMarketTs;
        if (duration > 0) {
          const prevStart = (params.currentMarketTs - duration) * 1000;
          const prevEnd = params.currentMarketTs * 1000;
          const currentEnd = (params.currentMarketTs + duration) * 1000;
          marketLines.setLines([
            { time: klineToTime(prevStart), label: 'Previous' },
            { time: klineToTime(prevEnd), label: 'Start Time' },
            { time: klineToTime(currentEnd), label: 'End Time' },
          ]);
          prevMarketTs = params.currentMarketTs;
        }
      }
      prevShowMarketLines = params.showMarketLines;
    }

    // ── Kline data ──
    if (params.klines.length === 0) return;

    const candles: CandlestickData[] = allKlines.map((k) => ({
      time: klineToTime(k.open_time_ms),
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
    }));
    // Stretch the last (live) candle to the streamed asset price so its close
    // always meets the current-price dotted line, even when the asset price
    // feed (e.g. Chainlink) updates more often than Binance kline ticks.
    if (params.assetPrice !== null && candles.length > 0) {
      const last = candles[candles.length - 1];
      last.close = params.assetPrice;
      if (params.assetPrice > last.high) last.high = params.assetPrice;
      if (params.assetPrice < last.low) last.low = params.assetPrice;
    }

    const volumes: HistogramData[] = allKlines.map((k) => ({
      time: klineToTime(k.open_time_ms),
      value: k.volume,
      color: k.close >= k.open ? indicatorColors.volumeUp : indicatorColors.volumeDown,
    })) as HistogramData[];

    const isReset = !inited || params.klines.length < prevKlineCount;

    try {
      if (isReset) {
        candleSeries.setData(candles);
        volumeSeries.setData(volumes);
        inited = true;
        autoFollow = true;
        prevMacdHistValue = null;
        rsiMaWindow.length = 0;
        currentPriceSeries.setData([]);
        fitToMarketWindow(chart, candleSeries, startTime, endTime);

        // Reset subchart data
        if (rsiSeries) {
          const { rsi, rsiMa } = computeRsiSeries(allKlines);
          rsiSeries.setData(rsi as LineData[]);
          if (rsiMaSeries) rsiMaSeries.setData(rsiMa as LineData[]);
        }
        if (macdLine && macdSignal && macdHistogram) {
          const macdData = computeMacdSeries(allKlines, 12, 26, 9);
          macdLine.setData(macdData.macdLine as LineData[]);
          macdSignal.setData(macdData.signalLine as LineData[]);
          macdHistogram.setData(macdData.histogram as HistogramData[]);
        }
        refreshOverlays(allKlines);

        // Clear fill markers on chart reset
        for (const line of fillPriceLines) {
          candleSeries.removePriceLine(line);
        }
        fillPriceLines = [];
        fillLabels.setFills([]);
        prevFillCount = 0;
      } else {
        // Incremental: update the last candle + volume. Each update is wrapped
        // individually so a transient glitch (e.g. out-of-order tick during a
        // WS reconnect) doesn't knock the rest of the render off.
        const lastCandle = candles[candles.length - 1];
        const lastVolume = volumes[volumes.length - 1];
        if (lastCandle) {
          try { candleSeries.update(lastCandle); } catch { /* swallow */ }
        }
        if (lastVolume) {
          try { volumeSeries.update(lastVolume); } catch { /* swallow */ }
        }
        if (autoFollow && endTime) {
          try { fitToMarketWindow(chart, candleSeries, startTime, endTime); } catch { /* swallow */ }
        }
        try { refreshOverlays(allKlines); } catch { /* swallow */ }
      }
    } catch {
      inited = false;
      prevKlineCount = 0;
      return;
    }

    prevKlineCount = params.klines.length;

    // ── Subchart indicator overlays ──
    if (params.indicators) {
      const ind = params.indicators;
      const time = candles[candles.length - 1]?.time;
      try {
        if (time && rsiSeries && ind.rsi != null) {
          rsiSeries.update({ time, value: ind.rsi } as LineData);
          // RSI-based MA: running SMA of RSI values
          rsiMaWindow.push(ind.rsi);
          if (rsiMaWindow.length > RSI_MA_PERIOD) rsiMaWindow.shift();
          if (rsiMaSeries && rsiMaWindow.length === RSI_MA_PERIOD) {
            const maVal = rsiMaWindow.reduce((a, b) => a + b, 0) / RSI_MA_PERIOD;
            rsiMaSeries.update({ time, value: maVal } as LineData);
          }
        }
        if (time) {
          if (macdLine && ind.macd_line != null) {
            macdLine.update({ time, value: ind.macd_line } as LineData);
          }
          if (macdSignal && ind.macd_signal != null) {
            macdSignal.update({ time, value: ind.macd_signal } as LineData);
          }
          if (macdHistogram && ind.macd_histogram != null) {
            const h = ind.macd_histogram;
            const growing = prevMacdHistValue === null || h >= prevMacdHistValue;
            macdHistogram.update({
              time,
              value: h,
              color: macdHistogramColor(h, growing),
            } as HistogramData);
            prevMacdHistValue = h;
          }
        }
      } catch {
        // Indicator overlay update failed — will self-correct on next tick
      }
    }

    // ── Delta label on candlestick series title + current price on axis ──
    const currentPrice = params.assetPrice ?? (allKlines.length > 0 ? allKlines[allKlines.length - 1].close : null);
    if (currentPrice !== null && params.priceToBeat !== null) {
      const delta = currentPrice - params.priceToBeat;
      const arrow = delta > 0 ? '\u25B2' : delta < 0 ? '\u25BC' : '';
      const text = `${arrow} $${Math.abs(delta).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
      const color = delta > 0 ? '#47C482' : delta < 0 ? '#E64B4B' : '#8b949e';
      deltaLabel.setText(text);
      deltaLabel.setColor(color);
      deltaLabel.setPrice(currentPrice);
      currentPriceSeries.applyOptions({ priceLineColor: color });
    } else {
      deltaLabel.setText('');
      deltaLabel.setPrice(null);
      currentPriceSeries.applyOptions({ priceLineColor: '#8b949e' });
    }

    // Update current price on chart axis
    if (currentPrice !== null && allKlines.length > 0) {
      const lastTime = klineToTime(allKlines[allKlines.length - 1].open_time_ms);
      try {
        currentPriceSeries.update({ time: lastTime, value: currentPrice } as LineData);
      } catch {
        currentPriceSeries.setData([{ time: lastTime, value: currentPrice } as LineData]);
      }
    }

    // ── PTB horizontal line ──
    if (params.priceToBeat !== prevPtb) {
      if (ptbLine) {
        candleSeries.removePriceLine(ptbLine);
        ptbLine = null;
      }
      if (params.priceToBeat !== null) {
        ptbLine = candleSeries.createPriceLine({
          price: params.priceToBeat,
          color: '#8b949e',
          lineWidth: 3,
          lineStyle: 0,
          axisLabelVisible: true,
        });
      }
      prevPtb = params.priceToBeat;
    }

    // ── Fill marker horizontal lines ──
    const fillMarkers = params.fillMarkers ?? [];
    if (fillMarkers.length !== prevFillCount) {
      for (const line of fillPriceLines) {
        candleSeries.removePriceLine(line);
      }
      fillPriceLines = [];

      for (const marker of fillMarkers) {
        const color = marker.is_up ? '#26a69a' : '#ef5350';
        const line = candleSeries.createPriceLine({
          price: marker.price,
          color,
          lineWidth: 1,
          lineStyle: 0,
          axisLabelVisible: false,
        });
        fillPriceLines.push(line);
      }

      fillLabels.setFills(
        fillMarkers.map((m) => ({
          price: m.price,
          label: m.label,
          color: m.is_up ? '#26a69a' : '#ef5350',
        })),
      );

      prevFillCount = fillMarkers.length;
    }
  }

  // Initial apply
  applyParams(initialParams);

  return {
    update(newParams: ChartParams) {
      applyParams(newParams);
    },
    destroy() {
      node.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      chart.remove();
    },
  };
};
