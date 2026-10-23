import { detectKind, findAmount, type ParsedPayment } from './notificationParser'
import { findOccurredAt } from './pastedPayment'

// 말풍선은 "알림톡 도착" 머리글이나 "삼성1234승인", "[삼성카드]1234" 같은 첫 줄로 시작한다.
const MESSAGE_START = /알림톡|승인|^\[[^\]]+\]/
// 채팅방 날짜 구분선·보낸 시각·버튼 글자는 결제 내용이 아니라서 버린다(날짜 구분선이 섞이면 결제일을 잘못 읽는다).
const NOISE_LINE = /요일|^(오전|오후)\s*\d|이용내역|바로가기/
const APPROVAL_LINE = /\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}\s+(.+)$/
const AUTO_PAY_LINE = /자동결제/

// 글자 인식은 말풍선 오른쪽의 장식·시각을 넓은 공백 뒤에 붙여 읽으므로 앞부분만 쓴다.
const cleanLine = (line: string) => line.split(/\s{3,}/)[0].trim()

const splitMessages = (text: string) => {
  const messages: string[][] = []
  text
    .split('\n')
    .map(cleanLine)
    .filter(line => line !== '' && !NOISE_LINE.test(line))
    .forEach(line => {
      if (MESSAGE_START.test(line) || messages.length === 0) messages.push([])
      messages[messages.length - 1].push(line)
    })
  return messages
}

const findMerchant = (lines: string[]) => {
  for (const line of lines) {
    const approval = line.match(APPROVAL_LINE)
    if (approval) return approval[1].trim()
  }
  const autoPayIndex = lines.findIndex(line => AUTO_PAY_LINE.test(line))
  const next = autoPayIndex >= 0 ? lines[autoPayIndex + 1] : undefined
  return next && findAmount(next) === null ? next : ''
}

export type CapturedPayment = ParsedPayment & { text: string }

export const parseAlimtalkCapture = (text: string, now = new Date()): CapturedPayment[] => {
  const seen = new Set<string>()
  return splitMessages(text).flatMap(lines => {
    const message = lines.join('\n')
    const amount = findAmount(message)
    const kind = detectKind(message)
    if (amount === null || kind === null) return []

    const payment: CapturedPayment = {
      kind,
      amount,
      merchant: findMerchant(lines),
      occurredAt: findOccurredAt(message, now).toISOString(),
      isCancel: /취소/.test(message),
      text: message,
    }
    const key = [payment.kind, payment.amount, payment.occurredAt, payment.merchant, payment.isCancel].join('|')
    if (seen.has(key)) return []
    seen.add(key)
    return [payment]
  })
}
