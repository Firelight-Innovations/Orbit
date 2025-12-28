import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Rocket, PartyPopper } from 'lucide-react'
import type { OrbitProfile } from '@/../../preload/index'

interface CompleteStepProps {
  profileId: string | null
  onFinish: () => void
}

export function CompleteStep({ profileId, onFinish }: CompleteStepProps) {
  const [profile, setProfile] = useState<OrbitProfile | null>(null)

  useEffect(() => {
    if (profileId) {
      loadProfile()
    }
  }, [profileId])

  const loadProfile = async () => {
    const profiles = await window.electronAPI.profile.getProfiles()
    const found = profiles.find(p => p.id === profileId)
    if (found) {
      setProfile(found)
    }
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2
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

  // Confetti-like particles
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 2 + Math.random() * 2,
    size: 4 + Math.random() * 8,
    color: ['#8b5cf6', '#a78bfa', '#c4b5fd', '#22c55e', '#3b82f6'][Math.floor(Math.random() * 5)]
  }))

  return (
    <>
      {/* Celebration particles covering the full viewport */}
      <motion.div
        className="pointer-events-none fixed inset-0 overflow-hidden"
        aria-hidden="true"
      >
        {particles.map((particle) => (
          <motion.div
            key={particle.id}
            className="absolute rounded-full"
            style={{
              width: particle.size,
              height: particle.size,
              backgroundColor: particle.color,
              left: `${particle.x}%`,
              top: '-10vh'
            }}
            initial={{ y: 0, opacity: 1 }}
            animate={{
              y: '110vh',
              opacity: 0,
              x: [0, Math.random() * 60 - 30, Math.random() * 60 - 30]
            }}
            transition={{
              duration: particle.duration,
              delay: particle.delay,
              ease: 'easeOut',
              repeat: Infinity,
              repeatDelay: 1
            }}
          />
        ))}
      </motion.div>

      <motion.div
        className="relative z-10 flex flex-col items-center text-center"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Success icon */}
        <motion.div
          variants={itemVariants}
          className="relative mb-8"
        >
        <motion.div
          className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{
            type: 'spring',
            stiffness: 400,
            damping: 15,
            delay: 0.2
          }}
        >
          <CheckCircle2 className="h-14 w-14 text-white" />
        </motion.div>
        
        {/* Celebration icon */}
        <motion.div
          className="absolute -right-2 -top-2"
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{
            type: 'spring',
            stiffness: 500,
            damping: 20,
            delay: 0.5
          }}
        >
          <PartyPopper className="h-10 w-10 text-yellow-400" />
        </motion.div>

        {/* Glow effect */}
        <motion.div
          className="absolute inset-0 rounded-full"
          animate={{
            boxShadow: [
              '0 0 0 0 rgba(34, 197, 94, 0)',
              '0 0 30px 10px rgba(34, 197, 94, 0.3)',
              '0 0 0 0 rgba(34, 197, 94, 0)'
            ]
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            repeatDelay: 0.5
          }}
        />
      </motion.div>

        {/* Title */}
        <motion.h2
          variants={itemVariants}
          className="mb-3 text-4xl font-bold"
        >
          <span className="bg-gradient-to-r from-green-400 via-emerald-400 to-teal-400 bg-clip-text text-transparent">
            You're All Set!
          </span>
        </motion.h2>

        {/* Subtitle */}
        <motion.p
          variants={itemVariants}
          className="mb-8 max-w-md text-lg text-zinc-400"
        >
          {profile ? (
            <>
              Your profile <span className="font-medium text-white">{profile.name}</span> is ready.
              Welcome to the future of browsing.
            </>
          ) : (
            <>
              Your profile is ready. Welcome to the future of browsing.
            </>
          )}
        </motion.p>

        {/* Launch button */}
        <motion.div variants={itemVariants} className="mt-[15px] mb-[15px]">
          <Button
            size="lg"
            onClick={onFinish}
            className="group relative overflow-hidden bg-gradient-to-r from-purple-600 to-purple-500 px-10 py-6 text-lg font-semibold text-white"
          >
            <span className="flex items-center gap-3">
              <Rocket className="h-5 w-5" />
              Launch Orbit
            </span>
          </Button>
        </motion.div>

        {/* Keyboard hint */}
        <motion.p
          variants={itemVariants}
          className="mt-6 text-sm text-zinc-500"
        >
          Press <kbd className="rounded bg-zinc-800 px-2 py-0.5 text-xs">Enter</kbd> to launch
        </motion.p>
      </motion.div>
    </>
  )
}

