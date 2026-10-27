import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useMemo } from 'react'
import { frequentEntries } from '../domain/insights'
import { displayName } from '../domain/nickname'
import { isAggregate, UNCATEGORIZED, type Kind, type Person } from '../domain/types'
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

// 첫 화면에서 '불러오는 중'을 '없음'으로 그리면 0원·빈 화면이 잠깐 깜빡인다.
// 그래서 불러오기 전에는 undefined를 돌려주는 원본 훅을 두고, 화면은 이걸로 준비됐는지 판단한다.
export function useCategoriesQuery() {
  return useLiveQuery(() => db.categories.orderBy('order').toArray())
}

export function useCategories() {
  return useCategoriesQuery() ?? []
}

export function useRules() {
  return useLiveQuery(() => db.rules.toArray()) ?? []
}

export function useUncategorizedQuery() {
  return useLiveQuery(async () => {
    const transactions = await db.transactions.where('category').anyOf(UNCATEGORIZED, '').toArray()
    return transactions
      .filter(transaction => !transaction.deleted && !isAggregate(transaction.source))
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
  })
}

export function useUncategorized() {
  return useUncategorizedQuery() ?? []
}

export function usePendingCapturesQuery() {
  return useLiveQuery(async () => {
    const captures = await db.captures.where('status').anyOf('대기', '중복').toArray()
    return captures.sort((left, right) => right.postedAt - left.postedAt)
  })
}

export function usePendingCaptures() {
  return usePendingCapturesQuery() ?? []
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

const RECENT_LOOKUP = 300

// 최근에 직접 기록한 내역에서 카테고리·가맹점을 뽑아 입력을 빠르게 한다.
export function useRecentInputs(kind: Kind) {
  return (
    useLiveQuery(async () => {
      const recent = await db.transactions.orderBy('occurredAt').reverse().limit(RECENT_LOOKUP).toArray()
      const ownRecords = recent.filter(transaction => !transaction.deleted && !isAggregate(transaction.source))
      const categories = [
        ...new Set(
          ownRecords
            .filter(transaction => transaction.kind === kind && transaction.category && transaction.category !== UNCATEGORIZED)
            .map(transaction => transaction.category),
        ),
      ]
      const merchants = [...new Set(ownRecords.map(transaction => transaction.merchant.trim()).filter(Boolean))]
      return { categories, merchants, frequent: frequentEntries(ownRecords, kind, 8) }
    }, [kind]) ?? { categories: [], merchants: [], frequent: [] }
  )
}

export function usePersonName() {
  const nicknames = useSharedSettings()?.닉네임
  return useCallback((person: Person) => displayName(person, nicknames ?? {}), [nicknames])
}
