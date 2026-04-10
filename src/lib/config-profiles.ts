// ============================================
// Config Profiles - Named Configuration Presets
// ============================================
// Manages save/load of named configuration profiles.
// Each profile captures a full snapshot of all AppSettings
// at the time of creation, allowing quick switching between
// different trading configurations (e.g., "Conservative",
// "Aggressive", "Backtest Mode", etc.).
// ============================================

import { db } from '@/lib/db';
import { exportAllSettings, importSettings } from './settings-manager';
import { logConfigChange } from './audit-logger';

// ---- Types ----

export interface ConfigProfileRecord {
  id: number;
  name: string;
  description: string;
  settings: Record<string, string>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ---- Functions ----

/**
 * Create a new profile by snapshotting the current settings.
 * If the profile is set as active, all other profiles will be deactivated.
 */
export async function createProfile(
  name: string,
  description: string = '',
  makeActive: boolean = false
): Promise<ConfigProfileRecord | null> {
  try {
    // Snapshot all current settings
    const currentSettings = await exportAllSettings();
    const settingsJSON = JSON.stringify(currentSettings);

    // If making this active, deactivate all others first
    if (makeActive) {
      await db.configProfile.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
    }

    const profile = await db.configProfile.create({
      data: {
        name,
        description,
        settings: settingsJSON,
        isActive: makeActive,
      },
    });

    console.log(`[ConfigProfiles] Created profile "${name}" (id: ${profile.id})`);

    await logConfigChange(
      'profiles',
      `profile:${profile.id}`,
      null,
      name,
      'profile_manager'
    );

    return {
      id: profile.id,
      name: profile.name,
      description: profile.description,
      settings: currentSettings,
      isActive: profile.isActive,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  } catch (error) {
    console.error('[ConfigProfiles] createProfile error:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Apply a saved profile to all current settings.
 * This will overwrite all existing settings with the profile's snapshot.
 * Also sets the profile as active and deactivates all others.
 */
export async function loadProfile(id: number): Promise<boolean> {
  try {
    const profile = await db.configProfile.findUnique({
      where: { id },
    });

    if (!profile) {
      console.error(`[ConfigProfiles] Profile id:${id} not found`);
      return false;
    }

    // Parse the stored settings
    let settingsData: Record<string, string>;
    try {
      settingsData = JSON.parse(profile.settings);
      if (typeof settingsData !== 'object' || settingsData === null || Array.isArray(settingsData)) {
        console.error(`[ConfigProfiles] Invalid settings data in profile id:${id}`);
        return false;
      }
    } catch {
      console.error(`[ConfigProfiles] Failed to parse settings JSON in profile id:${id}`);
      return false;
    }

    // Import the settings (overwrites current values)
    const importedCount = await importSettings(settingsData, `profile:${profile.name}`);

    // Set this profile as active, deactivate others
    await db.$transaction([
      db.configProfile.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      }),
      db.configProfile.update({
        where: { id },
        data: { isActive: true },
      }),
    ]);

    console.log(`[ConfigProfiles] Loaded profile "${profile.name}" (${importedCount} settings applied)`);

    await logConfigChange(
      'profiles',
      `profile:${id}`,
      null,
      `loaded:${profile.name}`,
      'profile_manager'
    );

    return true;
  } catch (error) {
    console.error('[ConfigProfiles] loadProfile error:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Delete a profile by ID.
 * Cannot delete the currently active profile (must deactivate first).
 */
export async function deleteProfile(id: number): Promise<boolean> {
  try {
    const profile = await db.configProfile.findUnique({
      where: { id },
    });

    if (!profile) {
      console.error(`[ConfigProfiles] Profile id:${id} not found`);
      return false;
    }

    if (profile.isActive) {
      console.error(`[ConfigProfiles] Cannot delete active profile "${profile.name}" — deactivate first`);
      return false;
    }

    await db.configProfile.delete({
      where: { id },
    });

    console.log(`[ConfigProfiles] Deleted profile "${profile.name}" (id: ${id})`);

    await logConfigChange(
      'profiles',
      `profile:${id}`,
      profile.name,
      null,
      'profile_manager'
    );

    return true;
  } catch (error) {
    console.error('[ConfigProfiles] deleteProfile error:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * List all profiles (without the full settings snapshot).
 */
export async function getAllProfiles(): Promise<ConfigProfileRecord[]> {
  try {
    const profiles = await db.configProfile.findMany({
      orderBy: [
        { isActive: 'desc' },  // Active profiles first
        { createdAt: 'desc' },  // Then newest first
      ],
    });

    return profiles.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      settings: {}, // Don't load full settings in list view
      isActive: p.isActive,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  } catch (error) {
    console.error('[ConfigProfiles] getAllProfiles error:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/**
 * Set a specific profile as the active profile.
 * Deactivates all other profiles.
 */
export async function setActiveProfile(id: number): Promise<boolean> {
  try {
    const profile = await db.configProfile.findUnique({
      where: { id },
    });

    if (!profile) {
      console.error(`[ConfigProfiles] Profile id:${id} not found`);
      return false;
    }

    await db.$transaction([
      db.configProfile.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      }),
      db.configProfile.update({
        where: { id },
        data: { isActive: true },
      }),
    ]);

    console.log(`[ConfigProfiles] Set "${profile.name}" as active profile`);

    await logConfigChange(
      'profiles',
      'active_profile',
      null,
      `${profile.name}:${id}`,
      'profile_manager'
    );

    return true;
  } catch (error) {
    console.error('[ConfigProfiles] setActiveProfile error:', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Get the currently active profile (if any).
 * Includes the full settings snapshot.
 */
export async function getActiveProfile(): Promise<ConfigProfileRecord | null> {
  try {
    const profile = await db.configProfile.findFirst({
      where: { isActive: true },
    });

    if (!profile) return null;

    let settings: Record<string, string> = {};
    try {
      settings = JSON.parse(profile.settings);
      if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
        settings = {};
      }
    } catch {
      settings = {};
    }

    return {
      id: profile.id,
      name: profile.name,
      description: profile.description,
      settings,
      isActive: true,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  } catch (error) {
    console.error('[ConfigProfiles] getActiveProfile error:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Get a single profile by ID with full settings snapshot.
 */
export async function getProfileById(id: number): Promise<ConfigProfileRecord | null> {
  try {
    const profile = await db.configProfile.findUnique({
      where: { id },
    });

    if (!profile) return null;

    let settings: Record<string, string> = {};
    try {
      settings = JSON.parse(profile.settings);
      if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
        settings = {};
      }
    } catch {
      settings = {};
    }

    return {
      id: profile.id,
      name: profile.name,
      description: profile.description,
      settings,
      isActive: profile.isActive,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  } catch (error) {
    console.error('[ConfigProfiles] getProfileById error:', error instanceof Error ? error.message : String(error));
    return null;
  }
}

/**
 * Update an existing profile's name and/or description.
 * Optionally re-snapshot the current settings into the profile.
 */
export async function updateProfile(
  id: number,
  updates: { name?: string; description?: string; resnapshot?: boolean }
): Promise<boolean> {
  try {
    const profile = await db.configProfile.findUnique({ where: { id } });
    if (!profile) {
      console.error(`[ConfigProfiles] Profile id:${id} not found`);
      return false;
    }

    const updateData: Record<string, unknown> = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.resnapshot) {
      const currentSettings = await exportAllSettings();
      updateData.settings = JSON.stringify(currentSettings);
    }

    await db.configProfile.update({
      where: { id },
      data: updateData,
    });

    console.log(`[ConfigProfiles] Updated profile id:${id}`);
    return true;
  } catch (error) {
    console.error('[ConfigProfiles] updateProfile error:', error instanceof Error ? error.message : String(error));
    return false;
  }
}
