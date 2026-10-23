import { pickCheer } from '../domain/celebration'

export type ConfettiPiece = { x: number; y: number; rotate: number; delay: number; color: number; isRound: boolean }

export type CelebrationState = {
  id: number
  message: string
  subline: string | null
  confetti: ConfettiPiece[]
}

const SHOW_MS = 2600
const CONFETTI_COUNT = 28

let current: CelebrationState | null = null
let lastMessage: string | undefined
let hideTimer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

const emit = () => listeners.forEach(listener => listener())

const makeConfetti = (): ConfettiPiece[] =>
  Array.from({ length: CONFETTI_COUNT }, (_, index) => {
    const angle = (index / CONFETTI_COUNT) * Math.PI * 2 + Math.random() * 0.4
    const distance = 110 + Math.random() * 80
    return {
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance * 0.8 - 60,
      rotate: (Math.random() - 0.5) * 720,
      delay: Math.random() * 120,
      color: index % 5,
      isRound: index % 3 === 0,
    }
  })

export const celebrate = (subline: string | null) => {
  lastMessage = pickCheer(Math.random, lastMessage)
  current = { id: Date.now(), message: lastMessage, subline, confetti: makeConfetti() }
  emit()
  clearTimeout(hideTimer)
  hideTimer = setTimeout(() => {
    current = null
    emit()
  }, SHOW_MS)
}

export const subscribeCelebration = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getCelebration = () => current
