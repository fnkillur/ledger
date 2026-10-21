import { useState } from 'react'
import { Link } from 'react-router'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { budgetPace, elapsedMonthsOfYear } from '../../domain/insights'
import { formatPreviousPeriod, type Period } from '../../domain/period'
import type { KindTotals } from '../../domain/stats'
import type { Kind, SharedSettings } from '../../domain/types'
import { formatShortMonth, formatWon } from '../../utils/format'
import { formatCompactWon, percent, TOOLTIP_STYLE } from './shared'

const SERIES: { kind: Kind; color: string }[] = [
  { kind: '수입', color: 'var(--series-income)' },
  { kind: '지출', color: 'var(--series-expense)' },
  { kind: '저축', color: 'var(--series-saving)' },
]

export type TrendRow = { monthKey: string } & (KindTotals | Record<Kind, null>)

type SummaryTabProps = {
  period: Period
  totals: KindTotals
  previousTotals: KindTotals
  trend: TrendRow[]
  shared: SharedSettings
}

const goalMultiplier = (period: Period, today: Date) =>
  period.type === '월별' ? 1 : elapsedMonthsOfYear(Number(period.monthKey.slice(0, 4)), today)

function SummaryTab({ period, totals, previousTotals, trend, shared }: SummaryTabProps) {
  const [today] = useState(() => new Date())

  const multiplier = goalMultiplier(period, today)
  const expenseDelta = totals.지출 - previousTotals.지출
  const savingRate = totals.수입 > 0 ? Math.round((totals.저축 / totals.수입) * 100) : null

  return (
    <>
      <section className="stat-tiles" aria-label="요약">
        <div className="stat-tile">
          <span className="stat-label">지출</span>
          <strong className="stat-value">{formatWon(totals.지출)}</strong>
          <span className="stat-delta">
            {formatPreviousPeriod(period)} 대비 {expenseDelta >= 0 ? '+' : '−'}
            {formatWon(Math.abs(expenseDelta))}
          </span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">저축률</span>
          <strong className="stat-value">{savingRate === null ? '–' : `${savingRate}%`}</strong>
          <span className="stat-delta">저축 {formatWon(totals.저축)}</span>
        </div>
      </section>

      <BudgetCard period={period} spent={totals.지출} budget={shared.월예산 * multiplier} today={today} />
      <SavingGoalCard saved={totals.저축} goal={shared.월저축목표 * multiplier} isYear={period.type === '연도별'} />

      <section className="card">
        <h2 className="card-title">{period.type === '연도별' ? `${period.monthKey.slice(0, 4)}년 월별 추이` : '최근 12개월'}</h2>
        <TrendChart data={trend} />
        <TrendTable data={trend} />
      </section>
    </>
  )
}

type BudgetCardProps = { period: Period; spent: number; budget: number; today: Date }

function BudgetCard({ period, spent, budget, today }: BudgetCardProps) {
  if (budget <= 0) return <GoalPrompt title="예산" text="월 예산을 정하면 남은 예산과 월말 예상 지출을 보여드려요." />

  const pace = period.type === '월별' ? budgetPace(spent, period.monthKey, today) : null
  const ratio = percent(spent, budget)
  const tone = getBudgetTone(pace?.projected ?? spent, budget)

  return (
    <section className="card">
      <h2 className="card-title">예산</h2>
      <Meter ratio={ratio} tone={tone} />
      <p className="meter-caption">
        <strong>{formatWon(spent)}</strong> / {formatWon(budget)} ({ratio}%) · {spent <= budget ? `${formatWon(budget - spent)} 남음` : `${formatWon(spent - budget)} 초과`}
      </p>
      {pace?.isCurrent && (
        <p className="meter-note">
          {getStatusIcon(tone)} 지금 속도면 월말에 <strong>{formatWon(pace.projected)}</strong> 쓸 것 같아요 ({pace.elapsedDays}/{pace.totalDays}일,
          하루 평균 {formatWon(Math.round(spent / pace.elapsedDays))})
        </p>
      )}
    </section>
  )
}

const getBudgetTone = (expected: number, budget: number) => {
  if (expected > budget) return 'critical'
  if (expected > budget * 0.9) return 'warning'
  return 'good'
}

const getStatusIcon = (tone: 'good' | 'warning' | 'critical') => {
  if (tone === 'critical') return '🚨'
  if (tone === 'warning') return '⚠️'
  return '✅'
}

type SavingGoalCardProps = { saved: number; goal: number; isYear: boolean }

function SavingGoalCard({ saved, goal, isYear }: SavingGoalCardProps) {
  if (goal <= 0) return <GoalPrompt title="저축 목표" text="월 저축 목표를 정하면 달성률을 보여드려요." />

  const ratio = percent(saved, goal)
  return (
    <section className="card">
      <h2 className="card-title">저축 목표{isYear ? ' (올해 누적)' : ''}</h2>
      <Meter ratio={ratio} tone={ratio >= 100 ? 'good' : 'accent'} />
      <p className="meter-caption">
        <strong>{formatWon(saved)}</strong> / {formatWon(goal)} ({ratio}%){ratio >= 100 ? ' · 🎉 달성!' : ` · ${formatWon(goal - saved)} 남음`}
      </p>
    </section>
  )
}

function Meter({ ratio, tone }: { ratio: number; tone: 'good' | 'warning' | 'critical' | 'accent' }) {
  return (
    <div className={`meter meter-${tone}`} role="meter" aria-valuenow={ratio} aria-valuemin={0} aria-valuemax={100}>
      <div className="meter-fill" style={{ width: `${Math.min(100, ratio)}%` }} />
    </div>
  )
}

function GoalPrompt({ title, text }: { title: string; text: string }) {
  return (
    <section className="card">
      <h2 className="card-title">{title}</h2>
      <p className="card-description">
        {text} <Link to="/settings">설정에서 정하기</Link>
      </p>
    </section>
  )
}

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
          <YAxis tickFormatter={formatCompactWon} tick={{ fill: 'var(--color-text-sub)', fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
          <Tooltip
            formatter={value => formatWon(Number(value))}
            labelFormatter={label => formatShortMonth(String(label))}
            cursor={{ stroke: 'var(--color-grid)' }}
            {...TOOLTIP_STYLE}
          />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 13 }} formatter={value => <span style={{ color: 'var(--color-text)' }}>{value}</span>} />
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

function TrendTable({ data }: { data: TrendRow[] }) {
  return (
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
          {data.map(row => (
            <tr key={row.monthKey}>
              <th scope="row">{row.monthKey}</th>
              {SERIES.map(series => (
                <td key={series.kind}>{row[series.kind]?.toLocaleString('ko-KR') ?? '–'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

export default SummaryTab
