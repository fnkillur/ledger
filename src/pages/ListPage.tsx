import { useMemo } from 'react'
import { Link } from 'react-router'
import EmptyState from '../components/EmptyState'
import PeriodHeader from '../components/PeriodHeader'
import ScopeSplit from '../components/ScopeSplit'
import TransactionRow from '../components/TransactionRow'
import { useCategories, useTransactionsBetween } from '../db/hooks'
import { monthKeysOfYear, toRange } from '../domain/period'
import { expenseByScope, monthlyTotals, sumByKind, toExcludedCategories, type KindTotals } from '../domain/stats'
import type { Transaction } from '../domain/types'
import { isSyncConfigured, useSettings } from '../sync/settings'
import { currentMonthKey, formatDayLabel, formatShortMonth, formatWon, toDateKey } from '../utils/format'
import { updateViewState, useViewState } from '../utils/viewState'

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
  const { periodType, monthKey } = useViewState()
  const settings = useSettings()

  const range = toRange({ type: periodType, monthKey })
  const transactions = useTransactionsBetween(range.start, range.end)
  const categories = useCategories()

  const excludedCategories = useMemo(() => toExcludedCategories(categories), [categories])
  const periodTransactions = useMemo(() => transactions ?? [], [transactions])
  const totals = useMemo(() => sumByKind(periodTransactions, excludedCategories), [periodTransactions, excludedCategories])
  const byScope = useMemo(() => expenseByScope(periodTransactions, excludedCategories), [periodTransactions, excludedCategories])

  return (
    <div className="page">
      <PeriodHeader />

      <main className="page-content">
        {!isSyncConfigured(settings) && (
          <Link to="/settings" className="notice">
            구글 시트와 아직 연결되지 않았어요. 설정에서 연결 코드를 붙여넣어 주세요.
          </Link>
        )}

        <section className="summary-card" aria-label="요약">
          <SummaryItem label="지출" amount={totals.지출} tone="지출" />
          <SummaryItem label="수입" amount={totals.수입} tone="수입" />
          <SummaryItem label="저축" amount={totals.저축} tone="저축" />
          <SummaryItem label="남은 돈" amount={totals.수입 - totals.지출 - totals.저축} tone="남은" />
          {totals.지출 > 0 && (
            <div className="summary-split">
              <span className="summary-label">지출 나눠보기</span>
              <ScopeSplit items={byScope} />
            </div>
          )}
        </section>

        {transactions?.length === 0 && <EmptyState sticker="peek">이 기간의 내역이 없어요.</EmptyState>}

        {periodType === '연도별' ? (
          <YearMonthList monthKey={monthKey} transactions={periodTransactions} excludedCategories={excludedCategories} />
        ) : (
          <DayGroups transactions={periodTransactions} />
        )}
      </main>

      <Link to="/tx/new" className="fab" aria-label="내역 추가">
        <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </Link>
    </div>
  )
}

function DayGroups({ transactions }: { transactions: Transaction[] }) {
  const dayGroups = useMemo(() => groupByDay(transactions), [transactions])

  return dayGroups.map(group => (
    <section key={group.dateKey} className="day-group">
      <h2 className="day-title">{formatDayLabel(group.transactions[0].occurredAt)}</h2>
      <ul className="tx-list">
        {group.transactions.map(transaction => (
          <TransactionRow key={transaction.id} transaction={transaction} />
        ))}
      </ul>
    </section>
  ))
}

type YearMonthListProps = {
  monthKey: string
  transactions: Transaction[]
  excludedCategories: Set<string>
}

function YearMonthList({ monthKey, transactions, excludedCategories }: YearMonthListProps) {
  const months = useMemo(() => {
    const latest = currentMonthKey()
    const monthKeys = monthKeysOfYear(monthKey).filter(key => key <= latest)
    return monthlyTotals(transactions, monthKeys, excludedCategories).reverse()
  }, [monthKey, transactions, excludedCategories])

  return (
    <ul className="tx-list month-list">
      {months.map(month => (
        <li key={month.monthKey}>
          <button
            type="button"
            className="tx-row month-row"
            onClick={() => updateViewState({ periodType: '월별', monthKey: month.monthKey })}
          >
            <strong className="month-row-label">{formatShortMonth(month.monthKey)}</strong>
            <MonthRowAmounts totals={month} />
          </button>
        </li>
      ))}
    </ul>
  )
}

function MonthRowAmounts({ totals }: { totals: KindTotals }) {
  return (
    <div className="month-row-amounts">
      <span>
        지출 <strong>{formatWon(totals.지출)}</strong>
      </span>
      <span>
        수입 <strong className="amount-수입">{formatWon(totals.수입)}</strong>
      </span>
      <span>
        저축 <strong>{formatWon(totals.저축)}</strong>
      </span>
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
