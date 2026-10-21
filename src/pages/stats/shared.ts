import type { Transaction } from '../../domain/types'

export const formatCompactWon = (amount: number) => {
  if (Math.abs(amount) >= 100_000_000) return `${Math.round(amount / 10_000_000) / 10}억`
  if (Math.abs(amount) >= 10_000) return `${Math.round(amount / 10_000).toLocaleString('ko-KR')}만`
  return amount.toLocaleString('ko-KR')
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
