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
          className="text-zinc-400 hover:text-white hover:bg-transparent -ml-2"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </motion.div>

      {/* Title */}
      <motion.div variants={itemVariants} className="mb-12 text-center">
        <h2 className="mb-4 text-4xl font-bold text-white">
          Set Up Your Profile
        </h2>
        <p className="text-lg text-zinc-400">
          How would you like to get started?
        </p>
      </motion.div>

      {/* Choice cards */}
      <div className="grid gap-8 md:grid-cols-2">
        {/* Import from Chrome */}
        <motion.div variants={itemVariants}>
          <Card
            className="group h-full cursor-pointer border-zinc-800 bg-zinc-900/50 backdrop-blur-sm transition-all hover:border-purple-500/50 hover:bg-zinc-900 overflow-hidden"
            onClick={onImport}
          >
            <CardContent className="p-0">
              <div className="flex h-full flex-col gap-6 p-8 md:p-10">
                <div className="flex flex-col gap-1.5">
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-600/20 ring-1 ring-purple-500/30">
                    <Chrome className="h-8 w-8 text-purple-400" />
                  </div>
                  <CardTitle className="text-2xl text-white mb-3">
                    Import from Chrome
                  </CardTitle>
                  <CardDescription className="text-base text-zinc-400">
                    Bring everything over
                  </CardDescription>
                </div>
                <div className="flex-1 flex flex-col gap-6">
                  <ul className="flex flex-col gap-3 text-sm text-zinc-400">
                    <li className="flex items-center gap-3">
                      <div className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                      Bookmarks & History
                    </li>
                    <li className="flex items-center gap-3">
                      <div className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                      Saved Passwords
                    </li>
                    <li className="flex items-center gap-3">
                      <div className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                      Extensions & Settings
                    </li>
                  </ul>
                  <Button
                    className="w-full bg-purple-600 text-white hover:bg-purple-500 h-12"
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
            className="group h-full cursor-pointer border-zinc-800 bg-zinc-900/50 backdrop-blur-sm transition-all hover:border-purple-500/50 hover:bg-zinc-900 overflow-hidden"
            onClick={onFresh}
          >
            <CardContent className="p-0">
              <div className="flex h-full flex-col gap-6 p-8 md:p-10">
                <div className="flex flex-col gap-1.5">
                  <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-600/20 ring-1 ring-emerald-500/30">
                    <Sparkles className="h-8 w-8 text-emerald-400" />
                  </div>
                  <CardTitle className="text-2xl text-white mb-3">
                    Start Fresh
                  </CardTitle>
                  <CardDescription className="text-base text-zinc-400">
                    Create a new profile with a clean slate
                  </CardDescription>
                </div>
                <div className="flex-1 flex flex-col gap-6">
                  <ul className="flex flex-col gap-3 text-sm text-zinc-400">
                    <li className="flex items-center gap-3">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Clean browsing experience
                    </li>
                    <li className="flex items-center gap-3">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Maximum privacy
                    </li>
                    <li className="flex items-center gap-3">
                      <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Import later anytime
                    </li>
                  </ul>
                  <Button
                    variant="outline"
                    className="w-full border-zinc-700 text-white hover:bg-zinc-800 h-12"
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
