import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Download, Sparkles, Chrome, Loader2 } from 'lucide-react'

interface ImportChoiceStepProps {
  onImport: () => void
  onFresh: () => void
  onBack: () => void
  isLoading: boolean
}

export function ImportChoiceStep({ onImport, onFresh, onBack, isLoading }: ImportChoiceStepProps) {
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
        type: 'spring' as const,
        stiffness: 300,
        damping: 24
      }
    }
  }

  return (
    <motion.div
      className="flex flex-col max-w-5xl mx-auto w-full"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Back button */}
      <motion.div variants={itemVariants} className="mb-12">
        <Button
          variant="ghost"
          onClick={onBack}
          className="-ml-2 text-white/60 hover:bg-transparent hover:text-white"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </motion.div>

      {/* Title */}
      <motion.div variants={itemVariants} className="mb-12 text-center">
        <h2 className="orbit-serif mb-4 text-5xl text-white">
          Set Up Your Profile
        </h2>
        <p className="text-lg text-white/60">
          How would you like to get started?
        </p>
      </motion.div>

      {/* Choice cards */}
      <div className="grid gap-8 md:grid-cols-2">
        {/* Import from Chrome */}
        <motion.div variants={itemVariants}>
          <Card
            className="group h-full cursor-pointer overflow-hidden border-[var(--border-subtle)] bg-[var(--surface-raised)] transition-colors hover:border-[var(--border-default)]"
            onClick={onImport}
          >
            <CardContent className="p-0">
              <div className="flex h-full flex-col gap-6 p-8 md:p-10">
                <div className="flex flex-col gap-1.5">
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-soft)] ring-1 ring-[var(--accent-primary)]/30">
                    <Chrome className="h-8 w-8 text-[var(--accent-primary)]" />
                  </div>
                  <CardTitle className="mb-3 text-2xl text-white">
                    Import from Chrome
                  </CardTitle>
                  <CardDescription className="text-base text-white/60">
                    Bring everything over
                  </CardDescription>
                </div>
                <div className="flex-1 flex flex-col gap-6">
                  <ul className="flex flex-col gap-3 text-sm text-white/60">
                    <li className="flex items-center gap-3">
                      <div className="h-1.5 w-1.5 rounded-full bg-[var(--accent-primary)]" />
                      Bookmarks & History
                    </li>
                    <li className="flex items-center gap-3">
                      <div className="h-1.5 w-1.5 rounded-full bg-[var(--accent-primary)]" />
                      Saved Passwords
                    </li>
                    <li className="flex items-center gap-3">
                      <div className="h-1.5 w-1.5 rounded-full bg-[var(--accent-primary)]" />
                      Extensions & Settings
                    </li>
                  </ul>
                  <Button
                    className="h-12 w-full bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-hover)]"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <Download className="mr-2 h-4 w-4" />
                        Import Profile
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Start Fresh */}
        <motion.div variants={itemVariants}>
          <Card
            className="group h-full cursor-pointer overflow-hidden border-[var(--border-subtle)] bg-[var(--surface-raised)] transition-colors hover:border-[var(--border-default)]"
            onClick={onFresh}
          >
            <CardContent className="p-0">
              <div className="flex h-full flex-col gap-6 p-8 md:p-10">
                <div className="flex flex-col gap-1.5">
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--research-soft)] ring-1 ring-[var(--research)]/30">
                    <Sparkles className="h-8 w-8 text-[var(--research)]" />
                  </div>
                  <CardTitle className="mb-3 text-2xl text-white">
                    Start Fresh
                  </CardTitle>
                  <CardDescription className="text-base text-white/60">
                    Create a new profile
                  </CardDescription>
                </div>
                <div className="flex-1 flex flex-col gap-6">
                  <ul className="flex flex-col gap-3 text-sm text-white/60">
                    <li className="flex items-center gap-3">
                      <div className="h-1.5 w-1.5 rounded-full bg-[var(--research)]" />
                      Clean browsing experience
                    </li>
                    <li className="flex items-center gap-3">
                      <div className="h-1.5 w-1.5 rounded-full bg-[var(--research)]" />
                      Maximum privacy
                    </li>
                    <li className="flex items-center gap-3">
                      <div className="h-1.5 w-1.5 rounded-full bg-[var(--research)]" />
                      Import later anytime
                    </li>
                  </ul>
                  <Button
                    variant="outline"
                    className="h-12 w-full border-[var(--border-default)] text-white hover:bg-[var(--surface-subtle)]"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Start Fresh
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  )
}
