// Duplicated from src/lib/market-time.ts so Pages Functions can build the
// Polymarket slug without bundling Svelte code from src/.

export type Asset = 'BTC' | 'ETH' | 'SOL' | 'XRP';
export type Timeframe = '5m' | '15m' | '1h' | '4h' | 'daily';

export function durationSeconds(timeframe: Timeframe): number {
  switch (timeframe) {
    case '5m': return 300;
    case '15m': return 900;
    case '1h': return 3600;
    case '4h': return 14400;
    case 'daily': return 86400;
  }
}

function datePartsET(ms: number) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? '0');
  const hour = get('hour');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: hour === 24 ? 0 : hour,
    minute: get('minute'),
    second: get('second'),
  };
}

function assetFullName(asset: Asset): string {
  switch (asset) {
    case 'BTC': return 'bitcoin';
    case 'ETH': return 'ethereum';
    case 'SOL': return 'solana';
    case 'XRP': return 'xrp';
  }
}

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

export function buildMarketSlug(asset: Asset, timeframe: Timeframe, timestamp: number): string {
  const assetLower = asset.toLowerCase();
  switch (timeframe) {
    case '5m':
      return `${assetLower}-updown-5m-${timestamp}`;
    case '15m':
      return `${assetLower}-updown-15m-${timestamp}`;
    case '4h':
      return `${assetLower}-updown-4h-${timestamp}`;
    case '1h': {
      const et = datePartsET(timestamp * 1000);
      const month = MONTH_NAMES[et.month - 1];
      const day = et.day;
      const hour = et.hour;
      let hour12: number;
      let ampm: string;
      if (hour === 0) { hour12 = 12; ampm = 'am'; }
      else if (hour < 12) { hour12 = hour; ampm = 'am'; }
      else if (hour === 12) { hour12 = 12; ampm = 'pm'; }
      else { hour12 = hour - 12; ampm = 'pm'; }
      return `${assetFullName(asset)}-up-or-down-${month}-${day}-${hour12}${ampm}-et`;
    }
    case 'daily': {
      const endTs = timestamp + 86400;
      const et = datePartsET(endTs * 1000);
      const month = MONTH_NAMES[et.month - 1];
      return `${assetFullName(asset)}-up-or-down-on-${month}-${et.day}`;
    }
  }
}

export function isValidAsset(s: string | null): s is Asset {
  return s === 'BTC' || s === 'ETH' || s === 'SOL' || s === 'XRP';
}

export function isValidTimeframe(s: string | null): s is Timeframe {
  return s === '5m' || s === '15m' || s === '1h' || s === '4h' || s === 'daily';
}
