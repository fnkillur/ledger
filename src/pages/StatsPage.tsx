import { useMemo } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import MonthSwitcher from '../components/MonthSwitcher'
import Segmented from '../components/Segmented'
import TopBar from '../components/TopBar'
import { useCategories, useTransactionsSince } from '../db/hooks'
import {
  matchesPerson,
  monthlyTotals,
  recentMonthKeys,
  sumByCategory,
  toExcludedCategories,
  toMonthKey,
  type KindTotals,
  type PersonFilter,
} from '../domain/stats'
import type { Kind } from '../domain/types'
import { formatShortMonth, formatWon, shiftMonth } from '../utils/format'
import { updateViewState, useViewState } from '../utils/viewState'

const PERSON_FILTERS: PersonFilter[] = ['합산', '쿠리만쥬', '우사기']
const TREND_MONTHS = 12

const SERIES: { kind: Kind; color: string }[] = [
  { kind: '수입', color: 'var(--series-income)' },
  { kind: '지출', color: 'var(--series-expense)' },
  { kind: '저축', color: 'var(--series-saving)' },
]

const formatCompactWon = (amount: number) => {
  if (Math.abs(amount) >= 100_000_000) return `${Math.round(amount / 10_000_000) / 10}억`
  if (Math.abs(amount) >= 10_000) return `${Math.round(amount / 10_000).toLocaleString('ko-KR')}만`
  return amount.toLocaleString('ko-KR')
}

const savingRate = (totals: KindTotals) => (totals.수입 > 0 ? Math.round((totals.저축 / totals.수입) * 100) : null)

function StatsPage() {
  const { monthKey, personFilter } = useViewState()

  const monthKeys = useMemo(() => recentMonthKeys(monthKey, TREND_MONTHS), [monthKey])
  const transactions = useTransactionsSince(monthKeys[0])
  const categories = useCategories()

  const excludedCategories = useMemo(() => toExcludedCategories(categories), [categories])
  const scoped = useMemo(
    () => (transactions ?? []).filter(transaction => matchesPerson(transaction, personFilter)),
    [transactions, personFilter],
  )
  const trend = useMemo(() => monthlyTotals(scoped, monthKeys, excludedCategories), [scoped, monthKeys, excludedCategories])
  const categoryTotals = useMemo(
    () => sumByCategory(scoped.filter(transaction => toMonthKey(transaction.occurredAt) === monthKey), '지출', excludedCategories),
    [scoped, monthKey, excludedCategories],
  )

  const current = trend.at(-1)!
  const previous = trend.at(-2)!
  const expenseDelta = current.지출 - previous.지출
  const rate = savingRate(current)

  return (
    <div className="page">
      <TopBar title={<MonthSwitcher monthKey={monthKey} onChange={value => updateViewState({ monthKey: value })} />} />

      <main className="page-content">
        <Segmented
          label="사람"
          options={PERSON_FILTERS}
          value={personFilter}
          onChange={value => updateViewState({ personFilter: value })}
        />

        <section className="stat-tiles" aria-label="이번 달 요약">
          <div className="stat-tile">
            <span className="stat-label">지출</span>
            <strong className="stat-value">{formatWon(current.지출)}</strong>
            <span className="stat-delta">
              {formatShortMonth(shiftMonth(monthKey, -1))} 대비 {expenseDelta >= 0 ? '+' : '−'}
              {formatWon(Math.abs(expenseDelta))}
            </span>
          </div>
          <div className="stat-tile">
            <span className="stat-label">저축률</span>
            <strong className="stat-value">{rate === null ? '–' : `${rate}%`}</strong>
            <span className="stat-delta">저축 {formatWon(current.저축)}</span>
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">카테고리별 지출</h2>
          {categoryTotals.length === 0 ? <p className="empty-inline">지출 내역이 없어요.</p> : <CategoryBars items={categoryTotals} />}
        </section>

        <section className="card">
          <h2 className="card-title">최근 {TREND_MONTHS}개월</h2>
          <TrendChart data={trend} />
          <details className="table-view">
            <summary>표로 보기</summary>
            <table>
              <thead>
                <tr>
                  <th scope="col">월</th>
                  {SERIES.map(series => (
                    <th key={series.kind} scope="col">
                      {series.kind}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trend.map(row => (
                  <tr key={row.monthKey}>
                    <th scope="row">{row.monthKey}</th>
                    {SERIES.map(series => (
                      <td key={series.kind}>{row[series.kind].toLocaleString('ko-KR')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      </main>
    </div>
  )
}

function CategoryBars({ items }: { items: { category: string; amount: number }[] }) {
  const max = Math.max(...items.map(item => item.amount))
  const total = items.reduce((sum, item) => sum + item.amount, 0)

  return (
    <ul className="bars">
      {items.map(item => (
        <li key={item.category} className="bar-row">
          <span className="bar-label">{item.category}</span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${Math.max(0, (item.amount / max) * 100)}%` }} />
          </div>
          <span className="bar-value">
            {item.amount.toLocaleString('ko-KR')}
            <span className="bar-share"> {Math.round((item.amount / total) * 100)}%</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

type TrendRow = { monthKey: string } & KindTotals

function TrendChart({ data }: { data: TrendRow[] }) {
  return (
    <div className="trend-chart">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-grid)" />
          <XAxis
            dataKey="monthKey"
            tickFormatter={formatShortMonth}
            tick={{ fill: 'var(--color-text-sub)', fontSize: 12 }}
            axisLine={{ stroke: 'var(--color-grid)' }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={formatCompactWon}
            tick={{ fill: 'var(--color-text-sub)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            formatter={value => formatWon(Number(value))}
            labelFormatter={label => formatShortMonth(String(label))}
            contentStyle={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 10,
              color: 'var(--color-text)',
            }}
            itemStyle={{ color: 'var(--color-text)' }}
            cursor={{ stroke: 'var(--color-grid)' }}
          />
          <Legend
            iconType="plainline"
            wrapperStyle={{ fontSize: 13, color: 'var(--color-text-sub)' }}
            formatter={value => <span style={{ color: 'var(--color-text)' }}>{value}</span>}
          />
          {SERIES.map(series => (
            <Line
              key={series.kind}
              type="monotone"
              dataKey={series.kind}
              stroke={series.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, stroke: 'var(--color-surface)', strokeWidth: 2 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default StatsPage
