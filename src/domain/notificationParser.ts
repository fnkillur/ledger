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

// 카드사는 "12,000원", 삼성월렛은 "₩12,000", 해외 원화결제는 "KRW 20,991.00"처럼 쓴다.
const AMOUNT_PATTERN = /(\d{1,3}(?:,\d{3})+|\d+)\s*원|[₩￦]\s*(\d{1,3}(?:,\d{3})+|\d+)|KRW\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g
// 줄을 넘으면 앞줄 문구라, 같은 줄 안에서만 본다.
const NON_PAYMENT_AMOUNT_PREFIX = /(잔액|누적|한도|잔고|포인트|할인|적립|캐시백)[^\d\n]{0,6}$/
// 토스는 결제 알림 제목에 "500원 캐시백"처럼 받은 혜택을 먼저 쓴다.
const NON_PAYMENT_AMOUNT_SUFFIX = /^\s*(캐시백|적립|포인트|할인)/

export const findAmount = (text: string) => {
  for (const match of text.matchAll(AMOUNT_PATTERN)) {
    const prefix = text.slice(Math.max(0, match.index - 12), match.index)
    if (NON_PAYMENT_AMOUNT_PREFIX.test(prefix)) continue
    if (NON_PAYMENT_AMOUNT_SUFFIX.test(text.slice(match.index + match[0].length))) continue
    const amount = Number((match[1] ?? match[2] ?? match[3]).replace(/,/g, ''))
    if (amount > 0) return amount
  }
  return null
}

const PROMOTION_PATTERN = /쿠폰|이벤트|광고|혜택|할인받|당첨|\(광고\)/

export const detectKind = (text: string): Kind | null => {
  if (PROMOTION_PATTERN.test(text)) return null
  if (/입금|받았|들어왔|환급/.test(text)) return '수입'
  if (/출금|결제|승인|사용|이체|보냈|납부/.test(text)) return '지출'
  return null
}

// 카드사·앱마다 가맹점을 쓰는 자리가 달라서 앞에서부터 맞는 형식을 찾는다.
const MERCHANT_PATTERNS = [
  // 토스 "올리브영에서 5,300원 결제했어요"
  /([^\s,|\]]{2,20})\s*에서/,
  // 카드 승인 "10/20 18:23 올리브영"(현대카드는 다음 줄)
  /\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}\s+(.+)$/m,
  // 현대카드 자동납부 "자동납부 승인 홍*동님 LGU+통신요금 23,100원"
  /자동납부.*?님\s+(.+?)\s+\d[\d,]*\s*원/,
  // 토스 "토스뱅크 체크카드 | 인터넷상거래_TOSS"
  /카드\s*\|\s*(.+)$/m,
  // 토스 캐시백 "31,750원 결제 | 토스페이_29cm_TOSS"
  /결제\s*\|\s*(.+)$/m,
  // 문자 "₩3,700 결제 완료" 다음 줄
  /결제\s*완료\s*\n\s*(.+)$/m,
]

// 해외 원화결제의 "AliExpress.com  *원화결제"처럼 가맹점 뒤에 붙는 결제 방식 표시는 뺀다.
const cleanMerchant = (merchant: string) => merchant.replace(/\s+\*.*$/, '').trim()

const findMerchant = (text: string) => {
  for (const pattern of MERCHANT_PATTERNS) {
    const merchant = text.match(pattern)?.[1]
    if (merchant) return cleanMerchant(merchant)
  }
  return ''
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
