import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Segmented from '../../components/Segmented'
import { eatingOutShare, SEASONAL_CATEGORIES, peakMonth, type MealSplit, type SeasonalCategory, type SeasonalSeries } from '../../domain/lifestyle'
import { formatWon } from '../../utils/format'
import { formatAxisWon, niceTicks, percent, TOOLTIP_STYLE } from './shared'

const MEAL_PARTS = [
  { key: 'grocery', label: '장보기', color: 'var(--slice-3)' },
  { key: 'delivery', label: '배달', color: 'var(--slice-4)' },
  { key: 'dining', label: '외식', color: 'var(--slice-2)' },
] as const

// 평소보다 이만큼(%p) 넘게 차이 나면 짚어 준다.
const MEAL_NOTICE_GAP = 5

const mealComparison = (share: number, history: (number | null)[]) => {
  const known = history.filter((value): value is number => value !== null)
  if (known.length === 0) return null
  const average = Math.round(known.reduce((sum, value) => sum + value, 0) / known.length)
  if (share - average > MEAL_NOTICE_GAP) return `평소(${average}%)보다 밖에서 많이 먹었어요`
  if (average - share > MEAL_NOTICE_GAP) return `평소(${average}%)보다 집밥이 많았어요`
  return `평소(${average}%)와 비슷해요`
}

type MealCardProps = {
  split: MealSplit
  history: ({ monthKey: string } & MealSplit)[]
}

