<script lang="ts">
  import type { ClobPriceData, CandleResult } from '../types';

  let {
    marketTitle,
    asset,
    assetPrice,
    priceToBeat,
    currentMarketTs,
    timeRemaining,
    currentUp,
    currentDown,
    previousCandles,
    chartEngine = 'lwc',
    onToggleEngine = () => {},
    onSetPtb = (_v: number | null) => {},
    hasManualPtb = false,
    hasScrapedPtb = false,
    binanceConnected,
    clobConnected,
    marketConnected,
  }: {
    marketTitle: string;
    asset: string | null;
    assetPrice: number | null;
    priceToBeat: number | null;
    currentMarketTs: number | null;
    timeRemaining: number;
    currentUp: ClobPriceData;
    currentDown: ClobPriceData;
    previousCandles: CandleResult[];
    chartEngine?: 'lwc' | 'tv';
    onToggleEngine?: () => void;
    onSetPtb?: (value: number | null) => void;
    hasManualPtb?: boolean;
    hasScrapedPtb?: boolean;
    binanceConnected: boolean;
    clobConnected: boolean;
    marketConnected: boolean;
  } = $props();

  let ptbInput = $state('');
  let ptbSaving = $state(false);
  let ptbEditing = $state(false);

  function startPtbEdit() {
    ptbInput = priceToBeat !== null ? formatPrice(priceToBeat, asset).replace('$', '').replace(/,/g, '') : '';
    ptbEditing = true;
  }

  function autoFocus(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  function handlePtbSave() {
    const val = parseFloat(ptbInput.replace(/[$,]/g, ''));
    if (!isNaN(val) && val > 0) {
      ptbSaving = true;
      onSetPtb(val);
      setTimeout(() => { ptbSaving = false; }, 500);
      ptbEditing = false;
    }
  }

  function handlePtbClear() {
    ptbInput = '';
    onSetPtb(null);
    ptbEditing = false;
  }

  function handlePtbKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') handlePtbSave();
    if (e.key === 'Escape') ptbEditing = false;
  }

  function formatPrice(val: number | null, assetName: string | null = null): string {
    if (val === null) return '--';
    const dp = assetName === 'XRP' ? 4 : 2;
    return val >= 1000 ? `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: dp })}` : `$${val.toFixed(dp)}`;
  }

  function formatDelta(assetVal: number | null, ptb: number | null): { text: string; className: string; arrow: string } {
    if (assetVal === null || ptb === null) return { text: '--', className: '', arrow: '' };
    const n = assetVal - ptb;
    return {
      text: '$' + Math.abs(n).toFixed(0),
      className: n > 0 ? 'positive' : n < 0 ? 'negative' : '',
      arrow: n > 0 ? '\u25B2' : n < 0 ? '\u25BC' : '',
    };
  }

  function formatMarketWindowET(startTs: number | null, remainingSecs: number): string | null {
    if (!startTs || remainingSecs <= 0) return null;
    const nowSecs = Date.now() / 1000;
    const totalDuration = Math.round((nowSecs - startTs) + remainingSecs);
    const endTs = startTs + totalDuration;
    const dateOpts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', timeZone: 'America/New_York' };
    const timeOpts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' };
    const dateStr = new Date(startTs * 1000).toLocaleString('en-US', dateOpts);
    const startTime = new Date(startTs * 1000).toLocaleString('en-US', timeOpts);
    const endTime = new Date(endTs * 1000).toLocaleString('en-US', timeOpts);
    const startPeriod = startTime.slice(-2);
    const endPeriod = endTime.slice(-2);
    const startDisplay = startPeriod === endPeriod ? startTime.slice(0, -3) : startTime;
    return `${dateStr}, ${startDisplay}-${endTime} ET`;
  }

  let delta = $derived(formatDelta(assetPrice, priceToBeat));
  let mins = $derived(timeRemaining > 0 ? Math.floor(timeRemaining / 60) : null);
  let remSecs = $derived(timeRemaining > 0 ? timeRemaining % 60 : null);
  let subtitle = $derived(formatMarketWindowET(currentMarketTs, timeRemaining));
</script>

