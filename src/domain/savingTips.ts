import { formatWon } from '../utils/format'
import { budgetPace } from './insights'
import { isCounted, myShare, recentMonthKeys, toExcludedCategories, toMonthKey } from './stats'
import { isAggregate, type Category, type Transaction } from './types'

export type SavingTipId = 'wants' | 'spike' | 'small' | 'delivery' | 'lateNight' | 'recurring'

// amount는 이만큼 줄일 수 있다는 어림값이라, 큰 순서로 보여준다.
export type SavingTip = { id: SavingTipId; title: string; detail: string; amount: number }

// 50/30/20 규칙(필수 50 · 선택 30 · 저축 20)에서 '선택'에 해당하는 카테고리.
const WANT_CATEGORIES = new Set(['쇼핑', '취미·여가', '카페·간식', '술·유흥', '미용', '과자', '원두', '선물', '여행·숙박'])
const WANT_RATIO_LIMIT = 30
const SPIKE_RATIO = 1.3
const SPIKE_MIN_AMOUNT = 30000
const SMALL_PAYMENT_LIMIT = 10000
const SMALL_PAYMENT_MIN_COUNT = 8
const DELIVERY_PATTERN = /배달의민족|배민|쿠팡이츠|요기요|땡겨요/
const DELIVERY_MIN_COUNT = 3
const LATE_NIGHT_MIN_COUNT = 3
const HISTORY_MONTHS = 3
// 월초 며칠은 지출이 적어 예상치가 크게 흔들리므로 비교하지 않는다.
const MIN_ELAPSED_DAYS = 7

// 어림값이라 천 원 단위로 보여준다.
const roundThousand = (amount: number) => Math.round(amount / 1000) * 1000

const sum = (transactions: Transaction[]) => transactions.reduce((total, transaction) => total + myShare(transaction), 0)

const isLateNight = (iso: string) => {
  const hour = new Date(iso).getHours()
  return hour >= 23 || hour < 4
}

type SavingTipsInput = {
  monthKey: string
  transactions: Transaction[]
  categories: Category[]
  today: Date
  limit?: number
}

