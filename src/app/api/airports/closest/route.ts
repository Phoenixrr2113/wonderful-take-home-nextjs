import { NextRequest, NextResponse } from "next/server";
import { closestSchema, formatZodErrors } from "@/lib/validation";
import { airports, airportsByCountry, airportIndexById } from "@/lib/airports";
import { haversineDistance } from "@/lib/haversine";
import { findNearestWithPredicate } from "@/lib/spatial-index";

export async function GET(request: NextRequest) {
  const start = performance.now();
  const sp = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = closestSchema.safeParse(sp);

  if (!parsed.success) {
    return NextResponse.json(
      { errors: formatZodErrors(parsed.error) },
      { status: 422 }
    );
  }

  const { country1, country2 } = parsed.data;
  const airports1 = airportsByCountry.get(country1);
  const airports2 = airportsByCountry.get(country2);

  if (!airports1 || !airports2) {
    return NextResponse.json(
      { data: null, message: "No airports found for one or both countries." },
      { status: 404 }
    );
  }

  // Use the smaller country set and find nearest in the other via spatial index
  // O(n) spatial queries instead of O(n*m) brute force
  const [smaller, larger, smallIsCountry1] =
    airports1.length <= airports2.length
      ? [airports1, airports2, true]
      : [airports2, airports1, false];

  const targetCountry = smallIsCountry1 ? country2 : country1;

  // Build a Set of indices for the target country for fast predicate
  const targetIndices = new Set<number>();
  for (const a of larger) {
    const idx = airportIndexById.get(a.id);
    if (idx !== undefined) targetIndices.add(idx);
  }

  const predicate = (idx: number) => targetIndices.has(idx);

  let minDistance = Infinity;
  let bestA1: (typeof smaller)[0] | null = null;
  let bestA2: (typeof larger)[0] | null = null;

  for (const a of smaller) {
    const nearestIdx = findNearestWithPredicate(
      a.longitude,
      a.latitude,
      predicate
    );
    if (nearestIdx === null) continue;

    const nearest = airports[nearestIdx];
    const d = haversineDistance(a.latitude, a.longitude, nearest.latitude, nearest.longitude);
    if (d < minDistance) {
      minDistance = d;
      if (smallIsCountry1) {
        bestA1 = a;
        bestA2 = nearest;
      } else {
        bestA1 = nearest;
        bestA2 = a;
      }
    }
  }

  const response = NextResponse.json({
    data: bestA1 && bestA2
      ? {
          airport1: bestA1,
          airport2: bestA2,
          distance_miles: Math.round(minDistance * 100) / 100,
        }
      : null,
  });
  response.headers.set("X-Response-Time", `${(performance.now() - start).toFixed(2)}ms`);
  return response;
}
