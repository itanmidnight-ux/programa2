// ============================================
// RECO-TRADING - Audit Log API
// ============================================
// GET /api/audit-log  - Get config change history
// ============================================

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
    const section = url.searchParams.get("section");

    const where: any = {};
    if (section) {
      where.section = section;
    }

    const changes = await db.configChange.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ changes });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
