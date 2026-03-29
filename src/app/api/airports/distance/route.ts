import { NextRequest, NextResponse } from "next/server";
import { distanceSchema, formatZodErrors } from "@/lib/validation";
import { airportById } from "@/lib/airports";
import { haversineDistance } from "@/lib/haversine";

export async function GET(request: NextRequest) {
  const start = performance.now();
  const sp = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = distanceSchema.safeParse(sp);

  if (!parsed.success) {
    return NextResponse.json(
      { errors: formatZodErrors(parsed.error) },
      { status: 422 }
    );
  }

  const airport1 = airportById.get(parsed.data.airport1_id);
  const airport2 = airportById.get(parsed.data.airport2_id);

  if (!airport1 || !airport2) {
    return NextResponse.json(
      { error: "One or both airports not found" },
      { status: 404 }
    );
  }

  const distance = haversineDistance(
    airport1.latitude,
    airport1.longitude,
    airport2.latitude,
    airport2.longitude
  );

  const response = NextResponse.json({
    data: {
      airport1,
      airport2,
      distance_miles: distance,
    },
  });
  response.headers.set("X-Response-Time", `${(performance.now() - start).toFixed(2)}ms`);
  return response;
}
