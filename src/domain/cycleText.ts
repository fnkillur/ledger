import { addPeriod, daysBetween, type CyclePeriod, type CycleState, type CycleUnit } from './cycle'

export type CycleBadgeTone = 'normal' | 'soon' | 'overdue' | 'empty'

// 일주일 안으로 다가오면 눈에 띄게 보여 준다.
const SOON_DAYS = 7
const DAYS_ONLY_LIMIT = 30

export const UNIT_LABEL: Record<CycleUnit, string> = { day: '일', week: '주', month: '개월', year: '년' }

const monthsBetween = (from: string, to: string) => {
  let months = 0
  while (addPeriod(from, { amount: months + 1, unit: 'month' }) <= to) months += 1
  return months
}

// 30일까지는 날수, 그 뒤로는 달력 기준 개월·일, 1년부터는 년·개월로 쓴다.
export const formatElapsed = (from: string, to: string) => {
  const days = daysBetween(from, to)
  if (days <= DAYS_ONLY_LIMIT) return `${days}일`
  const months = monthsBetween(from, to)
  if (months >= 12) {
    const years = Math.floor(months / 12)
    return months % 12 === 0 ? `${years}년` : `${years}년 ${months % 12}개월`
  }
  const restDays = daysBetween(addPeriod(from, { amount: months, unit: 'month' }), to)
  return restDays === 0 ? `${months}개월` : `${months}개월 ${restDays}일`
}

export const periodicLabel = (state: CycleState, today: string): { text: string; tone: CycleBadgeTone } => {
  if (state.days === null || !state.nextDate) return { text: '기록 없음', tone: 'empty' }
  if (state.days === 0) return { text: '오늘', tone: 'soon' }
  if (state.days < 0) return { text: `${formatElapsed(state.nextDate, today)} 지남`, tone: 'overdue' }
  return { text: `${formatElapsed(today, state.nextDate)} 남음`, tone: state.days <= SOON_DAYS ? 'soon' : 'normal' }
}

export const elapsedLabel = (state: CycleState, today: string) => {
  if (!state.lastDate) return '기록 없음'
  if (state.lastDate === today) return '오늘'
  return formatElapsed(state.lastDate, today)
}

export const formatPeriod = (period: CyclePeriod | null) => (period ? `${period.amount}${UNIT_LABEL[period.unit]}마다` : '주기 없음')
