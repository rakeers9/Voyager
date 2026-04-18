'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Crosshair, MapPin, Star, Clock } from 'lucide-react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import usePlaybackStore from '@/stores/playbackStore';
import useTripStore from '@/stores/tripStore';
import useViewStore, { type DayFilter } from '@/stores/viewStore';
import { usePlaceDetails } from '@/hooks/usePlaceDetails';
import { getSegmentColor, getCategoryLabel } from '@/lib/colors';
import { formatTime, formatDuration, getDayOfTrip } from '@/lib/time';
import type { Segment } from '@/types/segment';
import { isStopSegment, isTransitSegment } from '@/types/segment';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const PLAYHEAD_SOURCE = 'playhead-source';
const PLAYHEAD_GLOW = 'playhead-glow';
const STOPS_SOURCE = 'stops-source';
const STOPS_LAYER = 'stops-circles';

/** Compute bearing in degrees from point A to point B */
function computeBearing(lng1: number, lat1: number, lng2: number, lat2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const x = Math.sin(dLng) * Math.cos(phi2);
  const y = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng);
  return (toDeg(Math.atan2(x, y)) + 360) % 360;
}

type MapStyleKey = 'dark' | 'satellite';

const MAP_STYLES: Record<MapStyleKey, string> = {
  dark: 'mapbox://styles/mapbox/dark-v11',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
};

