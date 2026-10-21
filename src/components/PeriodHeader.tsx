import type { ReactNode } from 'react'
import { updateViewState, useViewState } from '../utils/viewState'
import PeriodSwitcher from './PeriodSwitcher'
import PersonPicker from './PersonPicker'

function PeriodHeader({ children }: { children?: ReactNode }) {
  const { periodType, monthKey } = useViewState()

  return (
    <header className="period-header">
      <div className="period-header-row">
        <PeriodSwitcher
          period={{ type: periodType, monthKey }}
          onChange={period => updateViewState({ periodType: period.type, monthKey: period.monthKey })}
        />
        <PersonPicker />
      </div>
      {children}
    </header>
  )
}

export default PeriodHeader
