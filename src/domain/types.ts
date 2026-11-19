import type { Anniversaries } from './anniversary'

export type Person = '쿠리만쥬' | '우사기'
// 저축은 더 이상 입력·통계에 쓰지 않지만, 과거 기록에 남아 있어서 타입은 유지한다.
export type Kind = '지출' | '수입' | '저축'
export type Source = '수동' | '알림' | '붙여넣기' | '이관' | '월합계'

// 이관·월합계는 한 달 치를 카테고리별로 묶은 행이라 건별 분석에서 뺀다.
export const isAggregate = (source: Source) => source === '이관' || source === '월합계'
// 어느 돈에서 나갔나: 공동은 공금, 개인은 결제한 사람(person)의 용돈이다.
export type Scope = '공동' | '개인'

export const PEOPLE: Person[] = ['쿠리만쥬', '우사기']
export const KINDS: Kind[] = ['지출', '수입']
export const SCOPES: Scope[] = ['공동', '개인']

// 시트에 저장된 값 '공동'·'개인'은 그대로 두고, 화면에는 '공금'·'용돈'으로 보여 준다.
export const scopeLabel = (scope: Scope) => (scope === '공동' ? '공금' : '용돈')

// amount는 영수증 한 줄 금액(개수만큼 산 값)이다. 개수를 모르던 예전 기록에는 quantity가 없다.
export type ReceiptLine = { name: string; amount: number; quantity?: number }

export const quantityOf = (line: ReceiptLine) => (line.quantity && line.quantity > 0 ? line.quantity : 1)

export const unitPriceOf = (line: ReceiptLine) => Math.round(line.amount / quantityOf(line))

export type Transaction = {
  id: string
  occurredAt: string
  person: Person
  kind: Kind
  amount: number
  shareCount: number
  merchant: string
  category: string
  excluded: boolean
  source: Source
  memo: string
  rawText: string
  deleted: boolean
  updatedAt: string
  scope: Scope
  // 영수증으로 저장한 내역에만 있다. 품목은 식재료 묶음만 남기고(영수증에 찍힌 금액 그대로), 나머지는 빈 목록이다.
  receiptItems?: ReceiptLine[]
}

export type Category = {
  kind: Kind
  name: string
  order: number
  excluded: boolean
  fixed: boolean
  icon: string
  personal: boolean
}

export type SharedSettings = {
  월예산: number
  월저축목표: number
  닉네임?: Partial<Record<Person, string>>
  기념일?: Anniversaries
}

export type Rule = {
  keyword: string
  category: string
  updatedAt: string
}

export const UNCATEGORIZED = '카테고리 없음'
