<script lang="ts">
  import { onMount } from 'svelte';
  import type { Asset, Timeframe, ClobPriceData } from './types';
  import { createMarketStore } from '$lib/stores/market.svelte';
  import { createPriceStore } from '$lib/stores/price.svelte';
  import { createClobStore } from '$lib/stores/clob.svelte';
  import Header from './components/Header.svelte';
  import AssetTimeframeSelector from './components/AssetTimeframeSelector.svelte';
  import ChartTab from './components/ChartTab.svelte';

  let asset = $state<Asset>('BTC');
  let timeframe = $state<Timeframe>('15m');
  let chartEngine = $state<'lwc' | 'tv'>('lwc');

  const market = createMarketStore();
  const price = createPriceStore();
  const clob = createClobStore();

  let prevTokenUp: string | null = null;
  let prevTokenDown: string | null = null;

  async function initStores() {
    // Init market first to get token IDs
    await market.init(asset, timeframe);

    // Init price store with market start timestamp
    if (market.currentMarketTs !== null) {
      price.init(asset, timeframe, market.currentMarketTs);
    }

    // Init CLOB store with token IDs
    if (market.tokenIdUp && market.tokenIdDown) {
      clob.init(market.tokenIdUp, market.tokenIdDown);
      prevTokenUp = market.tokenIdUp;
      prevTokenDown = market.tokenIdDown;
    }
  }

  // Watch for token ID changes (market rotation)
  $effect(() => {
    const up = market.tokenIdUp;
    const down = market.tokenIdDown;
    if (up && down && (up !== prevTokenUp || down !== prevTokenDown)) {
      clob.init(up, down);
      prevTokenUp = up;
      prevTokenDown = down;

      // Re-init price store on market rotation
      if (market.currentMarketTs !== null) {
        price.init(asset, timeframe, market.currentMarketTs);
      }
    }
  });

  // Update favicon based on asset
  $effect(() => {
    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
    if (link) {
      link.href = `/assets/${asset.toLowerCase()}.png`;
    }
  });

  // Update title from market store
  $effect(() => {
    if (market.marketTitle) {
      document.title = market.marketTitle;
    }
  });

  function onAssetChange(a: Asset) {
    asset = a;
    destroyAndReinit();
  }

  function onTimeframeChange(t: Timeframe) {
    timeframe = t;
    destroyAndReinit();
  }

  function destroyAndReinit() {
    market.destroy();
    price.destroy();
    clob.destroy();
    prevTokenUp = null;
    prevTokenDown = null;
    initStores();
  }

  onMount(() => {
    initStores();
    return () => {
      market.destroy();
      price.destroy();
      clob.destroy();
    };
  });

  // Build CLOB price data objects for header
  let currentUp: ClobPriceData = $derived({
    bid: clob.upBid !== null ? clob.upBid.toString() : null,
    ask: clob.upAsk !== null ? clob.upAsk.toString() : null,
    mid: clob.upMid !== null ? clob.upMid.toString() : null,
    ltp: null,
  });

  let currentDown: ClobPriceData = $derived({
    bid: clob.downBid !== null ? clob.downBid.toString() : null,
    ask: clob.downAsk !== null ? clob.downAsk.toString() : null,
    mid: clob.downMid !== null ? clob.downMid.toString() : null,
    ltp: null,
  });
</script>

<div class="app">
  <AssetTimeframeSelector {asset} {timeframe} {onAssetChange} {onTimeframeChange} />

  <Header
    marketTitle={market.marketTitle}
    {asset}
    assetPrice={price.assetPrice}
    priceToBeat={price.priceToBeat}
    currentMarketTs={market.currentMarketTs}
    timeRemaining={market.timeRemaining}
    {currentUp}
    {currentDown}
    previousCandles={market.previousCandles}
    {chartEngine}
    onToggleEngine={() => chartEngine = chartEngine === 'tv' ? 'lwc' : 'tv'}
    onSetPtb={(v) => price.setManualPtb(asset, timeframe, v)}
    hasManualPtb={price.hasManualPtb}
    hasScrapedPtb={price.hasScrapedPtb}
    binanceConnected={price.connected}
    clobConnected={clob.connected}
    marketConnected={market.connected}
  />

  <div class="tab-content">
    <div style="height: 100%">
      <ChartTab
        klines={price.klines}
        currentKline={price.currentKline}
        indicators={null}
        assetPrice={price.assetPrice}
        priceToBeat={price.priceToBeat}
        fillMarkers={[]}
        currentMarketTs={market.currentMarketTs}
        nextMarketTs={market.nextMarketTs}
        {chartEngine}
      />
    </div>
    {#if !market.connected && !price.connected}
      <div class="empty-state">
        {market.error ?? 'Connecting to data sources...'}
      </div>
    {/if}
  </div>
</div>
