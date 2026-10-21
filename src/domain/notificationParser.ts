import type { Kind } from './types'

export type CapturedNotification = {
  key: string
  packageName: string
  appLabel: string
  title: string
  text: string
  postedAt: number
}

export type ParsedPayment = {
  kind: Kind
  amount: number
  merchant: string
  occurredAt: string
  isCancel: boolean
}

const AMOUNT_PATTERN = /(\d{1,3}(?:,\d{3})+|\d+)\s*원/g
const NON_PAYMENT_AMOUNT_PREFIX = /(잔액|누적|한도|잔고|포인트|할인|적립|캐시백)[^\d]{0,6}$/

const findAmount = (text: string) => {
  for (const match of text.matchAll(AMOUNT_PATTERN)) {
    const prefix = text.slice(Math.max(0, match.index - 12), match.index)
    if (NON_PAYMENT_AMOUNT_PREFIX.test(prefix)) continue
    const amount = Number(match[1].replace(/,/g, ''))
    if (amount > 0) return amount
  }
  return null
}

const PROMOTION_PATTERN = /쿠폰|이벤트|광고|혜택|할인받|당첨|\(광고\)/

const detectKind = (text: string): Kind | null => {
  if (PROMOTION_PATTERN.test(text)) return null
  if (/입금|받았|들어왔|환급/.test(text)) return '수입'
  if (/출금|결제|승인|사용|이체|보냈|납부/.test(text)) return '지출'
  return null
}

const findMerchant = (text: string) => {
  const match = text.match(/([^\s,|\]]{2,20})\s*에서/)
  return match ? match[1] : ''
}

export const parsePaymentText = (text: string, occurredAt: string): ParsedPayment | null => {
  const kind = detectKind(text)
  const amount = findAmount(text)
  if (!kind || amount === null) return null

  return {
    kind,
    amount,
    merchant: findMerchant(text),
    occurredAt,
    isCancel: /취소/.test(text),
  }
}

export const parsePaymentNotification = (notification: CapturedNotification) =>
  parsePaymentText(`${notification.title}\n${notification.text}`, new Date(notification.postedAt).toISOString())

const DUPLICATE_WINDOW_MS = 2 * 60 * 1000

// 카드사 푸시, 알림톡, 토스가 같은 결제를 각각 알려주므로 금액·구분·시각이 가까우면 같은 거래로 본다.
export const isSamePayment = (
  left: Pick<ParsedPayment, 'kind' | 'amount' | 'occurredAt'>,
  right: Pick<ParsedPayment, 'kind' | 'amount' | 'occurredAt'>,
) =>
  left.kind === right.kind &&
  left.amount === right.amount &&
  Math.abs(Date.parse(left.occurredAt) - Date.parse(right.occurredAt)) <= DUPLICATE_WINDOW_MS