export default function MapViewport({ empty = false, sidebarWidth = 380 }: { empty?: boolean; sidebarWidth?: number } = {}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const isUserInteracting = useRef(false);
  const prevPos = useRef<{ lng: number; lat: number } | null>(null);
  const currentBearing = useRef(0);
  const [mapReady, setMapReady] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyleKey>('dark');
  const appliedStyle = useRef<MapStyleKey>('dark');

  const segments = useTripStore((s) => s.segments);
  const stats = useTripStore((s) => s.stats);
  const tz = useTripStore((s) => s.trip?.timezone ?? 'UTC');
  const dayFilter = useViewStore((s) => s.dayFilter);
  const setDayFilter = useViewStore((s) => s.setDayFilter);
  const [hoverInfo, setHoverInfo] = useState<{ segmentIndex: number; x: number; y: number } | null>(null);

  // Initialize map
  useEffect(() => {
    if (!MAPBOX_TOKEN || !mapContainer.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAP_STYLES.dark,
      center: [-119.5885, 37.749],
      zoom: 7,
      attributionControl: false,
    });

    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('mousedown', () => { isUserInteracting.current = true; });
    map.on('touchstart', () => { isUserInteracting.current = true; });
    map.on('moveend', () => {
      setTimeout(() => { isUserInteracting.current = false; }, 2000);
    });

    const setupLayers = () => {
      if (empty) return;
      const tripStart = useTripStore.getState().stats?.tripStartTime ?? 0;
      const tzNow = useTripStore.getState().trip?.timezone ?? 'UTC';
      addRouteLayers(map, segments, tripStart, tzNow);
      addStopsLayer(map, segments, tripStart, tzNow);
      addPlayheadLayer(map);
    };

    map.on('load', () => {
      setMapReady(true);

      if (!empty && segments.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        segments.forEach((seg) => {
          if (seg.type === 'stop') {
            bounds.extend([seg.longitude, seg.latitude]);
          } else if (isTransitSegment(seg)) {
            seg.routeCoordinates.forEach((coord) => bounds.extend(coord));
          }
        });
        map.fitBounds(bounds, { padding: 60, duration: 0 });
      }
    });

    map.on('style.load', () => {
      setupLayers();
      if (empty) return;
      const { currentPosition, currentSegment } = usePlaybackStore.getState();
      const src = map.getSource(PLAYHEAD_SOURCE) as mapboxgl.GeoJSONSource | undefined;
      if (src) {
        const color = currentSegment ? getSegmentColor(currentSegment) : '#FAFAFA';
        src.setData({
          type: 'Feature',
          properties: { color, bearing: currentBearing.current, isMoving: currentSegment && currentSegment.type !== 'stop' ? 1 : 0 },
          geometry: { type: 'Point', coordinates: [currentPosition.lng, currentPosition.lat] },
        });
      }
    });

    // Click handler for stop circles
    if (!empty) {
      map.on('click', STOPS_LAYER, (e) => {
        const feature = e.features?.[0];
        if (feature && feature.properties) {
          const idx = feature.properties.segmentIndex as number;
          usePlaybackStore.getState().jumpToSegment(idx);
        }
      });
      map.on('mouseenter', STOPS_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', STOPS_LAYER, () => {
        map.getCanvas().style.cursor = '';
        setHoverInfo(null);
      });
      map.on('mousemove', STOPS_LAYER, (e) => {
        const feature = e.features?.[0];
        if (!feature || !feature.properties) return;
        const idx = feature.properties.segmentIndex as number;
        setHoverInfo({ segmentIndex: idx, x: e.point.x, y: e.point.y });
      });
    }

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swap basemap style when toggled. Skip no-op calls — calling setStyle()
  // with the already-active URL still clears custom sources/layers and can
  // silently skip 'style.load', leaving the map empty.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (appliedStyle.current === mapStyle) return;
    appliedStyle.current = mapStyle;
    map.setStyle(MAP_STYLES[mapStyle]);
  }, [mapStyle, mapReady]);

  // Reset day filter when trip changes or selected day no longer exists.
  useEffect(() => {
    if (!stats) return;
    if (dayFilter !== 'all' && (typeof dayFilter !== 'number' || dayFilter > stats.totalDays)) {
      setDayFilter('all');
    }
  }, [stats, dayFilter, setDayFilter]);

  // Apply day filter: layer visibility, stops filter, camera fit, playback bounds.
  useEffect(() => {
    if (!mapReady || empty) return;
    const map = mapRef.current;
    if (!map || !stats || segments.length === 0) return;

    const tripStart = stats.tripStartTime;

    // Compute the day membership and time range of each segment once.
    const segDays = segments.map((seg) =>
      tripStart > 0 ? getDayOfTrip(seg.startTime, tripStart, tz) : 1
    );

    const isAll = dayFilter === 'all';
    const visibleIndices = segments
      .map((_, i) => i)
      .filter((i) => isAll || segDays[i] === dayFilter);

    // Toggle route layers
    segments.forEach((seg, i) => {
      if (seg.type === 'stop') return;
      const layerId = `route-${seg.id}`;
      if (!map.getLayer(layerId)) return;
      const visible = isAll || segDays[i] === dayFilter;
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
    });

    // Filter the stops layer
    if (map.getLayer(STOPS_LAYER)) {
      if (isAll) {
        map.setFilter(STOPS_LAYER, null);
      } else {
        map.setFilter(STOPS_LAYER, ['==', ['get', 'day'], dayFilter]);
      }
    }

    // Refit camera to visible segments
    if (visibleIndices.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      visibleIndices.forEach((i) => {
        const seg = segments[i];
        if (seg.type === 'stop') {
          bounds.extend([seg.longitude, seg.latitude]);
        } else if (isTransitSegment(seg)) {
          seg.routeCoordinates.forEach((coord) => bounds.extend(coord));
        }
      });
      isUserInteracting.current = false;
      map.fitBounds(bounds, { padding: 80, duration: 600 });
    }

    // Narrow playback to the day's range so the scrubber and playhead match.
    // For a specific day, always snap the cursor to its start so pressing
    // play begins from there. For "Full Trip", preserve the user's position.
    const playback = usePlaybackStore.getState();
    if (isAll) {
      const start = segments[0]?.startTime ?? 0;
      const end = segments[segments.length - 1]?.endTime ?? 0;
      playback.setBounds(start, end);
    } else if (visibleIndices.length > 0) {
      const firstIdx = visibleIndices[0];
      const lastIdx = visibleIndices[visibleIndices.length - 1];
      const first = segments[firstIdx];
      const last = segments[lastIdx];
      playback.setBounds(first.startTime, last.endTime, first.startTime);
      // Belt-and-suspenders: also force-jump to the first visible segment.
      // Resets currentSegmentIndex/currentSegment/currentPosition explicitly.
      playback.jumpToSegment(firstIdx);

      // Reset bearing tracking so the arrow doesn't rotate strangely from
      // its old position across the trip.
      prevPos.current = null;
      currentBearing.current = 0;

      // Force an immediate playhead source update — don't wait for the
      // subscriber to fire, so the arrow visibly snaps to the new spot.
      try {
        const playheadSource = map.getSource(PLAYHEAD_SOURCE) as mapboxgl.GeoJSONSource | undefined;
        if (playheadSource) {
          const { currentPosition, currentSegment } = usePlaybackStore.getState();
          const color = currentSegment ? getSegmentColor(currentSegment) : '#FAFAFA';
          const isMoving = currentSegment && currentSegment.type !== 'stop' ? 1 : 0;
          playheadSource.setData({
            type: 'Feature',
            properties: { color, bearing: 0, isMoving },
            geometry: { type: 'Point', coordinates: [currentPosition.lng, currentPosition.lat] },
          });
        }
      } catch {
        /* style transitioning */
      }
    }
  }, [dayFilter, mapReady, empty, segments, stats, tz]);

  // Subscribe to playback updates
  useEffect(() => {
    if (!mapReady || empty) return;

    const unsubscribe = usePlaybackStore.subscribe((state) => {
      const map = mapRef.current;
      if (!map) return;

      const { currentPosition, currentSegment, currentSegmentIndex, isPlaying } = state;
      const lng = currentPosition.lng;
      const lat = currentPosition.lat;

      // Compute bearing from previous position
      const prev = prevPos.current;
      if (prev) {
        const dist = Math.abs(lng - prev.lng) + Math.abs(lat - prev.lat);
        if (dist > 0.0001) {
          currentBearing.current = computeBearing(prev.lng, prev.lat, lng, lat);
        }
      }
      prevPos.current = { lng, lat };

      const isMoving = currentSegment && currentSegment.type !== 'stop';
      const color = currentSegment ? getSegmentColor(currentSegment) : '#FAFAFA';

      // Update playhead position + bearing
      try {
        const playheadSource = map.getSource(PLAYHEAD_SOURCE) as mapboxgl.GeoJSONSource | undefined;
        if (playheadSource) {
          playheadSource.setData({
            type: 'Feature',
            properties: {
              color,
              bearing: currentBearing.current,
              isMoving: isMoving ? 1 : 0,
            },
            geometry: {
              type: 'Point',
              coordinates: [lng, lat],
            },
          });
        }
      } catch {
        // Source may not be ready during style transitions
      }

      // Update route opacity
      segments.forEach((seg, i) => {
        if (seg.type === 'stop') return;
        const layerId = `route-${seg.id}`;
        if (!map.getLayer(layerId)) return;

        let opacity: number;
        if (i < currentSegmentIndex) opacity = 0.25;
        else if (i === currentSegmentIndex) opacity = 1;
        else opacity = 0.6;

        map.setPaintProperty(layerId, 'line-opacity', opacity);
      });

      // Camera follow
      if (isPlaying && !isUserInteracting.current) {
        map.easeTo({
          center: [lng, lat],
          duration: 300,
          easing: (t: number) => t,
        });
      }
    });

    return unsubscribe;
  }, [mapReady, segments]);

  const handleRecenter = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const { currentPosition, currentSegment } = usePlaybackStore.getState();

    // Pick zoom level based on segment type
    let zoom = 13;
    if (currentSegment) {
      if (currentSegment.type === 'stop') {
        zoom = 15; // street level for stops
      } else if (isTransitSegment(currentSegment)) {
        // Zoom out more for longer drives
        const dist = currentSegment.distance_meters;
        if (dist > 150_000) zoom = 8;
        else if (dist > 50_000) zoom = 9;
        else if (dist > 10_000) zoom = 11;
        else zoom = 13;
      }
    }

    isUserInteracting.current = false;
    map.flyTo({
      center: [currentPosition.lng, currentPosition.lat],
      zoom,
      duration: 1000,
      essential: true,
    });
  }, []);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-base">
        <div className="text-center">
          <p className="text-muted text-sm mb-2">Map requires a Mapbox token</p>
          <p className="text-dim text-xs font-mono">
            Add NEXT_PUBLIC_MAPBOX_TOKEN to .env.local
          </p>
        </div>
      </div>
    );
  }

  const hoveredSegment = hoverInfo ? segments[hoverInfo.segmentIndex] : null;

  const visibleStopIndices = useMemo(() => {
    const set = new Set<number>();
    const tripStart = stats?.tripStartTime ?? 0;
    segments.forEach((s, i) => {
      if (s.type !== 'stop') return;
      if (dayFilter === 'all') { set.add(i); return; }
      const d = tripStart > 0 ? getDayOfTrip(s.startTime, tripStart, tz) : 1;
      if (d === dayFilter) set.add(i);
    });
    return set;
  }, [segments, stats, dayFilter, tz]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />
      {mapReady && !empty && mapRef.current && (
        <>
          <StopPhotoMarkers
            map={mapRef.current}
            segments={segments}
            visibleStopIndices={visibleStopIndices}
            onHover={setHoverInfo}
            onLeave={() => setHoverInfo(null)}
            onClick={(i) => usePlaybackStore.getState().jumpToSegment(i)}
          />
          <PlayheadMarker map={mapRef.current} />
        </>
      )}
      {hoverInfo && hoveredSegment && isStopSegment(hoveredSegment) && (
        <StopTooltip segment={hoveredSegment} x={hoverInfo.x} y={hoverInfo.y} tz={tz} />
      )}
      <div className="absolute top-3 z-10 flex flex-col gap-2 transition-[left] duration-200 ease-out" style={{ left: sidebarWidth + 12 }}>
        <div className="flex gap-2">
          <div className="flex rounded-sm border border-white/10 bg-black/60 backdrop-blur-sm overflow-hidden">
            {(['dark', 'satellite'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setMapStyle(key)}
                className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors ${
                  mapStyle === key
                    ? 'bg-white/15 text-white'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                {key === 'dark' ? 'Dark' : 'Satellite'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleRecenter}
            className="flex items-center justify-center w-8 h-8 rounded-sm border border-white/10 bg-black/60 backdrop-blur-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            title="Recenter on current position"
          >
            <Crosshair size={15} />
          </button>
        </div>
      </div>
      {!empty && stats && stats.totalDays > 1 && (
        <div className="absolute top-3 right-3 z-10 max-w-[calc(100%-1.5rem)]">
          <DaySelector
            totalDays={stats.totalDays}
            value={dayFilter}
            onChange={setDayFilter}
          />
        </div>
      )}
    </div>
  );
}

function DaySelector({
  totalDays,
  value,
  onChange,
}: {
  totalDays: number;
  value: DayFilter;
  onChange: (next: DayFilter) => void;
}) {
  const days = Array.from({ length: totalDays }, (_, i) => i + 1);
  return (
    <div className="flex items-center rounded-sm border border-white/10 bg-black/60 backdrop-blur-sm overflow-hidden max-w-[min(80vw,640px)]">
      <button
        type="button"
        onClick={() => onChange('all')}
        className={`px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors border-r border-white/10 ${
          value === 'all'
            ? 'bg-white/15 text-white'
            : 'text-white/60 hover:text-white hover:bg-white/5'
        }`}
      >
        Full Trip
      </button>
      <div className="flex overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {days.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            className={`shrink-0 px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider transition-colors ${
              value === d
                ? 'bg-white/15 text-white'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            Day {d}
          </button>
        ))}
      </div>
    </div>
  );
}

