import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// Cache photo buffers
const photoCache = new Map<string, { buffer: ArrayBuffer; contentType: string; expires: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 6; // 6 hours

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = searchParams.get('query');
  const photoName = searchParams.get('name'); // e.g. "places/xxx/photos/yyy"

  if (!query && !photoName) {
    return NextResponse.json({ error: 'query or name required' }, { status: 400 });
  }

  if (!GOOGLE_API_KEY) {
    return NextResponse.json({ error: 'GOOGLE_PLACES_API_KEY not configured' }, { status: 500 });
  }

  const cacheKey = photoName || query!;
  const cached = photoCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return new NextResponse(cached.buffer, {
      headers: {
        'Content-Type': cached.contentType,
        'Cache-Control': 'public, max-age=21600, s-maxage=86400',
      },
    });
  }

  try {
    let resolvedPhotoName = photoName;

    // If no photo name, search for the place first
    if (!resolvedPhotoName && query) {
      const searchRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_API_KEY,
          'X-Goog-FieldMask': 'places.photos',
        },
        body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
      });

      const searchData = await searchRes.json();
      resolvedPhotoName = searchData.places?.[0]?.photos?.[0]?.name;
    }

    if (!resolvedPhotoName) {
      return NextResponse.json({ error: 'No photo found' }, { status: 404 });
    }

    // Fetch the photo
    const photoUrl = `https://places.googleapis.com/v1/${resolvedPhotoName}/media?maxWidthPx=800&key=${GOOGLE_API_KEY}`;
    const photoRes = await fetch(photoUrl, { redirect: 'follow' });

    if (!photoRes.ok) {
      return NextResponse.json({ error: 'Photo fetch failed' }, { status: 502 });
    }

    const contentType = photoRes.headers.get('content-type') || 'image/jpeg';
    const buffer = await photoRes.arrayBuffer();

    photoCache.set(cacheKey, { buffer, contentType, expires: Date.now() + CACHE_TTL });

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=21600, s-maxage=86400',
      },
    });
  } catch (err) {
    console.error('Places photo error:', err);
    return NextResponse.json({ error: 'Failed to fetch photo' }, { status: 500 });
  }
}
