import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// Cache place details to avoid repeated API calls
const detailsCache = new Map<string, { data: PlaceDetails; expires: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

export interface PlaceDetails {
  displayName: string;
  formattedAddress?: string;
  googleMapsUri?: string;
  websiteUri?: string;
  internationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  editorialSummary?: string;
  openingHours?: {
    weekdayDescriptions?: string[];
    openNow?: boolean;
  };
  photos: string[]; // photo resource names
  reviews?: {
    text: string;
    rating: number;
    authorName: string;
    relativePublishTimeDescription: string;
  }[];
}

const FIELD_MASK = [
  'places.displayName',
  'places.formattedAddress',
  'places.googleMapsUri',
  'places.websiteUri',
  'places.internationalPhoneNumber',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.editorialSummary',
  'places.regularOpeningHours',
  'places.photos',
  'places.reviews',
].join(',');

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = searchParams.get('query');

  if (!query) {
    return NextResponse.json({ error: 'query required' }, { status: 400 });
  }

  if (!GOOGLE_API_KEY) {
    return NextResponse.json({ error: 'GOOGLE_PLACES_API_KEY not configured' }, { status: 500 });
  }

  // Check cache
  const cached = detailsCache.get(query);
  if (cached && cached.expires > Date.now()) {
    return NextResponse.json(cached.data);
  }

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
    });

    const data = await res.json();
    const place = data.places?.[0];

    if (!place) {
      return NextResponse.json({ error: 'Place not found' }, { status: 404 });
    }

    const details: PlaceDetails = {
      displayName: place.displayName?.text || query,
      formattedAddress: place.formattedAddress,
      googleMapsUri: place.googleMapsUri,
      websiteUri: place.websiteUri,
      internationalPhoneNumber: place.internationalPhoneNumber,
      rating: place.rating,
      userRatingCount: place.userRatingCount,
      priceLevel: place.priceLevel,
      editorialSummary: place.editorialSummary?.text,
      openingHours: place.regularOpeningHours
        ? {
            weekdayDescriptions: place.regularOpeningHours.weekdayDescriptions,
            openNow: place.regularOpeningHours.openNow,
          }
        : undefined,
      photos: (place.photos || []).slice(0, 8).map((p: { name: string }) => p.name),
      reviews: (place.reviews || []).slice(0, 3).map(
        (r: { text?: { text?: string }; rating?: number; authorAttribution?: { displayName?: string }; relativePublishTimeDescription?: string }) => ({
          text: r.text?.text || '',
          rating: r.rating || 0,
          authorName: r.authorAttribution?.displayName || 'Anonymous',
          relativePublishTimeDescription: r.relativePublishTimeDescription || '',
        })
      ),
    };

    detailsCache.set(query, { data: details, expires: Date.now() + CACHE_TTL });

    return NextResponse.json(details, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  } catch (err) {
    console.error('Places details error:', err);
    return NextResponse.json({ error: 'Failed to fetch details' }, { status: 500 });
  }
}