function PlayheadMarker({ map }: { map: mapboxgl.Map }) {
  useEffect(() => {
    const container = document.createElement('div');
    container.style.pointerEvents = 'none';
    container.style.zIndex = '100';
    container.style.width = '44px';
    container.style.height = '44px';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.justifyContent = 'center';

    const inner = document.createElement('div');
    inner.style.width = '100%';
    inner.style.height = '100%';
    inner.style.display = 'flex';
    inner.style.alignItems = 'center';
    inner.style.justifyContent = 'center';
    inner.style.transition = 'transform 120ms linear';
    inner.style.willChange = 'transform';
    inner.innerHTML = `
      <svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" style="display:block; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6));">
        <path d="M18 3 L30 30 L18 23 L6 30 Z" fill="white" stroke="rgba(0,0,0,0.85)" stroke-width="1.75" stroke-linejoin="round"/>
      </svg>
    `;
    container.appendChild(inner);

    const initial = usePlaybackStore.getState().currentPosition;
    const marker = new mapboxgl.Marker({ element: container, anchor: 'center' })
      .setLngLat([initial.lng, initial.lat])
      .addTo(map);

    let prev: { lng: number; lat: number } | null = null;
    let bearing = 0;

    // Apply any current bearing inferred from initial state (zero on first mount).
    inner.style.transform = `rotate(${bearing}deg)`;

    const unsubscribe = usePlaybackStore.subscribe((s) => {
      const pos = s.currentPosition;
      if (prev) {
        const d = Math.abs(pos.lng - prev.lng) + Math.abs(pos.lat - prev.lat);
        if (d > 0.0001) {
          bearing = computeBearing(prev.lng, prev.lat, pos.lng, pos.lat);
        }
      }
      prev = { lng: pos.lng, lat: pos.lat };
      marker.setLngLat([pos.lng, pos.lat]);
      inner.style.transform = `rotate(${bearing}deg)`;
    });

    return () => {
      unsubscribe();
      marker.remove();
    };
  }, [map]);

  return null;
}

