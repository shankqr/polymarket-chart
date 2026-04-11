import type {
  ISeriesApi,
  IChartApi,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  ISeriesPrimitiveBase,
  SeriesAttachedParameter,
  CandlestickData,
  Coordinate,
  Time,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';

// ─── LeftPriceLabelPrimitive ────────────────────────────────────────────

class RightLabelRenderer implements IPrimitivePaneRenderer {
  private _y: number;
  private _text: string;
  private _color: string;

  constructor(y: number, text: string, color: string) {
    this._y = y;
    this._text = text;
    this._color = color;
  }

  draw(target: CanvasRenderingTarget2D) {
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = this._color;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(this._text, mediaSize.width - 5, this._y);
    });
  }
}

class RightLabelPaneView implements IPrimitivePaneView {
  private _primitive: LeftPriceLabelPrimitive;

  constructor(primitive: LeftPriceLabelPrimitive) {
    this._primitive = primitive;
  }

  renderer(): IPrimitivePaneRenderer | null {
    const y = this._primitive.getY();
    if (y === null) return null;
    return new RightLabelRenderer(y, this._primitive.text, this._primitive.color);
  }
}

/** Custom series primitive that draws a right-aligned label at a given price level. */
export class LeftPriceLabelPrimitive implements ISeriesPrimitiveBase<SeriesAttachedParameter> {
  private _price: number | null = null;
  private _text: string;
  private _color: string;
  private _series: ISeriesApi<'Candlestick'> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _paneViews: IPrimitivePaneView[];

  constructor(text: string, color: string) {
    this._text = text;
    this._color = color;
    this._paneViews = [new RightLabelPaneView(this)];
  }

  attached(param: SeriesAttachedParameter) {
    this._series = param.series as ISeriesApi<'Candlestick'>;
    this._requestUpdate = param.requestUpdate;
  }

  detached() {
    this._series = null;
    this._requestUpdate = null;
  }

  updateAllViews() {}

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  setPrice(price: number | null) {
    this._price = price;
    this._requestUpdate?.();
  }

  getY(): number | null {
    if (this._price === null || !this._series) return null;
    return this._series.priceToCoordinate(this._price);
  }

  get text() { return this._text; }
  get color() { return this._color; }
}

// ─── FillLabelsPrimitive ────────────────────────────────────────────────

class FillLabelsRenderer implements IPrimitivePaneRenderer {
  private _labels: { y: number; label: string; color: string }[];
  constructor(labels: { y: number; label: string; color: string }[]) { this._labels = labels; }
  draw(target: CanvasRenderingTarget2D) {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      for (const { y, label, color } of this._labels) {
        ctx.fillStyle = color;
        ctx.fillText(label, 5, y);
      }
    });
  }
}

class FillLabelsPaneView implements IPrimitivePaneView {
  private _primitive: FillLabelsPrimitive;
  constructor(primitive: FillLabelsPrimitive) { this._primitive = primitive; }
  renderer(): IPrimitivePaneRenderer | null {
    const labels = this._primitive.getResolvedLabels();
    if (labels.length === 0) return null;
    return new FillLabelsRenderer(labels);
  }
}

/** Custom primitive that draws left-aligned fill labels at multiple price levels. */
export class FillLabelsPrimitive implements ISeriesPrimitiveBase<SeriesAttachedParameter> {
  private _fills: { price: number; label: string; color: string }[] = [];
  private _series: ISeriesApi<'Candlestick'> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _paneViews: IPrimitivePaneView[];

  constructor() {
    this._paneViews = [new FillLabelsPaneView(this)];
  }

  attached(param: SeriesAttachedParameter) {
    this._series = param.series as ISeriesApi<'Candlestick'>;
    this._requestUpdate = param.requestUpdate;
  }

  detached() {
    this._series = null;
    this._requestUpdate = null;
  }

  updateAllViews() {}

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  setFills(fills: { price: number; label: string; color: string }[]) {
    this._fills = fills;
    this._requestUpdate?.();
  }

  getResolvedLabels(): { y: number; label: string; color: string }[] {
    if (!this._series) return [];
    const result: { y: number; label: string; color: string }[] = [];
    for (const fill of this._fills) {
      const y = this._series.priceToCoordinate(fill.price);
      if (y !== null) {
        result.push({ y: y as number, label: fill.label, color: fill.color });
      }
    }
    return result;
  }
}

// ─── RsiBandFillPrimitive ───────────────────────────────────────────────

class RsiBandFillRenderer implements IPrimitivePaneRenderer {
  private _overboughtFill: string;
  private _oversoldFill: string;
  private _series: ISeriesApi<'Line'>;

  constructor(series: ISeriesApi<'Line'>, overboughtFill: string, oversoldFill: string) {
    this._series = series;
    this._overboughtFill = overboughtFill;
    this._oversoldFill = oversoldFill;
  }

  draw(target: CanvasRenderingTarget2D) {
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const y0 = this._series.priceToCoordinate(0);
      const y30 = this._series.priceToCoordinate(30);
      const y70 = this._series.priceToCoordinate(70);
      const y100 = this._series.priceToCoordinate(100);
      if (y0 === null || y30 === null || y70 === null || y100 === null) return;

      // Overbought zone (70-100)
      ctx.fillStyle = this._overboughtFill;
      ctx.fillRect(0, Math.min(y70 as number, y100 as number), mediaSize.width, Math.abs((y100 as number) - (y70 as number)));

      // Oversold zone (0-30)
      ctx.fillStyle = this._oversoldFill;
      ctx.fillRect(0, Math.min(y0 as number, y30 as number), mediaSize.width, Math.abs((y30 as number) - (y0 as number)));
    });
  }
}

