import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/**
 * All time display functions accept a timezone (IANA string like 'America/Los_Angeles').
 * This ensures a Yosemite trip always shows Pacific times regardless of where the viewer is.
 */

export function formatTime(ms: number, tz: string): string {
  return formatInTimeZone(new Date(ms), tz, 'h:mm a');
}

export function formatDate(ms: number, tz: string): string {
  return formatInTimeZone(new Date(ms), tz, 'EEE, MMM d');
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatDistance(meters: number): string {
  const miles = meters / 1609.34;
  return miles < 1 ? `${Math.round(miles * 5280)} ft` : `${miles.toFixed(1)} mi`;
}

/**
 * Returns which day of the trip a timestamp falls on (1-indexed),
 * computed in the trip's timezone so day boundaries are consistent.
 */
export function getDayOfTrip(ms: number, tripStartMs: number, tz: string): number {
  const startDateStr = formatInTimeZone(new Date(tripStartMs), tz, 'yyyy-MM-dd');
  const currentDateStr = formatInTimeZone(new Date(ms), tz, 'yyyy-MM-dd');

  const startDay = new Date(startDateStr + 'T00:00:00');
  const currentDay = new Date(currentDateStr + 'T00:00:00');

  return Math.floor((currentDay.getTime() - startDay.getTime()) / 86400000) + 1;
}

/**
 * Returns the midnight timestamp (in UTC ms) for a given day of the trip,
 * computed in the trip's timezone.
 */
export function getDayStartMs(dayNumber: number, tripStartMs: number, tz: string): number {
  const startDateStr = formatInTimeZone(new Date(tripStartMs), tz, 'yyyy-MM-dd');
  const [year, month, day] = startDateStr.split('-').map(Number);

  const targetDate = new Date(year, month - 1, day + dayNumber - 1);
  const targetDateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;

  // Convert midnight in the trip's timezone to UTC
  return fromZonedTime(`${targetDateStr}T00:00:00`, tz).getTime();
}
