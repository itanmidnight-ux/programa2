// ============================================
// RECO-TRADING - Alert Rules API
// ============================================
// GET  /api/alerts  - List alert rules
// POST /api/alerts  - Create / Update / Delete / Toggle alert rules
// ============================================

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// ---- GET: List all alert rules ----
export async function GET() {
  try {
    const rules = await db.alertRule.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ rules });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ---- POST: Actions ----
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      // ---- CREATE ----
      case "create": {
        const { name, condition } = body;
        if (!name || typeof name !== "string" || name.trim().length > 100) {
          return NextResponse.json({ error: "name required (max 100 chars)" }, { status: 400 });
        }
        if (!condition || typeof condition !== "object") {
          return NextResponse.json({ error: "condition object required" }, { status: 400 });
        }

        // Sanitize name to prevent injection
        const sanitizedName = name.trim().replace(/[<>"'&]/g, "");

        const rule = await db.alertRule.create({
          data: {
            name: sanitizedName,
            condition: JSON.stringify(condition),
            enabled: body.enabled !== false,
          },
        });

        return NextResponse.json({ success: true, rule });
      }

      // ---- UPDATE ----
      case "update": {
        const { id, name, condition, enabled } = body;
        if (!id || typeof id !== "number") {
          return NextResponse.json({ error: "id required (must be a number)" }, { status: 400 });
        }

        const existing = await db.alertRule.findUnique({ where: { id } });
        if (!existing) {
          return NextResponse.json({ error: "Alert rule not found" }, { status: 404 });
        }

        const updateData: any = {};
        if (name !== undefined) {
          if (typeof name !== "string" || name.trim().length > 100) {
            return NextResponse.json({ error: "name must be a string (max 100 chars)" }, { status: 400 });
          }
          updateData.name = name.trim().replace(/[<>"'&]/g, "");
        }
        if (condition !== undefined) {
          if (typeof condition !== "object") {
            return NextResponse.json({ error: "condition must be an object" }, { status: 400 });
          }
          updateData.condition = JSON.stringify(condition);
        }
        if (enabled !== undefined) updateData.enabled = Boolean(enabled);

        const rule = await db.alertRule.update({
          where: { id },
          data: updateData,
        });

        return NextResponse.json({ success: true, rule });
      }

      // ---- DELETE ----
      case "delete": {
        const { id } = body;
        if (!id || typeof id !== "number") {
          return NextResponse.json({ error: "id required (must be a number)" }, { status: 400 });
        }

        const existing = await db.alertRule.findUnique({ where: { id } });
        if (!existing) {
          return NextResponse.json({ error: "Alert rule not found" }, { status: 404 });
        }

        await db.alertRule.delete({ where: { id } });

        return NextResponse.json({
          success: true,
          message: `Alert rule "${existing.name}" deleted`,
        });
      }

      // ---- TOGGLE ----
      case "toggle": {
        const { id } = body;
        if (!id || typeof id !== "number") {
          return NextResponse.json({ error: "id required (must be a number)" }, { status: 400 });
        }

        const existing = await db.alertRule.findUnique({ where: { id } });
        if (!existing) {
          return NextResponse.json({ error: "Alert rule not found" }, { status: 404 });
        }

        const rule = await db.alertRule.update({
          where: { id },
          data: { enabled: !existing.enabled },
        });

        return NextResponse.json({
          success: true,
          rule,
          message: `Alert rule "${rule.name}" ${rule.enabled ? "enabled" : "disabled"}`,
        });
      }

      default:
        return NextResponse.json(
          { error: "Invalid action. Use: create, update, delete, toggle" },
          { status: 400 }
        );
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
