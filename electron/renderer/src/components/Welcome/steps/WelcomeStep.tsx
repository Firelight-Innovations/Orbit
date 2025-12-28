import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import orbitLogo from '@/assets/orbit_logo.png'
import { useEffect } from 'react'

interface WelcomeStepProps {
  onGetStarted: () => void
}

export function WelcomeStep({ onGetStarted }: WelcomeStepProps) {
  // Staggered animation for child elements
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
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
        type: 'spring' as const,
        stiffness: 260,
        damping: 20
      }
    }
  }

  // Handle Enter key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        onGetStarted()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onGetStarted])

  return (
    <motion.div
      className="flex flex-col items-center text-center"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Logo */}
      <motion.div
        className="relative mb-8"
        variants={itemVariants}
      >
        <motion.div
          className="relative"
          animate={{
            y: [0, -6, 0],
          }}
          transition={{
            y: {
              duration: 5,
              repeat: Infinity,
              ease: 'easeInOut'
            }
          }}
        >
          <img
            src={orbitLogo}
            alt="Orbit"
            className="h-24 w-24 object-contain"
          />
          {/* Subtle glow */}
          <div className="absolute inset-0 -z-10 rounded-full bg-purple-500/20 blur-3xl" />
        </motion.div>
      </motion.div>

      {/* Title */}
      <motion.div variants={itemVariants} className="mb-3">
        <h1 className="text-5xl font-bold tracking-tight text-white">
          Orbit
        </h1>
      </motion.div>

      {/* Subtitle */}
      <motion.p
        className="mb-16 max-w-lg text-lg leading-relaxed text-zinc-400"
        variants={itemVariants}
      >
        Your intelligent browser companion. Navigate the web with speed, 
        focus, and AI-powered precision.
      </motion.p>

      {/* CTA Button */}
      <motion.div variants={itemVariants} className="w-full max-w-md">
        <Button
          size="lg"
          onClick={onGetStarted}
          className="group relative w-full overflow-hidden border-2 border-white/20 bg-transparent px-12 py-8 text-lg font-semibold text-white backdrop-blur-sm transition-all hover:border-purple-500/50 hover:bg-white/5"
        >
          <span className="relative z-10 flex items-center justify-center gap-3">
            Get Started
            <ArrowRight className="h-6 w-6 transition-transform group-hover:translate-x-1" />
          </span>
        </Button>
      </motion.div>

      {/* Keyboard hint */}
      <motion.p
        className="mt-8 text-sm text-zinc-600"
        variants={itemVariants}
      >
        Press <kbd className="rounded-md bg-zinc-900/50 border border-zinc-800 px-2 py-1 text-xs text-zinc-400 font-mono">Enter</kbd> to continue
      </motion.p>
    </motion.div>
  )
}

