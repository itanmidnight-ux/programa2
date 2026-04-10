// ============================================
// RECO-TRADING - Config Profiles API
// ============================================
// GET  /api/profiles  - List all profiles
// POST /api/profiles  - Create / Load / Delete / Set Active profile
// ============================================

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// ---- GET: List all profiles ----
export async function GET() {
  try {
    const profiles = await db.configProfile.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ profiles });
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
        const { name, description, settings } = body;
        if (!name || typeof name !== "string" || name.trim().length > 100) {
          return NextResponse.json({ error: "name required (max 100 chars)" }, { status: 400 });
        }

        const sanitizedName = name.trim().replace(/[<>"'&]/g, "");
        const sanitizedDesc = typeof description === "string"
          ? description.slice(0, 500).replace(/[<>"'&]/g, "")
          : "";

        const profile = await db.configProfile.create({
          data: {
            name: sanitizedName,
            description: sanitizedDesc,
            settings: JSON.stringify(settings || []),
          },
        });

        return NextResponse.json({ success: true, profile });
      }

      // ---- LOAD (apply profile to AppSettings) ----
      case "load": {
        const { id } = body;
        if (!id || typeof id !== "number") {
          return NextResponse.json({ error: "id required (must be a number)" }, { status: 400 });
        }

        const profile = await db.configProfile.findUnique({ where: { id } });
        if (!profile) {
          return NextResponse.json({ error: "Profile not found" }, { status: 404 });
        }

        // Parse settings from profile
        const settings: Array<{ key: string; value: string; section: string }> = JSON.parse(
          profile.settings || "[]"
        );

        // Apply each setting to AppSettings
        for (const setting of settings) {
          const existing = await db.appSetting.findUnique({ where: { key: setting.key } });
          if (existing && existing.value !== setting.value) {
            await db.configChange.create({
              data: {
                section: setting.section || existing.section,
                key: setting.key,
                oldValue: existing.value,
                newValue: setting.value,
                source: "profile",
              },
            });
          }

          await db.appSetting.upsert({
            where: { key: setting.key },
            update: { value: setting.value, section: setting.section },
            create: { key: setting.key, value: setting.value, section: setting.section || "general" },
          });
        }

        // Set this profile as active, deactivate others
        await db.configProfile.updateMany({ where: { isActive: true }, data: { isActive: false } });
        await db.configProfile.update({ where: { id }, data: { isActive: true } });

        return NextResponse.json({
          success: true,
          message: `Profile "${profile.name}" loaded (${settings.length} settings applied)`,
        });
      }

      // ---- DELETE ----
      case "delete": {
        const { id } = body;
        if (!id || typeof id !== "number") {
          return NextResponse.json({ error: "id required (must be a number)" }, { status: 400 });
        }

        const profile = await db.configProfile.findUnique({ where: { id } });
        if (!profile) {
          return NextResponse.json({ error: "Profile not found" }, { status: 404 });
        }

        await db.configProfile.delete({ where: { id } });

        return NextResponse.json({
          success: true,
          message: `Profile "${profile.name}" deleted`,
        });
      }

      // ---- SET ACTIVE ----
      case "set_active": {
        const { id } = body;
        if (!id || typeof id !== "number") {
          return NextResponse.json({ error: "id required (must be a number)" }, { status: 400 });
        }

        const profile = await db.configProfile.findUnique({ where: { id } });
        if (!profile) {
          return NextResponse.json({ error: "Profile not found" }, { status: 404 });
        }

        await db.configProfile.updateMany({ where: { isActive: true }, data: { isActive: false } });
        await db.configProfile.update({ where: { id }, data: { isActive: true } });

        return NextResponse.json({
          success: true,
          message: `Profile "${profile.name}" set as active`,
        });
      }

      default:
        return NextResponse.json(
          { error: "Invalid action. Use: create, load, delete, set_active" },
          { status: 400 }
        );
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
