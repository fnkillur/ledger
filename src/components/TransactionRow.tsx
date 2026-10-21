import { Link } from 'react-router'
import { useCategoryIcons } from '../db/hooks'
import { myShare } from '../domain/stats'
import type { Transaction } from '../domain/types'
import { formatSignedWon, formatTime } from '../utils/format'
import CategoryIcon from './CategoryIcon'
import PersonAvatar from './PersonAvatar'

function TransactionRow({ transaction }: { transaction: Transaction }) {
  const icons = useCategoryIcons()

  const share = myShare(transaction)
  const title = transaction.merchant || transaction.category || '내역 없음'

  return (
    <li>
      <Link to={`/tx/${transaction.id}`} className={`tx-row${transaction.excluded ? ' is-excluded' : ''}`}>
        <CategoryIcon icon={icons.get(transaction.category)} />
        <div className="tx-row-main">
          <strong className="tx-row-title">{title}</strong>
          <span className="tx-row-meta">
            <PersonAvatar person={transaction.person} size={14} />
            {transaction.category || '카테고리 없음'} · {formatTime(transaction.occurredAt)}
            {transaction.excluded && ' · 통계 제외'}
          </span>
        </div>
        <div className="tx-row-amount">
          <span className={`amount amount-${transaction.kind}`}>{formatSignedWon(share, transaction.kind)}</span>
          {transaction.shareCount > 1 && (
            <span className="tx-row-share">
              {transaction.amount.toLocaleString('ko-KR')}원 ÷ {transaction.shareCount}
            </span>
          )}
        </div>
      </Link>
    </li>
  )
}

export default TransactionRow