class RsiBandFillPaneView implements IPrimitivePaneView {
  private _primitive: RsiBandFillPrimitive;
  constructor(primitive: RsiBandFillPrimitive) { this._primitive = primitive; }
  renderer(): IPrimitivePaneRenderer | null {
    const series = this._primitive.getSeries();
    if (!series) return null;
    return new RsiBandFillRenderer(series, this._primitive.overboughtFill, this._primitive.oversoldFill);
  }
}

/** Custom primitive that draws colored band fills for RSI overbought/oversold zones. */
export class RsiBandFillPrimitive implements ISeriesPrimitiveBase<SeriesAttachedParameter> {
  private _series: ISeriesApi<'Line'> | null = null;
  private _paneViews: IPrimitivePaneView[];
  readonly overboughtFill: string;
  readonly oversoldFill: string;

  constructor(overboughtFill: string, oversoldFill: string) {
    this.overboughtFill = overboughtFill;
    this.oversoldFill = oversoldFill;
    this._paneViews = [new RsiBandFillPaneView(this)];
  }

  attached(param: SeriesAttachedParameter) {
    this._series = param.series as ISeriesApi<'Line'>;
  }

  detached() {
    this._series = null;
  }

  updateAllViews() {}

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  getSeries(): ISeriesApi<'Line'> | null { return this._series; }
}

// ─── VerticalLinesPrimitive ─────────────────────────────────────────────

class VerticalLinesRenderer implements IPrimitivePaneRenderer {
  private _lines: { x: Coordinate; label: string }[];
  private _color: string;

  constructor(lines: { x: Coordinate; label: string }[], color: string) {
    this._lines = lines;
    this._color = color;
  }

  draw(target: CanvasRenderingTarget2D) {
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      ctx.strokeStyle = this._color;
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 4]);
      for (const { x, label } of this._lines) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, mediaSize.height);
        ctx.stroke();
        if (label) {
          ctx.save();
          ctx.setLineDash([]);
          ctx.font = 'bold 11px sans-serif';
          const textWidth = ctx.measureText(label).width;
          const padH = 4;
          const padV = 3;
          const tagY = 14;
          ctx.fillStyle = this._color;
          ctx.beginPath();
          ctx.roundRect(x - textWidth / 2 - padH, tagY - 7 - padV, textWidth + padH * 2, 14 + padV * 2, 3);
          ctx.fill();
          ctx.fillStyle = '#0d1117';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, x, tagY);
          ctx.restore();
        }
      }
    });
  }
}

class VerticalLinesPaneView implements IPrimitivePaneView {
  private _primitive: VerticalLinesPrimitive;

  constructor(primitive: VerticalLinesPrimitive) {
    this._primitive = primitive;
  }

  renderer(): IPrimitivePaneRenderer | null {
    const lines = this._primitive.getResolvedLines();
    if (lines.length === 0) return null;
    return new VerticalLinesRenderer(lines, this._primitive.color);
  }
}

/** Custom primitive that draws labeled vertical lines at given time coordinates. */
export class VerticalLinesPrimitive implements ISeriesPrimitiveBase<SeriesAttachedParameter> {
  private _lines: { time: Time; label: string }[] = [];
  private _color: string;
  private _chart: IChartApi | null = null;
  private _series: ISeriesApi<'Candlestick'> | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _paneViews: IPrimitivePaneView[];

  constructor(color: string) {
    this._color = color;
    this._paneViews = [new VerticalLinesPaneView(this)];
  }

  attached(param: SeriesAttachedParameter) {
    this._chart = param.chart;
    this._series = param.series as ISeriesApi<'Candlestick'>;
    this._requestUpdate = param.requestUpdate;
  }

  detached() {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
  }

  updateAllViews() {}

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  setLines(lines: { time: Time; label: string }[]) {
    this._lines = lines;
    this._requestUpdate?.();
  }

  getResolvedLines(): { x: Coordinate; label: string }[] {
    if (!this._chart || !this._series) return [];
    const ts = this._chart.timeScale();
    const data = this._series.data() as CandlestickData[];
    if (data.length === 0) return [];

    const first = data[0];
    const last = data[data.length - 1];
    const x1 = ts.timeToCoordinate(first.time);
    const x2 = ts.timeToCoordinate(last.time);
    const t1 = first.time as number;
    const t2 = last.time as number;
    const canExtrapolate = x1 !== null && x2 !== null && t2 !== t1;
    const pxPerSec = canExtrapolate ? ((x2 as number) - (x1 as number)) / (t2 - t1) : 0;

    const result: { x: Coordinate; label: string }[] = [];
    for (const line of this._lines) {
      let coord = ts.timeToCoordinate(line.time);
      if (coord === null) {
        const targetNum = line.time as number;
        if (canExtrapolate && targetNum > t2) {
          coord = ((x2 as number) + (targetNum - t2) * pxPerSec) as Coordinate;
        } else {
          let closest: Time | null = null;
          let minDist = Infinity;
          for (const d of data) {
            const dist = Math.abs((d.time as number) - targetNum);
            if (dist < minDist) {
              minDist = dist;
              closest = d.time;
            }
          }
          coord = closest !== null ? ts.timeToCoordinate(closest) : null;
        }
      }
      if (coord !== null) {
        result.push({ x: coord, label: line.label });
      }
    }
    return result;
  }

  get color() { return this._color; }
}
