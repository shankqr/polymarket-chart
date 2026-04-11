import type { Time } from 'lightweight-charts';

/** Returns the US Eastern Time offset from UTC in seconds (negative = behind UTC). */
export function getETOffsetSec(ms: number): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  });
  const parts = fmt.formatToParts(new Date(ms));
  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value;
  // EDT = UTC-4, EST = UTC-5
  return tzName === 'EDT' ? -4 * 3600 : -5 * 3600;
}

/**
 * Convert kline open_time_ms (UTC) to a LWC Time adjusted to US Eastern Time.
 * Lightweight Charts renders Unix timestamps as UTC, so we shift by the ET offset
 * (EST = -5h, EDT = -4h) so the axis reads in Eastern.
 */
export function klineToTime(ms: number): Time {
  const utcSec = ms / 1000;
  const etOffsetSec = getETOffsetSec(ms);
  return (utcSec + etOffsetSec) as Time;
}
