'use client';

import { useRef, useCallback } from 'react';
import { X, FileDown, Copy, Check, MapPin, Car, Footprints, Clock, Star, DollarSign } from 'lucide-react';
import { useState } from 'react';
import useTripStore from '@/stores/tripStore';
import { getSegmentColor, getCategoryLabel } from '@/lib/colors';
import { formatTime, formatDuration, formatDistance, getDayOfTrip } from '@/lib/time';
import { isStopSegment, isTransitSegment } from '@/types/segment';
import type { Segment, StopSegment, TransitSegment } from '@/types/segment';

export default function ItineraryModal({ onClose }: { onClose: () => void }) {
  const trip = useTripStore((s) => s.trip);
  const segments = useTripStore((s) => s.segments);
  const stats = useTripStore((s) => s.stats);
  const contentRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  if (!trip || !stats) return null;
  const tz = trip.timezone;

  // Group segments by day
  const days: { day: number; label: string; segments: Segment[] }[] = [];
  const dayNames = ['Thursday', 'Friday', 'Saturday'];
  for (let d = 1; d <= stats.totalDays; d++) {
    const daySegs = segments.filter(
      (s) => getDayOfTrip(s.startTime, stats.tripStartTime, tz) === d
    );
    days.push({ day: d, label: `Day ${d} - ${dayNames[d - 1]}, Jun ${10 + d}`, segments: daySegs });
  }

  const buildPlainText = useCallback(() => {
    let text = `${trip.title}\n`;
    text += `${trip.description}\n`;
    text += `${'='.repeat(50)}\n\n`;

    for (const day of days) {
      text += `${day.label}\n`;
      text += `${'-'.repeat(40)}\n`;

      for (const seg of day.segments) {
        const time = `${formatTime(seg.startTime, tz)} - ${formatTime(seg.endTime, tz)}`;
        const dur = formatDuration(seg.duration_minutes);

        if (isStopSegment(seg)) {
          text += `\n  ${seg.title}\n`;
          text += `  ${time} (${dur})\n`;
          text += `  Type: ${getCategoryLabel(seg.category)}\n`;
          if (seg.details.description) text += `  ${seg.details.description}\n`;
          if (seg.details.address) text += `  Address: ${seg.details.address}\n`;
          if (seg.details.rating) text += `  Rating: ${seg.details.rating}/5\n`;
          if (seg.details.cuisine) text += `  Cuisine: ${seg.details.cuisine}\n`;
          if (seg.details.confirmation_number) text += `  Confirmation: ${seg.details.confirmation_number}\n`;
          if (seg.details.notes) text += `  Notes: ${seg.details.notes}\n`;
        } else if (isTransitSegment(seg)) {
          const mode = seg.type === 'drive' ? 'Drive' : 'Walk';
          text += `\n  ${mode}: ${seg.title}\n`;
          text += `  ${time} (${dur}) - ${formatDistance(seg.distance_meters)}\n`;
        }
      }
      text += '\n';
    }

    text += `${'='.repeat(50)}\n`;
    text += `Total: ${stats.totalStops} stops, ${formatDistance(stats.totalDrivingDistance)} driving, ${formatDistance(stats.totalWalkingDistance)} walking\n`;

    return text;
  }, [days, trip, stats, tz]);

  const handleCopy = useCallback(async () => {
    const text = buildPlainText();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [buildPlainText]);

  const handleExportPdf = useCallback(() => {
    // Open the itinerary content in a new window for printing as PDF
    const text = buildPlainText();
    const html = `<!DOCTYPE html>
<html>
<head>
  <title>${trip.title} - Itinerary</title>
  <style>
    body { font-family: 'Segoe UI', system-ui, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.6; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    .subtitle { color: #666; font-size: 14px; margin-bottom: 24px; }
    .day-header { font-size: 18px; font-weight: 600; margin-top: 32px; padding-bottom: 8px; border-bottom: 2px solid #e5e5e5; }
    .segment { margin: 16px 0; padding: 12px 16px; border-left: 3px solid #ddd; }
    .segment.stop { border-left-color: var(--color); }
    .segment.drive { border-left-color: #3B82F6; }
    .segment.walk { border-left-color: #22C55E; }
    .seg-title { font-size: 15px; font-weight: 600; }
    .seg-time { font-size: 13px; color: #666; font-family: monospace; }
    .seg-detail { font-size: 13px; color: #555; margin-top: 4px; }
    .seg-note { font-size: 13px; color: #777; font-style: italic; margin-top: 4px; padding: 8px; background: #f9f9f9; border-radius: 4px; }
    .badge { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 3px; background: #f0f0f0; color: #555; text-transform: uppercase; letter-spacing: 0.5px; }
    .stats { margin-top: 32px; padding-top: 16px; border-top: 2px solid #e5e5e5; font-size: 14px; color: #666; }
    @media print { body { margin: 20px; } }
  </style>
</head>
<body>
  <h1>${trip.title}</h1>
  <p class="subtitle">${trip.description}</p>
  ${days.map((day) => `
    <h2 class="day-header">${day.label}</h2>
    ${day.segments.map((seg) => {
      const color = getSegmentColor(seg);
      const time = `${formatTime(seg.startTime, tz)} - ${formatTime(seg.endTime, tz)}`;
      const dur = formatDuration(seg.duration_minutes);

      if (isStopSegment(seg)) {
        return `<div class="segment stop" style="--color: ${color}; border-left-color: ${color}">
          <div class="seg-title">${seg.title}</div>
          <div class="seg-time">${time} &middot; ${dur}</div>
          <span class="badge" style="background: ${color}15; color: ${color}">${getCategoryLabel(seg.category)}</span>
          ${seg.details.description ? `<div class="seg-detail">${seg.details.description}</div>` : ''}
          ${seg.details.address ? `<div class="seg-detail">📍 ${seg.details.address}</div>` : ''}
          ${seg.details.rating ? `<div class="seg-detail">★ ${seg.details.rating}/5${seg.details.price_level ? ` · ${'$'.repeat(seg.details.price_level)}` : ''}</div>` : ''}
          ${seg.details.cuisine ? `<div class="seg-detail">Cuisine: ${seg.details.cuisine}</div>` : ''}
          ${seg.details.confirmation_number ? `<div class="seg-detail">Confirmation: <code>${seg.details.confirmation_number}</code></div>` : ''}
          ${seg.details.notes ? `<div class="seg-note">${seg.details.notes}</div>` : ''}
        </div>`;
      } else if (isTransitSegment(seg)) {
        const mode = seg.type === 'drive' ? '🚗 Drive' : '🚶 Walk';
        return `<div class="segment ${seg.type}">
          <div class="seg-title">${mode}: ${seg.title}</div>
          <div class="seg-time">${time} &middot; ${dur} &middot; ${formatDistance(seg.distance_meters)}</div>
        </div>`;
      }
      return '';
    }).join('')}
  `).join('')}
  <div class="stats">
    <strong>Trip totals:</strong> ${stats.totalStops} stops &middot; ${formatDistance(stats.totalDrivingDistance)} driving &middot; ${formatDistance(stats.totalWalkingDistance)} walking &middot; ${stats.totalDays} days
  </div>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (win) {
      win.document.write(html);
      win.document.close();
      // Auto-trigger print dialog after a moment
      setTimeout(() => win.print(), 500);
    }
  }, [days, trip, stats, tz]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-[#0c0c0e] border border-white/[0.06] rounded-sm shadow-2xl shadow-black/80 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06] shrink-0">
          <div>
            <h2 className="text-heading text-base font-bold">{trip.title}</h2>
            <p className="text-[12px] text-dim mt-0.5">{trip.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-sm border border-white/[0.06] bg-white/[0.03] text-muted hover:text-heading hover:border-white/[0.1] transition-colors"
            >
              {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={handleExportPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-sm border border-white/[0.06] bg-white/[0.03] text-muted hover:text-heading hover:border-white/[0.1] transition-colors"
            >
              <FileDown size={12} />
              Export PDF
            </button>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-7 h-7 rounded-sm text-dim hover:text-heading hover:bg-white/[0.06] transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto px-5 py-4">
          {days.map((day) => {
            // Day stats
            const dayStops = day.segments.filter((s) => s.type === 'stop').length;
            const dayDriving = day.segments
              .filter((s): s is TransitSegment => s.type === 'drive')
              .reduce((sum, s) => sum + s.distance_meters, 0);

            return (
              <div key={day.day} className="mb-6">
                {/* Day header */}
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/[0.06]">
                  <h3 className="text-heading text-[15px] font-semibold">{day.label}</h3>
                  <span className="text-[11px] font-mono text-dim">
                    {dayStops} stops · {formatDistance(dayDriving)}
                  </span>
                </div>

                {/* Segments */}
                <div className="space-y-1">
                  {day.segments.map((seg) => (
                    <ItinerarySegment key={seg.id} segment={seg} tz={tz} />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Trip totals */}
          <div className="mt-4 pt-4 border-t border-white/[0.06]">
            <div className="flex items-center gap-4 text-[12px] text-dim">
              <span className="flex items-center gap-1"><MapPin size={12} /> {stats.totalStops} stops</span>
              <span className="flex items-center gap-1"><Car size={12} /> {formatDistance(stats.totalDrivingDistance)} driving</span>
              <span className="flex items-center gap-1"><Footprints size={12} /> {formatDistance(stats.totalWalkingDistance)} walking</span>
              <span className="flex items-center gap-1"><Clock size={12} /> {stats.totalDays} days</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ItinerarySegment({ segment, tz }: { segment: Segment; tz: string }) {
  const color = getSegmentColor(segment);
  const time = `${formatTime(segment.startTime, tz)} - ${formatTime(segment.endTime, tz)}`;
  const dur = formatDuration(segment.duration_minutes);

  if (isStopSegment(segment)) {
    return (
      <div className="flex gap-3 py-2 px-3 rounded-sm hover:bg-white/[0.02] transition-colors">
        <div className="w-1 shrink-0 rounded-full mt-1" style={{ backgroundColor: color, minHeight: 24 }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[13px] font-semibold text-heading">{segment.title}</span>
            <span
              className="text-[9px] font-semibold uppercase tracking-widest px-1.5 py-0.5 rounded-sm shrink-0"
              style={{ backgroundColor: `${color}15`, color }}
            >
              {getCategoryLabel(segment.category)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-dim">
            <span>{time}</span>
            <span>·</span>
            <span>{dur}</span>
            {segment.details.rating != null && (
              <>
                <span>·</span>
                <span className="flex items-center gap-0.5">
                  <Star size={9} className="text-warning fill-warning" />
                  {segment.details.rating}
                </span>
              </>
            )}
            {segment.details.price_level != null && (
              <>
                <span>·</span>
                <span className="text-success">{'$'.repeat(segment.details.price_level)}</span>
              </>
            )}
          </div>
          {segment.details.description && (
            <p className="text-[12px] text-muted mt-1 leading-relaxed">{segment.details.description}</p>
          )}
          {segment.details.address && (
            <p className="text-[11px] text-dim mt-0.5">📍 {segment.details.address}</p>
          )}
          {segment.details.confirmation_number && (
            <p className="text-[11px] text-dim mt-0.5">Confirmation: <span className="font-mono">{segment.details.confirmation_number}</span></p>
          )}
          {segment.details.notes && (
            <p className="text-[11px] text-muted italic mt-1 px-2 py-1.5 bg-white/[0.02] rounded-sm border border-white/[0.03]">
              {segment.details.notes}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (isTransitSegment(segment)) {
    const icon = segment.type === 'drive' ? '🚗' : '🚶';
    return (
      <div className="flex gap-3 py-1.5 px-3 text-[12px] text-dim">
        <div className="w-1 shrink-0" />
        <span>{icon}</span>
        <span>{segment.title}</span>
        <span className="font-mono">{dur}</span>
        <span>·</span>
        <span className="font-mono">{formatDistance(segment.distance_meters)}</span>
      </div>
    );
  }

  return null;
}
