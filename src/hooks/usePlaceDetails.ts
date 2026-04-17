import { useState, useEffect } from 'react';

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
  photos: string[];
  reviews?: {
    text: string;
    rating: number;
    authorName: string;
    relativePublishTimeDescription: string;
  }[];
}

// Client-side cache
const cache = new Map<string, PlaceDetails>();

export function usePlaceDetails(query: string | undefined) {
  const [details, setDetails] = useState<PlaceDetails | null>(
    query ? cache.get(query) ?? null : null
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query) {
      setDetails(null);
      return;
    }

    // Already cached
    const cached = cache.get(query);
    if (cached) {
      setDetails(cached);
      return;
    }

    setLoading(true);
    fetch(`/api/places/details?query=${encodeURIComponent(query)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed');
        return res.json();
      })
      .then((data: PlaceDetails) => {
        cache.set(query, data);
        setDetails(data);
      })
      .catch(() => {
        setDetails(null);
      })
      .finally(() => setLoading(false));
  }, [query]);

  return { details, loading };
}
