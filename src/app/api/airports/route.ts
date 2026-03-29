import { NextResponse } from "next/server";
import { airports } from "@/lib/airports";

export const revalidate = 3600;

export async function GET() {
  return NextResponse.json({ data: airports });
}
