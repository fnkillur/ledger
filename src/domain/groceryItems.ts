import { quantityOf, unitPriceOf, type Transaction } from './types'

export const GROCERY_SORTS = ['횟수순', '금액순'] as const
export type GrocerySort = (typeof GROCERY_SORTS)[number]

export type GroceryPurchase = {
  key: string
  name: string
  amount: number
  quantity: number
  unitPrice: number
  occurredAt: string
  merchant: string
  transactionId: string
}
export type GroceryItem = { key: string; name: string; count: number; amount: number }

// 영수증마다 '국산 두부'·'국산두부'처럼 띄어쓰기가 달라서 띄어쓰기를 빼고 같은 품목으로 본다.
const itemKey = (name: string) => name.replace(/\s+/g, '')

export const groceryPurchases = (transactions: Transaction[]): GroceryPurchase[] =>
  transactions
    .filter(transaction => !transaction.deleted && transaction.kind === '지출' && transaction.receiptItems?.length)
    .flatMap(transaction =>
      transaction.receiptItems!.map(item => ({
        key: itemKey(item.name),
        name: item.name,
        amount: item.amount,
        quantity: quantityOf(item),
        unitPrice: unitPriceOf(item),
        occurredAt: transaction.occurredAt,
        merchant: transaction.merchant,
        transactionId: transaction.id,
      })),
    )

export const groceryItemRanking = (purchases: GroceryPurchase[], sort: GrocerySort): GroceryItem[] => {
  const items = new Map<string, GroceryItem & { latestAt: string }>()
  purchases.forEach(purchase => {
    const item = items.get(purchase.key) ?? { key: purchase.key, name: purchase.name, count: 0, amount: 0, latestAt: '' }
    const isLatest = purchase.occurredAt >= item.latestAt
    items.set(purchase.key, {
      ...item,
      name: isLatest ? purchase.name : item.name,
      latestAt: isLatest ? purchase.occurredAt : item.latestAt,
      count: item.count + 1,
      amount: item.amount + purchase.amount,
    })
  })
  const byCount = (left: GroceryItem, right: GroceryItem) => right.count - left.count || right.amount - left.amount
  const byAmount = (left: GroceryItem, right: GroceryItem) => right.amount - left.amount || right.count - left.count
  return [...items.values()].map(({ latestAt: _latestAt, ...item }) => item).sort(sort === '횟수순' ? byCount : byAmount)
}

export const priceHistory = (purchases: GroceryPurchase[], key: string) =>
  purchases.filter(purchase => purchase.key === key).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))

// 가장 최근에 산 1개 가격을 바로 앞에 산 1개 가격과 비교한다.
export const priceChange = (history: GroceryPurchase[]) => {
  if (history.length < 2) return null
  const [latest, previous] = history
  const difference = latest.unitPrice - previous.unitPrice
  return { difference, percent: previous.unitPrice > 0 ? Math.round((difference / previous.unitPrice) * 100) : 0 }
}

// 여러 개 샀을 때만 개수와 1개 가격을 붙인다.
export const quantityLabel = (quantity: number, unitPrice: number) => (quantity > 1 ? `×${quantity} · 개당 ${unitPrice.toLocaleString('ko-KR')}원` : '')
