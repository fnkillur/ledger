import { pickCheer } from '../domain/celebration'

export type CelebrationState = {
  id: number
  title: string
  subline: string
  transactionIds: string[]
}

const SHOW_MS = 2800

let current: CelebrationState | null = null
let lastCheer: string | undefined
let hideTimer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()

const emit = () => listeners.forEach(listener => listener())

// 방금 기록한 내용을 제목으로 보여주고, 연속 기록 같은 소식이 없으면 응원 문구를 곁들인다.
export const celebrate = ({ title, transactionIds }: { title: string; transactionIds: string[] }, streakLine: string | null) => {
  lastCheer = pickCheer(Math.random, lastCheer)
  current = { id: Date.now(), title, subline: streakLine ?? lastCheer, transactionIds }
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
