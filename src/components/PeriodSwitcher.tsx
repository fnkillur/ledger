import { CaretDownIcon, CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { formatPeriod, isEarliestPeriod, isLatestPeriod, shiftPeriod, type Period } from '../domain/period'
import { currentMonthKey } from '../utils/format'
import PeriodPickerSheet from './PeriodPickerSheet'

type PeriodSwitcherProps = {
  period: Period
  onChange: (period: Period) => void
  // 캘린더는 미래·먼 과거 달도 보고, 월 단위로만 움직인다.
  monthOnly?: boolean
  unbounded?: boolean
}

function PeriodSwitcher({ period, onChange, monthOnly = false, unbounded = false }: PeriodSwitcherProps) {
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
        disabled={!unbounded && isEarliestPeriod(period)}
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
        disabled={!unbounded && isLatestPeriod(period, currentMonthKey())}
        onClick={() => onChange(shiftPeriod(period, 1))}
      >
        <CaretRightIcon size={16} weight="fill" aria-hidden="true" />
      </button>

      {isPickerOpen &&
        createPortal(
          <PeriodPickerSheet
            period={period}
            monthOnly={monthOnly}
            unbounded={unbounded}
            onSelect={handleSelect}
            onClose={() => setIsPickerOpen(false)}
          />,
          document.body,
        )}
    </div>
  )
}

export default PeriodSwitcher
