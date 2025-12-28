import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Check, 
  Chrome, 
  Import,
  Loader2,
  User
} from 'lucide-react'
import type { OrbitProfile, ChromeProfileInfo } from '@/../../preload/index'

interface ProfilesPageProps {
  onNavigate: (url: string) => void
}

export function ProfilesPage({ onNavigate }: ProfilesPageProps) {
  const [profiles, setProfiles] = useState<OrbitProfile[]>([])
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null)
  const [chromeProfiles, setChromeProfiles] = useState<ChromeProfileInfo[]>([])
  const [profileColors, setProfileColors] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState<OrbitProfile | null>(null)
  const [newProfileName, setNewProfileName] = useState('')
  const [selectedColor, setSelectedColor] = useState('#8b5cf6')
  const [isCreating, setIsCreating] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [selectedChromeProfile, setSelectedChromeProfile] = useState<ChromeProfileInfo | null>(null)

  useEffect(() => {
    loadData()
    
    // Listen for profile changes
    const unsubscribeProfileChange = window.electronAPI.profile.onProfileChanged((profile) => {
      if (profile) {
        setActiveProfileId(profile.id)
      }
    })
    
    const unsubscribeProfilesUpdate = window.electronAPI.profile.onProfilesUpdated((updatedProfiles) => {
      setProfiles(updatedProfiles)
    })
    
    // Cleanup listeners on unmount
    return () => {
      unsubscribeProfileChange()
      unsubscribeProfilesUpdate()
    }
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [allProfiles, activeId, colors, chrome] = await Promise.all([
        window.electronAPI.profile.getProfiles(),
        window.electronAPI.profile.getActiveProfileId(),
        window.electronAPI.profile.getProfileColors(),
        window.electronAPI.chrome.detectProfiles()
      ])
      setProfiles(allProfiles)
      setActiveProfileId(activeId)
      setProfileColors(colors)
      setChromeProfiles(chrome)
      if (colors.length > 0) {
        setSelectedColor(colors[0])
      }
    } catch (error) {
      console.error('Failed to load profiles:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateProfile = async () => {
    if (!newProfileName.trim()) return
    
    setIsCreating(true)
    try {
      await window.electronAPI.profile.createProfile(newProfileName.trim(), selectedColor)
      setShowCreateDialog(false)
      setNewProfileName('')
    } catch (error) {
      console.error('Failed to create profile:', error)
    } finally {
      setIsCreating(false)
    }
  }

  const handleImportProfile = async () => {
    if (!selectedChromeProfile) return
    
    setIsImporting(true)
    try {
      await window.electronAPI.chrome.importProfile(
        selectedChromeProfile.path,
        selectedChromeProfile.name
      )
      setShowImportDialog(false)
      setSelectedChromeProfile(null)
    } catch (error) {
      console.error('Failed to import profile:', error)
    } finally {
      setIsImporting(false)
    }
  }

  const handleDeleteProfile = async () => {
    if (!showDeleteDialog) return
    
    try {
      await window.electronAPI.profile.deleteProfile(showDeleteDialog.id)
      setShowDeleteDialog(null)
    } catch (error) {
      console.error('Failed to delete profile:', error)
    }
  }

  const handleSwitchProfile = async (profileId: string) => {
    try {
      await window.electronAPI.profile.setActiveProfile(profileId)
      // Event listeners will update the state automatically
    } catch (error) {
      console.error('Failed to switch profile:', error)
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0a0a0b]">
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-[#0a0a0b] p-8">
      <motion.div
        className="mx-auto max-w-4xl"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-white">Profiles</h1>
          <p className="text-zinc-400">
            Manage your Orbit profiles and import data from Chrome
          </p>
        </motion.div>

        {/* Action buttons */}
        <motion.div variants={itemVariants} className="mb-8 flex flex-wrap gap-4">
          <Button 
            onClick={() => setShowCreateDialog(true)}
            className="bg-purple-600 hover:bg-purple-500"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Profile
          </Button>
          {chromeProfiles.length > 0 && (
            <Button 
              variant="outline" 
              onClick={() => setShowImportDialog(true)}
              className="border-zinc-700 text-white hover:bg-zinc-800"
            >
              <Import className="mr-2 h-4 w-4" />
              Import from Chrome
            </Button>
          )}
        </motion.div>

        {/* Profiles grid */}
        {profiles.length === 0 ? (
          <motion.div
            variants={itemVariants}
            className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 py-16"
          >
            <User className="mb-4 h-12 w-12 text-zinc-600" />
            <h3 className="mb-2 text-lg font-medium text-zinc-400">No profiles yet</h3>
            <p className="mb-4 text-sm text-zinc-500">
              Create your first profile to get started
            </p>
            <Button 
              onClick={() => setShowCreateDialog(true)}
              className="bg-purple-600 hover:bg-purple-500"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Profile
            </Button>
          </motion.div>
        ) : (
          <motion.div 
            variants={containerVariants}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <AnimatePresence>
              {profiles.map((profile) => (
                <motion.div
                  key={profile.id}
                  variants={itemVariants}
                  layout
                  exit={{ opacity: 0, scale: 0.8 }}
                >
                  <Card 
                    className={`group cursor-pointer border-zinc-800 bg-zinc-900/50 transition-all hover:border-purple-500/50 hover:bg-zinc-900 ${
                      profile.id === activeProfileId ? 'ring-2 ring-purple-500' : ''
                    }`}
                    onClick={() => handleSwitchProfile(profile.id)}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <Avatar 
                          className="h-14 w-14 ring-2"
                          style={{ 
                            '--tw-ring-color': profile.color 
                          } as React.CSSProperties}
                        >
                          <AvatarImage src={profile.avatar} alt={profile.name} />
                          <AvatarFallback 
                            className="text-lg font-medium text-white"
                            style={{ backgroundColor: profile.color }}
                          >
                            {getInitials(profile.name)}
                          </AvatarFallback>
                        </Avatar>
                        {profile.id === activeProfileId && (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-500">
                            <Check className="h-4 w-4 text-white" />
                          </div>
                        )}
                      </div>
                      <CardTitle className="text-lg text-white">{profile.name}</CardTitle>
                      <CardDescription className="text-zinc-500">
                        {profile.isImported ? (
                          <span className="flex items-center gap-1">
                            <Chrome className="h-3 w-3" />
                            Imported from Chrome
                          </span>
                        ) : (
                          'Created locally'
                        )}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-zinc-400 hover:text-white"
                          onClick={(e) => {
                            e.stopPropagation()
                            // TODO: Implement edit
                          }}
                        >
                          <Edit2 className="mr-1 h-3 w-3" />
                          Edit
                        </Button>
                        {profiles.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                            onClick={(e) => {
                              e.stopPropagation()
                              setShowDeleteDialog(profile)
                            }}
                          >
                            <Trash2 className="mr-1 h-3 w-3" />
                            Delete
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </motion.div>

      {/* Create Profile Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="border-zinc-800 bg-zinc-900">
          <DialogHeader>
            <DialogTitle className="text-white">Create New Profile</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Create a fresh profile with its own bookmarks, history, and settings.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-300">
                Profile Name
              </label>
              <input
                type="text"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="Enter a name..."
                className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-300">
                Profile Color
              </label>
              <div className="flex flex-wrap gap-2">
                {profileColors.map((color) => (
                  <button
                    key={color}
                    onClick={() => setSelectedColor(color)}
                    className={`h-8 w-8 rounded-full transition-all ${
                      selectedColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900' : ''
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowCreateDialog(false)}
              className="text-zinc-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProfile}
              disabled={!newProfileName.trim() || isCreating}
              className="bg-purple-600 hover:bg-purple-500"
            >
              {isCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Profile'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Profile Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="border-zinc-800 bg-zinc-900">
          <DialogHeader>
            <DialogTitle className="text-white">Import from Chrome</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Select a Chrome profile to import into Orbit.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-64 space-y-2 overflow-auto py-4">
            {chromeProfiles.map((profile) => (
              <div
                key={profile.path}
                onClick={() => setSelectedChromeProfile(profile)}
                className={`flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-colors ${
                  selectedChromeProfile?.path === profile.path
                    ? 'bg-purple-500/20 ring-1 ring-purple-500'
                    : 'hover:bg-zinc-800'
                }`}
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={profile.avatar} alt={profile.name} />
                  <AvatarFallback className="bg-zinc-700 text-white">
                    {getInitials(profile.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="font-medium text-white">{profile.name}</p>
                  {profile.email && (
                    <p className="text-sm text-zinc-500">{profile.email}</p>
                  )}
                </div>
                {selectedChromeProfile?.path === profile.path && (
                  <Check className="h-5 w-5 text-purple-400" />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowImportDialog(false)}
              className="text-zinc-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleImportProfile}
              disabled={!selectedChromeProfile || isImporting}
              className="bg-purple-600 hover:bg-purple-500"
            >
              {isImporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Import className="mr-2 h-4 w-4" />
                  Import Profile
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!showDeleteDialog} onOpenChange={() => setShowDeleteDialog(null)}>
        <DialogContent className="border-zinc-800 bg-zinc-900">
          <DialogHeader>
            <DialogTitle className="text-white">Delete Profile?</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Are you sure you want to delete "{showDeleteDialog?.name}"? This action cannot be undone.
              All bookmarks, history, and settings for this profile will be permanently removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowDeleteDialog(null)}
              className="text-zinc-400 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteProfile}
              className="bg-red-600 hover:bg-red-500"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

