'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Crosshair } from 'lucide-react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import usePlaybackStore from '@/stores/playbackStore';
import useTripStore from '@/stores/tripStore';
import { getSegmentColor } from '@/lib/colors';
import type { Segment } from '@/types/segment';
import { isTransitSegment } from '@/types/segment';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const PLAYHEAD_SOURCE = 'playhead-source';
const PLAYHEAD_GLOW = 'playhead-glow';
const PLAYHEAD_ARROW = 'playhead-arrow';
const STOPS_SOURCE = 'stops-source';
const STOPS_LAYER = 'stops-circles';
const ARROW_IMAGE = 'arrow-icon';

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

/** Render an arrow icon to a canvas and return its ImageData */
function createArrowImage(size: number): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42;

  // Arrow pointing UP (0° = north), Mapbox rotates it via icon-rotate
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);               // tip
  ctx.lineTo(cx + r * 0.6, cy + r * 0.5); // bottom right
  ctx.lineTo(cx, cy + r * 0.15);        // notch
  ctx.lineTo(cx - r * 0.6, cy + r * 0.5); // bottom left
  ctx.closePath();

  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  // Subtle border
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

type MapStyleKey = 'dark' | 'satellite';

const MAP_STYLES: Record<MapStyleKey, string> = {
  dark: 'mapbox://styles/mapbox/dark-v11',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
};

export default function MapViewport() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const isUserInteracting = useRef(false);
  const prevPos = useRef<{ lng: number; lat: number } | null>(null);
  const currentBearing = useRef(0);
  const [mapReady, setMapReady] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyleKey>('dark');
  const appliedStyle = useRef<MapStyleKey>('dark');

  const segments = useTripStore((s) => s.segments);

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

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left');

    map.on('mousedown', () => { isUserInteracting.current = true; });
    map.on('touchstart', () => { isUserInteracting.current = true; });
    map.on('moveend', () => {
      setTimeout(() => { isUserInteracting.current = false; }, 2000);
    });

    const setupLayers = () => {
      const arrowImg = createArrowImage(64);
      if (!map.hasImage(ARROW_IMAGE)) {
        map.addImage(ARROW_IMAGE, arrowImg, { sdf: false });
      }
      addRouteLayers(map, segments);
      addStopsLayer(map, segments);
      addPlayheadLayer(map);
    };

    // Layer setup lives in 'style.load' (below) — it fires on both the initial
    // style AND every setStyle() swap, so it's the single source of truth.
    map.on('load', () => {
      setMapReady(true);

      const bounds = new mapboxgl.LngLatBounds();
      segments.forEach((seg) => {
        if (seg.type === 'stop') {
          bounds.extend([seg.longitude, seg.latitude]);
        } else if (isTransitSegment(seg)) {
          seg.routeCoordinates.forEach((coord) => bounds.extend(coord));
        }
      });
      map.fitBounds(bounds, { padding: 60, duration: 0 });
    });

    // Add layers on initial style load AND every setStyle() swap
    map.on('style.load', () => {
      setupLayers();
      // Push current playback position into the fresh source
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
    map.on('click', STOPS_LAYER, (e) => {
      const feature = e.features?.[0];
      if (feature && feature.properties) {
        const idx = feature.properties.segmentIndex as number;
        usePlaybackStore.getState().jumpToSegment(idx);
      }
    });
    map.on('mouseenter', STOPS_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', STOPS_LAYER, () => { map.getCanvas().style.cursor = ''; });

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

  // Subscribe to playback updates
  useEffect(() => {
    if (!mapReady) return;

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

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />
      <div className="absolute top-3 right-3 z-10 flex gap-2">
        <button
          type="button"
          onClick={handleRecenter}
          className="flex items-center justify-center w-8 h-8 rounded-sm border border-white/10 bg-black/60 backdrop-blur-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          title="Recenter on current position"
        >
          <Crosshair size={15} />
        </button>
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
      </div>
    </div>
  );
}

function addRouteLayers(map: mapboxgl.Map, segments: Segment[]) {
  segments.forEach((seg) => {
    if (!isTransitSegment(seg)) return;

    const sourceId = `route-source-${seg.id}`;
    const layerId = `route-${seg.id}`;
    const color = getSegmentColor(seg);

    map.addSource(sourceId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
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

function addStopsLayer(map: mapboxgl.Map, segments: Segment[]) {
  const features = segments
    .map((seg, idx) => {
      if (seg.type !== 'stop') return null;
      const color = getSegmentColor(seg);
      return {
        type: 'Feature' as const,
        properties: { color, segmentIndex: idx },
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
      'circle-radius': 16,
      'circle-color': ['get', 'color'],
      'circle-opacity': 0.15,
      'circle-blur': 1,
    },
  });

  // Arrow icon — shown when moving (driving/walking)
  map.addLayer({
    id: PLAYHEAD_ARROW,
    type: 'symbol',
    source: PLAYHEAD_SOURCE,
    layout: {
      'icon-image': ARROW_IMAGE,
      'icon-size': [
        'interpolate', ['linear'], ['zoom'],
        5, 0.25,
        10, 0.35,
        15, 0.45,
      ],
      'icon-rotate': ['get', 'bearing'],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });
}
