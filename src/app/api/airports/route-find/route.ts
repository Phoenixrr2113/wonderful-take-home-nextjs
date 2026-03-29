import { NextRequest, NextResponse } from "next/server";
import { routeSchema, formatZodErrors } from "@/lib/validation";
import { airportById, airports } from "@/lib/airports";
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
    response.headers.set("X-Response-Time", `${(performance.now() - start).toFixed(2)}ms`);
    return response;
  }

  // BFS pathfinding
  const queue: number[][] = [[indexOfAirport(origin.id)]];
  const visited = new Set<number>([origin.id]);
  const destId = destination.id;

  while (queue.length > 0) {
    const path = queue.shift()!;
    const currentIdx = path[path.length - 1];
    const current = airports[currentIdx];

    const reachableIndices = findIndicesWithinRadius(
      current.longitude,
      current.latitude,
      MAX_RANGE_MILES
    );

    for (const nextIdx of reachableIndices) {
      const nextAirport = airports[nextIdx];
      if (visited.has(nextAirport.id) || nextAirport.id === current.id) continue;

      const newPath = [...path, nextIdx];

      if (nextAirport.id === destId) {
        const result = buildRouteResponse(newPath);
        const response = NextResponse.json({ data: result });
        response.headers.set("X-Response-Time", `${(performance.now() - start).toFixed(2)}ms`);
        return response;
      }

      visited.add(nextAirport.id);
      queue.push(newPath);
    }
  }

  const response = NextResponse.json(
    { data: null, message: "No route found within refueling constraints." },
    { status: 404 }
  );
  response.headers.set("X-Response-Time", `${(performance.now() - start).toFixed(2)}ms`);
  return response;
}

function indexOfAirport(id: number): number {
  return airports.findIndex((a) => a.id === id);
}

function buildRouteResponse(pathIndices: number[]) {
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
