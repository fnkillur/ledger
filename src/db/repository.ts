import type { Rule, Transaction } from '../domain/types'
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
