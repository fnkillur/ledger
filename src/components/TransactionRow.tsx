import { useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { getCelebration, subscribeCelebration } from '../celebration/store'
import { useCategoryIcons, usePersonName } from '../db/hooks'
import { myShare } from '../domain/stats'
import { scopeLabel, type ReceiptLine, type Transaction } from '../domain/types'
import { formatSignedWon, formatTime } from '../utils/format'
import CategoryIcon from './CategoryIcon'
import PersonAvatar from './PersonAvatar'
import ReceiptSheet from './ReceiptSheet'

const hasReceiptLines = (transaction: Transaction): transaction is Transaction & { receiptItems: ReceiptLine[] } =>
  (transaction.receiptItems?.length ?? 0) > 0

type TransactionRowProps = {
  transaction: Transaction
  // 카테고리 상세처럼 모두 같은 카테고리인 목록에서는 카테고리 대신 공금·용돈 주인 얼굴을 앞에 둔다.
  isCategoryShown?: boolean
}

function TransactionRow({ transaction, isCategoryShown = true }: TransactionRowProps) {
  const icons = useCategoryIcons()
  const personName = usePersonName()
  const celebration = useSyncExternalStore(subscribeCelebration, getCelebration)

  const [isReceiptOpen, setIsReceiptOpen] = useState(false)

  const isJustSaved = celebration?.transactionIds.includes(transaction.id) === true
  const share = myShare(transaction)
  const category = transaction.category || '카테고리 없음'
  const title = transaction.merchant || category
  // 공금 지출은 누가 결제했는지보다 공금에서 나갔다는 게 중요해서 공금으로 보여 준다.
  const isShared = transaction.kind === '지출' && transaction.scope === '공동'
  const owner = isShared ? '공동' : transaction.person
  const receiptTransaction = hasReceiptLines(transaction) ? transaction : null
  const className = `tx-row${transaction.excluded ? ' is-excluded' : ''}${isJustSaved ? ' is-just-saved' : ''}`

  const content = (
    <>
      {isCategoryShown ? (
        <CategoryIcon name={category} emoji={icons.get(category)} size={20} />
      ) : (
        <span className="tx-row-lead">
          <PersonAvatar person={owner} size={36} />
        </span>
      )}
      <div className="tx-row-main">
        <strong className="tx-row-title">{title}</strong>
        <span className="tx-row-meta">
          <span className="tx-row-person">
            {isCategoryShown && <PersonAvatar person={owner} size={16} />}
            {isShared ? scopeLabel('공동') : personName(transaction.person)}
          </span>
          {isCategoryShown && <span className="tx-row-category">{category}</span>}
          {transaction.kind === '지출' && transaction.scope === '개인' && <span className="tx-badge">{scopeLabel('개인')}</span>}
          {transaction.shareCount > 1 && <span className="tx-badge">{transaction.shareCount}명 나눔</span>}
          {transaction.excluded && <span className="tx-badge">통계 제외</span>}
        </span>
      </div>
      <div className="tx-row-amount">
        <span className={`amount amount-${transaction.kind}`}>{formatSignedWon(share, transaction.kind)}</span>
        <span className="tx-row-time">{formatTime(transaction.occurredAt)}</span>
      </div>
    </>
  )

  return (
    <li>
      {receiptTransaction ? (
        <button type="button" className={className} onClick={() => setIsReceiptOpen(true)}>
          {content}
        </button>
      ) : (
        <Link to={`/tx/${transaction.id}`} className={className}>
          {content}
        </Link>
      )}
      {receiptTransaction && isReceiptOpen && createPortal(<ReceiptSheet transaction={receiptTransaction} onClose={() => setIsReceiptOpen(false)} />, document.body)}
    </li>
  )
}

export default TransactionRow
