'use client';

import { useState, useRef, useEffect } from 'react';
import {
  MapPin, Clock, ArrowRight, Navigation, Footprints, Car,
  Star, DollarSign, ChevronRight, ChevronDown, Route,
  ExternalLink, Phone, Globe, Clock3,
} from 'lucide-react';
import usePlaybackStore from '@/stores/playbackStore';
import useTripStore from '@/stores/tripStore';
import { getSegmentColor, getCategoryLabel } from '@/lib/colors';
import { formatTime, formatDuration, formatDistance, getDayOfTrip } from '@/lib/time';
import type { StopSegment, TransitSegment } from '@/types/segment';
import { isStopSegment } from '@/types/segment';
import { usePlaceDetails } from '@/hooks/usePlaceDetails';
import type { ReactNode } from 'react';

export default function IntelPanel() {
  const currentSegment = usePlaybackStore((s) => s.currentSegment);
  const currentSegmentIndex = usePlaybackStore((s) => s.currentSegmentIndex);
  const progressInSegment = usePlaybackStore((s) => s.progressInSegment);
  const segments = useTripStore((s) => s.segments);
  const stats = useTripStore((s) => s.stats);
  const trip = useTripStore((s) => s.trip);
  const jumpToSegment = usePlaybackStore((s) => s.jumpToSegment);
  const cursorTime = usePlaybackStore((s) => s.cursorTime);

  if (!currentSegment) return null;

  const tz = trip.timezone;
  const color = getSegmentColor(currentSegment);
  const currentDay = getDayOfTrip(cursorTime, stats.tripStartTime, tz);
  const photoQuery = currentSegment.details.photo_query;

  const categoryLabel = isStopSegment(currentSegment)
    ? getCategoryLabel(currentSegment.category)
    : currentSegment.type === 'drive'
      ? 'Driving'
      : 'Walking';

  // Day summary
  const daySegments = segments.filter(
    (s) => getDayOfTrip(s.startTime, stats.tripStartTime, tz) === currentDay
  );
  const dayStops = daySegments.filter((s) => s.type === 'stop').length;
  const dayDriving = daySegments
    .filter((s): s is TransitSegment => s.type === 'drive')
    .reduce((sum, s) => sum + s.distance_meters, 0);
  const dayWalking = daySegments
    .filter((s): s is TransitSegment => s.type === 'walk')
    .reduce((sum, s) => sum + s.distance_meters, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Scrollable content — everything scrolls */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        {/* Photo carousel */}
        <PhotoCarousel query={photoQuery} fallbackUrl={currentSegment.details.photos?.[0]} title={currentSegment.title} />

        {/* Title + time block */}
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h2 className="text-heading text-lg font-bold leading-snug">
              {currentSegment.title}
            </h2>
            <span className="text-[10px] font-mono text-dim mt-1 shrink-0">
              {currentSegmentIndex + 1}/{segments.length}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1.5">
            <span
              className="text-[10px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded-sm"
              style={{ backgroundColor: `${color}15`, color, border: `1px solid ${color}25` }}
            >
              {categoryLabel}
            </span>
            <span className="text-dim text-[10px]">·</span>
            <span className="text-[13px] font-mono text-muted">
              {formatTime(currentSegment.startTime, tz)}
            </span>
            <span className="text-dim text-xs">–</span>
            <span className="text-[13px] font-mono text-muted">
              {formatTime(currentSegment.endTime, tz)}
            </span>
            <span className="text-dim text-[10px]">·</span>
            <span className="text-[13px] font-mono text-primary font-medium">
              {formatDuration(currentSegment.duration_minutes)}
            </span>
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-[3px] bg-white/[0.04] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-100"
              style={{ width: `${progressInSegment * 100}%`, backgroundColor: color }}
            />
          </div>

          {/* Notes — pinned directly under the title/time block */}
          {currentSegment.details.notes && (
            <div className="mt-3">
              <SectionLabel label="Notes" />
              <div className="mt-2 px-3 py-2.5 bg-white/[0.02] rounded-sm border border-white/[0.04] text-[13px] text-muted italic leading-relaxed">
                {currentSegment.details.notes}
              </div>
            </div>
          )}
        </div>

        <div className="h-px bg-white/[0.04]" />

        {/* Main content — Google Places enriched */}
        <div className="px-4 py-3">
          {isStopSegment(currentSegment) ? (
            <StopDetail segment={currentSegment} />
          ) : (
            <TransitDetail segment={currentSegment as TransitSegment} progress={progressInSegment} />
          )}
        </div>

        {/* Google Places details */}
        {photoQuery && <PlaceDetailsSection query={photoQuery} segment={currentSegment} />}

        <div className="h-px bg-white/[0.04]" />

        {/* Day Summary */}
        <div className="px-4 py-3">
          <SectionLabel label={`Day ${currentDay} Summary`} />
          <div className="grid grid-cols-3 gap-2 mt-2">
            <StatBlock icon={<MapPin size={13} />} value={String(dayStops)} label="stops" />
            <StatBlock
              icon={<Car size={13} />}
              value={dayDriving > 0 ? formatDistance(dayDriving) : '—'}
              label="driving"
            />
            <StatBlock
              icon={<Footprints size={13} />}
              value={dayWalking > 0 ? formatDistance(dayWalking) : '—'}
              label="walking"
            />
          </div>
        </div>

        {/* Bottom padding */}
        <div className="h-4" />
      </div>

    </div>
  );
}

