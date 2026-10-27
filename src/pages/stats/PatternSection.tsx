import { useState } from 'react'
import { Link } from 'react-router'
import CategoryIcon from '../../components/CategoryIcon'
import EmptyState from '../../components/EmptyState'
import Sticker from '../../components/Sticker'
import PersonAvatar from '../../components/PersonAvatar'
import { useCategoryIcons, usePersonName } from '../../db/hooks'
import { TIME_SLOTS, WEEKDAYS, type CalendarDay, type MerchantStat } from '../../domain/insights'
import { myShare } from '../../domain/stats'
import type { Transaction } from '../../domain/types'
import { formatShortDay, formatWon } from '../../utils/format'
import MoreToggle from './MoreToggle'
import { formatCompactWon } from './shared'

const COLLAPSED_COUNT = 5

type PatternSectionProps = {
  hasDetail: boolean
  biggest: Transaction[]
  merchants: MerchantStat[]
  matrix: number[][]
  calendar: { days: CalendarDay[]; leadingBlanks: number; noSpendCount: number } | null
}

// 어떻게 썼나: 큰 지출, 자주 가는 곳, 무지출 데이, 요일·시간대.
function PatternSection({ hasDetail, biggest, merchants, matrix, calendar }: PatternSectionProps) {
  if (!hasDetail) {
    return (
      <section className="card">
        <EmptyState sticker="proud">
          <strong>건별 기록이 쌓이면 분석해 드릴게요</strong>
          <span>이 기간은 월 합계로 옮겨온 기록뿐이에요. 큰 지출, 자주 가는 곳, 요일·시간대, 무지출 데이를 보여드려요.</span>
        </EmptyState>
      </section>
    )
  }

  return (
    <>
      <section className="card">
        <h2 className="card-title">큰 지출</h2>
        <TopExpenseList transactions={biggest} />
      </section>

      <section className="card">
        <h2 className="card-title">자주 가는 곳</h2>
        {merchants.length === 0 ? <p className="empty-inline">가맹점 이름이 있는 내역이 없어요.</p> : <MerchantList merchants={merchants} />}
      </section>

      {calendar && <NoSpendCalendar {...calendar} />}

      <section className="card">
        <h2 className="card-title">요일·시간대별 지출</h2>
        <Heatmap matrix={matrix} />
      </section>
    </>
  )
}

