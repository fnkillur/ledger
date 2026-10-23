import { useMemo, useState } from 'react'
import PeriodHeader from '../components/PeriodHeader'
import ScopeChips from '../components/ScopeChips'
import UnderlineTabs from '../components/UnderlineTabs'
import { useCategories, useTransactionsBetween } from '../db/hooks'
import {
  categoryChanges,
  compareByPerson,
  fixedVsVariable,
  hasDetailedData,
  noSpendCalendar,
  topMerchants,
  weekdayTimeMatrix,
} from '../domain/insights'
import { monthKeysOfYear, previousComparison, shiftPeriod, toRange, type Period } from '../domain/period'
import { savingTips } from '../domain/savingTips'
import {
  expenseByScope,
  matchesScope,
  monthlyTotals,
  recentMonthKeys,
  sumByCategory,
  sumByKind,
  toExcludedCategories,
  toSlices,
  topExpenses,
  type ScopeFilter,
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
  const { periodType, monthKey } = useViewState()

  const [tab, setTab] = useState<Tab>('요약')
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('전체')
  const [today] = useState(() => new Date())

  const ranges = useMemo(() => {
    const period: Period = { type: periodType, monthKey }
    const monthKeys = trendMonthKeys(period)
    const range = toRange(period)
    const comparison = previousComparison(period, today)
    const lastYearMonthKey = shiftPeriod({ type: '연도별', monthKey }, -1).monthKey
    const lastYearRange = toRange({ type: '연도별', monthKey: lastYearMonthKey })
    return {
      period,
      monthKeys,
      range,
      previousRange: comparison?.range ?? null,
      previousLabel: comparison?.label ?? null,
      sameMonthLastYearRange: toRange({ type: '월별', monthKey: lastYearMonthKey }),
      fetchStart: earliest(comparison?.range.start ?? range.start, lastYearRange.start, toRange({ type: '월별', monthKey: monthKeys[0] }).start),
    }
  }, [periodType, monthKey, today])

  const transactions = useTransactionsBetween(ranges.fetchStart, ranges.range.end)
  const categories = useCategories()

  const excluded = useMemo(() => toExcludedCategories(categories), [categories])
  const loaded = useMemo(() => transactions ?? [], [transactions])
  const current = useMemo(() => loaded.filter(transaction => inRange(transaction, ranges.range)), [loaded, ranges])
  const previous = useMemo(() => {
    const { previousRange } = ranges
    return previousRange ? loaded.filter(transaction => inRange(transaction, previousRange)) : null
  }, [loaded, ranges])
  const sameMonthLastYear = useMemo(
    () => loaded.filter(transaction => inRange(transaction, ranges.sameMonthLastYearRange)),
    [loaded, ranges],
  )

  const summary = useMemo(() => {
    const latest = currentMonthKey()
    return {
      totals: sumByKind(current, excluded),
      byScope: expenseByScope(current, excluded),
      previousTotals: previous && sumByKind(previous, excluded),
      tips: periodType === '월별' ? savingTips({ monthKey, transactions: loaded, categories, today }) : null,
      // 아직 오지 않은 달, 기록이 하나도 없는 이번 달은 선을 0으로 떨어뜨리지 않고 비워 둔다.
      trend: monthlyTotals(loaded, ranges.monthKeys, excluded).map(row =>
        row.monthKey > latest || (row.monthKey === latest && row.지출 === 0 && row.수입 === 0)
          ? { monthKey: row.monthKey, 수입: null, 지출: null, 저축: null }
          : row,
      ),
    }
  }, [current, previous, loaded, ranges, excluded, periodType, monthKey, categories, today])

  const scopedCurrent = useMemo(() => current.filter(transaction => matchesScope(transaction, scopeFilter)), [current, scopeFilter])
  const scopedPrevious = useMemo(() => (previous ?? []).filter(transaction => matchesScope(transaction, scopeFilter)), [previous, scopeFilter])
  const scopedLastYear = useMemo(
    () => sameMonthLastYear.filter(transaction => matchesScope(transaction, scopeFilter)),
    [sameMonthLastYear, scopeFilter],
  )

  const categoryData = useMemo(() => {
    const ranking = sumByCategory(scopedCurrent, '지출', excluded)
    return {
      ranking,
      slices: toSlices(ranking, MAX_SLICES),
      changes: {
        '이전 기간': categoryChanges(scopedCurrent, scopedPrevious, excluded),
        '작년 같은 달': categoryChanges(scopedCurrent, scopedLastYear, excluded),
      },
      fixedVariable: fixedVsVariable(scopedCurrent, categories, excluded),
      personComparison: scopeFilter === '전체' ? compareByPerson(current, excluded, PERSON_COMPARE_LIMIT) : [],
    }
  }, [scopedCurrent, scopedPrevious, scopedLastYear, current, categories, excluded, scopeFilter])

  const patternData = useMemo(
    () => ({
      hasDetail: hasDetailedData(scopedCurrent),
      biggest: topExpenses(scopedCurrent, excluded, TOP_COUNT),
      merchants: topMerchants(scopedCurrent, excluded, MERCHANT_COUNT),
      matrix: weekdayTimeMatrix(scopedCurrent, excluded),
      calendar: periodType === '월별' ? noSpendCalendar(scopedCurrent, monthKey, today, excluded) : null,
    }),
    [scopedCurrent, excluded, periodType, monthKey, today],
  )

  return (
    <div className="page">
      <PeriodHeader>
        <UnderlineTabs label="통계 종류" tabs={TABS} value={tab} onChange={setTab} />
      </PeriodHeader>

      <main className="page-content">
        {tab !== '요약' && <ScopeChips value={scopeFilter} onChange={setScopeFilter} />}

        {tab === '요약' && (
          <SummaryTab
            period={ranges.period}
            previousLabel={ranges.previousLabel}
            totals={summary.totals}
            previousTotals={summary.previousTotals}
            byScope={summary.byScope}
            tips={summary.tips}
            trend={summary.trend}
          />
        )}
        {tab === '카테고리' && (
          <CategoryTab
            isMonthly={periodType === '월별'}
            previousLabel={ranges.previousLabel}
            total={sumByKind(scopedCurrent, excluded).지출}
            {...categoryData}
          />
        )}
        {tab === '소비 패턴' && <PatternTab {...patternData} />}
      </main>
    </div>
  )
}

export default StatsPage