// 장보기(편의점·마트·잡화)와 식비를 견줘, 집에서 해 먹었는지 밖에서 먹었는지 본다.
export function MealCard({ split, history }: MealCardProps) {
  const share = eatingOutShare(split)
  const total = split.grocery + split.delivery + split.dining
  const previousShares = history.slice(0, -1).map(eatingOutShare)
  const parts = MEAL_PARTS.filter(part => part.key !== 'delivery' || split.delivery > 0)

  // 최근 12개월 내내 장보기·식비 기록이 없으면 보여줄 게 없으니 카드째 숨긴다.
  if (share === null && history.every(row => eatingOutShare(row) === null)) return null

  return (
    <section className="card">
      <h2 className="card-title">집밥 vs 외식</h2>
      {share === null ? (
        <p className="card-description">이번 달은 아직 장보기·식비 기록이 없어요.</p>
      ) : (
        <>
          <p className="meal-headline">
            밖에서 먹은 돈 <strong>{share}%</strong>
          </p>
          {mealComparison(share, previousShares) && <p className="card-description meal-compare">{mealComparison(share, previousShares)}</p>}
          <div className="meal-bar" aria-hidden="true">
            {parts.map(part => (
              <span key={part.key} style={{ width: `${percent(split[part.key], total)}%`, background: part.color }} />
            ))}
          </div>
          <ul className="meal-legend">
            {parts.map(part => (
              <li key={part.key}>
                <span className="legend-swatch" style={{ background: part.color }} />
                <span className="meal-legend-label">{part.label}</span>
                <span className="meal-legend-value">
                  {formatWon(split[part.key])}
                  <span className="bar-share"> {percent(split[part.key], total)}%</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <MealTrend history={history} />
      <p className="meal-note">장보기는 편의점·마트·잡화, 외식은 식비예요. 배달은 건별 기록부터 따로 나눠요.</p>
    </section>
  )
}

function MealTrend({ history }: { history: MealCardProps['history'] }) {
  return (
    <div className="meal-trend" role="img" aria-label="최근 12개월 집밥과 외식 비율">
      {history.map((row, index) => {
        const share = eatingOutShare(row)
        return (
          <div key={row.monthKey} className={`meal-trend-month${index === history.length - 1 ? ' is-current' : ''}`}>
            <div className={`meal-trend-bar${share === null ? ' is-empty' : ''}`}>
              {share !== null && (
                <>
                  <span style={{ height: `${share}%`, background: 'var(--slice-2)' }} />
                  <span style={{ height: `${100 - share}%`, background: 'var(--slice-3)' }} />
                </>
              )}
            </div>
            <span className="meal-trend-label">{Number(row.monthKey.slice(5, 7))}</span>
          </div>
        )
      })}
    </div>
  )
}

const SEASON_BANDS = [
  { from: '1', to: '2', fill: 'var(--season-winter)' },
  { from: '3', to: '5', fill: 'var(--season-spring)' },
  { from: '6', to: '8', fill: 'var(--season-summer)' },
  { from: '9', to: '11', fill: 'var(--season-autumn)' },
  { from: '12', to: '12', fill: 'var(--season-winter)' },
]

const SEASON_NAMES = [
  { label: '봄', fill: 'var(--season-spring)' },
  { label: '여름', fill: 'var(--season-summer)' },
  { label: '가을', fill: 'var(--season-autumn)' },
  { label: '겨울', fill: 'var(--season-winter)' },
]

const MONTHS = Array.from({ length: 12 }, (_, index) => String(index + 1))

const CATEGORY_LABEL: Record<SeasonalCategory, string> = { '여행·숙박': '여행', 쇼핑: '쇼핑' }

// 해가 지날수록 진하게: 가장 최근 해만 앱 파랑, 앞선 해는 회색.
const yearColor = (index: number, count: number) => (index === count - 1 ? 'var(--slice-1)' : 'var(--slice-other)')

// 여행·쇼핑을 달마다 해별로 나란히 그려, 어느 계절에 몰리는지 본다.
export function SeasonalCard({ seriesByCategory }: { seriesByCategory: Record<SeasonalCategory, SeasonalSeries[]> }) {
  const [category, setCategory] = useState<SeasonalCategory>(SEASONAL_CATEGORIES[0])

  const series = seriesByCategory[category]
  const peak = peakMonth(series)
  const data = MONTHS.map((month, index) => ({ month, ...Object.fromEntries(series.map(row => [row.year, row.amounts[index]])) }))
  const ticks = niceTicks(Math.max(0, ...series.flatMap(row => row.amounts)))

  // 여행·쇼핑 둘 다 기록이 없으면 카드째 숨긴다. 한쪽만 없으면 그 탭에서 안내한다.
  if (SEASONAL_CATEGORIES.every(item => peakMonth(seriesByCategory[item]) === null)) return null

  return (
    <section className="card">
      <div className="card-header">
        <h2 className="card-title">계절별 소비</h2>
        <Segmented label="카테고리" options={SEASONAL_CATEGORIES} value={category} onChange={setCategory} />
      </div>
      <p className="card-description">
        {peak === null ? '아직 기록이 없어요.' : `${CATEGORY_LABEL[category]}은 ${peak}월에 가장 많이 썼어요`}
      </p>
      <div className="season-chart">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barCategoryGap="18%">
            {SEASON_BANDS.map(band => (
              <ReferenceArea key={band.from} x1={band.from} x2={band.to} fill={band.fill} fillOpacity={1} ifOverflow="extendDomain" />
            ))}
            <CartesianGrid vertical={false} stroke="var(--color-grid)" />
            <XAxis dataKey="month" tick={{ fill: 'var(--color-text-sub)', fontSize: 12 }} axisLine={{ stroke: 'var(--color-grid)' }} tickLine={false} interval={0} />
            <YAxis ticks={ticks} domain={[0, ticks.at(-1) ?? 0]} tickFormatter={formatAxisWon} tick={{ fill: 'var(--color-text-sub)', fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
            <Tooltip formatter={value => formatWon(Number(value))} labelFormatter={label => `${label}월`} cursor={{ fill: 'var(--color-pressed)' }} {...TOOLTIP_STYLE} />
            {series.map((row, index) => (
              <Bar key={row.year} dataKey={String(row.year)} name={`${row.year}년`} fill={yearColor(index, series.length)} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="season-legend">
        {series.map((row, index) => (
          <span key={row.year}>
            <span className="legend-swatch" style={{ background: yearColor(index, series.length) }} />
            {row.year}년
          </span>
        ))}
        {SEASON_NAMES.map(season => (
          <span key={season.label} className="season-legend-band">
            <span className="legend-swatch" style={{ background: season.fill }} />
            {season.label}
          </span>
        ))}
      </div>
    </section>
  )
}
