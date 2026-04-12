// ============================================
// Audit Logger - Configuration Change Tracking
// ============================================
// Simple audit logging utility for tracking all
// configuration changes across the application.
// Uses the ConfigChange table in the database.
// ============================================

import { db } from '@/lib/db';

// ---- Types ----

export interface ConfigChangeRecord {
  id: number;
  section: string;
  key: string;
  oldValue: string | null;
  newValue: string | null;
  source: string;
  createdAt: Date;
}

export interface ConfigChangeFilters {
  section?: string;
  key?: string;
  source?: string;
  limit?: number;
  offset?: number;
}

// ---- Functions ----

/**
 * Log a configuration change to the audit trail.
 * This is the primary entry point for recording config changes.
 * Typically called by settings-manager.ts automatically, but
 * can also be called directly for custom audit needs.
 */
export async function logConfigChange(
  section: string,
  key: string,
  oldValue: string | null,
  newValue: string | null,
  source: string = 'system'
): Promise<void> {
  try {
    await db.configChange.create({
      data: {
        section,
        key,
        oldValue,
        newValue,
        source,
      },
    });
  } catch (error) {
    // Audit logging should never crash the application
    console.error(
      `[AuditLogger] Failed to log config change [${section}.${key}]:`,
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Query the config change audit log with optional filters.
 * Returns changes in reverse chronological order (newest first).
 */
export async function getConfigChanges(
  filters?: ConfigChangeFilters
): Promise<ConfigChangeRecord[]> {
  try {
    const where: Record<string, unknown> = {};

    if (filters?.section) where.section = filters.section;
    if (filters?.key) where.key = filters.key;
    if (filters?.source) where.source = filters.source;

    const limit = filters?.limit ?? 50;
    const offset = filters?.offset ?? 0;

    const rows = await db.configChange.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return rows.map(row => ({
      id: row.id,
      section: row.section,
      key: row.key,
      oldValue: row.oldValue,
      newValue: row.newValue,
      source: row.source,
      createdAt: row.createdAt,
    }));
  } catch (error) {
    console.error('[AuditLogger] getConfigChanges error:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Get the most recent config changes (shortcut for common use).
 * Returns the last N changes in reverse chronological order.
 */
export async function getRecentChanges(limit: number = 20): Promise<ConfigChangeRecord[]> {
  return getConfigChanges({ limit });
}

/**
 * Get changes for a specific section.
 */
export async function getChangesBySection(
  section: string,
  limit: number = 50
): Promise<ConfigChangeRecord[]> {
  return getConfigChanges({ section, limit });
}

/**
 * Get changes for a specific key.
 */
export async function getChangesByKey(
  key: string,
  limit: number = 50
): Promise<ConfigChangeRecord[]> {
  return getConfigChanges({ key, limit });
}

/**
 * Count the total number of audit log entries.
 * Optionally filter by section.
 */
export async function getConfigChangeCount(section?: string): Promise<number> {
  try {
    const where = section ? { section } : {};
    return await db.configChange.count({ where });
  } catch (error) {
    console.error('[AuditLogger] getConfigChangeCount error:', error instanceof Error ? error.message : String(error));
    return 0;
  }
}

/**
 * Prune old audit log entries.
 * Deletes entries older than the specified number of days.
 * Useful for keeping the audit log from growing unbounded.
 */
export async function pruneConfigChanges(olderThanDays: number): Promise<number> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);

    const result = await db.configChange.deleteMany({
      where: {
        createdAt: { lt: cutoff },
      },
    });

    console.log(`[AuditLogger] Pruned ${result.count} config change entries older than ${olderThanDays} days`);
    return result.count;
  } catch (error) {
    console.error('[AuditLogger] pruneConfigChanges error:', error instanceof Error ? error.message : String(error));
    return 0;
  }
}

/**
 * Get a summary of config changes grouped by section.
 * Returns a count of changes per section for the last N days.
 */
export async function getConfigChangeSummary(lastDays: number = 7): Promise<{ section: string; count: number }[]> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lastDays);

    const rows = await db.configChange.findMany({
      where: {
        createdAt: { gte: cutoff },
      },
      select: {
        section: true,
      },
    });

    // Group by section
    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.section] = (counts[row.section] || 0) + 1;
    }

    return Object.entries(counts)
      .map(([section, count]) => ({ section, count }))
      .sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error('[AuditLogger] getConfigChangeSummary error:', error instanceof Error ? error.message : String(error));
    return [];
  }
}
