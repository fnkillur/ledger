import { parsePaymentText, type ParsedPayment } from './notificationParser'

const FULL_DATE = /(\d{4})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})일?(?:\s*(\d{1,2}):(\d{2}))?/
const MONTH_DAY_SLASH = /(?<!\d)(\d{1,2})\/(\d{1,2})(?:\s*(\d{1,2}):(\d{2}))?/
const MONTH_DAY_KOREAN = /(\d{1,2})월\s*(\d{1,2})일(?:\s*(\d{1,2}):(\d{2}))?/

const toDate = (year: number, month: number, day: number, hour?: string, minute?: string) =>
  hour === undefined ? new Date(year, month - 1, day, 12) : new Date(year, month - 1, day, Number(hour), Number(minute))

// 연도가 없는 날짜는 올해로 보되, 미래가 되면 작년 결제로 본다(1월에 12월 알림을 붙여넣는 경우).
const withInferredYear = (now: Date, month: number, day: number, hour?: string, minute?: string) => {
  const date = toDate(now.getFullYear(), month, day, hour, minute)
  if (date.getTime() - now.getTime() > 24 * 60 * 60 * 1000) return toDate(now.getFullYear() - 1, month, day, hour, minute)
  return date
}

const isValidMonthDay = (month: number, day: number) => month >= 1 && month <= 12 && day >= 1 && day <= 31

const isSameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate()

const findDate = (text: string, now: Date) => {
  const full = text.match(FULL_DATE)
  if (full) return { date: toDate(Number(full[1]), Number(full[2]), Number(full[3]), full[4], full[5]), hasTime: full[4] !== undefined }

  for (const pattern of [MONTH_DAY_KOREAN, MONTH_DAY_SLASH]) {
    const match = text.match(pattern)
    if (!match || !isValidMonthDay(Number(match[1]), Number(match[2]))) continue
    return { date: withInferredYear(now, Number(match[1]), Number(match[2]), match[3], match[4]), hasTime: match[3] !== undefined }
  }
  return null
}

// now는 알림을 받은 시각이다. 문자에 시각 없이 날짜만 있고 그날 받은 알림이면 받은 시각이 실제 결제 시각에 가장 가깝다.
export const findOccurredAt = (text: string, now: Date) => {
  const found = findDate(text, now)
  if (!found) return now
  if (!found.hasTime && isSameDay(found.date, now)) return now
  return found.date
}

export const parsePastedPayment = (text: string, now = new Date()): ParsedPayment | null =>
  parsePaymentText(text, findOccurredAt(text, now).toISOString())
