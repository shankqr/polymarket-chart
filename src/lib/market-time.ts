// Market timestamp calculation and slug building — ported from Rust src/utils.rs
// All market boundaries are aligned to Eastern Time (ET).

import type { Asset, Timeframe } from '../types';

/** Duration of each market timeframe in seconds. */
export function durationSeconds(timeframe: Timeframe): number {
  switch (timeframe) {
    case '5m': return 5 * 60;
    case '15m': return 15 * 60;
    case '1h': return 60 * 60;
    case '4h': return 4 * 60 * 60;
    case 'daily': return 24 * 60 * 60;
  }
}

/** Get current ET date/time components using Intl.DateTimeFormat. */
function nowET(): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') === 24 ? 0 : get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/**
 * Convert an ET date/time to a Unix timestamp.
 * Uses a temporary Date object and iterative correction to handle DST.
 */
function etToUnix(year: number, month: number, day: number, hour: number, minute: number, second: number = 0): number {
  // Create a UTC date, then adjust for ET offset
  // First guess: assume EST (-5)
  const guess = Date.UTC(year, month - 1, day, hour + 5, minute, second) / 1000;

  // Check what the actual ET offset is at that moment
  const actualET = datePartsET(guess * 1000);
  let diffHours = hour - actualET.hour;
  // Handle day boundary wrap (e.g., target=23, actual=0 → diff should be -1, not 23)
  if (diffHours > 12) diffHours -= 24;
  if (diffHours < -12) diffHours += 24;
  const diffMinutes = minute - actualET.minute;

  // Adjust
  return guess + diffHours * 3600 + diffMinutes * 60;
}

/** Get ET date/time components from a Unix timestamp (ms). */
function datePartsET(ms: number): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(ms));

  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') === 24 ? 0 : get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** Calculate the next market boundary timestamp (Unix seconds). */
export function nextMarketTimestamp(timeframe: Timeframe): number {
  const et = nowET();

  switch (timeframe) {
    case '5m': {
      const nextMin = (Math.floor(et.minute / 5) + 1) * 5;
      if (nextMin < 60) {
        return etToUnix(et.year, et.month, et.day, et.hour, nextMin);
      } else {
        const nextHour = et.hour + 1;
        if (nextHour < 24) {
          return etToUnix(et.year, et.month, et.day, nextHour, 0);
        } else {
          // Roll to next day
          const tomorrow = new Date(Date.UTC(et.year, et.month - 1, et.day + 1));
          return etToUnix(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate(), 0, 0);
        }
      }
    }

    case '15m': {
      const nextMin = (Math.floor(et.minute / 15) + 1) * 15;
      if (nextMin < 60) {
        return etToUnix(et.year, et.month, et.day, et.hour, nextMin);
      } else {
        const nextHour = et.hour + 1;
        if (nextHour < 24) {
          return etToUnix(et.year, et.month, et.day, nextHour, 0);
        } else {
          const tomorrow = new Date(Date.UTC(et.year, et.month - 1, et.day + 1));
          return etToUnix(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate(), 0, 0);
        }
      }
    }

    case '1h': {
      const nextHour = et.hour + 1;
      if (nextHour < 24) {
        return etToUnix(et.year, et.month, et.day, nextHour, 0);
      } else {
        const tomorrow = new Date(Date.UTC(et.year, et.month - 1, et.day + 1));
        return etToUnix(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate(), 0, 0);
      }
    }

    case '4h': {
      const next4h = (Math.floor(et.hour / 4) + 1) * 4;
      if (next4h < 24) {
        return etToUnix(et.year, et.month, et.day, next4h, 0);
      } else {
        const tomorrow = new Date(Date.UTC(et.year, et.month - 1, et.day + 1));
        return etToUnix(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate(), 0, 0);
      }
    }

    case 'daily': {
      if (et.hour < 12) {
        return etToUnix(et.year, et.month, et.day, 12, 0);
      } else {
        const tomorrow = new Date(Date.UTC(et.year, et.month - 1, et.day + 1));
        return etToUnix(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate(), 12, 0);
      }
    }
  }
}

/** Calculate the current market's start timestamp. */
export function currentMarketTimestamp(timeframe: Timeframe): number {
  return nextMarketTimestamp(timeframe) - durationSeconds(timeframe);
}

/** Map asset code to full name for slug building. */
export function assetFullName(asset: Asset): string {
  switch (asset) {
    case 'BTC': return 'bitcoin';
    case 'ETH': return 'ethereum';
    case 'SOL': return 'solana';
    case 'XRP': return 'xrp';
  }
}

/** Map asset to Binance trading pair symbol. */
export function binanceSymbol(asset: Asset): string {
  return `${asset}USDT`;
}

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/** Build the Polymarket market slug for a given asset, timeframe, and start timestamp. */
export function buildMarketSlug(asset: Asset, timeframe: Timeframe, timestamp: number): string {
  const assetLower = asset.toLowerCase();

  switch (timeframe) {
    case '5m':
      return `${assetLower}-updown-5m-${timestamp}`;

    case '15m':
      return `${assetLower}-updown-15m-${timestamp}`;

    case '1h': {
      // Format: bitcoin-up-or-down-january-16-4am-et
      const et = datePartsET(timestamp * 1000);
      const month = MONTH_NAMES[et.month - 1];
      const day = et.day;
      const hour = et.hour;

      let hour12: number;
      let ampm: string;
      if (hour === 0) {
        hour12 = 12; ampm = 'am';
      } else if (hour < 12) {
        hour12 = hour; ampm = 'am';
      } else if (hour === 12) {
        hour12 = 12; ampm = 'pm';
      } else {
        hour12 = hour - 12; ampm = 'pm';
      }

      return `${assetFullName(asset)}-up-or-down-${month}-${day}-${hour12}${ampm}-et`;
    }

    case '4h':
      return `${assetLower}-updown-4h-${timestamp}`;

    case 'daily': {
      // Slug uses END date (start + 24h)
      const endTs = timestamp + 24 * 60 * 60;
      const et = datePartsET(endTs * 1000);
      const month = MONTH_NAMES[et.month - 1];
      const day = et.day;

      return `${assetFullName(asset)}-up-or-down-on-${month}-${day}`;
    }
  }
}

/** Build the Binance klines URL for fetching price-to-beat.
 *  Routed through the Cloudflare Pages proxy to bypass networks that block
 *  api.binance.com directly (mobile carriers, smart TVs). */
export function binancePtbUrl(asset: Asset, timestamp: number, timeframe: Timeframe): string {
  const symbol = binanceSymbol(asset);
  const interval = timeframe === 'daily' ? '1d' : '1h';
  return `/api/binance/api/v3/klines?symbol=${symbol}&interval=${interval}&startTime=${timestamp * 1000}&limit=1`;
}
