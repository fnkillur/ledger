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

function TransactionRow({ transaction }: { transaction: Transaction }) {
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
  const receiptTransaction = hasReceiptLines(transaction) ? transaction : null
  const className = `tx-row${transaction.excluded ? ' is-excluded' : ''}${isJustSaved ? ' is-just-saved' : ''}`

  const content = (
    <>
      <CategoryIcon name={category} emoji={icons.get(category)} size={20} />
      <div className="tx-row-main">
        <strong className="tx-row-title">{title}</strong>
        <span className="tx-row-meta">
          <span className="tx-row-person">
            <PersonAvatar person={isShared ? '공동' : transaction.person} size={16} />
            {isShared ? scopeLabel('공동') : personName(transaction.person)}
          </span>
          <span className="tx-row-category">{category}</span>
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
