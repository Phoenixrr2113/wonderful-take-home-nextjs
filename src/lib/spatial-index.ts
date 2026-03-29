import KDBush from "kdbush";
import * as geokdbush from "geokdbush";
import { airports } from "./airports";
import type { Airport } from "./types";

const MILES_TO_KM = 1.60934;
const MAX_RANGE_MILES = 500;
const MAX_RANGE_KM = MAX_RANGE_MILES * MILES_TO_KM;

// Build spatial index once at module load (~5ms for 8K points)
const index = new KDBush(airports.length);
for (const airport of airports) {
  index.add(airport.longitude, airport.latitude);
}
index.finish();

// Precompute neighbor graph: for each airport, all airports within 500mi.
// Built once at startup. BFS then does zero spatial queries at runtime.
export const neighbors: ReadonlyArray<readonly number[]> = buildNeighborGraph();

function buildNeighborGraph(): number[][] {
  const graph: number[][] = new Array(airports.length);
  for (let i = 0; i < airports.length; i++) {
    const a = airports[i];
    const nearby = geokdbush.around(
      index,
      a.longitude,
      a.latitude,
      Infinity,
      MAX_RANGE_KM
    );
    // Filter out self
    graph[i] = nearby.filter((j: number) => j !== i);
  }
  return graph;
}

/**
 * Find all airports within a radius (miles) of a coordinate.
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
 * Find the single nearest airport (by index) that matches a predicate.
 */
export function findNearestWithPredicate(
  longitude: number,
  latitude: number,
  predicate: (idx: number) => boolean
): number | null {
  const results = geokdbush.around(index, longitude, latitude, 1, Infinity, predicate);
  return results.length > 0 ? results[0] : null;
}
