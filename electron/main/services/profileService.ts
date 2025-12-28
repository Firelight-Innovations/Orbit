import Store from 'electron-store'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, cpSync, rmSync } from 'fs'

// Profile color options
export const PROFILE_COLORS = [
  '#8b5cf6', // Purple (default)
  '#3b82f6', // Blue
  '#22c55e', // Green
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
] as const

export type ProfileColor = (typeof PROFILE_COLORS)[number]

export interface OrbitProfile {
  id: string
  name: string
  color: ProfileColor
  avatar?: string // URL or base64
  createdAt: string
  lastUsed: string
  isImported: boolean
  chromeProfileName?: string // Original Chrome profile name if imported
}

interface ProfileStoreSchema {
  profiles: OrbitProfile[]
  activeProfileId: string | null
  isFirstLaunch: boolean
  onboardingComplete: boolean
}

// Create typed store
const store = new Store<ProfileStoreSchema>({
  name: 'orbit-profiles',
  defaults: {
    profiles: [],
    activeProfileId: null,
    isFirstLaunch: true,
    onboardingComplete: false
  }
})

/**
 * Get the user data directory for Orbit profiles
 */
export function getOrbitUserDataDir(): string {
  return join(app.getPath('userData'), 'Profiles')
}

/**
 * Get the directory for a specific profile
 */
export function getProfileDir(profileId: string): string {
  return join(getOrbitUserDataDir(), profileId)
}

/**
 * Ensure the profiles directory exists
 */
function ensureProfilesDir(): void {
  const dir = getOrbitUserDataDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

/**
 * Check if this is the first launch
 */
export function isFirstLaunch(): boolean {
  return store.get('isFirstLaunch', true)
}

/**
 * Check if onboarding has been completed
 */
export function isOnboardingComplete(): boolean {
  return store.get('onboardingComplete', false)
}

/**
 * Mark onboarding as complete
 */
export function completeOnboarding(): void {
  store.set('isFirstLaunch', false)
  store.set('onboardingComplete', true)
}

/**
 * Reset first launch flag (for testing)
 */
export function resetFirstLaunch(): void {
  store.set('isFirstLaunch', true)
  store.set('onboardingComplete', false)
}

/**
 * Get all profiles
 */
export function getProfiles(): OrbitProfile[] {
  return store.get('profiles', [])
}

/**
 * Get a profile by ID
 */
export function getProfile(profileId: string): OrbitProfile | undefined {
  const profiles = getProfiles()
  return profiles.find(p => p.id === profileId)
}

/**
 * Get the active profile
 */
export function getActiveProfile(): OrbitProfile | null {
  const activeId = store.get('activeProfileId')
  if (!activeId) return null
  return getProfile(activeId) ?? null
}

/**
 * Get the active profile ID
 */
export function getActiveProfileId(): string | null {
  return store.get('activeProfileId', null)
}

/**
 * Generate a unique profile ID
 */
function generateProfileId(): string {
  return `profile-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Create a new profile
 */
export function createProfile(
  name: string,
  color: ProfileColor = PROFILE_COLORS[0],
  avatar?: string
): OrbitProfile {
  ensureProfilesDir()

  const profile: OrbitProfile = {
    id: generateProfileId(),
    name,
    color,
    avatar,
    createdAt: new Date().toISOString(),
    lastUsed: new Date().toISOString(),
    isImported: false
  }

  // Create the profile directory
  const profileDir = getProfileDir(profile.id)
  mkdirSync(profileDir, { recursive: true })

  // Save to store
  const profiles = getProfiles()
  profiles.push(profile)
  store.set('profiles', profiles)

  // If this is the first profile, make it active
  if (!store.get('activeProfileId')) {
    store.set('activeProfileId', profile.id)
  }

  return profile
}

/**
 * Create a profile from an imported Chrome profile
 */
export function createImportedProfile(
  name: string,
  chromeProfileName: string,
  color: ProfileColor = PROFILE_COLORS[0],
  avatar?: string
): OrbitProfile {
  ensureProfilesDir()

  const profile: OrbitProfile = {
    id: generateProfileId(),
    name,
    color,
    avatar,
    createdAt: new Date().toISOString(),
    lastUsed: new Date().toISOString(),
    isImported: true,
    chromeProfileName
  }

  // Create the profile directory
  const profileDir = getProfileDir(profile.id)
  mkdirSync(profileDir, { recursive: true })

  // Save to store
  const profiles = getProfiles()
  profiles.push(profile)
  store.set('profiles', profiles)

  // If this is the first profile, make it active
  if (!store.get('activeProfileId')) {
    store.set('activeProfileId', profile.id)
  }

  return profile
}

/**
 * Update a profile
 */
export function updateProfile(
  profileId: string,
  updates: Partial<Omit<OrbitProfile, 'id' | 'createdAt'>>
): OrbitProfile | null {
  const profiles = getProfiles()
  const index = profiles.findIndex(p => p.id === profileId)
  
  if (index === -1) return null

  profiles[index] = {
    ...profiles[index],
    ...updates,
    lastUsed: new Date().toISOString()
  }

  store.set('profiles', profiles)
  return profiles[index]
}

/**
 * Delete a profile
 */
export function deleteProfile(profileId: string): boolean {
  const profiles = getProfiles()
  const index = profiles.findIndex(p => p.id === profileId)
  
  if (index === -1) return false

  // Remove from store
  profiles.splice(index, 1)
  store.set('profiles', profiles)

  // Delete profile directory
  const profileDir = getProfileDir(profileId)
  if (existsSync(profileDir)) {
    rmSync(profileDir, { recursive: true, force: true })
  }

  // If this was the active profile, switch to another
  if (store.get('activeProfileId') === profileId) {
    store.set('activeProfileId', profiles[0]?.id ?? null)
  }

  return true
}

/**
 * Set the active profile
 */
export function setActiveProfile(profileId: string): boolean {
  const profile = getProfile(profileId)
  if (!profile) return false

  store.set('activeProfileId', profileId)
  updateProfile(profileId, { lastUsed: new Date().toISOString() })
  
  return true
}

/**
 * Copy data from source directory to profile directory
 */
export function copyDataToProfile(profileId: string, sourcePath: string, relativePath: string): boolean {
  try {
    const profileDir = getProfileDir(profileId)
    const destPath = join(profileDir, relativePath)
    
    // Ensure parent directory exists
    const parentDir = join(destPath, '..')
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true })
    }

    cpSync(sourcePath, destPath, { recursive: true, force: true })
    return true
  } catch (error) {
    console.error(`Error copying data to profile: ${error}`)
    return false
  }
}

/**
 * Get the user data directory path for a profile (used with --user-data-dir)
 */
export function getProfileUserDataDir(profileId: string): string {
  return getProfileDir(profileId)
}

// Export store for direct access if needed
export { store as profileStore }

