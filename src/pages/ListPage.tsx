import { useMemo } from 'react'
import { Link } from 'react-router'
import AddMenu from '../components/AddMenu'
import CategoryIcon from '../components/CategoryIcon'
import EmptyState from '../components/EmptyState'
import PeriodHeader from '../components/PeriodHeader'
import PersonAvatar from '../components/PersonAvatar'
import ScopeSplit from '../components/ScopeSplit'
import TransactionRow from '../components/TransactionRow'
import { useCategories, useCategoryIcons, usePersonName, useTransactionsBetween } from '../db/hooks'
import { monthKeysOfYear, toRange } from '../domain/period'
import {
  aggregateByCategory,
  expenseByScope,
  expenseRatio,
  monthlyTotals,
  ratioLevel,
  ratioMessage,
  sumByKind,
  toExcludedCategories,
  type CategoryAggregate,
  type KindTotals,
} from '../domain/stats'
import { isAggregate, PEOPLE, type Transaction } from '../domain/types'
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
          <ExpenseRatio totals={totals} />
          <SummaryItem label="지출" amount={totals.지출} tone="지출" />
          <SummaryItem label="수입" amount={totals.수입} tone="수입" />
          <SummaryItem label="남은 돈" amount={totals.수입 - totals.지출} tone="남은" />
          {totals.지출 > 0 && (
            <div className="summary-split">
              <span className="summary-label">지출 나눠보기</span>
              <ScopeSplit items={byScope} showLabels />
            </div>
          )}
        </section>

        {transactions?.length === 0 && <EmptyState sticker="peek">이 기간의 내역이 없어요.</EmptyState>}

        {periodType === '연도별' ? (
          <YearMonthList monthKey={monthKey} transactions={periodTransactions} excludedCategories={excludedCategories} />
        ) : (
          <MonthDetail monthKey={monthKey} transactions={periodTransactions} excludedCategories={excludedCategories} />
        )}
      </main>

      <AddMenu />
    </div>
  )
}

type MonthDetailProps = { monthKey: string; transactions: Transaction[]; excludedCategories: Set<string> }

function MonthDetail({ monthKey, transactions, excludedCategories }: MonthDetailProps) {
  const aggregates = useMemo(() => aggregateByCategory(transactions), [transactions])
  const detailed = useMemo(() => transactions.filter(transaction => !isAggregate(transaction.source)), [transactions])

  return (
    <>
      {aggregates.length > 0 && (
        <AggregateCard monthKey={monthKey} aggregates={aggregates} hasDetail={detailed.length > 0} excludedCategories={excludedCategories} />
      )}
      <DayGroups transactions={detailed} excludedCategories={excludedCategories} />
    </>
  )
}

type AggregateCardProps = {
  monthKey: string
  aggregates: CategoryAggregate[]
  hasDetail: boolean
  excludedCategories: Set<string>
}

// 월 합계만 있는 달은 날짜별 목록 대신 카테고리별 금액으로 보여준다.
function AggregateCard({ monthKey, aggregates, hasDetail, excludedCategories }: AggregateCardProps) {
  const icons = useCategoryIcons()
  const personName = usePersonName()

  return (
    <section className="card aggregate-card">
      <div className="aggregate-head">
        <h2 className="card-title">월 합계</h2>
        <Link to="/monthly" state={{ monthKey }} className="text-button text-primary section-action">
          고치기
        </Link>
      </div>
      <p className="card-description">
        {hasDetail ? '토스 캡처로 입력한 카테고리별 금액이에요.' : '이 달은 월 합계로 기록해서 카테고리별 금액만 있어요.'}
      </p>
      <ul className="aggregate-list">
        {aggregates.map(item => {
          const people = PEOPLE.filter(person => item.byPerson[person] !== 0)
          return (
            <li key={`${item.kind}-${item.category}`} className="aggregate-row">
              <CategoryIcon name={item.category} emoji={icons.get(item.category)} size={18} />
              <span className="aggregate-main">
                <span className="aggregate-name">
                  {item.category}
                  {excludedCategories.has(item.category) && <span className="tx-badge">통계 제외</span>}
                </span>
                <span className="aggregate-people">
                  {people.map(person => (
                    <span key={person}>
                      <PersonAvatar person={person} size={14} />
                      {people.length > 1 ? formatWon(item.byPerson[person]) : personName(person)}
                    </span>
                  ))}
                </span>
              </span>
              <strong className={`amount amount-${item.kind}`}>
                {item.kind === '수입' ? '+' : ''}
                {formatWon(item.total)}
              </strong>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function DayGroups({ transactions, excludedCategories }: { transactions: Transaction[]; excludedCategories: Set<string> }) {
  const dayGroups = useMemo(() => groupByDay(transactions), [transactions])

  return dayGroups.map(group => (
    <section key={group.dateKey} className="day-group">
      <h2 className="day-title">
        {formatDayLabel(group.transactions[0].occurredAt)}
        <DayTotal totals={sumByKind(group.transactions, excludedCategories)} />
      </h2>
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
        지출 <strong className="amount-지출">{formatWon(totals.지출)}</strong>
      </span>
      <span>
        수입 <strong className="amount-수입">{formatWon(totals.수입)}</strong>
      </span>
      <span>
        지출률 <strong>{formatRatio(expenseRatio(totals))}</strong>
      </span>
    </div>
  )
}

function DayTotal({ totals }: { totals: KindTotals }) {
  return (
    <span className="day-total">
      {totals.수입 > 0 && <span className="amount-수입">+{formatWon(totals.수입)}</span>}
      {totals.지출 > 0 && <span>{formatWon(totals.지출)}</span>}
    </span>
  )
}

const formatRatio = (ratio: number | null) => (ratio === null ? '–' : `${ratio}%`)

function ExpenseRatio({ totals }: { totals: KindTotals }) {
  const ratio = expenseRatio(totals)

  if (ratio === null) {
    return (
      <div className="ratio-hero">
        <span className="summary-label">수입 대비 지출</span>
        <strong className="ratio-value">–</strong>
        <span className="ratio-message">수입이 들어오면 지출 비율을 보여드려요</span>
      </div>
    )
  }

  const level = ratioLevel(ratio)
  return (
    <div className="ratio-hero" data-level={level}>
      <div className="ratio-head">
        <span className="summary-label">수입 대비 지출</span>
        <span className="ratio-chip">{level}</span>
      </div>
      <strong className="ratio-value">{ratio}%</strong>
      <div className="meter ratio-meter" aria-hidden="true">
        <div className="meter-fill" style={{ width: `${Math.min(100, ratio)}%` }} />
      </div>
      <span className="ratio-message">{ratioMessage(level)}</span>
    </div>
  )
}

type SummaryItemProps = {
  label: string
  amount: number
  tone: '지출' | '수입' | '남은'
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