// ── Photo Carousel ──────────────────────────────────

function PhotoCarousel({ query, fallbackUrl, title }: { query?: string; fallbackUrl?: string; title: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { details, loading } = usePlaceDetails(query);
  const [failedUrls, setFailedUrls] = useState<Set<string>>(new Set());

  // Reset failed URLs when segment changes
  useEffect(() => { setFailedUrls(new Set()); }, [query]);

  // Build photo URLs: Google Places photos if available, else fallback
  const photoUrls: string[] = [];
  if (details && details.photos.length > 0) {
    details.photos.forEach((name) => {
      photoUrls.push(`/api/places/photo?name=${encodeURIComponent(name)}`);
    });
  } else if (!loading && fallbackUrl) {
    // Only use fallback after loading completes (so we don't flash fallback then replace)
    photoUrls.push(fallbackUrl);
  } else if (!query && fallbackUrl) {
    photoUrls.push(fallbackUrl);
  }

  // Filter out failed URLs
  const validUrls = photoUrls.filter((u) => !failedUrls.has(u));

  // Show loading shimmer while fetching details (only if we expect photos)
  if (loading && query) {
    return <div className="w-full h-48 bg-white/[0.02] animate-pulse" />;
  }

  if (validUrls.length === 0) return null;

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="flex overflow-x-auto snap-x snap-mandatory"
        style={{ scrollbarWidth: 'none' }}
      >
        {validUrls.map((url, i) => (
          <div key={url} className="snap-start shrink-0 w-full h-48 relative bg-white/[0.02]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`${title} photo ${i + 1}`}
              className="w-full h-full object-cover"
              loading={i === 0 ? 'eager' : 'lazy'}
              onError={() => setFailedUrls((prev) => new Set(prev).add(url))}
            />
          </div>
        ))}
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#09090B]/80 to-transparent pointer-events-none" />
      {validUrls.length > 1 && (
        <div className="absolute bottom-2 right-3 px-2 py-0.5 bg-black/60 rounded-sm text-[10px] font-mono text-white/70">
          {validUrls.length} photos — scroll →
        </div>
      )}
    </div>
  );
}

// ── Google Places Details Section ───────────────────

