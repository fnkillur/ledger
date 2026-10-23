import { CaretDownIcon, CaretUpIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import CategoryIcon from '../../components/CategoryIcon'
import EmptyState from '../../components/EmptyState'
import PersonAvatar from '../../components/PersonAvatar'
import Segmented from '../../components/Segmented'
import { useCategoryIcons, usePersonName } from '../../db/hooks'
import type { CategoryChange, PersonComparison } from '../../domain/insights'
import type { Slice } from '../../domain/stats'
import { PEOPLE } from '../../domain/types'
import { formatWon } from '../../utils/format'
import { formatCompactWon, percent, TOOLTIP_STYLE } from './shared'

const SLICE_COLORS = ['var(--slice-1)', 'var(--slice-2)', 'var(--slice-3)', 'var(--slice-4)', 'var(--slice-5)']
const PERSON_COLORS = { 쿠리만쥬: 'var(--person-1)', 우사기: 'var(--person-2)' }
const CHANGE_LIMIT = 3

const sliceColor = (slice: Slice, index: number) => (slice.isOther ? 'var(--slice-other)' : SLICE_COLORS[index])

export type CompareTarget = '이전 기간' | '작년 같은 달'

type CategoryTabProps = {
  isMonthly: boolean
  previousLabel: string | null
  total: number
  slices: Slice[]
  ranking: { category: string; amount: number }[]
  changes: Record<CompareTarget, { increased: CategoryChange[]; decreased: CategoryChange[] }>
  fixedVariable: { fixed: number; variable: number }
  personComparison: PersonComparison[]
}

function CategoryTab({ isMonthly, previousLabel, total, slices, ranking, changes, fixedVariable, personComparison }: CategoryTabProps) {
  const [compareTarget, setCompareTarget] = useState<CompareTarget>('이전 기간')

  if (ranking.length === 0) {
    return (
      <section className="card">
        <EmptyState sticker="eat">이 기간의 지출 내역이 없어요.</EmptyState>
      </section>
    )
  }

  return (
    <>
      <section className="card">
        <h2 className="card-title">카테고리별 지출</h2>
        <CategoryDonut slices={slices} total={total} />
      </section>

      {previousLabel && (
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">많이 달라진 카테고리</h2>
            {isMonthly && (
              <Segmented label="비교 대상" options={['이전 기간', '작년 같은 달'] as const} value={compareTarget} onChange={setCompareTarget} />
            )}
          </div>
          <p className="card-description">{compareTarget === '이전 기간' ? previousLabel : '작년 같은 달'} 대비</p>
          <ChangeList changes={changes[compareTarget]} />
        </section>
      )}

      <section className="card">
        <h2 className="card-title">카테고리 순위</h2>
        <CategoryRanking items={ranking} />
      </section>

      <FixedVariableCard {...fixedVariable} />

      {personComparison.length > 0 && (
        <section className="card">
          <h2 className="card-title">개인 지출 비교</h2>
          <PersonComparisonBars rows={personComparison} />
        </section>
      )}
    </>
  )
}

function CategoryDonut({ slices, total }: { slices: Slice[]; total: number }) {
  const sliceTotal = slices.reduce((sum, slice) => sum + slice.amount, 0)
  const icons = useCategoryIcons()

  return (
    <div className="donut">
      <div className="donut-chart">
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie
              data={slices}
              dataKey="amount"
              nameKey="label"
              innerRadius="62%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              paddingAngle={1}
              stroke="var(--color-surface)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.map((slice, index) => (
                <Cell key={slice.label} fill={sliceColor(slice, index)} />
              ))}
            </Pie>
            <Tooltip formatter={value => formatWon(Number(value))} {...TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center" aria-hidden="true">
          <span>총 지출</span>
          <strong>{formatCompactWon(total)}</strong>
        </div>
      </div>
      <ul className="donut-legend">
        {slices.map((slice, index) => (
          <li key={slice.label}>
            <span className="legend-swatch" style={{ background: sliceColor(slice, index) }} />
            <span className="legend-label">
              {!slice.isOther && <CategoryIcon name={slice.label} emoji={icons.get(slice.label)} size={12} />}
              <span className="label-text">{slice.label}</span>
            </span>
            <span className="legend-value">{percent(slice.amount, sliceTotal)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ChangeList({ changes }: { changes: { increased: CategoryChange[]; decreased: CategoryChange[] } }) {
  const icons = useCategoryIcons()
  const rows = [...changes.increased.slice(0, CHANGE_LIMIT), ...changes.decreased.slice(0, CHANGE_LIMIT)]

  if (rows.length === 0) return <p className="empty-inline">비교할 내역이 없어요.</p>
  return (
    <ul className="change-list">
      {rows.map(row => (
        <li key={row.category}>
          <CategoryIcon name={row.category} emoji={icons.get(row.category)} size={16} />
          <span className="change-label">
            {row.category}
            <span className="change-sub">
              {formatWon(row.previous)} → {formatWon(row.current)}
            </span>
          </span>
          <span className={`change-delta ${row.delta > 0 ? 'is-up' : 'is-down'}`}>
            {row.delta > 0 ? <CaretUpIcon size={12} weight="fill" aria-hidden="true" /> : <CaretDownIcon size={12} weight="fill" aria-hidden="true" />}
            {formatWon(Math.abs(row.delta))}
          </span>
        </li>
      ))}
    </ul>
  )
}

function CategoryRanking({ items }: { items: { category: string; amount: number }[] }) {
  const icons = useCategoryIcons()
  const max = Math.max(...items.map(item => item.amount))
  const total = items.reduce((sum, item) => sum + item.amount, 0)

  return (
    <ol className="bars">
      {items.map((item, index) => (
        <li key={item.category} className="bar-row">
          <span className="bar-rank">{index + 1}</span>
          <span className="bar-label">
            <CategoryIcon name={item.category} emoji={icons.get(item.category)} size={12} />
            <span className="label-text">{item.category}</span>
          </span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${Math.max(0, (item.amount / max) * 100)}%` }} />
          </div>
          <span className="bar-value">
            {item.amount.toLocaleString('ko-KR')}
            <span className="bar-share"> {percent(item.amount, total)}%</span>
          </span>
        </li>
      ))}
    </ol>
  )
}

function FixedVariableCard({ fixed, variable }: { fixed: number; variable: number }) {
  const total = fixed + variable

  return (
    <section className="card">
      <h2 className="card-title">고정비 vs 변동비</h2>
      <div className="split-bar" aria-hidden="true">
        <div className="split-fixed" style={{ width: `${percent(fixed, total)}%` }} />
        <div className="split-variable" style={{ width: `${percent(variable, total)}%` }} />
      </div>
      <div className="split-legend">
        <span>
          <span className="legend-swatch split-fixed" /> 고정비 <strong>{formatWon(fixed)}</strong> ({percent(fixed, total)}%)
        </span>
        <span>
          <span className="legend-swatch split-variable" /> 변동비 <strong>{formatWon(variable)}</strong> ({percent(variable, total)}%)
        </span>
      </div>
      <p className="card-description">고정비 카테고리는 구글 시트 "카테고리" 탭의 고정비 칸에서 바꿀 수 있어요.</p>
    </section>
  )
}

function PersonComparisonBars({ rows }: { rows: PersonComparison[] }) {
  const icons = useCategoryIcons()
  const personName = usePersonName()
  const max = Math.max(...rows.flatMap(row => [row.쿠리만쥬, row.우사기]))

  return (
    <>
      <div className="person-legend">
        {PEOPLE.map(person => (
          <span key={person}>
            <span className="legend-swatch" style={{ background: PERSON_COLORS[person] }} />
            <PersonAvatar person={person} size={16} /> {personName(person)}
          </span>
        ))}
      </div>
      <ul className="person-bars">
        {rows.map(row => (
          <li key={row.category}>
            <span className="person-bars-label">
              <CategoryIcon name={row.category} emoji={icons.get(row.category)} size={12} />
              <span className="label-text">{row.category}</span>
            </span>
            {PEOPLE.map(person => (
              <div key={person} className="person-bar-row">
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(row[person] / max) * 100}%`, background: PERSON_COLORS[person] }} />
                </div>
                <span className="bar-value">{row[person].toLocaleString('ko-KR')}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </>
  )
}

export default CategoryTab
