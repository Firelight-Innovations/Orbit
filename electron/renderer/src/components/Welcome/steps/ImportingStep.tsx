import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Progress } from '@/components/ui/progress'
import { CheckCircle2, Loader2, XCircle, BookMarked, History, Cookie, Puzzle, Key } from 'lucide-react'
import type { ChromeProfileInfo } from '@/../../preload/index'

interface ImportingStepProps {
  chromeProfile: ChromeProfileInfo
  onComplete: (profileId: string) => void
  onError: () => void
}

interface ImportStep {
  id: string
  label: string
  icon: React.ReactNode
  status: 'pending' | 'active' | 'complete' | 'error'
}

export function ImportingStep({ chromeProfile, onComplete, onError }: ImportingStepProps) {
  const [progress, setProgress] = useState(0)
  const [currentPhase, setCurrentPhase] = useState('Preparing import...')
  const [error, setError] = useState<string | null>(null)
  const [steps, setSteps] = useState<ImportStep[]>([
    { id: 'bookmarks', label: 'Bookmarks', icon: <BookMarked className="h-4 w-4" />, status: 'pending' },
    { id: 'history', label: 'History', icon: <History className="h-4 w-4" />, status: 'pending' },
    { id: 'cookies', label: 'Cookies', icon: <Cookie className="h-4 w-4" />, status: 'pending' },
    { id: 'extensions', label: 'Extensions', icon: <Puzzle className="h-4 w-4" />, status: 'pending' },
    { id: 'passwords', label: 'Passwords', icon: <Key className="h-4 w-4" />, status: 'pending' }
  ])

  useEffect(() => {
    performImport()
  }, [])

  const performImport = async () => {
    try {
      // Simulate step-by-step progress for visual feedback
      const stepIds = ['bookmarks', 'history', 'cookies', 'extensions', 'passwords']
      
      for (let i = 0; i < stepIds.length; i++) {
        const stepId = stepIds[i]
        
        // Mark current step as active
        setSteps(prev => prev.map(s => ({
          ...s,
          status: s.id === stepId ? 'active' : s.status === 'active' ? 'complete' : s.status
        })))
        
        setCurrentPhase(`Importing ${stepId}...`)
        setProgress(Math.floor(((i + 0.5) / stepIds.length) * 80))
        
        // Small delay for visual effect
        await new Promise(resolve => setTimeout(resolve, 300))
      }

      // Perform actual import
      setCurrentPhase('Copying data...')
      setProgress(85)

      const result = await window.electronAPI.chrome.importProfile(
        chromeProfile.path,
        chromeProfile.name,
        ['bookmarks', 'history', 'cookies', 'extensions', 'passwords']
      )

      if (result.success && result.profileId) {
        // Mark all steps as complete
        setSteps(prev => prev.map(s => ({ ...s, status: 'complete' })))
        setProgress(100)
        setCurrentPhase('Import complete!')
        
        // Short delay before transitioning
        await new Promise(resolve => setTimeout(resolve, 800))
        onComplete(result.profileId)
      } else {
        throw new Error(result.error || 'Import failed')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error occurred'
      setError(message)
      setCurrentPhase('Import failed')
      setSteps(prev => prev.map(s => ({
        ...s,
        status: s.status === 'active' ? 'error' : s.status
      })))
      
      // Delay before allowing retry
      setTimeout(() => onError(), 2000)
    }
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
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

  return (
    <motion.div
      className="flex flex-col items-center text-center"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Title */}
      <motion.div variants={itemVariants} className="mb-8">
        <h2 className="orbit-serif mb-3 text-4xl text-white">
          Importing Your Profile
        </h2>
        <p className="text-lg text-white/60">
          Bringing over your data from {chromeProfile.name}
        </p>
      </motion.div>

      {/* Progress circle */}
      <motion.div
        variants={itemVariants}
        className="relative mb-8"
      >
        <div className="flex h-32 w-32 items-center justify-center rounded-full bg-[var(--surface-raised)] ring-1 ring-[var(--border-subtle)]">
          {error ? (
            <XCircle className="h-12 w-12 text-[var(--error)]" />
          ) : progress === 100 ? (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            >
              <CheckCircle2 className="h-12 w-12 text-[var(--success)]" />
            </motion.div>
          ) : (
            <Loader2 className="h-12 w-12 animate-spin text-[var(--accent-primary)]" />
          )}
        </div>
        
        {/* Progress ring */}
        <svg
          className="absolute inset-0 -rotate-90"
          viewBox="0 0 128 128"
        >
          <circle
            cx="64"
            cy="64"
            r="60"
            fill="none"
            stroke="#21262d"
            strokeWidth="8"
          />
          <motion.circle
            cx="64"
            cy="64"
            r="60"
            fill="none"
            stroke={error ? '#f85149' : '#24a0ed'}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 60}`}
            initial={{ strokeDashoffset: 2 * Math.PI * 60 }}
            animate={{ strokeDashoffset: 2 * Math.PI * 60 * (1 - progress / 100) }}
            transition={{ duration: 0.5 }}
          />
        </svg>
      </motion.div>

      {/* Current phase */}
      <motion.p
        variants={itemVariants}
        className={`mb-6 text-lg font-medium ${error ? 'text-[var(--error)]' : 'text-white'}`}
      >
        {currentPhase}
      </motion.p>

      {/* Progress bar */}
      <motion.div variants={itemVariants} className="mb-8 w-full max-w-md">
        <Progress value={progress} className="h-2" />
        <p className="mt-2 text-sm text-white/40">{progress}% complete</p>
      </motion.div>

      {/* Import steps */}
      <motion.div
        variants={itemVariants}
        className="grid w-full max-w-md grid-cols-5 gap-2"
      >
        {steps.map((step) => (
          <div
            key={step.id}
            className={`flex flex-col items-center gap-1 rounded-lg p-2 transition-colors ${
              step.status === 'complete'
                ? 'bg-[var(--success)]/10 text-[var(--success)]'
                : step.status === 'active'
                ? 'bg-[var(--accent-soft)] text-[var(--accent-primary)]'
                : step.status === 'error'
                ? 'bg-[var(--error-soft)] text-[var(--error)]'
                : 'bg-[var(--surface-subtle)] text-white/40'
            }`}
          >
            <div className="flex h-8 w-8 items-center justify-center">
              {step.status === 'complete' ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : step.status === 'active' ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <Loader2 className="h-5 w-5" />
                </motion.div>
              ) : step.status === 'error' ? (
                <XCircle className="h-5 w-5" />
              ) : (
                step.icon
              )}
            </div>
            <span className="text-xs">{step.label}</span>
          </div>
        ))}
      </motion.div>

      {/* Error message */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 rounded-xl border border-[var(--error)]/30 bg-[var(--error-soft)] p-4 text-[var(--error)]"
        >
          <p className="text-sm">{error}</p>
          <p className="mt-1 text-xs text-[var(--error)]/60">Returning to profile selection...</p>
        </motion.div>
      )}
    </motion.div>
  )
}

