import { formatPeriod, isLatestPeriod, shiftPeriod, type Period } from '../domain/period'
import { currentMonthKey } from '../utils/format'

type PeriodSwitcherProps = {
  period: Period
  onChange: (period: Period) => void
}

function PeriodSwitcher({ period, onChange }: PeriodSwitcherProps) {
  return (
    <div className="month-switcher">
      <button type="button" className="icon-button" aria-label="이전" onClick={() => onChange(shiftPeriod(period, -1))}>
        <Chevron direction="left" />
      </button>
      <span className="month-switcher-label">{formatPeriod(period)}</span>
      <button
        type="button"
        className="icon-button"
        aria-label="다음"
        disabled={isLatestPeriod(period, currentMonthKey())}
        onClick={() => onChange(shiftPeriod(period, 1))}
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

export default PeriodSwitcher
