import { CaretDownIcon, CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
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
        <CaretLeftIcon size={16} weight="fill" aria-hidden="true" />
      </button>
      <button type="button" className="period-label" aria-haspopup="dialog" onClick={() => setIsPickerOpen(true)}>
        {formatPeriod(period)}
        <CaretDownIcon size={14} weight="bold" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="icon-button period-arrow"
        aria-label="다음"
        disabled={isLatestPeriod(period, currentMonthKey())}
        onClick={() => onChange(shiftPeriod(period, 1))}
      >
        <CaretRightIcon size={16} weight="fill" aria-hidden="true" />
      </button>

      {isPickerOpen &&
        createPortal(<PeriodPickerSheet period={period} onSelect={handleSelect} onClose={() => setIsPickerOpen(false)} />, document.body)}
    </div>
  )
}

export default PeriodSwitcher
