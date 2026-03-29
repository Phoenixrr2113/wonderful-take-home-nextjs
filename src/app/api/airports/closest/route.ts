import { NextRequest, NextResponse } from "next/server";
import { closestSchema, formatZodErrors } from "@/lib/validation";
import { airportsByCountry } from "@/lib/airports";
import { haversineDistance } from "@/lib/haversine";

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

  let minDistance = Infinity;
  let closestPair: { airport1: typeof airports1[0]; airport2: typeof airports2[0]; distance_miles: number } | null = null;

  for (const a1 of airports1) {
    for (const a2 of airports2) {
      const d = haversineDistance(a1.latitude, a1.longitude, a2.latitude, a2.longitude);
      if (d < minDistance) {
        minDistance = d;
        closestPair = { airport1: a1, airport2: a2, distance_miles: d };
      }
    }
  }

  const response = NextResponse.json({ data: closestPair });
  response.headers.set("X-Response-Time", `${(performance.now() - start).toFixed(2)}ms`);
  return response;
}
