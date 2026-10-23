import { ArrowsClockwiseIcon, CoffeeIcon, MopedIcon, MoonStarsIcon, ScalesIcon, TrendUpIcon, type Icon } from '@phosphor-icons/react'
import { useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Sticker, { type StickerName } from '../../components/Sticker'
import ScopeSplit from '../../components/ScopeSplit'
import { budgetPace } from '../../domain/insights'
import type { Period } from '../../domain/period'
import type { SavingTip, SavingTipId } from '../../domain/savingTips'
import { expenseRatio, ratioLevel, ratioMessage, type expenseByScope, type KindTotals, type RatioLevel } from '../../domain/stats'
import type { Kind } from '../../domain/types'
import { formatMonthLabel, formatWon } from '../../utils/format'
import { formatAxisWon, niceTicks, TOOLTIP_STYLE } from './shared'

const SERIES: { kind: Kind; color: string }[] = [
  { kind: '수입', color: 'var(--series-income)' },
  { kind: '지출', color: 'var(--series-expense)' },
]

export type TrendRow = { monthKey: string } & (KindTotals | Record<Kind, null>)

type SummaryTabProps = {
  period: Period
  previousLabel: string | null
  totals: KindTotals
  previousTotals: KindTotals | null
  byScope: ReturnType<typeof expenseByScope>
  tips: SavingTip[] | null
  trend: TrendRow[]
}

function SummaryTab({ period, previousLabel, totals, previousTotals, byScope, tips, trend }: SummaryTabProps) {
  const [today] = useState(() => new Date())

  const pace = period.type === '월별' ? budgetPace(totals.지출, period.monthKey, today) : null
  const ratio = expenseRatio(totals)
  const previousRatio = previousTotals && expenseRatio(previousTotals)

  return (
    <>
      <section className="stat-tiles" aria-label="요약">
        <div className="stat-tile">
          <span className="stat-label">지출</span>
          <strong className="stat-value is-expense">{formatWon(totals.지출)}</strong>
          {previousTotals && previousLabel && <ExpenseDelta label={previousLabel} delta={totals.지출 - previousTotals.지출} />}
          {pace?.isCurrent && pace.projected > totals.지출 && <span className="stat-delta">이 속도면 월말 약 {formatWon(roundToThousand(pace.projected))}</span>}
          <ScopeSplit items={byScope} />
        </div>
        <div className="stat-tile" data-level={ratio === null ? undefined : ratioLevel(ratio)}>
          <span className="stat-label">수입 대비 지출</span>
          <strong className="stat-value ratio-tile-value">{ratio === null ? '–' : `${ratio}%`}</strong>
          <span className="stat-delta">
            {ratio !== null && previousRatio !== null
              ? `${previousLabel} 대비 ${ratio - previousRatio >= 0 ? '+' : '−'}${Math.abs(ratio - previousRatio)}%p`
              : `수입 ${formatWon(totals.수입)}`}
          </span>
          <span className="stat-delta">남은 돈 {formatWon(totals.수입 - totals.지출)}</span>
          <RatioMood ratio={ratio} previousRatio={previousRatio} />
        </div>
      </section>

      {tips && <SavingTips tips={tips} />}

      <section className="card">
        <h2 className="card-title">{period.type === '연도별' ? `${period.monthKey.slice(0, 4)}년 월별 추이` : '최근 12개월'}</h2>
        <TrendChart data={trend} />
        <TrendTable data={trend} />
      </section>
    </>
  )
}

// 라벨 12개가 좁은 화면에도 모두 들어가도록 월 숫자만 쓴다. 연도는 툴팁에서 보여준다.
const formatMonthTick = (monthKey: string) => String(Number(monthKey.slice(5, 7)))

const roundToThousand = (amount: number) => Math.round(amount / 1000) * 1000

const TIP_VISUALS: Record<SavingTipId, [Icon, string]> = {
  wants: [ScalesIcon, 'purple'],
  spike: [TrendUpIcon, 'orange'],
  small: [CoffeeIcon, 'yellow'],
  delivery: [MopedIcon, 'pink'],
  lateNight: [MoonStarsIcon, 'blue'],
  recurring: [ArrowsClockwiseIcon, 'teal'],
}

function SavingTips({ tips }: { tips: SavingTip[] }) {
  return (
    <section className="card">
      <h2 className="card-title">줄여볼 만한 지출</h2>
      {tips.length === 0 ? (
        <p className="card-description">지금은 눈에 띄게 줄일 곳이 없어요. 잘하고 있어요!</p>
      ) : (
        <ul className="tip-list">
          {tips.map(tip => {
            const [Glyph, tone] = TIP_VISUALS[tip.id]
            return (
              <li key={tip.id} className="tip-row">
                <span className={`category-icon tone-${tone}`} style={{ width: 36, height: 36 }} aria-hidden="true">
                  <Glyph size={20} weight="duotone" />
                </span>
                <span className="tip-text">
                  <strong>{tip.title}</strong>
                  <span>{tip.detail}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function ExpenseDelta({ label, delta }: { label: string; delta: number }) {
  return (
    <span className="stat-delta">
      {label} 대비 {delta >= 0 ? '+' : '−'}
      {formatWon(Math.abs(delta))}
    </span>
  )
}

// 번 것보다 많이 쓴 달은 울고, 지난 기간보다 지출률이 줄면 축하한다.
const moodSticker = (level: RatioLevel, isImproved: boolean): StickerName => {
  if (level === '초과') return 'cry'
  if (isImproved) return 'celebrate'
  if (level === '여유') return 'proud'
  return 'thinking'
}

function RatioMood({ ratio, previousRatio }: { ratio: number | null; previousRatio: number | null }) {
  if (ratio === null) return null

  const level = ratioLevel(ratio)
  const isImproved = previousRatio !== null && ratio < previousRatio
  return (
    <div className="tile-mood">
      <Sticker name={moodSticker(level, isImproved)} size={56} />
      <span>{isImproved && level !== '초과' ? '지난번보다 덜 썼어요' : ratioMessage(level)}</span>
    </div>
  )
}

const maxValue = (data: TrendRow[]) => Math.max(0, ...data.flatMap(row => [row.수입 ?? 0, row.지출 ?? 0]))

function TrendChart({ data }: { data: TrendRow[] }) {
  const ticks = niceTicks(maxValue(data))

  return (
    <div className="trend-chart">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--color-grid)" />
          <XAxis
            dataKey="monthKey"
            tickFormatter={formatMonthTick}
            tick={{ fill: 'var(--color-text-sub)', fontSize: 12 }}
            axisLine={{ stroke: 'var(--color-grid)' }}
            tickLine={false}
            interval={0}
            padding={{ left: 12, right: 12 }}
          />
          <YAxis
            ticks={ticks}
            domain={[0, ticks.at(-1) ?? 0]}
            tickFormatter={formatAxisWon}
            tick={{ fill: 'var(--color-text-sub)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            formatter={value => formatWon(Number(value))}
            labelFormatter={label => formatMonthLabel(String(label))}
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

const formatRatio = (ratio: number | null) => (ratio === null ? '–' : `${ratio}%`)

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
            <th scope="col">지출률</th>
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <tr key={row.monthKey}>
              <th scope="row">{row.monthKey}</th>
              {SERIES.map(series => (
                <td key={series.kind}>{row[series.kind]?.toLocaleString('ko-KR') ?? '–'}</td>
              ))}
              <td>{formatRatio(row.수입 === null ? null : expenseRatio({ 지출: row.지출 ?? 0, 수입: row.수입 }))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}

export default SummaryTab