function StopPhotoMarkers({
  map,
  segments,
  visibleStopIndices,
  onHover,
  onLeave,
  onClick,
}: {
  map: mapboxgl.Map;
  segments: Segment[];
  visibleStopIndices: Set<number>;
  onHover: (info: { segmentIndex: number; x: number; y: number }) => void;
  onLeave: () => void;
  onClick: (index: number) => void;
}) {
  return (
    <>
      {segments.map((seg, idx) => {
        if (!isStopSegment(seg)) return null;
        return (
          <StopPhotoMarker
            key={seg.id}
            map={map}
            segment={seg}
            index={idx}
            visible={visibleStopIndices.has(idx)}
            onHover={onHover}
            onLeave={onLeave}
            onClick={onClick}
          />
        );
      })}
    </>
  );
}

function StopPhotoMarker({
  map,
  segment,
  index,
  visible,
  onHover,
  onLeave,
  onClick,
}: {
  map: mapboxgl.Map;
  segment: Extract<Segment, { type: 'stop' }>;
  index: number;
  visible: boolean;
  onHover: (info: { segmentIndex: number; x: number; y: number }) => void;
  onLeave: () => void;
  onClick: (index: number) => void;
}) {
  const query = segment.details.photo_query || segment.title;
  const { details } = usePlaceDetails(query);
  const [retry, setRetry] = useState(0);
  const [imgGaveUp, setImgGaveUp] = useState(false);
  const isCurrent = usePlaybackStore((s) => s.currentSegmentIndex === index);

  // Reset retry state whenever the underlying stop changes.
  useEffect(() => {
    setRetry(0);
    setImgGaveUp(false);
  }, [segment.id]);

  const MAX_RETRIES = 3;
  const firstPhoto = details?.photos?.[0];
  const baseUrl = firstPhoto
    ? `/api/places/photo?name=${encodeURIComponent(firstPhoto)}`
    : null;
  // Append a retry key only after the first failure — keeps the initial URL
  // stable so the browser can share its cached 200 across markers.
  const photoUrl = baseUrl && !imgGaveUp
    ? (retry === 0 ? baseUrl : `${baseUrl}&r=${retry}`)
    : null;

  const handleImgError = () => {
    if (retry < MAX_RETRIES) {
      // Back off slightly so we don't hammer the proxy during a Google API blip.
      const delay = 300 * Math.pow(2, retry);
      setTimeout(() => setRetry((r) => r + 1), delay);
    } else {
      setImgGaveUp(true);
    }
  };

  const [el, setEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = document.createElement('div');
    element.style.pointerEvents = 'auto';
    const marker = new mapboxgl.Marker({ element, anchor: 'center' })
      .setLngLat([segment.longitude, segment.latitude])
      .addTo(map);
    setEl(element);
    return () => {
      marker.remove();
      setEl(null);
    };
  }, [map, segment.longitude, segment.latitude]);

  // Toggle whole-marker visibility (day filter hides it; no-photo case falls
  // back to the underlying circle layer by hiding the DOM marker entirely).
  useEffect(() => {
    if (!el) return;
    el.style.display = visible && photoUrl ? '' : 'none';
  }, [el, visible, photoUrl]);

  // When the playhead is currently ON this stop, hide the marker entirely so
  // the playhead glow/arrow (which lives on the map canvas below DOM markers)
  // remains visible.
  useEffect(() => {
    if (!el) return;
    el.style.visibility = isCurrent ? 'hidden' : 'visible';
  }, [el, isCurrent]);

  if (!el || !photoUrl) return null;

  const color = getSegmentColor(segment);
  const reportHover = () => {
    const p = map.project([segment.longitude, segment.latitude]);
    onHover({ segmentIndex: index, x: p.x, y: p.y });
  };

  return createPortal(
    <div
      onMouseEnter={reportHover}
      onMouseMove={reportHover}
      onMouseLeave={onLeave}
      onClick={() => onClick(index)}
      className="cursor-pointer transition-transform hover:scale-110"
      style={{
        width: 30,
        height: 30,
        borderRadius: 4,
        border: `2px solid ${color}`,
        overflow: 'hidden',
        boxShadow: `0 2px 6px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.4)`,
        background: '#09090B',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoUrl}
        alt=""
        onError={handleImgError}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    </div>,
    el,
  );
}

