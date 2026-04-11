<script lang="ts">
  import type { Asset, Timeframe } from '../types';

  let { asset, timeframe, onAssetChange, onTimeframeChange }: {
    asset: Asset;
    timeframe: Timeframe;
    onAssetChange: (a: Asset) => void;
    onTimeframeChange: (t: Timeframe) => void;
  } = $props();

  const assets: Asset[] = ['BTC', 'ETH', 'SOL', 'XRP'];
  const timeframes: { value: Timeframe; label: string }[] = [
    { value: '5m', label: '5m' },
    { value: '15m', label: '15m' },
    { value: '1h', label: '1h' },
    { value: '4h', label: '4h' },
    { value: 'daily', label: 'Daily' },
  ];
</script>

<div class="selector-bar">
  <div class="selector-group">
    {#each assets as a}
      <button
        class="selector-btn asset-btn"
        class:active={a === asset}
        onclick={() => onAssetChange(a)}
      >
        <img src="/assets/{a.toLowerCase()}.png" alt={a} class="selector-icon" />
        {a}
      </button>
    {/each}
  </div>

  <div class="selector-divider"></div>

  <div class="selector-group">
    {#each timeframes as tf}
      <button
        class="selector-btn tf-btn"
        class:active={tf.value === timeframe}
        onclick={() => onTimeframeChange(tf.value)}
      >
        {tf.label}
      </button>
    {/each}
  </div>
</div>

<style>
  .selector-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: #161625;
    border-bottom: 1px solid #2a2a3e;
  }

  .selector-group {
    display: flex;
    gap: 4px;
  }

  .selector-divider {
    width: 1px;
    height: 24px;
    background: #2a2a3e;
    margin: 0 4px;
  }

  .selector-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border: 1px solid #2a2a3e;
    border-radius: 4px;
    background: transparent;
    color: #8b949e;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .selector-btn:hover {
    background: #1e1e35;
    color: #c9d1d9;
  }

  .selector-btn.active {
    background: #1e3a5f;
    border-color: #388bfd;
    color: #e6edf3;
  }

  .selector-icon {
    width: 16px;
    height: 16px;
    border-radius: 50%;
  }
</style>
