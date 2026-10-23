export type Person = '쿠리만쥬' | '우사기'
// 저축은 더 이상 입력·통계에 쓰지 않지만, 과거 기록에 남아 있어서 타입은 유지한다.
export type Kind = '지출' | '수입' | '저축'
export type Source = '수동' | '알림' | '붙여넣기' | '이관' | '월합계'

// 이관·월합계는 한 달 치를 카테고리별로 묶은 행이라 건별 분석에서 뺀다.
export const isAggregate = (source: Source) => source === '이관' || source === '월합계'
// 개인 지출은 결제한 사람(person)의 몫이다.
export type Scope = '공동' | '개인'

export const PEOPLE: Person[] = ['쿠리만쥬', '우사기']
export const KINDS: Kind[] = ['지출', '수입']
export const SCOPES: Scope[] = ['공동', '개인']

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
}

export type Rule = {
  keyword: string
  category: string
  updatedAt: string
}

export const UNCATEGORIZED = '카테고리 없음'
