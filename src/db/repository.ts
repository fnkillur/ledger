import type { Category, Person, Rule, SharedSettings, Transaction } from '../domain/types'
import { db } from './database'

export type TransactionInput = Omit<Transaction, 'id' | 'updatedAt' | 'deleted'>

const now = () => new Date().toISOString()

export const saveTransaction = async (input: TransactionInput, id?: string) => {
  const transaction: Transaction = { ...input, id: id ?? crypto.randomUUID(), deleted: false, updatedAt: now() }
  await db.transaction('rw', db.transactions, db.outbox, async () => {
    await db.transactions.put(transaction)
    await db.outbox.put({ id: transaction.id, type: 'transaction' })
  })
  return transaction
}

export const deleteTransaction = async (id: string) => {
  await db.transaction('rw', db.transactions, db.outbox, async () => {
    await db.transactions.update(id, { deleted: true, updatedAt: now() })
    await db.outbox.put({ id, type: 'transaction' })
  })
}

export const splitTransaction = async (original: Transaction, splitAmount: number, category: string) => {
  const remaining = original.amount - splitAmount
  await db.transaction('rw', db.transactions, db.outbox, async () => {
    await saveTransaction({ ...original, amount: remaining }, original.id)
    await saveTransaction({ ...original, amount: splitAmount, category, memo: original.memo })
  })
}

export const saveRule = async (keyword: string, category: string) => {
  const rule: Rule = { keyword: keyword.trim(), category, updatedAt: now() }
  if (!rule.keyword) return
  await db.transaction('rw', db.rules, db.outbox, async () => {
    await db.rules.put(rule)
    await db.outbox.put({ id: rule.keyword, type: 'rule' })
  })
}

export const saveSharedSettings = async (settings: SharedSettings) => {
  await db.transaction('rw', db.shared, db.outbox, async () => {
    await db.shared.put({ key: 'shared', ...settings, updatedAt: now() })
    await db.outbox.put({ id: 'shared', type: 'settings' })
  })
}

export type MonthlyAmount = { category: string; amount: number }

const monthlyId = (monthKey: string, person: Person, category: string) => `monthly-${monthKey}-${person}-${category}`

// 같은 달·같은 사람의 월 합계는 다시 저장하면 덮어쓰고, 빠진 카테고리는 지운다.
export const saveMonthlyTotals = async (monthKey: string, person: Person, amounts: MonthlyAmount[], categories: Category[]) => {
  const [year, month] = monthKey.split('-').map(Number)
  const occurredAt = new Date(year, month - 1, 1, 12).toISOString()
  const categoryByName = new Map(categories.map(category => [category.name, category]))
  const prefix = `monthly-${monthKey}-${person}-`
  const updatedAt = now()

  await db.transaction('rw', db.transactions, db.outbox, async () => {
    const existing = await db.transactions.where('id').startsWith(prefix).toArray()
    const keep = new Set<string>()

    for (const { category, amount } of amounts) {
      const info = categoryByName.get(category)
      if (!info || amount === 0) continue
      const id = monthlyId(monthKey, person, category)
      keep.add(id)
      await db.transactions.put({
        id,
        occurredAt,
        person,
        kind: info.kind,
        amount,
        shareCount: 1,
        merchant: '월 합계',
        category,
        excluded: false,
        source: '월합계',
        memo: '',
        rawText: '',
        deleted: false,
        updatedAt,
        scope: info.kind === '지출' && info.personal ? '개인' : '공동',
      })
      await db.outbox.put({ id, type: 'transaction' })
    }

    for (const transaction of existing) {
      if (keep.has(transaction.id) || transaction.deleted) continue
      await db.transactions.update(transaction.id, { deleted: true, updatedAt })
      await db.outbox.put({ id: transaction.id, type: 'transaction' })
    }
  })
}
