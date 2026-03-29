import { NextResponse } from "next/server";
import { airports, airportById } from "@/lib/airports";

export async function generateStaticParams() {
  return airports.map((a) => ({ id: String(a.id) }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const airport = airportById.get(parseInt(id, 10));

  if (!airport) {
    return NextResponse.json(
      { error: "Airport not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ data: airport });
}
