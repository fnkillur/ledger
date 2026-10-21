export type Person = '쿠리만쥬' | '우사기'
export type Kind = '지출' | '수입' | '저축'
export type Source = '수동' | '알림' | '붙여넣기' | '이관'

export const PEOPLE: Person[] = ['쿠리만쥬', '우사기']
export const KINDS: Kind[] = ['지출', '수입', '저축']

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
}

export type Category = {
  kind: Kind
  name: string
  order: number
  excluded: boolean
  fixed: boolean
  icon: string
}

export type SharedSettings = {
  월예산: number
  월저축목표: number
}

export type Rule = {
  keyword: string
  category: string
  updatedAt: string
}

export const UNCATEGORIZED = '카테고리 없음'
