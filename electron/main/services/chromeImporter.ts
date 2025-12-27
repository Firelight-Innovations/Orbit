import { join } from 'path'
import { existsSync, readdirSync, readFileSync, cpSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { createImportedProfile, getProfileDir, type ProfileColor, PROFILE_COLORS } from './profileService'

// Chrome profile info parsed from Local State
export interface ChromeProfileInfo {
  name: string
  directoryName: string // e.g., "Default", "Profile 1"
  email?: string
  avatar?: string
  isDefault: boolean
  path: string // Full path to the profile directory
}

// Import progress status
export interface ImportProgress {
  phase: 'detecting' | 'copying' | 'complete' | 'error'
  currentStep: string
  progress: number // 0-100
  error?: string
}

// Data categories that can be imported
export type ImportCategory = 
  | 'bookmarks'
  | 'history'
  | 'cookies'
  | 'extensions'
  | 'passwords'
  | 'preferences'

// Files/folders to copy for each category
const IMPORT_CATEGORIES: Record<ImportCategory, string[]> = {
  bookmarks: ['Bookmarks', 'Bookmarks.bak'],
  history: ['History', 'History-journal'],
  cookies: ['Cookies', 'Cookies-journal'],
  extensions: ['Extensions', 'Extension State', 'Extension Rules'],
  passwords: ['Login Data', 'Login Data-journal'],
  preferences: ['Preferences', 'Secure Preferences']
}

/**
 * Get the Chrome user data directory for the current platform
 */
export function getChromeUserDataDir(): string | null {
  const platform = process.platform
  const home = homedir()

  if (platform === 'win32') {
    // Windows
    const localAppData = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local')
    return join(localAppData, 'Google', 'Chrome', 'User Data')
  } else if (platform === 'darwin') {
    // macOS
    return join(home, 'Library', 'Application Support', 'Google', 'Chrome')
  } else if (platform === 'linux') {
    // Linux
    return join(home, '.config', 'google-chrome')
  }

  return null
}

/**
 * Check if Chrome is installed
 */
export function isChromeInstalled(): boolean {
  const userDataDir = getChromeUserDataDir()
  return userDataDir !== null && existsSync(userDataDir)
}

/**
 * Detect available Chrome profiles
 */
export function detectChromeProfiles(): ChromeProfileInfo[] {
  const userDataDir = getChromeUserDataDir()
  if (!userDataDir || !existsSync(userDataDir)) {
    return []
  }

  const profiles: ChromeProfileInfo[] = []

  // Try to read Local State for profile info
  const localStatePath = join(userDataDir, 'Local State')
  let localState: {
    profile?: {
      info_cache?: Record<string, {
        name?: string
        gaia_name?: string
        user_name?: string
        gaia_picture_url?: string
        is_using_default_avatar?: boolean
      }>
    }
  } | null = null

  if (existsSync(localStatePath)) {
    try {
      const content = readFileSync(localStatePath, 'utf-8')
      localState = JSON.parse(content)
    } catch (error) {
      console.error('Error reading Chrome Local State:', error)
    }
  }

  // Get profile directories
  const entries = readdirSync(userDataDir, { withFileTypes: true })
  
  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    // Chrome profiles are in "Default" or "Profile N" directories
    const isProfile = entry.name === 'Default' || /^Profile \d+$/.test(entry.name)
    if (!isProfile) continue

    const profilePath = join(userDataDir, entry.name)
    
    // Verify it's a real profile by checking for key files
    const hasPreferences = existsSync(join(profilePath, 'Preferences'))
    if (!hasPreferences) continue

    // Get profile info from Local State if available
    const profileInfo = localState?.profile?.info_cache?.[entry.name]

    const name = profileInfo?.name || 
                 profileInfo?.gaia_name || 
                 (entry.name === 'Default' ? 'Default Profile' : entry.name)

    profiles.push({
      name,
      directoryName: entry.name,
      email: profileInfo?.user_name,
      avatar: profileInfo?.gaia_picture_url,
      isDefault: entry.name === 'Default',
      path: profilePath
    })
  }

  // Sort: Default first, then by name
  return profiles.sort((a, b) => {
    if (a.isDefault) return -1
    if (b.isDefault) return 1
    return a.name.localeCompare(b.name)
  })
}

