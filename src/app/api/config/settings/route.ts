// ============================================
// RECO-TRADING - App Settings API
// ============================================
// GET    /api/config/settings       - Load all app settings from DB
// PUT    /api/config/settings       - Bulk update settings
// POST   /api/config/settings/reset - Reset to defaults
// ============================================

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// ---- Default settings seed ----
const DEFAULT_SETTINGS: { key: string; value: string; section: string; description?: string }[] = [
  // API
  { key: "api_key", value: "", section: "api", description: "Legacy API key (compat)" },
  { key: "api_secret", value: "", section: "api", description: "Legacy API secret (compat)" },
  { key: "testnet", value: "true", section: "api", description: "Use demo mode" },
  { key: "confirm_mainnet", value: "false", section: "api", description: "Confirm mainnet trading" },
  { key: "broker_active", value: "oanda", section: "general", description: "Active broker provider" },
  // Trading
  { key: "symbol", value: "XAU_USD", section: "trading", description: "Trading symbol" },
  { key: "timeframe", value: "5m", section: "trading", description: "Candle timeframe" },
  { key: "loop_sleep", value: "5", section: "trading", description: "Loop sleep seconds" },
  { key: "history_limit", value: "200", section: "trading", description: "Candles to fetch" },
  // Signals
  { key: "min_confidence", value: "0.62", section: "signals", description: "Min signal confidence" },
  { key: "strong_confidence", value: "0.78", section: "signals", description: "Strong confidence threshold" },
  { key: "adx_min", value: "18", section: "signals", description: "Min ADX for trend" },
  { key: "max_spread", value: "1.5", section: "signals", description: "Max spread USDT" },
  { key: "min_volume", value: "0.5", section: "signals", description: "Min volume ratio" },
  // Risk
  { key: "risk_per_trade", value: "1.2", section: "risk", description: "Risk per trade %" },
  { key: "max_trades_day", value: "120", section: "risk", description: "Max trades per day" },
  { key: "daily_loss_limit", value: "50", section: "risk", description: "Daily loss limit $" },
  { key: "max_drawdown", value: "15", section: "risk", description: "Max drawdown %" },
  { key: "stop_loss", value: "1.5", section: "risk", description: "Default stop loss %" },
  { key: "take_profit", value: "2.5", section: "risk", description: "Default take profit %" },
  // Execution
  { key: "max_slippage", value: "0.1", section: "execution", description: "Max slippage %" },
  { key: "max_spread_exec", value: "2.0", section: "execution", description: "Max spread exec USDT" },
  { key: "order_timeout", value: "5000", section: "execution", description: "Order timeout ms" },
  { key: "split_threshold", value: "500", section: "execution", description: "Split threshold $" },
  { key: "retry_attempts", value: "3", section: "execution", description: "Retry attempts" },
  // Autopause
  { key: "pause_on_loss_limit", value: "true", section: "autopause", description: "Pause on daily loss" },
  { key: "pause_on_drawdown", value: "true", section: "autopause", description: "Pause on max drawdown" },
  { key: "pause_on_spread", value: "true", section: "autopause", description: "Pause on high spread" },
  { key: "pause_on_disconnect", value: "true", section: "autopause", description: "Pause on disconnect" },
  // Display
  { key: "terminal_tui", value: "false", section: "display", description: "Terminal TUI" },
  { key: "low_ram", value: "false", section: "display", description: "Low RAM mode" },
];

// ---- GET: Fetch all settings ----
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const section = url.searchParams.get("section");

    const where = section ? { section } : {};
    const settings = await db.appSetting.findMany({
      where,
      orderBy: [{ section: "asc" }, { key: "asc" }],
    });

    return NextResponse.json({ settings });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ---- PUT: Bulk update settings ----
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const updates: Array<{ key: string; value: string; section: string }> = body.settings;

    if (!Array.isArray(updates)) {
      return NextResponse.json({ error: "settings array required" }, { status: 400 });
    }

    const updatedCount = { count: 0 };
    const createdCount = { count: 0 };

    for (const update of updates) {
      if (!update.key || update.value === undefined) continue;

      // Log the change before updating
      const existing = await db.appSetting.findUnique({ where: { key: update.key } });
      if (existing && existing.value !== update.value) {
        await db.configChange.create({
          data: {
            section: update.section || existing.section,
            key: update.key,
            oldValue: existing.value,
            newValue: update.value,
            source: "user",
          },
        });
      } else if (!existing) {
        await db.configChange.create({
          data: {
            section: update.section || "general",
            key: update.key,
            oldValue: null,
            newValue: update.value,
            source: "user",
          },
        });
      }

      // Upsert the setting
      const result = await db.appSetting.upsert({
        where: { key: update.key },
        update: { value: update.value, section: update.section },
        create: {
          key: update.key,
          value: update.value,
          section: update.section || "general",
        },
      });

      if (result.createdAt === result.updatedAt) {
        createdCount.count++;
      } else {
        updatedCount.count++;
      }
    }

    // Apply settings to running engine (non-blocking)
    import('@/lib/config-persistence').then(({ applySettingsToEngine }) => {
      applySettingsToEngine().catch(() => {});
    });

    return NextResponse.json({
      success: true,
      updated: updatedCount.count,
      created: createdCount.count,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ---- POST: Reset to defaults ----
export async function POST(request: Request) {
  try {
    // Check for reset action in URL
    const url = new URL(request.url);

    // Delete all existing settings
    const count = await db.appSetting.deleteMany({});

    // Re-insert defaults
    await db.appSetting.createMany({
      data: DEFAULT_SETTINGS.map((s) => ({
        key: s.key,
        value: s.value,
        section: s.section,
        description: s.description,
      })),
    });

    // Log the reset
    await db.configChange.create({
      data: {
        section: "system",
        key: "all_settings",
        oldValue: `reset ${count.count} settings`,
        newValue: "defaults restored",
        source: "user",
      },
    });

    return NextResponse.json({
      success: true,
      message: `Reset ${count.count} settings to defaults`,
      defaultsInserted: DEFAULT_SETTINGS.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
