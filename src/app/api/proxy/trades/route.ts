import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit") || "200";
    const status = searchParams.get("status") || "";
    let url = `http://localhost:9000/api/trades?XTransformPort=9000&limit=${limit}`;
    if (status) url += `&status=${status}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("Flask not available");
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Flask API not available", mock: true }, { status: 503 });
  }
}