function StopTooltip({
  segment,
  x,
  y,
  tz,
}: {
  segment: Extract<Segment, { type: 'stop' }>;
  x: number;
  y: number;
  tz: string;
}) {
  const color = getSegmentColor(segment);
  const label = getCategoryLabel(segment.category);
  const d = segment.details;

  const query = d.photo_query || segment.title;
  const { details, loading } = usePlaceDetails(query);
  const [imgFailed, setImgFailed] = useState(false);

  // Reset the failure flag whenever the segment changes.
  useEffect(() => { setImgFailed(false); }, [segment.id]);

  const firstPhoto = details?.photos?.[0];
  const photoUrl = firstPhoto && !imgFailed
    ? `/api/places/photo?name=${encodeURIComponent(firstPhoto)}`
    : null;
  const showPhotoSlot = loading || photoUrl;

  const TOOLTIP_WIDTH = 260;
  const TOOLTIP_EST_HEIGHT = showPhotoSlot ? 300 : 180;
  const offset = 14;

  // x/y are pixel offsets inside the map container. We approximate the
  // container's viewport by falling back to window size — close enough
  // for edge-flip heuristics and avoids an extra ref.
  const containerW = typeof window !== 'undefined' ? window.innerWidth : 0;
  const containerH = typeof window !== 'undefined' ? window.innerHeight : 0;

  const flipX = x + offset + TOOLTIP_WIDTH > containerW - 16;
  const flipY = y + offset + TOOLTIP_EST_HEIGHT > containerH - 16;

  const left = flipX ? x - offset - TOOLTIP_WIDTH : x + offset;
  const top = flipY ? y - offset - TOOLTIP_EST_HEIGHT : y + offset;

  return (
    <div
      className="pointer-events-none absolute z-20 rounded-sm border border-white/[0.08] bg-[#09090B]/95 backdrop-blur-xl shadow-lg shadow-black/60 overflow-hidden"
      style={{ left, top, width: TOOLTIP_WIDTH }}
    >
      {showPhotoSlot && (
        <div className="relative w-full h-[130px] bg-white/[0.03] overflow-hidden">
          {photoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={photoUrl}
              alt={segment.title}
              loading="eager"
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover animate-in fade-in duration-150"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-white/[0.04] to-white/[0.01] animate-pulse" />
          )}
          <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-[#09090B]/80 to-transparent pointer-events-none" />
        </div>
      )}
      <div className="p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color }}>
          {label}
        </span>
      </div>

      <p className="text-[13px] text-heading font-medium leading-tight line-clamp-2">
        {segment.title}
      </p>

      <div className="flex items-center gap-2 mt-1.5 text-[10px] font-mono text-dim">
        <Clock size={10} />
        <span>{formatTime(segment.startTime, tz)}</span>
        <span>·</span>
        <span>{formatDuration(segment.duration_minutes)}</span>
      </div>

      {d.description && (
        <p className="text-[11px] text-muted leading-snug mt-2 line-clamp-3">{d.description}</p>
      )}

      {(d.rating != null || d.cuisine || d.trail_difficulty) && (
        <div className="flex items-center gap-2 mt-1.5">
          {d.rating != null && (
            <div className="flex items-center gap-1">
              <Star size={10} className="text-warning fill-warning" />
              <span className="text-[11px] text-muted">{d.rating}/5</span>
            </div>
          )}
          {d.cuisine && <span className="text-[10px] text-dim">{d.cuisine}</span>}
          {d.trail_difficulty && (
            <span className="text-[10px] text-dim">{d.trail_difficulty}</span>
          )}
        </div>
      )}

      {d.address && (
        <div className="flex items-start gap-1 mt-1.5">
          <MapPin size={10} className="text-dim mt-0.5 shrink-0" />
          <p className="text-[10px] text-dim truncate">{d.address}</p>
        </div>
      )}
      </div>
    </div>
  );
}

