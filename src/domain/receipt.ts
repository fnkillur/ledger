export type ReceiptItem = { name: string; amount: number; category: string }
export type ReceiptGroup = { category: string; amount: number; items: ReceiptItem[] }

const MEMO_ITEM_COUNT = 3

// 품목을 카테고리별로 묶고, 결제 금액을 품목 금액 비율대로 나눈다. 반올림 차이는 가장 큰 묶음에 붙인다.
export const groupReceipt = (items: ReceiptItem[], total: number): ReceiptGroup[] => {
  const itemSum = items.reduce((sum, item) => sum + item.amount, 0)
  if (itemSum <= 0 || total <= 0) return []

  const byCategory = new Map<string, ReceiptItem[]>()
  items.forEach(item => byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]))

  const groups = [...byCategory.entries()]
    .map(([category, groupItems]) => {
      const groupSum = groupItems.reduce((sum, item) => sum + item.amount, 0)
      return { category, items: groupItems, amount: Math.round((groupSum * total) / itemSum) }
    })
    .filter(group => group.amount > 0)
    .sort((left, right) => right.amount - left.amount)
  if (groups.length === 0) return []

  const difference = total - groups.reduce((sum, group) => sum + group.amount, 0)
  groups[0] = { ...groups[0], amount: groups[0].amount + difference }
  return groups
}

export const receiptMemo = (items: ReceiptItem[]) => {
  const names = items.map(item => item.name)
  if (names.length <= MEMO_ITEM_COUNT) return names.join(', ')
  return `${names.slice(0, MEMO_ITEM_COUNT).join(', ')} 외 ${names.length - MEMO_ITEM_COUNT}개`
}

export const moveReceiptItem = (items: ReceiptItem[], index: number, category: string) =>
  items.map((item, itemIndex) => (itemIndex === index ? { ...item, category } : item))

const PAID_AT = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/

// 영수증에서 읽은 결제 일시(YYYY-MM-DD 또는 YYYY-MM-DDTHH:mm). 시각이 없으면 지금 적힌 시각을 그대로 둔다.
export const receiptPaidAt = (paidAt: string | undefined, fallback: string) => {
  const match = paidAt?.match(PAID_AT)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const base = new Date(fallback)
  const [hour, minute] = match[4] === undefined ? [base.getHours(), base.getMinutes()] : [Number(match[4]), Number(match[5])]
  const date = new Date(year, month - 1, day, hour, minute)
  if (date.getMonth() !== month - 1 || date.getDate() !== day || hour > 23 || minute > 59) return null
  return date.toISOString()
}
