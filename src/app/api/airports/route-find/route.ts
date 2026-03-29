import { NextRequest, NextResponse } from "next/server";
import { routeSchema, formatZodErrors } from "@/lib/validation";
import { airportById, airports, airportIndexById } from "@/lib/airports";
import { haversineDistance } from "@/lib/haversine";
import { findIndicesWithinRadius } from "@/lib/spatial-index";

const MAX_RANGE_MILES = 500;

export async function GET(request: NextRequest) {
  const start = performance.now();
  const sp = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = routeSchema.safeParse(sp);

  if (!parsed.success) {
    return NextResponse.json(
      { errors: formatZodErrors(parsed.error) },
      { status: 422 }
    );
  }

  const origin = airportById.get(parsed.data.airport1_id);
  const destination = airportById.get(parsed.data.airport2_id);

  if (!origin || !destination) {
    return NextResponse.json(
      { error: "One or both airports not found" },
      { status: 404 }
    );
  }

  // Check direct flight
  const directDistance = haversineDistance(
    origin.latitude,
    origin.longitude,
    destination.latitude,
    destination.longitude
  );

  if (directDistance <= MAX_RANGE_MILES) {
    const response = NextResponse.json({
      data: {
        stops: [
          { airport: origin, distance_to_next: directDistance },
          { airport: destination, distance_to_next: null },
        ],
        total_distance: directDistance,
        total_stops: 2,
      },
    });
    response.headers.set(
      "X-Response-Time",
      `${(performance.now() - start).toFixed(2)}ms`
    );
    return response;
  }

  const originIdx = airportIndexById.get(origin.id)!;
  const destIdx = airportIndexById.get(destination.id)!;

  // A*-like BFS: use a priority queue sorted by estimated total hops
  // Heuristic: straight-line distance / max range = minimum remaining hops
  const destLat = destination.latitude;
  const destLng = destination.longitude;

  // Parent map for path reconstruction (no more path arrays in queue)
  const parent = new Int32Array(airports.length).fill(-1);
  const visited = new Uint8Array(airports.length); // faster than Set
  visited[originIdx] = 1;

  // Ring buffer BFS queue (avoids shift() O(n))
  // For greedy best-first, we use a simple priority bucket approach:
  // Since hops are integers, bucket by estimated total hops
  const buckets: number[][] = [];

  function enqueue(idx: number, hopsFromOrigin: number) {
    const remaining = haversineDistance(
      airports[idx].latitude,
      airports[idx].longitude,
      destLat,
      destLng
    );
    const estTotal = hopsFromOrigin + Math.ceil(remaining / MAX_RANGE_MILES);
    while (buckets.length <= estTotal) buckets.push([]);
    buckets[estTotal].push(idx);
  }

  enqueue(originIdx, 0);

  // Track depth per node for the heuristic
  const depth = new Uint16Array(airports.length);

  while (true) {
    // Find next non-empty bucket
    let bucket: number[] | undefined;
    let bi = 0;
    for (; bi < buckets.length; bi++) {
      if (buckets[bi].length > 0) {
        bucket = buckets[bi];
        break;
      }
    }
    if (!bucket) break;

    const currentIdx = bucket.pop()!;
    const current = airports[currentIdx];
    const currentDepth = depth[currentIdx];

    const reachableIndices = findIndicesWithinRadius(
      current.longitude,
      current.latitude,
      MAX_RANGE_MILES
    );

    for (let i = 0; i < reachableIndices.length; i++) {
      const nextIdx = reachableIndices[i];
      if (visited[nextIdx] || nextIdx === currentIdx) continue;

      visited[nextIdx] = 1;
      parent[nextIdx] = currentIdx;
      depth[nextIdx] = currentDepth + 1;

      if (nextIdx === destIdx) {
        // Reconstruct path
        const result = buildRouteFromParents(parent, originIdx, destIdx);
        const response = NextResponse.json({ data: result });
        response.headers.set(
          "X-Response-Time",
          `${(performance.now() - start).toFixed(2)}ms`
        );
        return response;
      }

      enqueue(nextIdx, currentDepth + 1);
    }
  }

  const response = NextResponse.json(
    { data: null, message: "No route found within refueling constraints." },
    { status: 404 }
  );
  response.headers.set(
    "X-Response-Time",
    `${(performance.now() - start).toFixed(2)}ms`
  );
  return response;
}

function buildRouteFromParents(
  parent: Int32Array,
  originIdx: number,
  destIdx: number
) {
  // Walk backwards from destination to origin
  const pathIndices: number[] = [];
  let cur = destIdx;
  while (cur !== -1) {
    pathIndices.push(cur);
    cur = parent[cur];
  }
  pathIndices.reverse();

  const stops = [];
  let totalDistance = 0;

  for (let i = 0; i < pathIndices.length; i++) {
    const airport = airports[pathIndices[i]];
    let distanceToNext: number | null = null;

    if (i < pathIndices.length - 1) {
      const next = airports[pathIndices[i + 1]];
      distanceToNext = haversineDistance(
        airport.latitude,
        airport.longitude,
        next.latitude,
        next.longitude
      );
      totalDistance += distanceToNext;
    }

    stops.push({ airport, distance_to_next: distanceToNext });
  }

  return {
    stops,
    total_distance: Math.round(totalDistance * 100) / 100,
    total_stops: pathIndices.length,
  };
}
