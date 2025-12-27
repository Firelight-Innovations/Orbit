import { useState, useEffect } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { 
  UserPlus, 
  Settings, 
  Users, 
  Check,
  ChevronDown,
  Import,
  Sparkles
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
      await loadProfiles()
      setIsOpen(false)
      // In a full implementation, this would trigger a browser restart/reload
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
        className="w-64 border-zinc-800 bg-zinc-900"
        sideOffset={8}
      >
        {/* Current profile header */}
        {activeProfile && (
          <>
            <DropdownMenuLabel className="flex items-center gap-3 p-3">
              <Avatar 
                className="h-10 w-10 ring-2"
                style={{ 
                  '--tw-ring-color': activeProfile.color 
                } as React.CSSProperties}
              >
                <AvatarImage src={activeProfile.avatar} alt={activeProfile.name} />
                <AvatarFallback 
                  className="text-sm font-medium text-white"
                  style={{ backgroundColor: activeProfile.color }}
                >
                  {getInitials(activeProfile.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 overflow-hidden">
                <p className="truncate font-medium text-white">{activeProfile.name}</p>
                {activeProfile.isImported && activeProfile.chromeProfileName && (
                  <p className="truncate text-xs text-zinc-500">
                    Imported from Chrome
                  </p>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-zinc-800" />
          </>
        )}

        {/* Switch profile submenu (if multiple profiles) */}
        {profiles.length > 1 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="text-zinc-300 focus:bg-zinc-800 focus:text-white">
              <Users className="mr-2 h-4 w-4" />
              Switch Profile
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="border-zinc-800 bg-zinc-900">
              {profiles.map((profile) => (
                <DropdownMenuItem
                  key={profile.id}
                  onClick={() => handleSwitchProfile(profile.id)}
                  className="flex items-center gap-3 text-zinc-300 focus:bg-zinc-800 focus:text-white"
                >
                  <Avatar 
                    className="h-6 w-6 ring-1"
                    style={{ 
                      '--tw-ring-color': profile.color 
                    } as React.CSSProperties}
                  >
                    <AvatarImage src={profile.avatar} alt={profile.name} />
                    <AvatarFallback 
                      className="text-[10px] font-medium text-white"
                      style={{ backgroundColor: profile.color }}
                    >
                      {getInitials(profile.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex-1 truncate">{profile.name}</span>
                  {profile.id === activeProfile?.id && (
                    <Check className="h-4 w-4 text-purple-400" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}

        {/* Add new profile options */}
        <DropdownMenuItem 
          onClick={handleAddProfile}
          className="text-zinc-300 focus:bg-zinc-800 focus:text-white"
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Create New Profile
        </DropdownMenuItem>

        <DropdownMenuItem 
          onClick={handleAddProfile}
          className="text-zinc-300 focus:bg-zinc-800 focus:text-white"
        >
          <Import className="mr-2 h-4 w-4" />
          Import from Chrome
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-zinc-800" />

        {/* Manage profiles */}
        <DropdownMenuItem 
          onClick={handleManageProfiles}
          className="text-zinc-300 focus:bg-zinc-800 focus:text-white"
        >
          <Settings className="mr-2 h-4 w-4" />
          Manage Profiles
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