/**
 * Get details about what data exists in a Chrome profile
 */
export function getProfileDataSummary(chromeProfile: ChromeProfileInfo): Record<ImportCategory, boolean> {
  const summary: Record<ImportCategory, boolean> = {
    bookmarks: false,
    history: false,
    cookies: false,
    extensions: false,
    passwords: false,
    preferences: false
  }

  for (const [category, files] of Object.entries(IMPORT_CATEGORIES)) {
    for (const file of files) {
      if (existsSync(join(chromeProfile.path, file))) {
        summary[category as ImportCategory] = true
        break
      }
    }
  }

  return summary
}

/**
 * Import a Chrome profile to create a new Orbit profile
 */
export async function importChromeProfile(
  chromeProfile: ChromeProfileInfo,
  newProfileName: string,
  categories: ImportCategory[] = ['bookmarks', 'history', 'cookies', 'extensions', 'passwords'],
  onProgress?: (progress: ImportProgress) => void
): Promise<{ success: boolean; profileId?: string; error?: string }> {
  try {
    // Start progress
    onProgress?.({
      phase: 'detecting',
      currentStep: 'Creating Orbit profile...',
      progress: 5
    })

    // Pick a color based on index
    const colorIndex = Math.floor(Math.random() * PROFILE_COLORS.length)
    const color: ProfileColor = PROFILE_COLORS[colorIndex]

    // Create the Orbit profile
    const orbitProfile = createImportedProfile(
      newProfileName,
      chromeProfile.name,
      color,
      chromeProfile.avatar
    )

    const profileDir = getProfileDir(orbitProfile.id)

    onProgress?.({
      phase: 'copying',
      currentStep: 'Preparing to copy data...',
      progress: 10
    })

    // Copy data for each category
    const totalCategories = categories.length
    let completedCategories = 0

    for (const category of categories) {
      const files = IMPORT_CATEGORIES[category]
      
      onProgress?.({
        phase: 'copying',
        currentStep: `Importing ${category}...`,
        progress: 10 + Math.floor((completedCategories / totalCategories) * 80)
      })

      for (const file of files) {
        const sourcePath = join(chromeProfile.path, file)
        if (existsSync(sourcePath)) {
          try {
            const destPath = join(profileDir, file)
            
            // Ensure parent directory exists
            mkdirSync(join(destPath, '..'), { recursive: true })
            
            // Copy file or directory
            cpSync(sourcePath, destPath, { recursive: true, force: true })
          } catch (error) {
            console.warn(`Warning: Could not copy ${file}:`, error)
            // Continue with other files
          }
        }
      }

      completedCategories++
    }

    // Copy additional Chrome profile data that might be needed
    const additionalFiles = [
      'Web Data',
      'Favicons',
      'Top Sites',
      'Visited Links',
      'TransportSecurity'
    ]

    onProgress?.({
      phase: 'copying',
      currentStep: 'Copying additional data...',
      progress: 92
    })

    for (const file of additionalFiles) {
      const sourcePath = join(chromeProfile.path, file)
      if (existsSync(sourcePath)) {
        try {
          const destPath = join(profileDir, file)
          cpSync(sourcePath, destPath, { recursive: true, force: true })
        } catch (error) {
          // Ignore errors for additional files
        }
      }
    }

    onProgress?.({
      phase: 'complete',
      currentStep: 'Import complete!',
      progress: 100
    })

    return {
      success: true,
      profileId: orbitProfile.id
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    
    onProgress?.({
      phase: 'error',
      currentStep: 'Import failed',
      progress: 0,
      error: errorMessage
    })

    return {
      success: false,
      error: errorMessage
    }
  }
}

/**
 * Check if Chrome is currently running (important for password import)
 * Note: This is a simple check and may not work on all systems
 */
export function isChromeRunning(): boolean {
  // TODO: Implement platform-specific process check
  // For now, we'll assume Chrome is not running
  return false
}