export const savingTips = ({ monthKey, transactions, categories, today, limit = 3 }: SavingTipsInput): SavingTip[] => {
  const excluded = toExcludedCategories(categories)
  const fixed = new Set(categories.filter(category => category.fixed).map(category => category.name))
  const counted = transactions.filter(transaction => isCounted(transaction, excluded))
  const ofMonth = (key: string) => counted.filter(transaction => toMonthKey(transaction.occurredAt) === key)

  const month = ofMonth(monthKey)
  const expenses = month.filter(transaction => transaction.kind === '지출')
  const detailed = expenses.filter(transaction => !isAggregate(transaction.source) && transaction.amount > 0)
  const income = sum(month.filter(transaction => transaction.kind === '수입'))

  const pace = budgetPace(1, monthKey, today)
  const isTooEarly = pace.isCurrent && pace.elapsedDays < MIN_ELAPSED_DAYS
  const toMonthEnd = (amount: number) => Math.round((amount * pace.totalDays) / pace.elapsedDays)
  const monthEndLabel = pace.isCurrent ? '이번 달 예상' : '이번 달'

  const tips: SavingTip[] = []

  const wants = toMonthEnd(sum(expenses.filter(transaction => WANT_CATEGORIES.has(transaction.category))))
  const wantRatio = income > 0 ? Math.round((wants / income) * 100) : 0
  if (!isTooEarly && wantRatio > WANT_RATIO_LIMIT) {
    const amount = roundThousand(wants - (income * WANT_RATIO_LIMIT) / 100)
    tips.push({
      id: 'wants',
      title: `선택 소비가 수입의 ${wantRatio}%예요`,
      detail: `50/30/20 규칙(필수 50 · 선택 30 · 저축 20)에선 쇼핑·카페·취미 같은 선택 소비를 30% 안으로 권해요. ${formatWon(amount)} 줄이면 맞출 수 있어요.`,
      amount,
    })
  }

  const historyKeys = recentMonthKeys(monthKey, HISTORY_MONTHS + 1).filter(key => key !== monthKey)
  const activeHistory = historyKeys.filter(key => ofMonth(key).some(transaction => transaction.kind === '지출'))
  if (!isTooEarly && activeHistory.length > 0) {
    const spikes = [...new Set(expenses.map(transaction => transaction.category))]
      .filter(category => !fixed.has(category))
      .map(category => {
        const current = toMonthEnd(sum(expenses.filter(transaction => transaction.category === category)))
        const average = Math.round(
          activeHistory.reduce((total, key) => total + sum(ofMonth(key).filter(transaction => transaction.kind === '지출' && transaction.category === category)), 0) /
            activeHistory.length,
        )
        return { category, current, average, difference: roundThousand(current - average) }
      })
      .filter(item => item.average > 0 && item.current >= item.average * SPIKE_RATIO && item.difference >= SPIKE_MIN_AMOUNT)
      .sort((left, right) => right.difference - left.difference)
    const top = spikes[0]
    if (top) {
      tips.push({
        id: 'spike',
        title: `${top.category} 지출이 평소보다 ${formatWon(top.difference)} 많아요`,
        detail: `최근 ${activeHistory.length}달 평균 약 ${formatWon(roundThousand(top.average))} → ${monthEndLabel} 약 ${formatWon(roundThousand(top.current))}`,
        amount: top.difference,
      })
    }
  }

  const small = detailed.filter(transaction => myShare(transaction) <= SMALL_PAYMENT_LIMIT)
  if (small.length >= SMALL_PAYMENT_MIN_COUNT) {
    const total = sum(small)
    tips.push({
      id: 'small',
      title: `1만 원 이하 소액 결제 ${small.length}번, ${formatWon(total)}`,
      detail: `커피·간식처럼 작은 결제도 쌓이면 커져요(라떼 효과). 절반만 줄여도 약 ${formatWon(roundThousand(total / 2))}이에요.`,
      amount: roundThousand(total / 2),
    })
  }

  const delivery = detailed.filter(transaction => DELIVERY_PATTERN.test(transaction.merchant))
  if (delivery.length >= DELIVERY_MIN_COUNT) {
    const total = sum(delivery)
    const average = Math.round(total / delivery.length)
    tips.push({
      id: 'delivery',
      title: `배달 ${delivery.length}번, ${formatWon(total)}`,
      detail: `한 번에 평균 약 ${formatWon(roundThousand(average))}이에요. 두 번만 직접 해 먹어도 약 ${formatWon(roundThousand(average * 2))} 아껴요.`,
      amount: roundThousand(average * 2),
    })
  }

  const lateNight = detailed.filter(transaction => isLateNight(transaction.occurredAt))
  if (lateNight.length >= LATE_NIGHT_MIN_COUNT) {
    const total = sum(lateNight)
    tips.push({
      id: 'lateNight',
      title: `밤 11시 이후 결제 ${lateNight.length}번, ${formatWon(total)}`,
      detail: '늦은 밤 결제는 충동구매일 때가 많아요. 장바구니에 담아 두고 다음 날 결정해 보세요.',
      amount: roundThousand(total / 2),
    })
  }

  const recentKeys = new Set([monthKey, ...historyKeys])
  const monthsByPayment = new Map<string, { merchant: string; amount: number; months: Set<string> }>()
  counted
    .filter(
      transaction =>
        transaction.kind === '지출' &&
        !isAggregate(transaction.source) &&
        transaction.amount > 0 &&
        transaction.merchant.trim() !== '' &&
        !fixed.has(transaction.category) &&
        recentKeys.has(toMonthKey(transaction.occurredAt)),
    )
    .forEach(transaction => {
      const key = `${transaction.merchant.trim()}|${transaction.amount}`
      const entry = monthsByPayment.get(key) ?? { merchant: transaction.merchant.trim(), amount: myShare(transaction), months: new Set<string>() }
      entry.months.add(toMonthKey(transaction.occurredAt))
      monthsByPayment.set(key, entry)
    })
  const recurring = [...monthsByPayment.values()].filter(entry => entry.months.size >= 2 && entry.months.has(monthKey))
  if (recurring.length > 0) {
    const total = recurring.reduce((sumOfMonth, entry) => sumOfMonth + entry.amount, 0)
    const names = recurring.map(entry => entry.merchant).slice(0, 3).join(', ')
    tips.push({
      id: 'recurring',
      title: `매달 나가는 결제 ${recurring.length}건, 월 ${formatWon(total)}`,
      detail: `${names}${recurring.length > 3 ? ' 등' : ''}. 안 쓰는 구독이 없는지 한 번 확인해 보세요.`,
      amount: total,
    })
  }

  return tips.sort((left, right) => right.amount - left.amount).slice(0, limit)
}
