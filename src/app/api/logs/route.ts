import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/logs — Read system logs
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "100");
    const level = searchParams.get("level") || "";

    const where: any = {};
    if (level) where.level = level.toUpperCase();

    const logs = await db.systemLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json(logs.map((l) => ({
      timestamp: l.createdAt.toISOString(),
      level: l.level,
      message: l.message,
    })));
  } catch (error: any) {
    return NextResponse.json({ error: "Database not available", logs: [] }, { status: 503 });
  }
}

// POST /api/logs — Add a system log entry
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const log = await db.systemLog.create({
      data: {
        level: (body.level || "INFO").toUpperCase(),
        message: body.message || "",
        source: body.source || "dashboard",
      },
    });
    return NextResponse.json({ success: true, log });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
