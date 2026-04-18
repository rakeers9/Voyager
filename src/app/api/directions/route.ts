import { NextRequest, NextResponse } from 'next/server';

// Token: Mapbox tokens are public-safe by design. Reuse the same one the
// browser uses for the basemap.
const MAPBOX_TOKEN =
  process.env.MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

interface CacheEntry {
  coordinates: [number, number][];
  distance_meters: number;
  duration_seconds: number;
  expires: number;
}

// Module-scoped, in-memory cache. Survives across requests within a single
// server runtime; resets on cold starts.
const directionsCache = new Map<string, CacheEntry>();
const CACHE_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days

const ALLOWED_PROFILES = new Set(['driving', 'walking', 'driving-traffic']);

function parseLngLat(input: string | null): [number, number] | null {
  if (!input) return null;
  const parts = input.split(',').map((s) => Number(s.trim()));
  if (parts.length !== 2 || parts.some((n) => !Number.isFinite(n))) return null;
  const [lng, lat] = parts;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return [lng, lat];
}

export async function GET(request: NextRequest) {
  if (!MAPBOX_TOKEN) {
    return NextResponse.json(
      { error: 'MAPBOX_TOKEN / NEXT_PUBLIC_MAPBOX_TOKEN not configured' },
      { status: 500 }
    );
  }

  const { searchParams } = request.nextUrl;
  const from = parseLngLat(searchParams.get('from'));
  const to = parseLngLat(searchParams.get('to'));
  const profileParam = searchParams.get('profile') ?? 'driving';
  const profile = ALLOWED_PROFILES.has(profileParam) ? profileParam : 'driving';

  if (!from || !to) {
    return NextResponse.json(
      { error: 'from and to are required as "lng,lat"' },
      { status: 400 }
    );
  }

  const cacheKey = `${profile}|${from.join(',')}|${to.join(',')}`;
  const cached = directionsCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json({
      coordinates: cached.coordinates,
      distance_meters: cached.distance_meters,
      duration_seconds: cached.duration_seconds,
      cached: true,
    });
  }

  const url =
    `https://api.mapbox.com/directions/v5/mapbox/${profile}/` +
    `${from[0]},${from[1]};${to[0]},${to[1]}` +
    `?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json(
        { error: `Mapbox directions failed: ${res.status}`, detail: text.slice(0, 200) },
        { status: 502 }
      );
    }
    const data = await res.json();
    const route = data.routes?.[0];
    if (!route?.geometry?.coordinates?.length) {
      return NextResponse.json({ error: 'No route found' }, { status: 404 });
    }

    const coordinates = route.geometry.coordinates as [number, number][];
    const distance_meters = Math.round(route.distance ?? 0);
    const duration_seconds = Math.round(route.duration ?? 0);

    directionsCache.set(cacheKey, {
      coordinates,
      distance_meters,
      duration_seconds,
      expires: Date.now() + CACHE_TTL,
    });

    return NextResponse.json({ coordinates, distance_meters, duration_seconds });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch directions' },
      { status: 500 }
    );
  }
}
