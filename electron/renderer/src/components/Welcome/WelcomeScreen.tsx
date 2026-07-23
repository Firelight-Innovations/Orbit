import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AnimatedStarfield } from './AnimatedStarfield'
import { WelcomeStep } from './steps/WelcomeStep'
import { ImportChoiceStep } from './steps/ImportChoiceStep'
import { ProfileSelectStep } from './steps/ProfileSelectStep'
import { ImportingStep } from './steps/ImportingStep'
import { CompleteStep } from './steps/CompleteStep'
import type { ChromeProfileInfo } from '@/../../preload/index'

export type WizardStep = 'welcome' | 'import-choice' | 'profile-select' | 'importing' | 'complete'

interface WelcomeScreenProps {
  onComplete: () => void
}

export function WelcomeScreen({ onComplete }: WelcomeScreenProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('welcome')
  const [selectedChromeProfile, setSelectedChromeProfile] = useState<ChromeProfileInfo | null>(null)
  const [importedProfileId, setImportedProfileId] = useState<string | null>(null)
  const [chromeProfiles, setChromeProfiles] = useState<ChromeProfileInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // Load Chrome profiles when needed
  useEffect(() => {
    if (currentStep === 'profile-select' && chromeProfiles.length === 0) {
      loadChromeProfiles()
    }
  }, [currentStep])

  const loadChromeProfiles = async () => {
    setIsLoading(true)
    try {
      const profiles = await window.electronAPI.chrome.detectProfiles()
      setChromeProfiles(profiles)
    } catch (error) {
      console.error('Failed to detect Chrome profiles:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGetStarted = () => {
    setCurrentStep('import-choice')
  }

  const handleChooseImport = async () => {
    const isInstalled = await window.electronAPI.chrome.isInstalled()
    if (isInstalled) {
      setCurrentStep('profile-select')
    } else {
      // Chrome not installed, go to fresh start
      handleChooseFresh()
    }
  }

  const handleChooseFresh = async () => {
    // Create a default profile
    setIsLoading(true)
    try {
      const profile = await window.electronAPI.profile.createProfile('Default', '#24a0ed')
      setImportedProfileId(profile.id)
      setCurrentStep('complete')
    } catch (error) {
      console.error('Failed to create profile:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectChromeProfile = (profile: ChromeProfileInfo) => {
    setSelectedChromeProfile(profile)
    setCurrentStep('importing')
  }

  const handleImportComplete = (profileId: string) => {
    setImportedProfileId(profileId)
    setCurrentStep('complete')
  }

  const handleImportError = () => {
    // Go back to profile selection on error
    setCurrentStep('profile-select')
  }

  const handleFinish = async () => {
    // Complete onboarding
    await window.electronAPI.profile.completeOnboarding()
    onComplete()
  }

  const handleBack = () => {
    switch (currentStep) {
      case 'import-choice':
        setCurrentStep('welcome')
        break
      case 'profile-select':
        setCurrentStep('import-choice')
        break
      case 'importing':
        setCurrentStep('profile-select')
        break
      default:
        break
    }
  }

  // Page transition variants
  const pageVariants = {
    initial: { opacity: 0, x: 50 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -50 }
  }

  const pageTransition = {
    type: 'spring' as const,
    stiffness: 300,
    damping: 30
  }

  return (
    // Flat base tone. The purple/blue radial washes that used to sit over this
    // are gone; Simplicity keeps its backgrounds unlit and lets the content
    // carry the colour. The starfield stays as Orbit's own mark, retinted.
    <div className="relative h-full w-full overflow-hidden bg-[var(--surface-base)]">
      {/* Animated starfield background */}
      <AnimatedStarfield starCount={150} />

      {/* Content */}
      <div className="relative z-10 flex h-full w-full items-center justify-center px-8">
        <AnimatePresence mode="wait">
          {currentStep === 'welcome' && (
            <motion.div
              key="welcome"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={pageTransition}
              className="w-full max-w-4xl"
            >
              <WelcomeStep onGetStarted={handleGetStarted} />
            </motion.div>
          )}

          {currentStep === 'import-choice' && (
            <motion.div
              key="import-choice"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={pageTransition}
              className="w-full max-w-3xl"
            >
              <ImportChoiceStep
                onImport={handleChooseImport}
                onFresh={handleChooseFresh}
                onBack={handleBack}
                isLoading={isLoading}
              />
            </motion.div>
          )}

          {currentStep === 'profile-select' && (
            <motion.div
              key="profile-select"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={pageTransition}
              className="w-full max-w-3xl"
            >
              <ProfileSelectStep
                profiles={chromeProfiles}
                isLoading={isLoading}
                onSelect={handleSelectChromeProfile}
                onBack={handleBack}
                onSkip={handleChooseFresh}
              />
            </motion.div>
          )}

          {currentStep === 'importing' && selectedChromeProfile && (
            <motion.div
              key="importing"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={pageTransition}
              className="w-full max-w-2xl"
            >
              <ImportingStep
                chromeProfile={selectedChromeProfile}
                onComplete={handleImportComplete}
                onError={handleImportError}
              />
            </motion.div>
          )}

          {currentStep === 'complete' && (
            <motion.div
              key="complete"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={pageTransition}
              className="w-full max-w-2xl"
            >
              <CompleteStep
                profileId={importedProfileId}
                onFinish={handleFinish}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Step indicator */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2">
        <div className="flex items-center gap-3 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-6 py-3 shadow-sm shadow-black/20">
          {(['welcome', 'import-choice', 'profile-select', 'complete'] as const).map((step, index) => {
            const stepOrder = ['welcome', 'import-choice', 'profile-select', 'importing', 'complete']
            const currentIndex = stepOrder.indexOf(currentStep)
            const thisIndex = stepOrder.indexOf(step)
            const isActive = thisIndex <= currentIndex
            const isCurrent = step === currentStep || (currentStep === 'importing' && step === 'profile-select')
            
            return (
              <motion.div
                key={step}
                className="relative h-1.5 rounded-full overflow-hidden"
                initial={false}
                animate={{
                  width: isCurrent ? 40 : 8,
                }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
              >
                <div className={`h-full rounded-full ${
                  isActive ? 'bg-[var(--accent-primary)]' : 'bg-white/15'
                }`} />
                {isCurrent && (
                  <motion.div
                    className="absolute inset-0 bg-white/30 rounded-full"
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: 'linear'
                    }}
                  />
                )}
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