function TopExpenseList({ transactions }: { transactions: Transaction[] }) {
  const icons = useCategoryIcons()
  const personName = usePersonName()
  const [isExpanded, setIsExpanded] = useState(false)

  const shown = isExpanded ? transactions : transactions.slice(0, COLLAPSED_COUNT)

  return (
    <>
      <ol className="top-list">
        {shown.map((transaction, index) => (
          <li key={transaction.id}>
            <Link to={`/tx/${transaction.id}`} className="top-row">
              <span className="bar-rank">{index + 1}</span>
              <CategoryIcon name={transaction.category} emoji={icons.get(transaction.category)} size={16} />
              <span className="top-row-main">
                <strong>{transaction.merchant || transaction.category}</strong>
                <span className="tx-row-meta">
                  <span className="tx-row-person">
                    <PersonAvatar person={transaction.person} size={16} />
                    {personName(transaction.person)}
                  </span>
                  <span className="tx-row-category">{transaction.category}</span>
                  {transaction.shareCount > 1 && <span className="tx-badge">{transaction.shareCount}명 나눔</span>}
                </span>
              </span>
              <span className="top-row-amount">
                {formatWon(myShare(transaction))}
                <span className="tx-row-time">{formatShortDay(transaction.occurredAt)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <MoreToggle total={transactions.length} collapsedCount={COLLAPSED_COUNT} isExpanded={isExpanded} onToggle={() => setIsExpanded(!isExpanded)} />
    </>
  )
}

function MerchantList({ merchants }: { merchants: MerchantStat[] }) {
  return (
    <ol className="top-list">
      {merchants.map((merchant, index) => (
        <li key={merchant.merchant} className="top-row merchant-row">
          <span className="bar-rank">{index + 1}</span>
          <span className="top-row-main">
            <strong>{merchant.merchant}</strong>
            <span className="tx-row-meta">
              <span className="tx-badge">{merchant.count}번 방문</span>
              {merchant.count > 1 && `평균 ${formatWon(Math.round(merchant.amount / merchant.count))}`}
            </span>
          </span>
          <span className="top-row-amount">{formatWon(merchant.amount)}</span>
        </li>
      ))}
    </ol>
  )
}

const heatLevel = (value: number, max: number) => {
  if (value <= 0 || max <= 0) return 0
  return Math.max(1, Math.ceil((value / max) * 5))
}

function Heatmap({ matrix }: { matrix: number[][] }) {
  const max = Math.max(...matrix.flat())
  const [weekdayIndex, slotIndex] = findPeak(matrix)

  return (
    <>
      <div className="heatmap" role="table" aria-label="요일별 시간대별 지출">
        <span />
        {TIME_SLOTS.map(slot => (
          <span key={slot.label} className="heatmap-head">
            {slot.label}
          </span>
        ))}
        {WEEKDAYS.map((weekday, row) => (
          <HeatmapRow key={weekday} weekday={weekday} values={matrix[row]} max={max} />
        ))}
      </div>
      <div className="heatmap-scale" aria-hidden="true">
        적음 {[1, 2, 3, 4, 5].map(level => <span key={level} className={`heat-${level}`} />)} 많음
      </div>
      {max > 0 && (
        <p className="meter-note">
          가장 많이 쓰는 때는 <strong>{WEEKDAYS[weekdayIndex]}요일 {TIME_SLOTS[slotIndex].label}</strong>이에요 ({formatWon(max)})
        </p>
      )}
    </>
  )
}

const findPeak = (matrix: number[][]) =>
  matrix.reduce<[number, number]>(
    (peak, row, rowIndex) =>
      row.reduce<[number, number]>(
        (best, value, columnIndex) => (value > matrix[best[0]][best[1]] ? [rowIndex, columnIndex] : best),
        peak,
      ),
    [0, 0],
  )

function HeatmapRow({ weekday, values, max }: { weekday: string; values: number[]; max: number }) {
  return (
    <>
      <span className="heatmap-head">{weekday}</span>
      {values.map((value, index) => (
        <span
          key={TIME_SLOTS[index].label}
          className={`heatmap-cell heat-${heatLevel(value, max)}`}
          title={`${weekday} ${TIME_SLOTS[index].label} ${formatWon(value)}`}
          role="cell"
          aria-label={`${weekday}요일 ${TIME_SLOTS[index].label} ${formatWon(value)}`}
        />
      ))}
    </>
  )
}

type NoSpendCalendarProps = { days: CalendarDay[]; leadingBlanks: number; noSpendCount: number }

function NoSpendCalendar({ days, leadingBlanks, noSpendCount }: NoSpendCalendarProps) {
  return (
    <section className="card">
      <h2 className="card-title">
        무지출 데이 <span className="count">🌱 {noSpendCount}일</span>
        {noSpendCount > 0 && <Sticker name="excited" size={44} className="card-sticker" />}
      </h2>
      <div className="calendar">
        {WEEKDAYS.map(weekday => (
          <span key={weekday} className="calendar-head">
            {weekday}
          </span>
        ))}
        {Array.from({ length: leadingBlanks }, (_, index) => (
          <span key={`blank-${index}`} />
        ))}
        {days.map(day => (
          <CalendarCell key={day.day} day={day} />
        ))}
      </div>
    </section>
  )
}

function CalendarCell({ day }: { day: CalendarDay }) {
  if (day.isFuture) return <span className="calendar-day is-future">{day.day}</span>
  if (day.spent <= 0) {
    return (
      <span className="calendar-day is-no-spend" aria-label={`${day.day}일 무지출`}>
        {day.day}
        <span aria-hidden="true">🌱</span>
      </span>
    )
  }
  return (
    <span className="calendar-day">
      {day.day}
      <span className="calendar-amount">{formatCompactWon(day.spent)}</span>
    </span>
  )
}

export default PatternSection
