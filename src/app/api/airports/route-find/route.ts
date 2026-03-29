import { NextRequest, NextResponse } from "next/server";
import { routeSchema, formatZodErrors } from "@/lib/validation";
import { airportById, airports, airportIndexById } from "@/lib/airports";
import { haversineDistance } from "@/lib/haversine";
import { neighbors } from "@/lib/spatial-index";

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

  const originIdx = airportIndexById.get(origin.id)!;
  const destIdx = airportIndexById.get(destination.id)!;

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

  // Bidirectional BFS with precomputed neighbor graph
  const parentF = new Int32Array(airports.length).fill(-1);
  const parentB = new Int32Array(airports.length).fill(-1);
  const visitedF = new Uint8Array(airports.length);
  const visitedB = new Uint8Array(airports.length);

  visitedF[originIdx] = 1;
  visitedB[destIdx] = 1;

  let frontierF = [originIdx];
  let frontierB = [destIdx];

  let meetIdx = -1;

  outer: while (frontierF.length > 0 && frontierB.length > 0) {
    // Expand the smaller frontier
    if (frontierF.length <= frontierB.length) {
      const nextFrontier: number[] = [];
      for (let i = 0; i < frontierF.length; i++) {
        const cur = frontierF[i];
        const nbrs = neighbors[cur];
        for (let j = 0; j < nbrs.length; j++) {
          const n = nbrs[j];
          if (visitedF[n]) continue;
          visitedF[n] = 1;
          parentF[n] = cur;
          if (visitedB[n]) {
            meetIdx = n;
            break outer;
          }
          nextFrontier.push(n);
        }
      }
      frontierF = nextFrontier;
    } else {
      const nextFrontier: number[] = [];
      for (let i = 0; i < frontierB.length; i++) {
        const cur = frontierB[i];
        const nbrs = neighbors[cur];
        for (let j = 0; j < nbrs.length; j++) {
          const n = nbrs[j];
          if (visitedB[n]) continue;
          visitedB[n] = 1;
          parentB[n] = cur;
          if (visitedF[n]) {
            meetIdx = n;
            break outer;
          }
          nextFrontier.push(n);
        }
      }
      frontierB = nextFrontier;
    }
  }

  if (meetIdx === -1) {
    const response = NextResponse.json(
      { data: null, message: "No route found within refueling constraints." },
      { status: 404 }
    );
    response.headers.set("X-Response-Time", `${(performance.now() - start).toFixed(2)}ms`);
    return response;
  }

  // Reconstruct path: origin → meetIdx ← destination
  const pathForward: number[] = [];
  let cur = meetIdx;
  while (cur !== -1) {
    pathForward.push(cur);
    cur = parentF[cur];
  }
  pathForward.reverse();

  const pathBackward: number[] = [];
  cur = parentB[meetIdx];
  while (cur !== -1) {
    pathBackward.push(cur);
    cur = parentB[cur];
  }

  const fullPath = [...pathForward, ...pathBackward];
  const result = buildRouteResponse(fullPath);
  const response = NextResponse.json({ data: result });
  response.headers.set("X-Response-Time", `${(performance.now() - start).toFixed(2)}ms`);
  return response;
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
