import { useState } from 'react'
import { createPortal } from 'react-dom'
import { formatPeriod, isEarliestPeriod, isLatestPeriod, shiftPeriod, type Period } from '../domain/period'
import { currentMonthKey } from '../utils/format'
import PeriodPickerSheet from './PeriodPickerSheet'

type PeriodSwitcherProps = {
  period: Period
  onChange: (period: Period) => void
}

function PeriodSwitcher({ period, onChange }: PeriodSwitcherProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false)

  const handleSelect = (next: Period) => {
    onChange(next)
    setIsPickerOpen(false)
  }

  return (
    <div className="month-switcher">
      <button
        type="button"
        className="icon-button period-arrow"
        aria-label="이전"
        disabled={isEarliestPeriod(period)}
        onClick={() => onChange(shiftPeriod(period, -1))}
      >
        <Triangle direction="left" />
      </button>
      <button type="button" className="period-label" aria-haspopup="dialog" onClick={() => setIsPickerOpen(true)}>
        {formatPeriod(period)}
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        className="icon-button period-arrow"
        aria-label="다음"
        disabled={isLatestPeriod(period, currentMonthKey())}
        onClick={() => onChange(shiftPeriod(period, 1))}
      >
        <Triangle direction="right" />
      </button>

      {isPickerOpen &&
        createPortal(<PeriodPickerSheet period={period} onSelect={handleSelect} onClose={() => setIsPickerOpen(false)} />, document.body)}
    </div>
  )
}

function Triangle({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path d={direction === 'left' ? 'M17 4v16L5 12z' : 'M7 4v16l12-8z'} fill="currentColor" strokeLinejoin="round" />
    </svg>
  )
}

export default PeriodSwitcher
