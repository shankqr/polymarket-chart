<script lang="ts">
  import { chartAction, type ChartParams } from '$lib/actions/chart';
  import type { KlineEntry, FillMarker, ComputedIndicators } from '../types';

  let {
    klines,
    currentKline,
    indicators,
    assetPrice = null,
    priceToBeat,
    fillMarkers,
    showEma,
    showRsi,
    showMacd,
    showMarketLines,
    currentMarketTs,
    nextMarketTs,
    onResetRef,
  }: {
    klines: KlineEntry[];
    currentKline: KlineEntry | null;
    indicators: ComputedIndicators | null;
    assetPrice?: number | null;
    priceToBeat: number | null;
    fillMarkers: FillMarker[];
    showEma: boolean;
    showRsi: boolean;
    showMacd: boolean;
    showMarketLines: boolean;
    currentMarketTs: number | null;
    nextMarketTs: number | null;
    onResetRef: (fn: () => void) => void;
  } = $props();

  let chartParams: ChartParams = $derived({
    klines,
    currentKline,
    indicators,
    assetPrice,
    priceToBeat,
    fillMarkers,
    showEma,
    showRsi,
    showMacd,
    showMarketLines,
    currentMarketTs,
    nextMarketTs,
    onResetRef,
  });
</script>

<div style="width: 100%; height: 100%; min-height: 400px" use:chartAction={chartParams}></div>
