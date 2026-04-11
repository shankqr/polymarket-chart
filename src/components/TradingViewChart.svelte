<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createTvEmbedWidget } from '../lib/chart/tradingview';

  let containerEl: HTMLDivElement;
  let loading = $state(true);
  let error = $state<string | null>(null);

  onMount(() => {
    try {
      createTvEmbedWidget(containerEl);
      loading = false;
    } catch (e: any) {
      error = e?.message ?? 'Failed to load TradingView widget';
      loading = false;
    }
  });

  onDestroy(() => {
    if (containerEl) containerEl.innerHTML = '';
  });
</script>

<div class="tv-chart-wrapper">
  {#if loading}
    <div class="empty-state">Loading TradingView...</div>
  {:else if error}
    <div class="empty-state">{error}</div>
  {/if}
  <div bind:this={containerEl} class="tv-container" class:hidden={loading || !!error}></div>
</div>

<style>
  .tv-chart-wrapper {
    width: 100%;
    height: 100%;
    min-height: 400px;
    position: relative;
  }
  .tv-container {
    width: 100%;
    height: 100%;
  }
  .tv-container.hidden {
    display: none;
  }
</style>