function PlaceDetailsSection({ query, segment }: { query: string; segment: { latitude: number; longitude: number } }) {
  const { details, loading } = usePlaceDetails(query);
  const [hoursOpen, setHoursOpen] = useState(false);

  if (loading) {
    return (
      <div className="px-4 py-3 space-y-2">
        <div className="h-3 w-24 bg-white/[0.04] rounded animate-pulse" />
        <div className="h-3 w-full bg-white/[0.04] rounded animate-pulse" />
        <div className="h-3 w-3/4 bg-white/[0.04] rounded animate-pulse" />
      </div>
    );
  }

  if (!details) return null;

  const priceLevelMap: Record<string, string> = {
    PRICE_LEVEL_FREE: 'Free',
    PRICE_LEVEL_INEXPENSIVE: '$',
    PRICE_LEVEL_MODERATE: '$$',
    PRICE_LEVEL_EXPENSIVE: '$$$',
    PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
  };

  return (
    <>
      <div className="h-px bg-white/[0.04]" />
      <div className="px-4 py-3 space-y-3">
        <SectionLabel label="Place Info" />

        {/* Editorial summary from Google */}
        {details.editorialSummary && (
          <p className="text-[13px] text-muted leading-relaxed">{details.editorialSummary}</p>
        )}

        {/* Key stats row */}
        <div className="flex items-center gap-3 flex-wrap">
          {details.rating != null && (
            <div className="flex items-center gap-1">
              <Star size={12} className="text-warning fill-warning" />
              <span className="text-[13px] font-semibold text-heading">{details.rating}</span>
              {details.userRatingCount != null && (
                <span className="text-[11px] text-dim">({details.userRatingCount.toLocaleString()})</span>
              )}
            </div>
          )}
          {details.priceLevel && priceLevelMap[details.priceLevel] && (
            <span className="text-[13px] text-success font-mono">{priceLevelMap[details.priceLevel]}</span>
          )}
          {details.openingHours && (
            <span className={`text-[11px] font-semibold ${details.openingHours.openNow ? 'text-success' : 'text-danger'}`}>
              {details.openingHours.openNow ? 'Open now' : 'Closed'}
            </span>
          )}
        </div>

        {/* Detail rows */}
        <div className="space-y-0.5">
          {details.formattedAddress && (
            <DetailRow icon={<MapPin size={12} />} value={details.formattedAddress} />
          )}
          {details.internationalPhoneNumber && (
            <DetailRow icon={<Phone size={12} />} value={details.internationalPhoneNumber} />
          )}
          {details.websiteUri && (
            <DetailRow
              icon={<Globe size={12} />}
              value={
                <a href={details.websiteUri} target="_blank" rel="noopener noreferrer" className="text-info hover:underline break-all">
                  {details.websiteUri.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                </a>
              }
            />
          )}
        </div>

        {/* Opening hours — collapsible */}
        {details.openingHours?.weekdayDescriptions && (
          <div>
            <button
              onClick={() => setHoursOpen(!hoursOpen)}
              className="flex items-center gap-1.5 text-[12px] text-muted hover:text-primary transition-colors"
            >
              <Clock3 size={12} />
              <span>Hours</span>
              <ChevronDown size={10} className={`transition-transform ${hoursOpen ? '' : '-rotate-90'}`} />
            </button>
            {hoursOpen && (
              <div className="mt-1.5 pl-5 space-y-0.5">
                {details.openingHours.weekdayDescriptions.map((line, i) => (
                  <p key={i} className="text-[11px] font-mono text-dim">{line}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Google Maps link */}
        {details.googleMapsUri && (
          <a
            href={details.googleMapsUri}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.03] border border-white/[0.06] rounded-sm text-[12px] text-muted hover:text-heading hover:border-white/[0.1] transition-colors"
          >
            <ExternalLink size={12} />
            Open in Google Maps
          </a>
        )}

        {/* Reviews — horizontal scroll */}
        {details.reviews && details.reviews.length > 0 && (
          <div className="pt-1">
            <SectionLabel label="Reviews" />
            <div
              className="flex gap-2 mt-2 overflow-x-auto snap-x snap-mandatory pb-1"
              style={{ scrollbarWidth: 'none' }}
            >
              {details.reviews.map((review, i) => (
                <div
                  key={i}
                  className="snap-start shrink-0 w-[280px] px-3 py-2.5 bg-white/[0.02] rounded-sm border border-white/[0.03]"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, s) => (
                        <Star
                          key={s}
                          size={10}
                          className={s < review.rating ? 'text-warning fill-warning' : 'text-dim'}
                        />
                      ))}
                    </div>
                    <span className="text-[11px] text-dim">{review.relativePublishTimeDescription}</span>
                  </div>
                  <p className="text-[12px] text-muted leading-relaxed line-clamp-4">{review.text}</p>
                  <p className="text-[10px] text-dim mt-1.5">— {review.authorName}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── Stop Detail (seed data fields) ──────────────────

function StopDetail({ segment }: { segment: StopSegment }) {
  const d = segment.details;
  return (
    <div className="space-y-2">
      {d.description && (
        <p className="text-[13px] text-primary leading-relaxed">{d.description}</p>
      )}
      <div className="space-y-0.5">
        {d.cuisine && <DetailRow icon={null} label="Cuisine" value={d.cuisine} />}
        {d.trail_difficulty && (
          <DetailRow icon={<Route size={12} className="text-activity" />} label="Difficulty" value={d.trail_difficulty} />
        )}
        {d.confirmation_number && (
          <DetailRow icon={null} label="Confirmation" value={<span className="font-mono text-[12px]">{d.confirmation_number}</span>} />
        )}
      </div>
    </div>
  );
}

// ── Transit Detail ──────────────────────────────────

function TransitDetail({ segment, progress }: { segment: TransitSegment; progress: number }) {
  const remaining = segment.duration_minutes - Math.round(segment.duration_minutes * progress);
  const distanceCovered = Math.round(segment.distance_meters * progress);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[13px]">
        <span className="text-muted truncate">{segment.title.split('→')[0]?.trim() || 'Origin'}</span>
        <ArrowRight size={12} className="text-dim shrink-0" />
        <span className="text-primary truncate">{segment.title.split('→')[1]?.trim() || 'Destination'}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <StatBlock icon={<Clock size={13} />} value={formatDuration(remaining)} label="remaining" />
        <StatBlock
          icon={<Navigation size={13} />}
          value={formatDistance(segment.distance_meters)}
          label="total"
        />
      </div>
      {segment.distance_meters > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-dim">
          <span className="font-mono">{formatDistance(distanceCovered)}</span>
          <span>covered</span>
          <div className="flex-1 h-px bg-white/[0.04]" />
          <span className="font-mono">{formatDistance(segment.distance_meters - distanceCovered)}</span>
          <span>to go</span>
        </div>
      )}
    </div>
  );
}

// ── Shared Components ───────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-widest text-dim">{label}</span>
  );
}

function DetailRow({ icon, label, value }: { icon?: ReactNode; label?: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-1 text-[13px] min-w-0">
      {label && <span className="text-dim shrink-0">{label}</span>}
      <span className="flex-1 min-w-0 text-primary break-words overflow-hidden">{value}</span>
      {icon && <span className="shrink-0 mt-0.5 text-dim">{icon}</span>}
    </div>
  );
}

function StatBlock({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <div className="px-2 py-2 bg-white/[0.02] rounded-sm border border-white/[0.03] text-center">
      <div className="flex items-center justify-center gap-1 text-dim mb-0.5">{icon}</div>
      <p className="text-heading text-[13px] font-semibold font-mono">{value}</p>
      <p className="text-dim text-[9px] uppercase tracking-widest">{label}</p>
    </div>
  );
}
