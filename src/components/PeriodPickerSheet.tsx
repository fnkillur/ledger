import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { EARLIEST_MONTH_KEY, type Period } from '../domain/period'
import { currentMonthKey } from '../utils/format'
import FieldHint from './FieldHint'
import Segmented from './Segmented'

const PERIOD_TYPES = ['월별', '연도별'] as const
const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1)

type PeriodPickerSheetProps = {
  period: Period
  onSelect: (period: Period) => void
  onClose: () => void
}

const toMonthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`

function PeriodPickerSheet({ period, onSelect, onClose }: PeriodPickerSheetProps) {
  const latest = currentMonthKey()
  const latestYear = Number(latest.slice(0, 4))
  const earliestYear = Number(EARLIEST_MONTH_KEY.slice(0, 4))

  const [type, setType] = useState(period.type)
  const [year, setYear] = useState(Number(period.monthKey.slice(0, 4)))

  const selectedMonth = Number(period.monthKey.slice(5, 7))

  const handleSelectYear = () => {
    const month = year === latestYear ? Number(latest.slice(5, 7)) : 12
    onSelect({ type: '연도별', monthKey: toMonthKey(year, month) })
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="기간 선택" onClick={event => event.stopPropagation()}>
        <Segmented label="기간 단위" options={PERIOD_TYPES} value={type} onChange={setType} />

        <div className="year-stepper">
          <button type="button" className="icon-button" aria-label="이전 해" disabled={year <= earliestYear} onClick={() => setYear(year - 1)}>
            <CaretLeftIcon size={16} weight="fill" aria-hidden="true" />
          </button>
          <strong>{year}년</strong>
          <button type="button" className="icon-button" aria-label="다음 해" disabled={year >= latestYear} onClick={() => setYear(year + 1)}>
            <CaretRightIcon size={16} weight="fill" aria-hidden="true" />
          </button>
        </div>

        {type === '월별' ? (
          <div className="month-grid">
            {MONTHS.map(month => (
              <button
                key={month}
                type="button"
                className="month-cell"
                aria-pressed={period.type === '월별' && toMonthKey(year, month) === period.monthKey}
                disabled={toMonthKey(year, month) > latest || toMonthKey(year, month) < EARLIEST_MONTH_KEY}
                onClick={() => onSelect({ type: '월별', monthKey: toMonthKey(year, month) })}
              >
                {month}월
              </button>
            ))}
          </div>
        ) : (
          <button type="button" className="button button-primary" onClick={handleSelectYear}>
            {year}년 전체 보기
          </button>
        )}

        {type === '월별' && period.type === '월별' && Number(period.monthKey.slice(0, 4)) !== year && (
          <FieldHint>
            지금 보는 달: {Number(period.monthKey.slice(0, 4))}년 {selectedMonth}월
          </FieldHint>
        )}
      </div>
    </div>
  )
}

export default PeriodPickerSheet
