import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch("http://localhost:9000/api/snapshot?XTransformPort=9000", {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Flask not available");
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Flask API not available", mock: true }, { status: 503 });
  }
}
