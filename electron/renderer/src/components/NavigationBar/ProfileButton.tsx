import { useState, useEffect } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { 
  UserPlus, 
  Settings, 
  ChevronDown,
  Import,
} from 'lucide-react'
import type { OrbitProfile } from '@/../../preload/index'

interface ProfileButtonProps {
  onNavigate?: (url: string) => void
}

export function ProfileButton({ onNavigate }: ProfileButtonProps) {
  const [profiles, setProfiles] = useState<OrbitProfile[]>([])
  const [activeProfile, setActiveProfile] = useState<OrbitProfile | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    loadProfiles()
    
    // Listen for profile changes
    const unsubscribeProfileChange = window.electronAPI.profile.onProfileChanged((profile) => {
      setActiveProfile(profile)
    })
    
    const unsubscribeProfilesUpdate = window.electronAPI.profile.onProfilesUpdated((profiles) => {
      setProfiles(profiles)
    })
    
    // Cleanup listeners on unmount
    return () => {
      unsubscribeProfileChange()
      unsubscribeProfilesUpdate()
    }
  }, [])

  const loadProfiles = async () => {
    try {
      const [allProfiles, active] = await Promise.all([
        window.electronAPI.profile.getProfiles(),
        window.electronAPI.profile.getActiveProfile()
      ])
      setProfiles(allProfiles)
      setActiveProfile(active)
    } catch (error) {
      console.error('Failed to load profiles:', error)
    }
  }

  const handleSwitchProfile = async (profileId: string) => {
    try {
      await window.electronAPI.profile.setActiveProfile(profileId)
      setIsOpen(false)
      // Event listeners will update the state automatically
    } catch (error) {
      console.error('Failed to switch profile:', error)
    }
  }

  const handleManageProfiles = () => {
    setIsOpen(false)
    onNavigate?.('orbit://profiles')
  }

  const handleAddProfile = () => {
    setIsOpen(false)
    onNavigate?.('orbit://profiles/new')
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  }

  // If no profiles exist yet, don't show the button
  if (profiles.length === 0 && !activeProfile) {
    return null
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button
          className="group flex items-center gap-2 rounded-full p-1 pr-2 transition-all hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          aria-label="Profile menu"
        >
          <Avatar 
            className="h-7 w-7 ring-2 transition-all"
            style={{ 
              '--tw-ring-color': activeProfile?.color || '#8b5cf6' 
            } as React.CSSProperties}
          >
            <AvatarImage src={activeProfile?.avatar} alt={activeProfile?.name} />
            <AvatarFallback 
              className="text-xs font-medium text-white"
              style={{ backgroundColor: activeProfile?.color || '#8b5cf6' }}
            >
              {activeProfile ? getInitials(activeProfile.name) : '?'}
            </AvatarFallback>
          </Avatar>
          <ChevronDown className="h-3 w-3 text-zinc-400 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent 
        align="end" 
        className="w-80 border-zinc-800 bg-zinc-900 p-0"
        sideOffset={8}
      >
        {/* Current profile header - Chrome style */}
        {activeProfile && (
          <>
            <div className="flex flex-col items-center px-6 py-5 text-center">
              <Avatar 
                className="mb-3 h-16 w-16 ring-[3px] ring-offset-2 ring-offset-zinc-900"
                style={{ 
                  '--tw-ring-color': activeProfile.color 
                } as React.CSSProperties}
              >
                <AvatarImage src={activeProfile.avatar} alt={activeProfile.name} />
                <AvatarFallback 
                  className="text-xl font-semibold text-white"
                  style={{ backgroundColor: activeProfile.color }}
                >
                  {getInitials(activeProfile.name)}
                </AvatarFallback>
              </Avatar>
              <div className="w-full">
                <p className="truncate text-base font-medium text-white">{activeProfile.name}</p>
                {activeProfile.isImported && activeProfile.chromeProfileName ? (
                  <p className="mt-0.5 truncate text-sm text-zinc-400">
                    {activeProfile.chromeProfileName}
                  </p>
                ) : (
                  <p className="mt-0.5 truncate text-sm text-zinc-400">
                    {activeProfile.name.toLowerCase().replace(/\s+/g, '.')}@orbit.local
                  </p>
                )}
              </div>
            </div>
            <DropdownMenuSeparator className="bg-zinc-800" />
          </>
        )}

        {/* Other Orbit profiles - Chrome style */}
        {profiles.length > 1 && (
          <>
            <div className="px-3 py-2">
              <p className="px-3 py-1.5 text-xs font-medium text-zinc-500">
                Other Orbit profiles
              </p>
              <div className="flex flex-col gap-0.5">
                {profiles
                  .filter(profile => profile.id !== activeProfile?.id)
                  .map((profile) => (
                    <button
                      key={profile.id}
                      onClick={() => handleSwitchProfile(profile.id)}
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-zinc-800"
                    >
                      <Avatar 
                        className="h-8 w-8 ring-2"
                        style={{ 
                          '--tw-ring-color': profile.color 
                        } as React.CSSProperties}
                      >
                        <AvatarImage src={profile.avatar} alt={profile.name} />
                        <AvatarFallback 
                          className="text-xs font-medium text-white"
                          style={{ backgroundColor: profile.color }}
                        >
                          {getInitials(profile.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 overflow-hidden">
                        <p className="truncate text-sm font-medium text-zinc-200">
                          {profile.name}
                        </p>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
            <DropdownMenuSeparator className="bg-zinc-800" />
          </>
        )}

        {/* Action buttons - Chrome style */}
        <div className="flex flex-col gap-0.5 p-2">
          <DropdownMenuItem 
            onClick={handleAddProfile}
            className="cursor-pointer rounded-md px-3 py-2.5 text-sm text-zinc-300 focus:bg-zinc-800 focus:text-white"
          >
            <UserPlus className="mr-3 h-4 w-4" />
            Create New Profile
          </DropdownMenuItem>

          <DropdownMenuItem 
            onClick={handleAddProfile}
            className="cursor-pointer rounded-md px-3 py-2.5 text-sm text-zinc-300 focus:bg-zinc-800 focus:text-white"
          >
            <Import className="mr-3 h-4 w-4" />
            Import from Chrome
          </DropdownMenuItem>

          <DropdownMenuItem 
            onClick={handleManageProfiles}
            className="cursor-pointer rounded-md px-3 py-2.5 text-sm text-zinc-300 focus:bg-zinc-800 focus:text-white"
          >
            <Settings className="mr-3 h-4 w-4" />
            Manage Profiles
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

