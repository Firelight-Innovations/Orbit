import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ArrowLeft, User, Loader2, ChevronRight } from 'lucide-react'
import type { ChromeProfileInfo } from '@/../../preload/index'

interface ProfileSelectStepProps {
  profiles: ChromeProfileInfo[]
  isLoading: boolean
  onSelect: (profile: ChromeProfileInfo) => void
  onBack: () => void
  onSkip: () => void
}

export function ProfileSelectStep({
  profiles,
  isLoading,
  onSelect,
  onBack,
  onSkip
}: ProfileSelectStepProps) {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.1
      }
    }
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 24
      }
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

  return (
    <motion.div
      className="flex flex-col"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Back button */}
      <motion.div variants={itemVariants} className="mb-8">
        <Button
          variant="ghost"
          onClick={onBack}
          className="text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </motion.div>

      {/* Title */}
      <motion.div variants={itemVariants} className="mb-8 text-center">
        <h2 className="mb-3 text-3xl font-bold text-white">
          Select a Chrome Profile
        </h2>
        <p className="text-lg text-zinc-400">
          Choose which profile you'd like to import into Orbit
        </p>
      </motion.div>

      {/* Loading state */}
      {isLoading && (
        <motion.div
          variants={itemVariants}
          className="flex flex-col items-center justify-center py-12"
        >
          <Loader2 className="mb-4 h-8 w-8 animate-spin text-purple-500" />
          <p className="text-zinc-400">Detecting Chrome profiles...</p>
        </motion.div>
      )}

      {/* No profiles found */}
      {!isLoading && profiles.length === 0 && (
        <motion.div
          variants={itemVariants}
          className="flex flex-col items-center justify-center py-12 text-center"
        >
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800">
            <User className="h-8 w-8 text-zinc-500" />
          </div>
          <h3 className="mb-2 text-lg font-medium text-white">
            No Chrome Profiles Found
          </h3>
          <p className="mb-6 max-w-sm text-zinc-400">
            We couldn't find any Chrome profiles on your computer. 
            You can start fresh and import later.
          </p>
          <Button onClick={onSkip} className="bg-purple-600 hover:bg-purple-500">
            Start Fresh Instead
          </Button>
        </motion.div>
      )}

      {/* Profile list */}
      {!isLoading && profiles.length > 0 && (
        <motion.div
          variants={containerVariants}
          className="flex flex-col gap-3.5"
        >
          {profiles.map((profile, index) => (
            <motion.div
              key={profile.path}
              variants={itemVariants}
              custom={index}
            >
              <Card
                className="group cursor-pointer border-zinc-800 bg-zinc-900/50 backdrop-blur-sm transition-all hover:border-purple-500/50 hover:bg-zinc-900"
                onClick={() => onSelect(profile)}
              >
                <CardContent className="flex items-center gap-4 p-4 pl-2.5">
                  <Avatar className="h-10 w-10 ring-2 ring-zinc-700 transition-all group-hover:ring-purple-500/50">
                    <AvatarImage src={profile.avatar} alt={profile.name} />
                    <AvatarFallback className="bg-gradient-to-br from-purple-500 to-purple-700 text-white">
                      {getInitials(profile.name)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-white">{profile.name}</h3>
                      {profile.isDefault && (
                        <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs text-purple-300">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-400">
                      {profile.email || '\u00A0'}
                    </p>
                    <p className="text-xs text-zinc-500">{profile.directoryName}</p>
                  </div>

                  <ChevronRight className="h-5 w-5 text-zinc-500 transition-all group-hover:translate-x-1 group-hover:text-purple-400" />
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Skip option */}
      {!isLoading && profiles.length > 0 && (
        <motion.div variants={itemVariants} className="mt-8 text-center">
          <Button
            variant="ghost"
            onClick={onSkip}
            className="text-zinc-400 hover:text-white"
          >
            Skip and start fresh
          </Button>
        </motion.div>
      )}
    </motion.div>
  )
}