function addRouteLayers(map: mapboxgl.Map, segments: Segment[], tripStart: number, tz: string) {
  segments.forEach((seg) => {
    if (!isTransitSegment(seg)) return;

    const sourceId = `route-source-${seg.id}`;
    const layerId = `route-${seg.id}`;
    const color = getSegmentColor(seg);
    const day = tripStart > 0 ? getDayOfTrip(seg.startTime, tripStart, tz) : 1;

    map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: { day },
        geometry: { type: 'LineString', coordinates: seg.routeCoordinates },
      },
    });

    map.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': color,
        'line-width': seg.type === 'walk' ? 3 : 4,
        'line-opacity': 0.6,
        'line-dasharray': seg.type === 'walk' ? [2, 2] : [1, 0],
      },
    });

    map.on('click', layerId, () => {
      const idx = segments.indexOf(seg);
      usePlaybackStore.getState().jumpToSegment(idx);
    });
    map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
  });
}

function addStopsLayer(map: mapboxgl.Map, segments: Segment[], tripStart: number, tz: string) {
  const features = segments
    .map((seg, idx) => {
      if (seg.type !== 'stop') return null;
      const color = getSegmentColor(seg);
      const day = tripStart > 0 ? getDayOfTrip(seg.startTime, tripStart, tz) : 1;
      return {
        type: 'Feature' as const,
        properties: { color, segmentIndex: idx, day },
        geometry: {
          type: 'Point' as const,
          coordinates: [seg.longitude, seg.latitude],
        },
      };
    })
    .filter(Boolean);

  map.addSource(STOPS_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: features as GeoJSON.Feature[] },
  });

  map.addLayer({
    id: STOPS_LAYER,
    type: 'circle',
    source: STOPS_SOURCE,
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        5, 4,
        10, 6,
        15, 8,
      ],
      'circle-color': ['get', 'color'],
      'circle-stroke-color': ['get', 'color'],
      'circle-stroke-width': 2,
      'circle-stroke-opacity': 0.5,
    },
  });
}

function addPlayheadLayer(map: mapboxgl.Map) {
  map.addSource(PLAYHEAD_SOURCE, {
    type: 'geojson',
    data: {
      type: 'Feature',
      properties: { color: '#FAFAFA', bearing: 0, isMoving: 0 },
      geometry: { type: 'Point', coordinates: [-119.5885, 37.749] },
    },
  });

  // Outer glow — always visible
  map.addLayer({
    id: PLAYHEAD_GLOW,
    type: 'circle',
    source: PLAYHEAD_SOURCE,
    paint: {
      'circle-radius': 22,
      'circle-color': ['get', 'color'],
      'circle-opacity': 0.2,
      'circle-blur': 1,
    },
  });

  // The rotating arrow itself is a DOM marker (<PlayheadMarker/>) so it can
  // always render above photo/stop markers via z-index.
}