<div class="header">
  <!-- Row 1: Title + status -->
  <div class="header-row1">
    <div class="header-identity">
      <div class="header-title-line">
        {#if asset}
          <img src="/assets/{asset.toLowerCase()}.png" alt={asset} class="asset-logo" />
        {/if}
        <span class="market-title">{marketTitle}</span>
        <span class="conn-dots">
          <span class="conn-dot" class:connected={marketConnected} class:disconnected={!marketConnected} title="Gamma API"></span>
          <span class="conn-dot" class:connected={binanceConnected} class:disconnected={!binanceConnected} title="Binance"></span>
          <span class="conn-dot" class:connected={clobConnected} class:disconnected={!clobConnected} title="CLOB"></span>
        </span>
        {#if previousCandles && previousCandles.length > 0}
          <span class="prev-candles">
            {#each previousCandles as candle}
              {#if candle !== 'Unknown'}
                <span class="candle-dot {candle === 'Up' ? 'up' : 'down'}">
                  {candle === 'Up' ? 'UP' : 'DN'}
                </span>
              {/if}
            {/each}
          </span>
        {/if}
      </div>
      {#if subtitle}
        <div class="header-subtitle">
          <span>{subtitle}</span>
          <button
            class="chart-toggle tv-toggle"
            class:active={chartEngine === 'tv'}
            onclick={onToggleEngine}
          >
            {chartEngine === 'tv' ? 'TradingView' : 'Lightweight'}
          </button>
        </div>
      {/if}
    </div>
  </div>

  <!-- Row 2: Price blocks + countdown -->
  <div class="header-row2">
    <div class="price-block">
      <div class="price-label">
        PRICE TO BEAT
        {#if hasManualPtb}<span class="manual-badge">MANUAL</span>{:else if hasScrapedPtb}<span class="poly-badge">POLY</span>{/if}
      </div>
      {#if ptbEditing}
        <div class="ptb-inline-edit">
          <input
            type="text"
            class="ptb-input"
            placeholder="Set PTB"
            bind:value={ptbInput}
            onkeydown={handlePtbKeydown}
            use:autoFocus
          />
          <button class="ptb-btn" onclick={handlePtbSave} disabled={ptbSaving}>
            {ptbSaving ? '...' : 'Set'}
          </button>
          {#if hasManualPtb}
            <button class="ptb-btn ptb-clear" onclick={handlePtbClear}>X</button>
          {/if}
        </div>
      {:else}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="price-value ptb-clickable" onclick={startPtbEdit}>
          {formatPrice(priceToBeat, asset)}
        </div>
      {/if}
    </div>

    <div class="price-block">
      <div class="price-label">CURRENT PRICE</div>
      <div class="price-value current">{formatPrice(assetPrice, asset)}</div>
    </div>

    <div class="price-block clob-block">
      <div class="market-prices">
        {#if delta.arrow}
          <span class="delta-inline {delta.className}">{delta.arrow} {delta.text}</span>
        {/if}
        <span class="clob-price up">
          Up: <strong>{currentUp.mid ? `${Math.round(parseFloat(currentUp.mid) * 100)}\u00A2` : '--'}</strong>
        </span>
        <span class="clob-price down">
          Down: <strong>{currentDown.mid ? `${Math.round(parseFloat(currentDown.mid) * 100)}\u00A2` : '--'}</strong>
        </span>
      </div>
    </div>

    <div class="countdown-block">
      {#if mins !== null && remSecs !== null}
        <div class="countdown-unit">
          <span class="countdown-number">{mins}</span>
          <span class="countdown-label">MINS</span>
        </div>
        <div class="countdown-unit">
          <span class="countdown-number">{remSecs.toString().padStart(2, '0')}</span>
          <span class="countdown-label">SECS</span>
        </div>
      {:else}
        <div class="countdown-unit">
          <span class="countdown-number">--</span>
          <span class="countdown-label">TIME</span>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .conn-dots {
    display: inline-flex;
    gap: 3px;
    margin-left: 6px;
  }
  .conn-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    display: inline-block;
  }
  .conn-dot.connected {
    background: #47C482;
    box-shadow: 0 0 4px #47C482;
  }
  .conn-dot.disconnected {
    background: #E64B4B;
  }
  .manual-badge {
    font-size: 7px;
    background: #C4922A;
    color: #000;
    padding: 0 4px;
    border-radius: 2px;
    font-weight: 700;
    margin-left: 4px;
  }
  .poly-badge {
    font-size: 7px;
    background: #2A6BC4;
    color: #fff;
    padding: 0 4px;
    border-radius: 2px;
    font-weight: 700;
    margin-left: 4px;
  }
  .ptb-inline-edit {
    display: flex;
    align-items: center;
    gap: 3px;
  }
  .ptb-clickable {
    cursor: pointer;
    border-bottom: 1px dashed var(--text-dim);
  }
  .ptb-clickable:hover {
    color: var(--cyan);
    border-bottom-color: var(--cyan);
  }
  .ptb-input {
    width: 80px;
    background: #1c2128;
    border: 1px solid #30363d;
    color: #e6edf3;
    font-size: 9px;
    padding: 2px 5px;
    border-radius: 3px;
    font-family: inherit;
    outline: none;
  }
  .ptb-input:focus {
    border-color: #58a6ff;
  }
  .ptb-btn {
    background: #1c2128;
    border: 1px solid #30363d;
    color: #8b949e;
    font-size: 8px;
    padding: 2px 6px;
    border-radius: 3px;
    cursor: pointer;
    font-family: inherit;
    font-weight: 600;
  }
  .ptb-btn:hover {
    color: #e6edf3;
    border-color: #58a6ff;
  }
  .ptb-clear {
    color: #E64B4B;
  }
  .ptb-clear:hover {
    border-color: #E64B4B;
  }
</style>
