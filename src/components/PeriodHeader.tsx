import { updateViewState, useViewState, type PeriodType } from '../utils/viewState'
import PeriodSwitcher from './PeriodSwitcher'
import TopBar from './TopBar'

const PERIOD_TYPES: PeriodType[] = ['월별', '연도별']

function PeriodHeader() {
  const { periodType, monthKey } = useViewState()

  return (
    <TopBar
      title={
        <PeriodSwitcher
          period={{ type: periodType, monthKey }}
          onChange={period => updateViewState({ periodType: period.type, monthKey: period.monthKey })}
        />
      }
      actions={
        <div className="period-toggle" role="radiogroup" aria-label="기간 단위">
          {PERIOD_TYPES.map(type => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={type === periodType}
              className="period-toggle-option"
              onClick={() => updateViewState({ periodType: type })}
            >
              {type === '월별' ? '월' : '연'}
            </button>
          ))}
        </div>
      }
    />
  )
}

export default PeriodHeader
