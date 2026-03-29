import { NextRequest, NextResponse } from "next/server";
import { searchSchema, formatZodErrors } from "@/lib/validation";
import { findAirportsWithinRadius } from "@/lib/spatial-index";
import { haversineDistance } from "@/lib/haversine";
import type { AirportWithDistance } from "@/lib/types";

export async function GET(request: NextRequest) {
  const start = performance.now();
  const sp = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = searchSchema.safeParse(sp);

  if (!parsed.success) {
    return NextResponse.json(
      { errors: formatZodErrors(parsed.error) },
      { status: 422 }
    );
  }

  const { latitude, longitude, radius } = parsed.data;
  const nearby = findAirportsWithinRadius(longitude, latitude, radius);

  const results: AirportWithDistance[] = nearby.map((airport) => ({
    ...airport,
    distance: haversineDistance(
      latitude,
      longitude,
      airport.latitude,
      airport.longitude
    ),
  }));

  results.sort((a, b) => a.distance - b.distance);

  const response = NextResponse.json({ data: results });
  response.headers.set("X-Response-Time", `${(performance.now() - start).toFixed(2)}ms`);
  return response;
}
