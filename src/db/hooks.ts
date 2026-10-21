import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { UNCATEGORIZED } from '../domain/types'
import { db } from './database'

export function useTransactionsBetween(start: string, end: string) {
  return useLiveQuery(async () => {
    const transactions = await db.transactions.where('occurredAt').between(start, end, true, false).toArray()
    return transactions
      .filter(transaction => !transaction.deleted)
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
  }, [start, end])
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

export function useSharedSettings() {
  return useLiveQuery(async () => (await db.shared.get('shared')) ?? { key: 'shared' as const, 월예산: 0, 월저축목표: 0, updatedAt: '' })
}

export function useCategoryIcons() {
  const categories = useCategories()
  return useMemo(() => new Map(categories.map(category => [category.name, category.icon])), [categories])
}
