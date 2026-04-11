import { ColorType, type DeepPartial, type ChartOptions } from 'lightweight-charts';

export const chartTheme: DeepPartial<ChartOptions> = {
  layout: {
    background: { type: ColorType.Solid, color: '#1a1a2e' },
    textColor: '#a0a0b0',
    fontSize: 11,
  },
  grid: {
    vertLines: { color: '#2a2a3e' },
    horzLines: { color: '#2a2a3e' },
  },
  crosshair: {
    vertLine: { color: '#555577', width: 1, style: 3 },
    horzLine: { color: '#555577', width: 1, style: 3 },
  },
  timeScale: {
    borderColor: '#2a2a3e',
    timeVisible: true,
    secondsVisible: false,
    rightOffset: 10,
  },
  rightPriceScale: {
    borderColor: '#2a2a3e',
  },
};

export const candleColors = {
  upColor: '#26a69a',
  downColor: '#ef5350',
  borderUpColor: '#26a69a',
  borderDownColor: '#ef5350',
  wickUpColor: '#26a69a',
  wickDownColor: '#ef5350',
};

export const indicatorColors = {
  emaShort: '#2196F3',
  emaLong: '#FF9800',
  vwap: '#9C27B0',
  // Pivots HL
  pivotHigh: '#ef5350',
  pivotLow: '#26a69a',
  // RSI
  rsi: '#A855F7',
  rsiOverbought: 'rgba(239, 68, 68, 0.5)',
  rsiOversold: 'rgba(34, 197, 94, 0.5)',
  rsiMidline: 'rgba(148, 163, 184, 0.3)',
  rsiMa: '#E2B93B',
  rsiOverboughtFill: 'rgba(239, 68, 68, 0.06)',
  rsiOversoldFill: 'rgba(34, 197, 94, 0.06)',
  // MACD
  macdLine: '#2196F3',
  macdSignal: '#FF9800',
  macdHistogramUp: '#26a69a',
  macdHistogramUpDim: '#93d7cf',
  macdHistogramDown: '#ef5350',
  macdHistogramDownDim: '#f7a0a0',
  macdZeroLine: 'rgba(148, 163, 184, 0.4)',
  // Volume
  volumeUp: 'rgba(38, 166, 154, 0.3)',
  volumeDown: 'rgba(239, 83, 80, 0.3)',
};
