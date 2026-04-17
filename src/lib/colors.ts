import type { Segment, StopCategory } from '@/types/segment';

const CATEGORY_COLORS: Record<StopCategory, string> = {
  meal: '#FBBF24',
  accommodation: '#A78BFA',
  activity: '#FB923C',
  sightseeing: '#60A5FA',
  transit_hub: '#94A3B8',
  errand: '#94A3B8',
  rest: '#64748B',
};

export function getSegmentColor(segment: Segment): string {
  if (segment.type === 'drive') return '#60A5FA';
  if (segment.type === 'walk') return '#34D399';
  if (segment.type === 'stop') return CATEGORY_COLORS[segment.category] || '#94A3B8';
  return '#94A3B8';
}

const CATEGORY_LABELS: Record<StopCategory, string> = {
  meal: 'Meal',
  accommodation: 'Accommodation',
  activity: 'Activity',
  sightseeing: 'Sightseeing',
  transit_hub: 'Transit',
  errand: 'Errand',
  rest: 'Rest',
};

export function getCategoryLabel(category: StopCategory): string {
  return CATEGORY_LABELS[category] || category;
}

export function getSegmentIcon(segment: Segment): string {
  if (segment.type === 'drive') return '🚗';
  if (segment.type === 'walk') return '🚶';
  if (segment.type === 'stop') {
    const icons: Record<StopCategory, string> = {
      meal: '🍽️',
      accommodation: '🏨',
      activity: '🏔️',
      sightseeing: '📸',
      transit_hub: '🚉',
      errand: '📦',
      rest: '☕',
    };
    return icons[segment.category] || '📍';
  }
  return '📍';
}
