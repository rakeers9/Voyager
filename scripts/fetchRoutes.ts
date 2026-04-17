/**
 * One-shot: fetch real route polylines, durations, and distances from the
 * Mapbox Directions API for every transit segment in the seed trip, then
 * write the results to `src/data/generatedRoutes.json`.
 *
 * Run: `npm run fetch-routes`
 *
 * Re-runnable. Existing entries are overwritten; adding/removing transit
 * segments in `seedTrip.ts` will produce/prune keys accordingly.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { segmentDefs, type TransitDef } from '../src/data/seedTrip';

function loadEnvLocal(): Record<string, string> {
  const path = resolve(process.cwd(), '.env.local');
  const raw = readFileSync(path, 'utf8');
  const env: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const env = { ...loadEnvLocal(), ...process.env };
const TOKEN = env.NEXT_PUBLIC_MAPBOX_TOKEN || env.MAPBOX_TOKEN;
if (!TOKEN) {
  console.error('Missing NEXT_PUBLIC_MAPBOX_TOKEN in .env.local');
  process.exit(1);
}

function routeKey(type: 'drive' | 'walk', origin: [number, number], destination: [number, number]): string {
  return `${type}:${origin[0]},${origin[1]}->${destination[0]},${destination[1]}`;
}

type DirectionsRoute = {
  duration: number;     // seconds
  distance: number;     // meters
  geometry: { coordinates: [number, number][] };
};

async function fetchRoute(def: TransitDef): Promise<{ duration_minutes: number; distance_meters: number; route: [number, number][] }> {
  // Mapbox Directions: driving-traffic for drives, walking for walks
  const profile = def.type === 'drive' ? 'driving-traffic' : 'walking';
  const coords = `${def.origin[0]},${def.origin[1]};${def.destination[0]},${def.destination[1]}`;
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coords}` +
    `?geometries=geojson&overview=full&access_token=${TOKEN}`;

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mapbox ${res.status} for ${def.title}: ${body}`);
  }
  const data = (await res.json()) as { routes?: DirectionsRoute[] };
  const route = data.routes?.[0];
  if (!route) throw new Error(`No route returned for ${def.title}`);

  return {
    duration_minutes: Math.round(route.duration / 60),
    distance_meters: Math.round(route.distance),
    route: route.geometry.coordinates,
  };
}

async function main() {
  const transits = segmentDefs.filter(
    (d): d is TransitDef => d.type === 'drive' || d.type === 'walk',
  );

  console.log(`Fetching Directions for ${transits.length} transit segments...`);
  const out: Record<string, { duration_minutes: number; distance_meters: number; route: [number, number][] }> = {};

  for (const def of transits) {
    const key = routeKey(def.type, def.origin, def.destination);
    try {
      const result = await fetchRoute(def);
      out[key] = result;
      const km = (result.distance_meters / 1000).toFixed(1);
      console.log(`  ✓ ${def.title.padEnd(42)} ${String(result.duration_minutes).padStart(4)} min  ${km.padStart(7)} km  ${result.route.length} pts`);
    } catch (err) {
      console.error(`  ✗ ${def.title}: ${(err as Error).message}`);
    }
    // Gentle throttle — Mapbox allows 300 req/min on the free tier.
    await new Promise((r) => setTimeout(r, 150));
  }

  const outPath = resolve(process.cwd(), 'src/data/generatedRoutes.json');
  writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
  console.log(`\nWrote ${Object.keys(out).length} routes to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
