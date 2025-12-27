import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

interface Star {
  x: number
  y: number
  size: number
  opacity: number
  speed: number
}

interface AnimatedStarfieldProps {
  starCount?: number
  className?: string
}

export function AnimatedStarfield({ starCount = 150, className = '' }: AnimatedStarfieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const starsRef = useRef<Star[]>([])
  const animationRef = useRef<number>()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas size
    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      initStars()
    }

    // Initialize stars
    const initStars = () => {
      starsRef.current = Array.from({ length: starCount }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 0.5,
        opacity: Math.random() * 0.8 + 0.2,
        speed: Math.random() * 0.5 + 0.1
      }))
    }

    // Animation loop
    const animate = () => {
      if (!ctx || !canvas) return

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Draw gradient background
      const gradient = ctx.createRadialGradient(
        canvas.width / 2,
        canvas.height / 2,
        0,
        canvas.width / 2,
        canvas.height / 2,
        canvas.width * 0.7
      )
      gradient.addColorStop(0, 'rgba(139, 92, 246, 0.08)')
      gradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.03)')
      gradient.addColorStop(1, 'transparent')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Draw and update stars
      starsRef.current.forEach((star) => {
        // Draw star
        ctx.beginPath()
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`
        ctx.fill()

        // Add subtle glow for larger stars
        if (star.size > 1.5) {
          ctx.beginPath()
          ctx.arc(star.x, star.y, star.size * 2, 0, Math.PI * 2)
          const glowGradient = ctx.createRadialGradient(
            star.x, star.y, 0,
            star.x, star.y, star.size * 2
          )
          glowGradient.addColorStop(0, `rgba(139, 92, 246, ${star.opacity * 0.3})`)
          glowGradient.addColorStop(1, 'transparent')
          ctx.fillStyle = glowGradient
          ctx.fill()
        }

        // Move star slowly upward for a drifting effect
        star.y -= star.speed * 0.5
        
        // Subtle horizontal drift
        star.x += Math.sin(Date.now() * 0.001 + star.y * 0.01) * 0.1

        // Twinkle effect
        star.opacity = 0.3 + Math.sin(Date.now() * 0.002 + star.x) * 0.3

        // Reset star if it goes off screen
        if (star.y < -10) {
          star.y = canvas.height + 10
          star.x = Math.random() * canvas.width
        }
        if (star.x < -10) star.x = canvas.width + 10
        if (star.x > canvas.width + 10) star.x = -10
      })

      animationRef.current = requestAnimationFrame(animate)
    }

    resize()
    window.addEventListener('resize', resize)
    animate()

    return () => {
      window.removeEventListener('resize', resize)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [starCount])

  return (
    <motion.canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 2 }}
    />
  )
}

