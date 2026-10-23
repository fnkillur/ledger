import type { Transaction } from '../../domain/types'

export const formatCompactWon = (amount: number) => {
  if (Math.abs(amount) >= 100_000_000) return `${Math.round(amount / 10_000_000) / 10}억`
  if (Math.abs(amount) >= 10_000) return `${Math.round(amount / 10_000).toLocaleString('ko-KR')}만`
  return amount.toLocaleString('ko-KR')
}

// 세로축은 폭이 좁아서 쉼표 없이 쓴다(2,000만 → 2000만).
export const formatAxisWon = (amount: number) => {
  if (Math.abs(amount) >= 100_000_000) return `${Math.round(amount / 10_000_000) / 10}억`
  if (Math.abs(amount) >= 10_000) return `${Math.round(amount / 10_000)}만`
  return String(amount)
}

// 눈금이 450만·1350만처럼 어중간하지 않도록 1·2·5 단위로 딱 떨어지는 간격을 고른다.
export const niceTicks = (max: number, count = 4) => {
  if (max <= 0) return [0]
  const rawStep = max / count
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const step = [1, 2, 2.5, 5, 10].map(unit => unit * magnitude).find(candidate => candidate >= rawStep)!
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, index) => index * step)
}

export const percent = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 100) : 0)

export const inRange = (transaction: Transaction, range: { start: string; end: string }) =>
  transaction.occurredAt >= range.start && transaction.occurredAt < range.end

export const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 10,
    color: 'var(--color-text)',
  },
  itemStyle: { color: 'var(--color-text)' },
}
