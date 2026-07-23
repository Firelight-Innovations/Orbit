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
          className="text-white/60 hover:text-white"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </motion.div>

      {/* Title */}
      <motion.div variants={itemVariants} className="mb-8 text-center">
        <h2 className="orbit-serif mb-3 text-4xl text-white">
          Select a Chrome Profile
        </h2>
        <p className="text-lg text-white/60">
          Choose which profile you'd like to import into Orbit
        </p>
      </motion.div>

      {/* Loading state */}
      {isLoading && (
        <motion.div
          variants={itemVariants}
          className="flex flex-col items-center justify-center py-12"
        >
          <Loader2 className="mb-4 h-8 w-8 animate-spin text-[var(--accent-primary)]" />
          <p className="text-white/60">Detecting Chrome profiles...</p>
        </motion.div>
      )}

      {/* No profiles found */}
      {!isLoading && profiles.length === 0 && (
        <motion.div
          variants={itemVariants}
          className="flex flex-col items-center justify-center py-12 text-center"
        >
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-subtle)]">
            <User className="h-8 w-8 text-white/40" />
          </div>
          <h3 className="mb-2 text-lg font-medium text-white">
            No Chrome Profiles Found
          </h3>
          <p className="mb-6 max-w-sm text-white/60">
            We couldn't find any Chrome profiles on your computer. 
            You can start fresh and import later.
          </p>
          <Button onClick={onSkip} className="bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)]">
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
                className="group cursor-pointer border-[var(--border-subtle)] bg-[var(--surface-raised)] transition-colors hover:border-[var(--border-default)]"
                onClick={() => onSelect(profile)}
              >
                <CardContent className="flex items-center gap-4 p-4 pl-2.5">
                  <Avatar className="h-10 w-10 ring-1 ring-[var(--border-default)] transition-colors group-hover:ring-[var(--accent-primary)]/50">
                    <AvatarImage src={profile.avatar} alt={profile.name} />
                    <AvatarFallback className="bg-[var(--accent-primary)] text-white">
                      {getInitials(profile.name)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-white">{profile.name}</h3>
                      {profile.isDefault && (
                        <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-xs text-[var(--accent-secondary)]">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-white/60">
                      {profile.email || '\u00A0'}
                    </p>
                    <p className="text-xs text-white/40">{profile.directoryName}</p>
                  </div>

                  <ChevronRight className="h-5 w-5 text-white/40 transition-all group-hover:translate-x-1 group-hover:text-[var(--accent-primary)]" />
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
            className="text-white/60 hover:text-white"
          >
            Skip and start fresh
          </Button>
        </motion.div>
      )}
    </motion.div>
  )
}

