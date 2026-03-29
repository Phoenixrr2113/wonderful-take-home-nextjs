import KDBush from "kdbush";
import * as geokdbush from "geokdbush";
import { airports } from "./airports";
import type { Airport } from "./types";

const MILES_TO_KM = 1.60934;

// Build spatial index once at module load (~5ms for 8K points)
const index = new KDBush(airports.length);
for (const airport of airports) {
  index.add(airport.longitude, airport.latitude);
}
index.finish();

/**
 * Find all airports within a radius (miles) of a coordinate.
 * Returns airport indices from the `airports` array, sorted by distance ascending.
 */
export function findAirportsWithinRadius(
  longitude: number,
  latitude: number,
  radiusMiles: number
): Airport[] {
  const radiusKm = radiusMiles * MILES_TO_KM;
  const indices = geokdbush.around(index, longitude, latitude, Infinity, radiusKm);
  return indices.map((i: number) => airports[i]);
}

/**
 * Find airports within range for BFS pathfinding.
 * Returns indices for efficiency (avoids object allocation per hop).
 */
export function findIndicesWithinRadius(
  longitude: number,
  latitude: number,
  radiusMiles: number
): number[] {
  const radiusKm = radiusMiles * MILES_TO_KM;
  return geokdbush.around(index, longitude, latitude, Infinity, radiusKm);
}
