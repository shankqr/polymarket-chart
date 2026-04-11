<script lang="ts">
  import ChartView from './ChartView.svelte';
  import TradingViewChart from './TradingViewChart.svelte';
  import type { KlineEntry, FillMarker, ComputedIndicators } from '../types';

  let {
    klines,
    currentKline,
    indicators,
    assetPrice = null,
    priceToBeat,
    fillMarkers,
    currentMarketTs,
    nextMarketTs,
    chartEngine = 'lwc',
  }: {
    klines: KlineEntry[];
    currentKline: KlineEntry | null;
    indicators: ComputedIndicators | null;
    assetPrice?: number | null;
    priceToBeat: number | null;
    fillMarkers: FillMarker[];
    currentMarketTs: number | null;
    nextMarketTs: number | null;
    chartEngine: 'lwc' | 'tv';
  } = $props();

  let showEma = $state(true);
  let showRsi = $state(true);
  let showMacd = $state(true);
  let showMarketLines = $state(true);
  let resetFn: (() => void) | null = null;

  function onResetRef(fn: () => void) {
    resetFn = fn;
  }

</script>

<div class="chart-tab">
  <div class="chart-container" style="position: relative;">
      {#if chartEngine === 'lwc'}
        <div class="chart-overlay-buttons">
          <button
            class="chart-toggle"
            class:active={showEma}
            onclick={() => showEma = !showEma}
          >EMA</button>
          <button
            class="chart-toggle"
            class:active={showMarketLines}
            onclick={() => showMarketLines = !showMarketLines}
          >Markets</button>
          <button
            class="chart-toggle"
            class:active={showRsi}
            onclick={() => showRsi = !showRsi}
          >RSI</button>
          <button
            class="chart-toggle"
            class:active={showMacd}
            onclick={() => showMacd = !showMacd}
          >MACD</button>
          <button
            class="chart-toggle"
            onclick={() => resetFn?.()}
          >Reset</button>
        </div>
        {#if klines.length === 0}
          <div class="empty-state">Waiting for kline data...</div>
        {:else}
          <ChartView
            {klines}
            {currentKline}
            {indicators}
            {assetPrice}
            {priceToBeat}
            {fillMarkers}
            {showEma}
            {showRsi}
            {showMacd}
            {showMarketLines}
            {currentMarketTs}
            {nextMarketTs}
            {onResetRef}
          />
        {/if}
      {:else}
        <TradingViewChart />
      {/if}
  </div>
</div>
