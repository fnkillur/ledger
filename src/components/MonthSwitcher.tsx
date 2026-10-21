import { currentMonthKey, formatMonthLabel, shiftMonth } from '../utils/format'

type MonthSwitcherProps = {
  monthKey: string
  onChange: (monthKey: string) => void
}

function MonthSwitcher({ monthKey, onChange }: MonthSwitcherProps) {
  const isCurrentMonth = monthKey >= currentMonthKey()

  return (
    <div className="month-switcher">
      <button type="button" className="icon-button" aria-label="이전 달" onClick={() => onChange(shiftMonth(monthKey, -1))}>
        <Chevron direction="left" />
      </button>
      <span className="month-switcher-label">{formatMonthLabel(monthKey)}</span>
      <button
        type="button"
        className="icon-button"
        aria-label="다음 달"
        disabled={isCurrentMonth}
        onClick={() => onChange(shiftMonth(monthKey, 1))}
      >
        <Chevron direction="right" />
      </button>
    </div>
  )
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default MonthSwitcher
