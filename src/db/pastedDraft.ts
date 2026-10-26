import { suggestCategory } from '../domain/classify'
import { parsePastedPayment } from '../domain/pastedPayment'
import { db } from './database'
import type { TransactionInput } from './repository'

// iOS 단축어가 문자 내용을 주소에 담아 열면, 그 내용으로 내역 추가 화면을 미리 채운다.
export const buildPastedDraft = async (text: string, base: TransactionInput): Promise<TransactionInput | null> => {
  const parsed = parsePastedPayment(text)
  if (!parsed) return null

  const [rules, categories] = await Promise.all([db.rules.toArray(), db.categories.toArray()])
  const category = suggestCategory(parsed.merchant, rules, categories.map(item => item.name)) ?? ''
  return {
    ...base,
    kind: parsed.kind,
    amount: parsed.isCancel ? -parsed.amount : parsed.amount,
    merchant: parsed.merchant,
    occurredAt: parsed.occurredAt,
    category,
    scope: categories.find(item => item.name === category)?.personal ? '개인' : '공동',
    source: '붙여넣기',
    memo: parsed.isCancel ? '결제 취소' : '',
    rawText: text.trim(),
  }
}
