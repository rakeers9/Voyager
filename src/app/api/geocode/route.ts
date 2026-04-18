import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

const geocodeCache = new Map<string, { lat: number; lng: number; displayName: string; expires: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('query');

  if (!query) {
    return NextResponse.json({ error: 'query required' }, { status: 400 });
  }

  if (!GOOGLE_API_KEY) {
    return NextResponse.json({ error: 'GOOGLE_PLACES_API_KEY not configured' }, { status: 500 });
  }

  const cached = geocodeCache.get(query);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json(cached);
  }

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'places.location,places.displayName',
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
    });

    const data = await res.json();
    const place = data.places?.[0];

    if (!place?.location) {
      return NextResponse.json({ error: 'Place not found' }, { status: 404 });
    }

    const result = {
      lat: place.location.latitude,
      lng: place.location.longitude,
      displayName: place.displayName?.text || query,
    };

    geocodeCache.set(query, { ...result, expires: Date.now() + CACHE_TTL });

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'public, max-age=86400' },
    });
  } catch (err) {
    console.error('Geocode error:', err);
    return NextResponse.json({ error: 'Geocoding failed' }, { status: 500 });
  }
}
