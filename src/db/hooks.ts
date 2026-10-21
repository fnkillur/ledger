import { useLiveQuery } from 'dexie-react-hooks'
import { UNCATEGORIZED } from '../domain/types'
import { db } from './database'

const monthRange = (monthKey: string) => {
  const [year, month] = monthKey.split('-').map(Number)
  return [new Date(year, month - 1, 1).toISOString(), new Date(year, month, 1).toISOString()] as const
}

export function useMonthTransactions(monthKey: string) {
  return useLiveQuery(async () => {
    const [start, end] = monthRange(monthKey)
    const transactions = await db.transactions.where('occurredAt').between(start, end, true, false).toArray()
    return transactions
      .filter(transaction => !transaction.deleted)
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
  }, [monthKey])
}

export function useTransactionsSince(startMonthKey: string) {
  return useLiveQuery(async () => {
    const [start] = monthRange(startMonthKey)
    const transactions = await db.transactions.where('occurredAt').aboveOrEqual(start).toArray()
    return transactions.filter(transaction => !transaction.deleted)
  }, [startMonthKey])
}

export function useTransaction(id: string | undefined) {
  return useLiveQuery(async () => {
    if (!id) return null
    return (await db.transactions.get(id)) ?? null
  }, [id])
}

export function useCategories() {
  return useLiveQuery(() => db.categories.orderBy('order').toArray()) ?? []
}

export function useRules() {
  return useLiveQuery(() => db.rules.toArray()) ?? []
}

export function useUncategorized() {
  return useLiveQuery(async () => {
    const transactions = await db.transactions.where('category').anyOf(UNCATEGORIZED, '').toArray()
    return transactions
      .filter(transaction => !transaction.deleted && transaction.source !== '이관')
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
  }) ?? []
}

export function usePendingCaptures() {
  return useLiveQuery(async () => {
    const captures = await db.captures.where('status').anyOf('대기', '중복').toArray()
    return captures.sort((left, right) => right.postedAt - left.postedAt)
  }) ?? []
}

export function useSyncStatus() {
  return useLiveQuery(async () => ({
    pendingCount: await db.outbox.count(),
    lastSyncedAt: (await db.meta.get('sync'))?.lastSyncedAt ?? null,
  }))
}
