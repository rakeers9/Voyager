/**
 * Interpolate a position along a route (array of [lng, lat] coordinates)
 * at a given progress (0.0 to 1.0).
 */
export function interpolateAlongRoute(
  coordinates: [number, number][],
  progress: number
): { lng: number; lat: number } {
  if (!coordinates || coordinates.length === 0) return { lng: 0, lat: 0 };
  if (coordinates.length === 1) return { lng: coordinates[0][0], lat: coordinates[0][1] };
  if (progress <= 0) return { lng: coordinates[0][0], lat: coordinates[0][1] };
  if (progress >= 1) {
    const last = coordinates[coordinates.length - 1];
    return { lng: last[0], lat: last[1] };
  }

  // Compute cumulative distances between consecutive points
  const distances: number[] = [0];
  let totalDistance = 0;
  for (let i = 1; i < coordinates.length; i++) {
    const d = haversine(coordinates[i - 1], coordinates[i]);
    totalDistance += d;
    distances.push(totalDistance);
  }

  if (totalDistance === 0) return { lng: coordinates[0][0], lat: coordinates[0][1] };

  const targetDistance = progress * totalDistance;

  for (let i = 1; i < distances.length; i++) {
    if (targetDistance <= distances[i]) {
      const segmentStart = distances[i - 1];
      const segmentLength = distances[i] - distances[i - 1];
      const t = segmentLength > 0 ? (targetDistance - segmentStart) / segmentLength : 0;

      const [lng1, lat1] = coordinates[i - 1];
      const [lng2, lat2] = coordinates[i];
      return {
        lng: lng1 + (lng2 - lng1) * t,
        lat: lat1 + (lat2 - lat1) * t,
      };
    }
  }

  const last = coordinates[coordinates.length - 1];
  return { lng: last[0], lat: last[1] };
}

/** Haversine distance between two [lng, lat] points, in meters. */
function haversine([lng1, lat1]: [number, number], [lng2, lat2]: [number, number]): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
