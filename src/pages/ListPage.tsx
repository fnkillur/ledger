import { useMemo } from 'react'
import { Link } from 'react-router'
import MonthSwitcher from '../components/MonthSwitcher'
import Segmented from '../components/Segmented'
import TopBar from '../components/TopBar'
import TransactionRow from '../components/TransactionRow'
import { useCategories, useMonthTransactions } from '../db/hooks'
import { matchesPerson, sumByKind, toExcludedCategories, type PersonFilter } from '../domain/stats'
import type { Transaction } from '../domain/types'
import { formatDayLabel, formatWon, toDateKey } from '../utils/format'
import { isSyncConfigured, useSettings } from '../sync/settings'
import { updateViewState, useViewState } from '../utils/viewState'

const PERSON_FILTERS: PersonFilter[] = ['합산', '쿠리만쥬', '우사기']

type DayGroup = { dateKey: string; transactions: Transaction[] }

const groupByDay = (transactions: Transaction[]) =>
  transactions.reduce<DayGroup[]>((groups, transaction) => {
    const dateKey = toDateKey(transaction.occurredAt)
    const lastGroup = groups.at(-1)
    if (lastGroup?.dateKey === dateKey) {
      lastGroup.transactions.push(transaction)
      return groups
    }
    return [...groups, { dateKey, transactions: [transaction] }]
  }, [])

function ListPage() {
  const { monthKey, personFilter } = useViewState()
  const settings = useSettings()

  const transactions = useMonthTransactions(monthKey)
  const categories = useCategories()

  const filtered = useMemo(
    () => (transactions ?? []).filter(transaction => matchesPerson(transaction, personFilter)),
    [transactions, personFilter],
  )
  const totals = useMemo(() => sumByKind(filtered, toExcludedCategories(categories)), [filtered, categories])
  const dayGroups = useMemo(() => groupByDay(filtered), [filtered])

  return (
    <div className="page">
      <TopBar title={<MonthSwitcher monthKey={monthKey} onChange={value => updateViewState({ monthKey: value })} />} />

      <main className="page-content">
        <Segmented
          label="사람"
          options={PERSON_FILTERS}
          value={personFilter}
          onChange={value => updateViewState({ personFilter: value })}
        />

        {!isSyncConfigured(settings) && (
          <Link to="/settings" className="notice">
            구글 시트와 아직 연결되지 않았어요. 설정에서 연결 코드를 붙여넣어 주세요.
          </Link>
        )}

        <section className="summary-card" aria-label="이번 달 요약">
          <SummaryItem label="지출" amount={totals.지출} tone="지출" />
          <SummaryItem label="수입" amount={totals.수입} tone="수입" />
          <SummaryItem label="저축" amount={totals.저축} tone="저축" />
          <SummaryItem label="남은 돈" amount={totals.수입 - totals.지출 - totals.저축} tone="남은" />
        </section>

        {transactions?.length === 0 && (
          <p className="empty-state">이 달의 내역이 없어요.</p>
        )}

        {dayGroups.map(group => (
          <section key={group.dateKey} className="day-group">
            <h2 className="day-title">{formatDayLabel(group.transactions[0].occurredAt)}</h2>
            <ul className="tx-list">
              {group.transactions.map(transaction => (
                <TransactionRow key={transaction.id} transaction={transaction} />
              ))}
            </ul>
          </section>
        ))}
      </main>

      <Link to="/tx/new" className="fab" aria-label="내역 추가">
        <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </Link>
    </div>
  )
}

type SummaryItemProps = {
  label: string
  amount: number
  tone: '지출' | '수입' | '저축' | '남은'
}

function SummaryItem({ label, amount, tone }: SummaryItemProps) {
  return (
    <div className="summary-item">
      <span className="summary-label">{label}</span>
      <strong className={`summary-amount amount-${tone}`}>{formatWon(amount)}</strong>
    </div>
  )
}

export default ListPage
