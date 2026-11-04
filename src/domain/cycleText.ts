import type { CyclePeriod, CycleState, CycleUnit } from './cycle'

export type CycleBadgeTone = 'normal' | 'soon' | 'overdue' | 'empty'

// 일주일 안으로 다가오면 눈에 띄게 보여 준다.
const SOON_DAYS = 7

export const UNIT_LABEL: Record<CycleUnit, string> = { day: '일', week: '주', month: '개월', year: '년' }

export const cycleBadge = (state: CycleState, hasPeriod: boolean): { text: string; tone: CycleBadgeTone } => {
  if (state.days === null) return { text: '기록 없음', tone: 'empty' }
  if (!hasPeriod) return { text: state.days === 0 ? '오늘' : `D+${state.days}`, tone: 'normal' }
  if (state.days < 0) return { text: `D+${-state.days}`, tone: 'overdue' }
  if (state.days === 0) return { text: 'D-day', tone: 'soon' }
  return { text: `D-${state.days}`, tone: state.days <= SOON_DAYS ? 'soon' : 'normal' }
}

export const formatPeriod = (period: CyclePeriod | null) => (period ? `${period.amount}${UNIT_LABEL[period.unit]}마다` : '주기 없음')
