import { useMemo, useState } from 'react'
import PeriodHeader from '../components/PeriodHeader'
import UnderlineTabs from '../components/UnderlineTabs'
import { useCategories, useSharedSettings, useTransactionsBetween } from '../db/hooks'
import {
  categoryChanges,
  compareByPerson,
  fixedVsVariable,
  hasDetailedData,
  noSpendCalendar,
  topMerchants,
  weekdayTimeMatrix,
} from '../domain/insights'
import { formatPreviousPeriod, monthKeysOfYear, shiftPeriod, toRange, type Period } from '../domain/period'
import {
  matchesPerson,
  monthlyTotals,
  recentMonthKeys,
  sumByCategory,
  sumByKind,
  toExcludedCategories,
  toSlices,
  topExpenses,
} from '../domain/stats'
import { currentMonthKey } from '../utils/format'
import { useViewState } from '../utils/viewState'
import CategoryTab from './stats/CategoryTab'
import PatternTab from './stats/PatternTab'
import { inRange } from './stats/shared'
import SummaryTab from './stats/SummaryTab'

const TABS = ['요약', '카테고리', '소비 패턴'] as const
type Tab = (typeof TABS)[number]

const TREND_MONTHS = 12
const MAX_SLICES = 6
const PERSON_COMPARE_LIMIT = 8
const TOP_COUNT = 10
const MERCHANT_COUNT = 5

const trendMonthKeys = (period: Period) =>
  period.type === '연도별' ? monthKeysOfYear(period.monthKey) : recentMonthKeys(period.monthKey, TREND_MONTHS)

const earliest = (...isoStrings: string[]) => isoStrings.reduce((min, value) => (value < min ? value : min))

function StatsPage() {
  const { periodType, monthKey, personFilter } = useViewState()

  const [tab, setTab] = useState<Tab>('요약')
  const [today] = useState(() => new Date())

  const ranges = useMemo(() => {
    const period: Period = { type: periodType, monthKey }
    const monthKeys = trendMonthKeys(period)
    const range = toRange(period)
    const previousRange = toRange(shiftPeriod(period, -1))
    const lastYearMonthKey = shiftPeriod({ type: '연도별', monthKey }, -1).monthKey
    const lastYearRange = toRange({ type: '연도별', monthKey: lastYearMonthKey })
    return {
      period,
      monthKeys,
      range,
      previousRange,
      sameMonthLastYearRange: toRange({ type: '월별', monthKey: lastYearMonthKey }),
      fetchStart: earliest(previousRange.start, lastYearRange.start, toRange({ type: '월별', monthKey: monthKeys[0] }).start),
    }
  }, [periodType, monthKey])

  const transactions = useTransactionsBetween(ranges.fetchStart, ranges.range.end)
  const categories = useCategories()
  const shared = useSharedSettings()

  const excluded = useMemo(() => toExcludedCategories(categories), [categories])
  const scoped = useMemo(
    () => (transactions ?? []).filter(transaction => matchesPerson(transaction, personFilter)),
    [transactions, personFilter],
  )
  const current = useMemo(() => scoped.filter(transaction => inRange(transaction, ranges.range)), [scoped, ranges])
  const previous = useMemo(() => scoped.filter(transaction => inRange(transaction, ranges.previousRange)), [scoped, ranges])
  const sameMonthLastYear = useMemo(
    () => scoped.filter(transaction => inRange(transaction, ranges.sameMonthLastYearRange)),
    [scoped, ranges],
  )

  const summary = useMemo(() => {
    const latest = currentMonthKey()
    return {
      totals: sumByKind(current, excluded),
      previousTotals: sumByKind(previous, excluded),
      trend: monthlyTotals(scoped, ranges.monthKeys, excluded).map(row =>
        row.monthKey > latest ? { monthKey: row.monthKey, 수입: null, 지출: null, 저축: null } : row,
      ),
    }
  }, [current, previous, scoped, ranges, excluded])

  const categoryData = useMemo(() => {
    const ranking = sumByCategory(current, '지출', excluded)
    return {
      ranking,
      slices: toSlices(ranking, MAX_SLICES),
      changes: {
        '이전 기간': categoryChanges(current, previous, excluded),
        '작년 같은 달': categoryChanges(current, sameMonthLastYear, excluded),
      },
      fixedVariable: fixedVsVariable(current, categories, excluded),
      personComparison: personFilter === '합산' ? compareByPerson(current, excluded, PERSON_COMPARE_LIMIT) : null,
    }
  }, [current, previous, sameMonthLastYear, categories, excluded, personFilter])

  const patternData = useMemo(
    () => ({
      hasDetail: hasDetailedData(current),
      biggest: topExpenses(current, excluded, TOP_COUNT),
      merchants: topMerchants(current, excluded, MERCHANT_COUNT),
      matrix: weekdayTimeMatrix(current, excluded),
      calendar: periodType === '월별' ? noSpendCalendar(current, monthKey, today, excluded) : null,
    }),
    [current, excluded, periodType, monthKey, today],
  )

  return (
    <div className="page">
      <PeriodHeader>
        <UnderlineTabs label="통계 종류" tabs={TABS} value={tab} onChange={setTab} />
      </PeriodHeader>

      <main className="page-content">
        {tab === '요약' && (
          <SummaryTab
            period={ranges.period}
            totals={summary.totals}
            previousTotals={summary.previousTotals}
            trend={summary.trend}
            shared={shared ?? { 월예산: 0, 월저축목표: 0 }}
          />
        )}
        {tab === '카테고리' && (
          <CategoryTab
            isMonthly={periodType === '월별'}
            previousLabel={formatPreviousPeriod(ranges.period)}
            total={summary.totals.지출}
            {...categoryData}
          />
        )}
        {tab === '소비 패턴' && <PatternTab {...patternData} />}
      </main>
    </div>
  )
}

export default StatsPage
